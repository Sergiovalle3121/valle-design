/**
 * Orquestador del pipeline de render por lotes y por tiles.
 *
 * Junta las cuatro piezas —índice de tiles, caché de teselado con LOD,
 * planificador con presupuesto y constructor de lotes— y sostiene la propiedad
 * que da sentido a todo el trabajo:
 *
 *   **En reposo, el número de entidades detalladas es el de las VISIBLES.**
 *
 * No «2.500 de 100.000 muestreadas uniformemente». Todas. `renderedEntities`
 * frente a `visibleEntities` es la cifra que hay que mirar en el benchmark, y la
 * que separa un dibujo lento de un dibujo falso.
 *
 * ## Cómo se reparte el trabajo
 *
 * - **Panear** cambia el conjunto de tiles visibles. Los que salen se liberan;
 *   los que entran se encolan. Los que siguen dentro NO SE TOCAN: su geometría
 *   ya está en la GPU y sus uniformes de cámara se actualizan con cuatro
 *   números. Ese es el motivo de que un paneo pueda caber en un cuadro.
 * - **Hacer zoom** puede cambiar el escalón de LOD. Se cuantiza el zoom a
 *   octavas (`log2(pixelsPerUnit)`) para que una rueda de ratón no invalide la
 *   escena entera en cada muesca; cuando la octava cambia, los tiles residentes
 *   se reconstruyen, y la caché de teselado hace que reconstruir sea barato
 *   porque el escalón nuevo casi siempre ya se calculó antes.
 * - **Editar** entra por `invalidate(affectedEntityIds)`, que es lo que devuelve
 *   el ejecutor de comandos. No hace falta adivinar qué cambió ni vaciar nada
 *   más que los tiles tocados.
 *
 * Puro respecto a THREE: produce lotes en arrays tipados. Quien lo consume los
 * sube a la GPU con `line-batch-three.ts`.
 */
import {
  CAD_ENTITY_REGISTRY,
  type CadBounds,
  type CadNativeEntity,
} from "../entity-runtime";
import type { CadDocument } from "../cad-document";
import {
  CadRenderTileIndex,
  diffCadTiles,
  suggestCadTileSize,
  type CadTileId,
} from "./tile-index";
import {
  CadTessellationCache,
  cadRenderLodTier,
  cadRenderSegmentBudget,
  tessellateCadEntity,
  type CadRenderLodTier,
  type CadTessellationCacheStats,
} from "./tessellation-cache";
import {
  buildCadLineBatches,
  cadDrawOrderDepth,
  type CadLineBatch,
  type CadLineBatchItem,
  type CadLineStyle,
} from "./line-batch";
import { CadRenderScheduler, type CadRenderFrameResult } from "./render-scheduler";
import type { CadTextQuadRequest } from "./text-atlas";

/** Color por defecto, el mismo que usaba la proyección anterior. */
export const CAD_RENDER_DEFAULT_COLOR = 0x60a5fa;
/** Medio grosor por defecto en píxeles: un trazo de 1 px. */
export const CAD_RENDER_DEFAULT_HALF_WIDTH_PX = 0.5;

export interface CadRenderView {
  /** Rectángulo de dibujo visible, ya con overscan. De `cadViewBounds`. */
  bounds: CadBounds;
  /** El zoom. De `CadView.pixelsPerUnit`. */
  pixelsPerUnit: number;
}

export type CadRenderStyleResolver = (entity: CadNativeEntity) => CadLineStyle;

export interface CadRenderPipelineOptions {
  tileSize?: number;
  frameBudgetMs?: number;
  cache?: CadTessellationCache;
  now?: () => number;
  style?: CadRenderStyleResolver;
  document?: CadDocument;
}

export interface CadRenderPipelineStats {
  totalEntities: number;
  /** Entidades que caen dentro de la vista. Sin muestrear. */
  visibleEntities: number;
  /** Entidades ya materializadas como instancias residentes. */
  renderedEntities: number;
  visibleTiles: number;
  residentTiles: number;
  batches: number;
  instances: number;
  glyphRequests: number;
  pendingTasks: number;
  /** true cuando no queda trabajo: es el momento en que se mide «en reposo». */
  settled: boolean;
  zoomOctave: number;
  cache: CadTessellationCacheStats;
}

export interface CadRenderViewUpdate {
  addedTiles: number;
  removedTiles: number;
  retainedTiles: number;
  /** true si el cambio de octava obligó a reconstruir los tiles residentes. */
  lodChanged: boolean;
}

interface ResidentTile {
  batches: CadLineBatch[];
  entityIds: string[];
  textRequests: CadTextQuadRequest[];
  instances: number;
  zoomOctave: number;
}

function defaultStyle(entity: CadNativeEntity): CadLineStyle {
  const value = entity.context?.presentation?.color?.value;
  const color =
    value && /^#[0-9a-f]{6}$/i.test(value)
      ? Number.parseInt(value.slice(1), 16)
      : CAD_RENDER_DEFAULT_COLOR;
  const weight = entity.context?.presentation?.lineweight?.value;
  return {
    color,
    // El lineweight canónico va en centésimas de milímetro, como en DXF. Se
    // convierte a un medio grosor en píxeles con la regla de que 0,25 mm es un
    // trazo fino de 1 px: es una convención, pero explícita y en un solo sitio.
    halfWidthPx:
      typeof weight === "number" && weight > 0
        ? Math.max(CAD_RENDER_DEFAULT_HALF_WIDTH_PX, weight / 50)
        : CAD_RENDER_DEFAULT_HALF_WIDTH_PX,
    linetypeIndex: 0,
    layer: entity.layer,
  };
}

/** Octava del zoom. Cuantizar evita invalidar la escena en cada muesca. */
export function cadRenderZoomOctave(pixelsPerUnit: number): number {
  if (!(pixelsPerUnit > 0)) return 0;
  return Math.round(Math.log2(pixelsPerUnit));
}

export class CadRenderPipeline {
  private readonly entities = new Map<string, CadNativeEntity>();
  private readonly drawOrder = new Map<string, number>();
  private readonly resident = new Map<CadTileId, ResidentTile>();
  private readonly cache: CadTessellationCache;
  private readonly scheduler: CadRenderScheduler;
  private readonly styleOf: CadRenderStyleResolver;
  private index: CadRenderTileIndex;
  private document?: CadDocument;
  private visibleTiles: CadTileId[] = [];
  private view: CadRenderView = {
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    pixelsPerUnit: 1,
  };
  private zoomOctaveValue = 0;
  private drawOrderCount = 0;

  constructor(options: CadRenderPipelineOptions = {}) {
    this.cache = options.cache ?? new CadTessellationCache();
    this.scheduler = new CadRenderScheduler({
      frameBudgetMs: options.frameBudgetMs,
      now: options.now,
    });
    this.styleOf = options.style ?? defaultStyle;
    this.index = new CadRenderTileIndex(options.tileSize ?? 4_096);
    this.document = options.document;
  }

  /**
   * Sustituye el contenido. `drawOrderIds` es `modelSpace.entityIds`: define qué
   * tapa a qué, así que se guarda como índice y no como orden de iteración.
   */
  replace(
    entities: readonly CadNativeEntity[],
    drawOrderIds: readonly string[],
    document?: CadDocument,
  ): void {
    this.entities.clear();
    this.drawOrder.clear();
    this.resident.clear();
    this.cache.clear();
    this.scheduler.abort();
    this.document = document ?? this.document;
    let bounds: CadBounds | null = null;
    const boundsById = new Map<string, CadBounds>();
    for (const entity of entities) {
      if (!CAD_ENTITY_REGISTRY.supports(entity)) continue;
      this.entities.set(entity.id, entity);
      const entityBounds = CAD_ENTITY_REGISTRY.adapter(entity).bounds.bounds(
        entity,
        this.document,
      );
      boundsById.set(entity.id, entityBounds);
      bounds = bounds
        ? {
            minX: Math.min(bounds.minX, entityBounds.minX),
            minY: Math.min(bounds.minY, entityBounds.minY),
            maxX: Math.max(bounds.maxX, entityBounds.maxX),
            maxY: Math.max(bounds.maxY, entityBounds.maxY),
          }
        : { ...entityBounds };
    }
    drawOrderIds.forEach((id, position) => this.drawOrder.set(id, position));
    this.drawOrderCount = Math.max(drawOrderIds.length, this.entities.size);
    this.index = new CadRenderTileIndex(
      bounds ? suggestCadTileSize(bounds, this.entities.size) : 4_096,
    );
    for (const [id, entityBounds] of boundsById) this.index.upsert(id, entityBounds);
    this.visibleTiles = [];
  }

  get tileSize(): number {
    return this.index.tileSize;
  }

  /**
   * Invalidación por `affectedEntityIds`. Reindexa las entidades tocadas, tira
   * su teselado y libera los tiles residentes que las contenían para que se
   * reconstruyan con presupuesto en vez de de golpe.
   */
  invalidate(
    affectedEntityIds: readonly string[],
    upserts: readonly CadNativeEntity[] = [],
  ): number {
    for (const entity of upserts) {
      if (!CAD_ENTITY_REGISTRY.supports(entity)) continue;
      this.entities.set(entity.id, entity);
      this.index.upsert(
        entity.id,
        CAD_ENTITY_REGISTRY.adapter(entity).bounds.bounds(entity, this.document),
      );
    }
    for (const id of affectedEntityIds) {
      if (upserts.some((entity) => entity.id === id)) continue;
      if (!this.entities.has(id)) continue;
      // Un id afectado que ya no está entre las entidades es una baja.
      this.index.remove(id);
      this.entities.delete(id);
    }
    this.cache.invalidate(affectedEntityIds);
    const affected = new Set(affectedEntityIds);
    let evicted = 0;
    for (const [tileId, tile] of [...this.resident]) {
      if (!tile.entityIds.some((id) => affected.has(id))) continue;
      this.resident.delete(tileId);
      evicted += 1;
    }
    this.enqueueMissingTiles();
    return evicted;
  }

  /**
   * Fija la vista. Devuelve el delta de tiles: es la cifra que demuestra que
   * panear no reconstruye la escena.
   */
  setView(view: CadRenderView): CadRenderViewUpdate {
    const previousTiles = this.visibleTiles;
    const octave = cadRenderZoomOctave(view.pixelsPerUnit);
    const lodChanged = octave !== this.zoomOctaveValue;
    this.view = view;
    this.zoomOctaveValue = octave;
    this.visibleTiles = this.index.visibleTileIds(view.bounds);
    const diff = diffCadTiles(previousTiles, this.visibleTiles);
    // Los tiles que salen de la vista liberan su geometría: sin esto, pasear por
    // un plano grande retiene el plano entero y la prueba de fuga lo caza.
    for (const tileId of diff.removed) this.resident.delete(tileId);
    if (lodChanged) {
      for (const [tileId, tile] of [...this.resident])
        if (tile.zoomOctave !== octave) this.resident.delete(tileId);
    }
    const centerX = (view.bounds.minX + view.bounds.maxX) / 2;
    const centerY = (view.bounds.minY + view.bounds.maxY) / 2;
    this.scheduler.abort();
    this.scheduler.reprioritize(centerX, centerY);
    this.enqueueMissingTiles();
    return {
      addedTiles: diff.added.length,
      removedTiles: diff.removed.length,
      retainedTiles: diff.retained.length,
      lodChanged,
    };
  }

  private enqueueMissingTiles(): void {
    for (const tileId of this.visibleTiles) {
      if (this.resident.has(tileId)) continue;
      const tile = this.index.tile(tileId);
      if (!tile) continue;
      const centerX = (tile.contentBounds.minX + tile.contentBounds.maxX) / 2;
      const centerY = (tile.contentBounds.minY + tile.contentBounds.maxY) / 2;
      this.scheduler.enqueue({
        key: tileId,
        x: centerX,
        y: centerY,
        run: () => this.buildTile(tileId),
      });
    }
  }

  private buildTile(tileId: CadTileId): void {
    const entityIds = this.index.entityIdsInTile(tileId);
    const items: CadLineBatchItem[] = [];
    const textRequests: CadTextQuadRequest[] = [];
    const rendered: string[] = [];
    for (const id of entityIds) {
      const entity = this.entities.get(id);
      if (!entity) continue;
      const depth = cadDrawOrderDepth(this.drawOrder.get(id) ?? 0, this.drawOrderCount);
      if (entity.type === "mtext") {
        // El texto no se tesela: viaja como petición de quads para el atlas.
        // Los productores de geometría de MText, cotas y mleader se conservan;
        // este pipeline sólo cambia CÓMO se materializa el resultado.
        textRequests.push({
          text: entity.text,
          fontKey: entity.fontFamily ?? "Arial",
          fontSize: entity.height ?? 120,
          x: entity.insertion.x,
          y: entity.insertion.y,
          rotationDeg: entity.rotation ?? 0,
          color: this.styleOf(entity).color,
          depth,
        });
        rendered.push(id);
        continue;
      }
      const tier = this.lodTierFor(id);
      const tessellation = this.cache.get(id, tier, () =>
        tessellateCadEntity(entity, cadRenderSegmentBudget(tier), this.document),
      );
      if (tessellation.segmentCount === 0) continue;
      items.push({ tessellation, style: this.styleOf(entity), depth });
      rendered.push(id);
    }
    const batches = buildCadLineBatches(items);
    let instances = 0;
    for (const batch of batches) instances += batch.instanceCount;
    this.resident.set(tileId, {
      batches,
      entityIds: rendered,
      textRequests,
      instances,
      zoomOctave: this.zoomOctaveValue,
    });
  }

  private lodTierFor(entityId: string): CadRenderLodTier {
    const bounds = this.index.bounds(entityId);
    if (!bounds) return 0;
    const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
    return cadRenderLodTier(span * this.view.pixelsPerUnit);
  }

  runFrame(budgetMs?: number): CadRenderFrameResult {
    return this.scheduler.runFrame(budgetMs);
  }

  /** Ejecuta cuadros hasta asentar. Es lo que mide `firstDetailMs` sin un rAF. */
  settle(maxFrames = 100_000): number {
    let frames = 0;
    while (this.scheduler.pending > 0 && frames < maxFrames) {
      this.scheduler.runFrame();
      frames += 1;
    }
    return frames;
  }

  /** Lotes residentes de los tiles VISIBLES, en orden de cercanía al centro. */
  visibleBatches(): CadLineBatch[] {
    const batches: CadLineBatch[] = [];
    for (const tileId of this.visibleTiles) {
      const tile = this.resident.get(tileId);
      if (tile) batches.push(...tile.batches);
    }
    return batches;
  }

  /** Peticiones de texto de los tiles visibles, para el atlas compartido. */
  visibleTextRequests(): CadTextQuadRequest[] {
    const requests: CadTextQuadRequest[] = [];
    for (const tileId of this.visibleTiles) {
      const tile = this.resident.get(tileId);
      if (tile) requests.push(...tile.textRequests);
    }
    return requests;
  }

  /** Entidades con detalle residente y visibles ahora mismo. */
  renderedEntityIds(): string[] {
    const ids: string[] = [];
    for (const tileId of this.visibleTiles) {
      const tile = this.resident.get(tileId);
      if (!tile) continue;
      for (const id of tile.entityIds) {
        const bounds = this.index.bounds(id);
        if (
          bounds &&
          bounds.minX <= this.view.bounds.maxX &&
          bounds.maxX >= this.view.bounds.minX &&
          bounds.minY <= this.view.bounds.maxY &&
          bounds.maxY >= this.view.bounds.minY
        )
          ids.push(id);
      }
    }
    return ids;
  }

  stats(): CadRenderPipelineStats {
    let batches = 0;
    let instances = 0;
    let glyphRequests = 0;
    for (const tileId of this.visibleTiles) {
      const tile = this.resident.get(tileId);
      if (!tile) continue;
      batches += tile.batches.length;
      instances += tile.instances;
      for (const request of tile.textRequests) glyphRequests += request.text.length;
    }
    return {
      totalEntities: this.entities.size,
      visibleEntities: this.index.visibleEntityIds(this.view.bounds).length,
      renderedEntities: this.renderedEntityIds().length,
      visibleTiles: this.visibleTiles.length,
      residentTiles: this.resident.size,
      batches,
      instances,
      glyphRequests,
      pendingTasks: this.scheduler.pending,
      settled: this.scheduler.pending === 0,
      zoomOctave: this.zoomOctaveValue,
      cache: this.cache.stats,
    };
  }

  /** Libera todo. Se llama al cerrar el documento; la prueba de fuga lo exige. */
  dispose(): void {
    this.scheduler.clear();
    this.resident.clear();
    this.cache.clear();
    this.entities.clear();
    this.drawOrder.clear();
    this.index.clear();
    this.visibleTiles = [];
  }
}
