/**
 * Caché de geometría LOCAL de una definición de bloque.
 *
 * ## El agujero que viene a tapar
 *
 * `insertAdapter.bounds.bounds` resolvía el bloque ENTERO —recursión por
 * bloques anidados incluida— por cada INSERT, cada vez que alguien pedía sus
 * límites: una vez por instancia al levantar el índice de tiles del pipeline
 * de render (`replace()`), otra vez por instancia al levantar el índice de
 * selección (`CadNativeSelectionIndex.replace()`), y otra vez por cada
 * comparación al ordenar candidatos de `hitTest` por distancia
 * (`centerDistanceSquared`, que llama a `bounds.bounds` DOS veces). Un plano
 * con 34.000 INSERT de un puñado de bloques de catálogo —puerta, ventana,
 * inodoro— pagaba la misma resolución recursiva 34.000 veces por la MISMA
 * definición, sólo porque cada instancia pide su lugar distinto.
 *
 * Lo que cambia entre instancias del mismo bloque es SÓLO la afín de
 * colocación (`insertion`, `rotation`, `scale`); el contenido —lo caro de
 * resolver— es idéntico mientras `block.version` no cambie. Aquí se factoriza
 * eso: la resolución recursiva se paga UNA VEZ por (definición × versión ×
 * escalón de segmentos), y cada instancia paga sólo transformar un puñado de
 * números por su propia afín.
 *
 * ## Por qué este módulo no conoce `resolveCadInsert`
 *
 * Podría vivir aquí la llamada a `resolveCadInsert` + `blockChildPaths`
 * directamente, pero las dos viven en `professional-blocks.ts` y
 * `block-text-adapters.ts` — y éste último es quien va a CONSUMIR esta
 * caché. Que la caché importara al consumidor cerraría un ciclo. En su lugar
 * la caché es agnóstica: recibe un `produce()` que hace el trabajo caro y
 * sólo se llama cuando la entrada no está o quedó obsoleta. El mismo patrón
 * que `tessellation-cache.ts` ya usa para el teselado por entidad.
 *
 * ## Por qué una entrada por bloque, no una LRU
 *
 * `tessellation-cache.ts` acota por PUNTOS retenidos porque hay una entrada
 * por ENTIDAD del dibujo —decenas de miles—. Aquí hay una entrada por
 * DEFINICIÓN de bloque —el tamaño de la tabla de bloques del documento,
 * normalmente decenas, nunca miles—, así que una caché sin desalojo no es una
 * fuga: está acotada por algo que ya tiene su propio tope natural. Guardar
 * más de una versión o escalón por bloque no compra nada, porque la próxima
 * consulta de esa misma definición siempre pide la versión y el escalón
 * VIGENTES; por eso `set` sustituye la entrada entera en vez de acumular.
 *
 * Puro: sin THREE, sin DOM y sin depender de ningún otro módulo de `lib/cad`.
 */
import type { CadBounds, CadRenderPath } from "./entity-runtime";

export interface CadBlockLocalGeometry {
  readonly paths: readonly CadRenderPath[];
  readonly bounds: CadBounds;
}

interface CadBlockCacheEntry {
  readonly version: number;
  readonly segments: number;
  readonly geometry: CadBlockLocalGeometry;
}

const cache = new Map<string, CadBlockCacheEntry>();

/**
 * Geometría local memorizada de `blockId` en su `version` y escalón de
 * `segments` vigentes. Si la entrada guardada es de otra versión —el bloque se
 * redefinió— o de otro escalón —cambió el LOD—, se descarta y se recalcula:
 * `block.version` es monótona (`cad-document.ts`), así que una comparación de
 * igualdad basta, no hace falta un reloj ni una lista de invalidación.
 */
export function cadBlockLocalGeometry(
  blockId: string,
  version: number,
  segments: number,
  produce: () => CadBlockLocalGeometry,
): CadBlockLocalGeometry {
  const existing = cache.get(blockId);
  if (existing && existing.version === version && existing.segments === segments)
    return existing.geometry;
  const geometry = produce();
  cache.set(blockId, { version, segments, geometry });
  return geometry;
}

/** Vacía la caché entera. Para specs y para un `replace()` de documento nuevo. */
export function clearCadBlockCache(): void {
  cache.clear();
}

/** Definiciones de bloque memorizadas ahora mismo. Nunca instancias. */
export function cadBlockCacheSize(): number {
  return cache.size;
}

/** Colocación de UNA instancia: lo único que puede variar entre dos INSERT del mismo bloque. */
export interface CadBlockPlacement {
  readonly insertion: { readonly x: number; readonly y: number };
  readonly rotationDeg: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly basePoint: { readonly x: number; readonly y: number };
}

interface CadAffine2 {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/**
 * `T(insertion) · R(rotationDeg) · S(scaleX, scaleY) · T(-basePoint)`.
 *
 * Es la MISMA fórmula que `insertMatrix` en `professional-blocks.ts` —esa
 * función no se importa aquí a propósito: `professional-blocks.ts` no es
 * territorio de esta ola y depender de una función privada de otro módulo
 * para una multiplicación de tres matrices 2×3 no vale el acoplamiento. La
 * duplicación queda protegida por `block-cache.spec.ts`, que compara esta
 * afín contra `resolveCadInsert` para varias combinaciones de giro, escala no
 * uniforme y reflexión: si algún día divergen, el spec lo dice con una cifra,
 * no con un plano mal dibujado.
 */
function placementAffine(placement: CadBlockPlacement): CadAffine2 {
  const radians = (placement.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const sx = placement.scaleX;
  const sy = placement.scaleY;
  const baseX = placement.basePoint.x;
  const baseY = placement.basePoint.y;
  return {
    a: cos * sx,
    b: sin * sx,
    c: -sin * sy,
    d: cos * sy,
    e: placement.insertion.x - (cos * sx * baseX - sin * sy * baseY),
    f: placement.insertion.y - (sin * sx * baseX + cos * sy * baseY),
  };
}

/**
 * Límites de una instancia a partir del AABB LOCAL de su bloque. Transforma
 * las 4 esquinas del rectángulo local por la afín de colocación y toma el
 * envolvente de las 4 imágenes — eso basta para un envolvente EXACTO: una
 * afín lleva un rectángulo a un paralelogramo, y las esquinas de un
 * paralelogramo son siempre sus puntos extremos. O(1) por instancia: no
 * vuelve a tocar el contenido del bloque, sólo cuatro puntos y una afín.
 */
export function cadBlockWorldBounds(local: CadBounds, placement: CadBlockPlacement): CadBounds {
  const m = placementAffine(placement);
  const corners: readonly [number, number][] = [
    [local.minX, local.minY],
    [local.minX, local.maxY],
    [local.maxX, local.minY],
    [local.maxX, local.maxY],
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of corners) {
    const worldX = m.a * x + m.c * y + m.e;
    const worldY = m.b * x + m.d * y + m.f;
    if (worldX < minX) minX = worldX;
    if (worldX > maxX) maxX = worldX;
    if (worldY < minY) minY = worldY;
    if (worldY > maxY) maxY = worldY;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Trazos LOCALES del bloque llevados a coordenadas de mundo para ESTA
 * instancia. Sigue siendo O(contenido) por instancia —cada punto se
 * transforma— pero ya no incluye resolver bloques anidados ni teselar: eso
 * lo pagó `produce()` una sola vez por definición. Lo consume `hitTest`, que
 * necesita los trazos reales y no sólo su envolvente.
 */
export function cadBlockWorldPaths(
  local: readonly CadRenderPath[],
  placement: CadBlockPlacement,
): CadRenderPath[] {
  const m = placementAffine(placement);
  return local.map((path) => ({
    closed: path.closed,
    points: path.points.map((point) => ({
      x: m.a * point.x + m.c * point.y + m.e,
      y: m.b * point.x + m.d * point.y + m.f,
    })),
  }));
}
