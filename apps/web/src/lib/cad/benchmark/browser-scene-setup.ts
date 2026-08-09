/**
 * Piezas de escena del arnés de navegador: estimación de memoria de GPU,
 * cámara compartida por los dos caminos, y construcción del camino ANTERIOR.
 *
 * Están fuera de `browser-harness.ts` porque aquél sostiene el BUCLE —el orden
 * de apertura, paneo, zoom y reposo, y qué se muestrea en cada fase—, y eso es
 * lo que hay que poder leer de una sentada. Esto de aquí es maquinaria estable:
 * cómo se cuenta un búfer, dónde se pone la cámara, cómo se levanta un
 * `THREE.Group` por entidad. Juntos rozaban las 780 líneas y el trinquete de
 * tamaño corta en 800.
 */
import * as THREE from "three";
import {
  buildCadNativeObject,
  disposeCadNativeObject,
  type CadThreeViewport,
} from "../entity-three";
import { CAD_ENTITY_REGISTRY, type CadBounds, type CadNativeEntity } from "../entity-runtime";
import type { CadDocument } from "../cad-document";
import { planCadNativeRenderBudget } from "../native-render-budget";

// ---------------------------------------------------------------------------
// Estimación de memoria de GPU
// ---------------------------------------------------------------------------

/**
 * Recorre el grafo sumando búferes de atributo y texturas, deduplicando por
 * identidad: el camino nuevo comparte UN quad unitario entre todos los lotes y
 * UNA textura de atlas, así que contarlos por malla multiplicaría por mil algo
 * que en la GPU está una sola vez.
 */
export function estimateCadGpuBytes(root: THREE.Object3D): {
  attributeBytes: number;
  textureBytes: number;
} {
  const seenArrays = new Set<ArrayBufferLike>();
  const seenTextures = new Set<string>();
  let attributeBytes = 0;
  let textureBytes = 0;
  root.traverse((child) => {
    const geometry = (child as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (geometry) {
      const attributes = { ...geometry.attributes } as Record<string, THREE.BufferAttribute>;
      if (geometry.index) attributes.__index = geometry.index as THREE.BufferAttribute;
      for (const attribute of Object.values(attributes)) {
        const buffer = (attribute.array as { buffer?: ArrayBufferLike }).buffer;
        if (!buffer || seenArrays.has(buffer)) continue;
        seenArrays.add(buffer);
        attributeBytes += (attribute.array as ArrayLike<number> & { byteLength: number }).byteLength;
      }
    }
    const material = (child as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    for (const single of Array.isArray(material) ? material : material ? [material] : []) {
      for (const value of Object.values(single as unknown as Record<string, unknown>)) {
        const texture = value as THREE.Texture | null;
        if (!texture || !(texture as { isTexture?: boolean }).isTexture) continue;
        if (seenTextures.has(texture.uuid)) continue;
        seenTextures.add(texture.uuid);
        const image = texture.image as { width?: number; height?: number } | undefined;
        // RGBA8 sin mipmaps. Es la cota inferior honesta: el driver puede
        // guardar más, nunca menos.
        textureBytes += (image?.width ?? 0) * (image?.height ?? 0) * 4;
      }
    }
  });
  return { attributeBytes, textureBytes };
}

// ---------------------------------------------------------------------------
// Cámara y viewport
// ---------------------------------------------------------------------------

/**
 * Los DOS caminos comparten la misma convención de escena —
 * `(dibujo − centro) · escala` en el plano XZ — así que comparten cámara. Si no
 * la compartieran, cualquier diferencia de FPS podría ser de la proyección y no
 * del pipeline, y la comparación no diría nada.
 */
export function createViewport(bounds: CadBounds): CadThreeViewport {
  const spanX = Math.max(bounds.maxX - bounds.minX, 1);
  const spanY = Math.max(bounds.maxY - bounds.minY, 1);
  return {
    // `width/2` es el centro del dibujo en la convención de `scenePoint`.
    width: bounds.minX + bounds.maxX,
    height: bounds.minY + bounds.maxY,
    // Normaliza el dibujo a ~1.000 unidades de escena. Sin esto, la cartografía
    // (1,6 M de unidades de dibujo) empujaría las coordenadas a la zona donde
    // un float32 tiene menos de una décima de resolución.
    scale: 1_000 / Math.max(spanX, spanY),
    elevation: 0.11,
  };
}

export function aimCamera(
  camera: THREE.OrthographicCamera,
  viewport: CadThreeViewport,
  view: { bounds: CadBounds; pixelsPerUnit: number },
  canvasWidth: number,
  canvasHeight: number,
): void {
  const centerX = (view.bounds.minX + view.bounds.maxX) / 2;
  const centerY = (view.bounds.minY + view.bounds.maxY) / 2;
  const sceneX = (centerX - viewport.width / 2) * viewport.scale;
  const sceneZ = (centerY - viewport.height / 2) * viewport.scale;
  // El semiancho sale de los PÍXELES del lienzo y de `pixelsPerUnit`, no de la
  // caja de la vista: así el grosor en píxeles del shader es realmente píxeles.
  const halfWidth = (canvasWidth / 2 / view.pixelsPerUnit) * viewport.scale;
  const halfHeight = (canvasHeight / 2 / view.pixelsPerUnit) * viewport.scale;
  camera.left = -halfWidth;
  camera.right = halfWidth;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.position.set(sceneX, 50, sceneZ);
  // +Y del dibujo hacia ABAJO en pantalla: la misma convención que el editor
  // (`yScreenSign: 1`). Sin esto el texto saldría reflejado.
  camera.up.set(0, 0, -1);
  camera.lookAt(sceneX, viewport.elevation ?? 0.11, sceneZ);
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------------------
// Camino anterior: un THREE.Group por entidad
// ---------------------------------------------------------------------------

export interface LegacyBuildResult {
  visible: number;
  detailed: number;
  textObjects: number;
  truncatedAtEntities: number | null;
  truncatedBy: "texture" | "clock" | null;
  planned: number;
}

export function visibleEntities(
  entities: readonly CadNativeEntity[],
  bounds: CadBounds,
  document: CadDocument,
): CadNativeEntity[] {
  return entities.filter((entity) => {
    const box = CAD_ENTITY_REGISTRY.adapter(entity).bounds.bounds(entity, document);
    return (
      box.minX <= bounds.maxX &&
      box.maxX >= bounds.minX &&
      box.minY <= bounds.maxY &&
      box.maxY >= bounds.minY
    );
  });
}

export function buildLegacyGroup(
  group: THREE.Group,
  entities: readonly CadNativeEntity[],
  document: CadDocument,
  viewport: CadThreeViewport,
  view: { bounds: CadBounds },
  textureBudgetBytes: number,
  buildBudgetMs: number,
): LegacyBuildResult {
  for (const child of [...group.children]) {
    disposeCadNativeObject(child);
    child.removeFromParent();
  }
  const visible = visibleEntities(entities, view.bounds, document);
  const plan = planCadNativeRenderBudget(entities, [], undefined, {
    visibleEntities: visible,
  });
  const started = performance.now();
  let textureBytes = 0;
  let textObjects = 0;
  let built = 0;
  let truncatedAtEntities: number | null = null;
  let truncatedBy: "texture" | "clock" | null = null;
  for (const entity of plan.entities) {
    const object = buildCadNativeObject(entity, viewport, false, document);
    group.add(object);
    built += 1;
    object.traverse((child) => {
      if (!child.userData.nativeText) return;
      textObjects += 1;
      const map = ((child as THREE.Sprite).material as THREE.SpriteMaterial).map;
      const image = map?.image as { width?: number; height?: number } | undefined;
      textureBytes += (image?.width ?? 0) * (image?.height ?? 0) * 4;
    });
    if (textureBytes > textureBudgetBytes) {
      truncatedAtEntities = built;
      truncatedBy = "texture";
      break;
    }
    // El reloj se mira cada 64 entidades: consultarlo por entidad mide el
    // reloj tanto como el trabajo.
    if (built % 64 === 0 && performance.now() - started > buildBudgetMs) {
      truncatedAtEntities = built;
      truncatedBy = "clock";
      break;
    }
  }
  return {
    visible: visible.length,
    detailed: built,
    textObjects,
    truncatedAtEntities,
    truncatedBy,
    planned: plan.entities.length,
  };
}

