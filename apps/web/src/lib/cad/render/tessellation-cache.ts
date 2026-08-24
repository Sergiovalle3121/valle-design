/**
 * Caché de teselado con LOD y tope LRU.
 *
 * ## Por qué existe
 *
 * El pipeline anterior llamaba a `adapter.renderer.paths(entity, 96)` cada vez
 * que reconstruía la escena, con 96 segmentos fijos para todo: un arco de tres
 * píxeles en pantalla pagaba lo mismo que uno de mil. Peor, un paneo de 30 px
 * volvía a teselar entidades que no habían cambiado ni de forma ni de tamaño
 * aparente. Aquí el teselado se calcula una vez por (entidad × nivel de detalle)
 * y se reutiliza mientras la entidad no cambie.
 *
 * ## Tres niveles, no un continuo
 *
 * Se podría calcular el número exacto de segmentos para cada zoom
 * (`cadRenderSegmentsForSagitta` lo hace y es la regla honesta: error de flecha
 * por debajo de media pantalla de píxel). Pero si el número cambia con cada
 * muesca de la rueda, la caché no acierta nunca — cada zoom es una clave nueva.
 * Por eso el nivel se cuantiza a TRES escalones por tamaño aparente. El coste es
 * teselar de más en el borde superior de cada escalón; la ganancia es que el
 * zoom deja de invalidar la caché entera.
 *
 * ## El tope no es un detalle
 *
 * Una caché sin tope es una fuga con otro nombre: recorre el documento entero
 * mientras el usuario pasea y nunca devuelve nada. El tope se cuenta en PUNTOS,
 * no en entradas, porque una entrada puede ser un segmento o una spline de mil
 * puntos y un tope por entradas no acota la memoria. La prueba de fuga del
 * benchmark (tres ciclos, crecimiento ≤ 15 MB) es la que caza el fallo si
 * alguien quita este tope.
 *
 * Puro: sin THREE y sin DOM.
 */
import { CAD_ENTITY_REGISTRY, type CadNativeEntity } from "../entity-runtime";
import type { CadDocument } from "../cad-document";
import { CAD_RENDER_ORIGIN_ZERO, type CadRenderOrigin } from "./render-origin";

export type CadRenderLodTier = 0 | 1 | 2;

/** Tamaño aparente (px) por debajo del cual una curva es un garabato. */
export const CAD_RENDER_LOD_COARSE_MAX_PX = 24;
/** Tamaño aparente (px) por debajo del cual el detalle medio es indistinguible. */
export const CAD_RENDER_LOD_MEDIUM_MAX_PX = 320;

/** Segmentos por vuelta completa en cada escalón. */
export const CAD_RENDER_LOD_SEGMENTS: readonly [number, number, number] = [
  8, 32, 128,
];

export interface CadTessellatedPath {
  /** Coordenadas de dibujo intercaladas x,y. Un Float32Array, no objetos. */
  readonly xy: Float32Array;
  readonly closed: boolean;
}

export interface CadTessellation {
  readonly paths: readonly CadTessellatedPath[];
  readonly pointCount: number;
  readonly segmentCount: number;
}

export interface CadTessellationCacheStats {
  hits: number;
  misses: number;
  evictions: number;
  invalidations: number;
  entries: number;
  points: number;
}

/**
 * Escalón de detalle a partir del tamaño aparente en píxeles.
 *
 * `screenSpanPx` es la mayor dimensión de la caja de la entidad multiplicada por
 * `pixelsPerUnit` — el producto ya existe como estado legible desde que la vista
 * es ortográfica, así que no hay que deducirlo de la cámara.
 */
export function cadRenderLodTier(screenSpanPx: number): CadRenderLodTier {
  if (!(screenSpanPx > CAD_RENDER_LOD_COARSE_MAX_PX)) return 0;
  if (screenSpanPx <= CAD_RENDER_LOD_MEDIUM_MAX_PX) return 1;
  return 2;
}

/** Segmentos que gasta un barrido de `sweepRatio` vueltas en un escalón dado. */
export function cadRenderSegmentBudget(
  tier: CadRenderLodTier,
  sweepRatio = 1,
): number {
  const full = CAD_RENDER_LOD_SEGMENTS[tier];
  return Math.max(2, Math.ceil(full * Math.min(1, Math.max(0, sweepRatio))));
}

/**
 * Segmentos exactos para que la flecha (sagitta) de la cuerda no supere
 * `tolerancePx` píxeles. Es la regla de la que salen los escalones de arriba;
 * se exporta porque es la que hay que mirar si alguien discute los números.
 */
export function cadRenderSegmentsForSagitta(
  radiusPx: number,
  tolerancePx = 0.5,
): number {
  if (!(radiusPx > 0) || !(tolerancePx > 0)) return 2;
  const ratio = 1 - tolerancePx / radiusPx;
  if (ratio <= -1) return 2;
  if (ratio >= 1) return 2;
  return Math.max(2, Math.ceil(Math.PI / Math.acos(ratio)));
}

/**
 * Teselado de una entidad nativa a través del registro de adaptadores. El
 * registro sigue siendo la única fuente de verdad sobre la forma de una
 * entidad; este módulo sólo decide CUÁNTOS segmentos pedirle y guarda el
 * resultado.
 */
/**
 * Teselado de una entidad, con las coordenadas de dibujo ya reducidas al
 * ORIGEN FLOTANTE antes de empaquetarlas a `Float32Array` — es el punto donde
 * de verdad se pierde precisión con coordenadas grandes (ver
 * `render-origin.ts`), así que es aquí donde hay que restar, no después.
 * `origin` es opcional y CERO por defecto: sin él, este teselado es
 * bit-idéntico al de antes de que existiera el origen flotante.
 */
export function tessellateCadEntity(
  entity: CadNativeEntity,
  segments: number,
  document?: CadDocument,
  origin: CadRenderOrigin = CAD_RENDER_ORIGIN_ZERO,
): CadTessellation {
  const paths: CadTessellatedPath[] = [];
  let pointCount = 0;
  let segmentCount = 0;
  for (const path of CAD_ENTITY_REGISTRY.adapter(entity).renderer.paths(
    entity,
    segments,
    document,
  )) {
    if (path.points.length < 2) continue;
    const xy = new Float32Array(path.points.length * 2);
    for (let index = 0; index < path.points.length; index += 1) {
      // La resta ocurre en JS doubles, ANTES de tocar el Float32Array: es
      // exactamente la técnica de origen flotante — lo que entra al array ya
      // es pequeño, sea cual sea la magnitud absoluta del documento.
      xy[index * 2] = path.points[index].x - origin.x;
      xy[index * 2 + 1] = path.points[index].y - origin.y;
    }
    paths.push({ xy, closed: path.closed });
    pointCount += path.points.length;
    segmentCount += path.points.length - 1 + (path.closed ? 1 : 0);
  }
  return { paths, pointCount, segmentCount };
}

interface CacheEntry {
  key: string;
  entityId: string;
  tessellation: CadTessellation;
}

export interface CadTessellationCacheOptions {
  /** Tope duro en puntos retenidos. Es lo que acota la memoria de verdad. */
  maxPoints?: number;
  /** Tope secundario en entradas, para que un dibujo de segmentos no explote. */
  maxEntries?: number;
}

export const CAD_TESSELLATION_CACHE_DEFAULT_MAX_POINTS = 1_500_000;
export const CAD_TESSELLATION_CACHE_DEFAULT_MAX_ENTRIES = 120_000;

/**
 * Caché LRU por (entidad × escalón de LOD).
 *
 * La invalidación entra por `affectedEntityIds`, que es exactamente lo que
 * devuelve el ejecutor de comandos tras aplicar un lote: no hace falta adivinar
 * qué cambió ni vaciar la caché entera después de mover una línea.
 */
export class CadTessellationCache {
  /** Map preserva orden de inserción: el primero es el menos usado. */
  private readonly entries = new Map<string, CacheEntry>();
  private readonly keysByEntity = new Map<string, Set<string>>();
  private readonly maxPoints: number;
  private readonly maxEntries: number;
  private retainedPoints = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private invalidations = 0;

  constructor(options: CadTessellationCacheOptions = {}) {
    this.maxPoints = Math.max(
      1,
      options.maxPoints ?? CAD_TESSELLATION_CACHE_DEFAULT_MAX_POINTS,
    );
    this.maxEntries = Math.max(
      1,
      options.maxEntries ?? CAD_TESSELLATION_CACHE_DEFAULT_MAX_ENTRIES,
    );
  }

  static key(entityId: string, tier: CadRenderLodTier): string {
    return `${entityId}|${tier}`;
  }

  peek(entityId: string, tier: CadRenderLodTier): CadTessellation | null {
    return (
      this.entries.get(CadTessellationCache.key(entityId, tier))
        ?.tessellation ?? null
    );
  }

  get(
    entityId: string,
    tier: CadRenderLodTier,
    produce: () => CadTessellation,
  ): CadTessellation {
    const key = CadTessellationCache.key(entityId, tier);
    const existing = this.entries.get(key);
    if (existing) {
      this.hits += 1;
      // Reinserción: lo vuelve a poner al final de la cola de desalojo.
      this.entries.delete(key);
      this.entries.set(key, existing);
      return existing.tessellation;
    }
    this.misses += 1;
    const tessellation = produce();
    const entry: CacheEntry = { key, entityId, tessellation };
    this.entries.set(key, entry);
    this.retainedPoints += tessellation.pointCount;
    const keys = this.keysByEntity.get(entityId) ?? new Set<string>();
    keys.add(key);
    this.keysByEntity.set(entityId, keys);
    this.evictWhileOverBudget();
    return tessellation;
  }

  private evictWhileOverBudget(): void {
    while (
      (this.retainedPoints > this.maxPoints ||
        this.entries.size > this.maxEntries) &&
      this.entries.size > 1
    ) {
      const oldest = this.entries.keys().next();
      if (oldest.done) return;
      this.dropKey(oldest.value);
      this.evictions += 1;
    }
  }

  private dropKey(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.retainedPoints -= entry.tessellation.pointCount;
    const keys = this.keysByEntity.get(entry.entityId);
    if (keys) {
      keys.delete(key);
      if (keys.size === 0) this.keysByEntity.delete(entry.entityId);
    }
  }

  /** Devuelve cuántas entradas se tiraron. Un id desconocido no es un error. */
  invalidate(entityIds: Iterable<string>): number {
    let dropped = 0;
    for (const entityId of entityIds) {
      const keys = this.keysByEntity.get(entityId);
      if (!keys) continue;
      for (const key of [...keys]) {
        this.dropKey(key);
        dropped += 1;
      }
    }
    this.invalidations += dropped;
    return dropped;
  }

  clear(): void {
    this.entries.clear();
    this.keysByEntity.clear();
    this.retainedPoints = 0;
  }

  get stats(): CadTessellationCacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      invalidations: this.invalidations,
      entries: this.entries.size,
      points: this.retainedPoints,
    };
  }
}
