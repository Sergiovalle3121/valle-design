/**
 * Escena THREE del pipeline por lotes: la superficie de enchufe.
 *
 * ## Por qué existe este archivo y no un cableado dentro del editor
 *
 * `Layout3DEditor.tsx` tiene 23.444 líneas y hay otra sesión trabajándolo. Meter
 * ahí la reconciliación de mallas sería un diff grande en el archivo más
 * disputado del repositorio y con el mayor riesgo de conflicto. Toda la lógica
 * vive aquí, probada en Node, de forma que enchufarla se reduzca a construir
 * esta clase, llamar a `setView` cuando la cámara cambia y a `runFrame` en el
 * bucle de dibujo.
 *
 * **Este PR NO la enchufa.** La clase está completa y probada, pero nadie la
 * construye todavía: el cableado va en un PR posterior, pequeño y aislado. Se
 * dice aquí, en el commit y en el PR porque un módulo listo y desconectado que
 * pareciera conectado sería justo el tipo de silencio que hay que evitar.
 *
 * ## Reconciliación, no reconstrucción
 *
 * `sync()` compara los lotes que el pipeline declara visibles con las mallas que
 * ya están en el grupo, y sólo crea las que faltan y libera las que sobran. Un
 * paneo que conserva 14 de 18 tiles toca 4 mallas, no 18 — que es el motivo
 * entero de que exista el índice de tiles.
 */
import * as THREE from "three";
import type { CadThreeViewport } from "../entity-three";
import {
  buildCadLineBatchMesh,
  createCadLineBatchMaterial,
  disposeCadLineBatchMesh,
  setCadLineBatchHiddenLayers,
  updateCadLineBatchUniforms,
  type CadLineBatchUniforms,
} from "./line-batch-three";
import {
  CadCanvasTextAtlas,
  buildCadTextAtlasMesh,
  createCadTextAtlasMaterial,
  type CadTextAtlasUniforms,
} from "./text-atlas-three";
import { buildCadTextQuads } from "./text-atlas";
import {
  CadRenderPipeline,
  type CadRenderPipelineOptions,
  type CadRenderPipelineStats,
  type CadRenderView,
  type CadRenderViewUpdate,
} from "./pipeline";
import type { CadNativeEntity } from "../entity-runtime";
import type { CadDocument } from "../cad-document";
import type { CadRenderFrameResult } from "./render-scheduler";

export interface CadRenderSceneOptions extends CadRenderPipelineOptions {
  viewport: CadThreeViewport;
  /** Tamaño del atlas de glifos en píxeles. */
  atlasSize?: number;
  /** Altura de la em rasterizada. Por encima de ~3× el texto se ablanda. */
  atlasEmPixels?: number;
}

export interface CadRenderSyncResult {
  /** Mallas creadas en esta sincronización. */
  created: number;
  /** Mallas liberadas porque su lote dejó de estar visible. */
  disposed: number;
  /** Mallas que siguen tal cual: la cifra que dice que no se reconstruye. */
  retained: number;
  glyphs: number;
  droppedGlyphs: number;
}

export class CadRenderScene {
  readonly group = new THREE.Group();
  readonly pipeline: CadRenderPipeline;
  private readonly material: THREE.ShaderMaterial;
  private readonly uniforms: CadLineBatchUniforms;
  private readonly textAtlas: CadCanvasTextAtlas;
  private readonly textMaterial: THREE.ShaderMaterial;
  private readonly textUniforms: CadTextAtlasUniforms;
  private readonly meshes = new Map<string, THREE.Mesh>();
  private textMesh: THREE.Mesh | null = null;
  private viewport: CadThreeViewport;
  private pixelsPerUnit = 1;
  private hiddenLayers: ReadonlySet<string> = new Set();

  constructor(options: CadRenderSceneOptions) {
    this.pipeline = new CadRenderPipeline(options);
    this.viewport = options.viewport;
    this.group.name = "cad-render:scene";
    this.group.userData.cadRenderScene = true;
    const line = createCadLineBatchMaterial({
      viewport: options.viewport,
      pixelsPerUnit: 1,
    });
    this.material = line.material;
    this.uniforms = line.uniforms;
    this.textAtlas = new CadCanvasTextAtlas(options.atlasSize, options.atlasEmPixels);
    const text = createCadTextAtlasMaterial({
      viewport: options.viewport,
      texture: this.textAtlas.texture,
    });
    this.textMaterial = text.material;
    this.textUniforms = text.uniforms;
  }

  replace(
    entities: readonly CadNativeEntity[],
    drawOrderIds: readonly string[],
    document?: CadDocument,
  ): void {
    this.pipeline.replace(entities, drawOrderIds, document);
    this.clearMeshes();
  }

  invalidate(affectedEntityIds: readonly string[], upserts: readonly CadNativeEntity[] = []): void {
    this.pipeline.invalidate(affectedEntityIds, upserts);
  }

  /**
   * Cambia la vista. Un paneo o un zoom que NO cambia el conjunto de tiles no
   * reconstruye nada: escribe cuatro uniformes y termina.
   */
  setView(view: CadRenderView, viewport?: CadThreeViewport): CadRenderViewUpdate {
    if (viewport) this.viewport = viewport;
    this.pixelsPerUnit = view.pixelsPerUnit;
    updateCadLineBatchUniforms(this.uniforms, this.viewport, view.pixelsPerUnit);
    this.textUniforms.cadScale.value = this.viewport.scale;
    this.textUniforms.cadCenter.value.set(this.viewport.width / 2, this.viewport.height / 2);
    return this.pipeline.setView(view);
  }

  runFrame(budgetMs?: number): CadRenderFrameResult {
    return this.pipeline.runFrame(budgetMs);
  }

  get settled(): boolean {
    return this.pipeline.settled;
  }

  /** Reconcilia las mallas del grupo con los lotes visibles del pipeline. */
  sync(): CadRenderSyncResult {
    const batches = this.pipeline.visibleBatches();
    const wanted = new Set<string>();
    let created = 0;
    let retained = 0;
    for (const batch of batches) {
      wanted.add(batch.bucketKey);
      const existing = this.meshes.get(batch.bucketKey);
      // Un lote que ha crecido trae arrays NUEVOS: comparar el número de
      // instancias basta para saber si la geometría en GPU sigue valiendo.
      if (existing && existing.userData.cadLineBatchInstances === batch.instanceCount) {
        retained += 1;
        continue;
      }
      if (existing) {
        disposeCadLineBatchMesh(existing);
        this.meshes.delete(batch.bucketKey);
      }
      const mesh = buildCadLineBatchMesh(batch, this.material);
      this.meshes.set(batch.bucketKey, mesh);
      this.group.add(mesh);
      created += 1;
    }
    let disposed = 0;
    for (const [key, mesh] of [...this.meshes]) {
      if (wanted.has(key)) continue;
      disposeCadLineBatchMesh(mesh);
      this.meshes.delete(key);
      disposed += 1;
    }
    setCadLineBatchHiddenLayers(this.group, this.hiddenLayers);

    const requests = this.pipeline.visibleTextRequests();
    let glyphs = 0;
    let droppedGlyphs = 0;
    if (this.textMesh) {
      this.textMesh.geometry.dispose();
      this.textMesh.removeFromParent();
      this.textMesh = null;
    }
    if (requests.length > 0) {
      const quads = buildCadTextQuads(requests, this.textAtlas.atlas, this.textAtlas.source);
      this.textAtlas.sync();
      this.textUniforms.cadAtlas.value = this.textAtlas.texture;
      glyphs = quads.instanceCount;
      droppedGlyphs = quads.droppedGlyphs;
      if (quads.instanceCount > 0) {
        this.textMesh = buildCadTextAtlasMesh(quads, this.textMaterial);
        this.group.add(this.textMesh);
      }
    }
    return { created, disposed, retained, glyphs, droppedGlyphs };
  }

  setHiddenLayers(hiddenLayers: ReadonlySet<string>): void {
    this.hiddenLayers = new Set(hiddenLayers);
    setCadLineBatchHiddenLayers(this.group, this.hiddenLayers);
  }

  stats(): CadRenderPipelineStats & { meshes: number; pixelsPerUnit: number } {
    return {
      ...this.pipeline.stats(),
      meshes: this.meshes.size + (this.textMesh ? 1 : 0),
      pixelsPerUnit: this.pixelsPerUnit,
    };
  }

  private clearMeshes(): void {
    for (const mesh of this.meshes.values()) disposeCadLineBatchMesh(mesh);
    this.meshes.clear();
    if (this.textMesh) {
      this.textMesh.geometry.dispose();
      this.textMesh.removeFromParent();
      this.textMesh = null;
    }
  }

  dispose(): void {
    this.clearMeshes();
    this.material.dispose();
    this.textMaterial.dispose();
    this.textAtlas.dispose();
    this.pipeline.dispose();
    this.group.removeFromParent();
  }
}
