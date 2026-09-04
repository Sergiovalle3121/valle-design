/**
 * DEL ESCANEO A POLILÍNEAS: umbral, despeckle, adelgazamiento y ajuste
 * (Ola I, 2026-09-04).
 *
 * Medido antes (`distancia-autocad-completo-20260903.md`, §4 4º RASTER): la
 * fila `toolset-raster.vectorizacion` de la rúbrica estaba en ⬜ con la
 * evidencia «No hay vectorización». Un plano escaneado se podía insertar,
 * recortar y atenuar desde la Ola H, pero calcarlo seguía siendo trabajo a
 * mano, trazo por trazo. Esto lo convierte en geometría.
 *
 * ## La tubería, y por qué cada paso está donde está
 *
 *   1. **Umbral de Otsu.** Un escaneo no tiene «negro» y «blanco»: tiene una
 *      nube de grises con dos jorobas (tinta y papel). Otsu parte el
 *      histograma por donde la varianza ENTRE las dos clases es máxima, sin
 *      pedirle al usuario un número que no sabe. El umbral se DECLARA, y se
 *      puede fijar a mano cuando el papel está muy amarillo.
 *   2. **Despeckle.** Un escaneo trae polvo: manchas de uno a tres píxeles que
 *      el umbral toma por tinta. Se etiquetan las componentes conexas (8
 *      vecinos) y se tiran las que no llegan al área mínima. Se cuenta cuántas
 *      se fueron y cuántos píxeles se llevaron: sin ese recuento, «el escaneo
 *      salió limpio» no se puede comprobar.
 *   3. **Adelgazamiento de Zhang-Suen.** Un trazo de lápiz mide tres o cuatro
 *      píxeles de ancho; una polilínea mide cero. El algoritmo pela el borde
 *      en dos medias pasadas —cada una borra una pareja de esquinas distinta—
 *      hasta que ya no quita nada, y deja la línea media de un píxel SIN
 *      romperla, que es la propiedad que lo hace válido aquí.
 *   4. **Recorrido del esqueleto.** Los píxeles de un esqueleto tienen grado 1
 *      (extremo), 2 (tramo) o ≥ 3 (nodo). Se sale de cada extremo y de cada
 *      nodo y se camina por los de grado 2; lo que quede sin visitar y sea
 *      todo de grado 2 es un bucle CERRADO (el contorno de un rectángulo lo
 *      es). Los enlaces en diagonal se descartan cuando existe el camino
 *      ortogonal equivalente: sin eso, las cuatro esquinas de un rectángulo
 *      parecen nodos y el contorno sale en cuatro trozos en vez de uno.
 *   5. **Douglas-Peucker + fusión de colineales.** La cadena de píxeles tiene
 *      un vértice por píxel. Douglas-Peucker se queda con los que se salen de
 *      la tolerancia, y la fusión quita los que quedan alineados —incluido el
 *      vértice de la costura de un bucle, que es donde empezó a caminar y no
 *      una esquina del dibujo.
 *
 * ## Lo que TODAVÍA NO hace, dicho aquí y repetido donde se lea
 *
 * Arcos, círculos y sombreados. Un arco sale como una polilínea de tramos
 * rectos, no como ARC; una zona maciza sale como su contorno, no como HATCH.
 * Reconocerlos es ajustar primitivas a la cadena (mínimos cuadrados sobre
 * círculo, detección de relleno) y no es de esta entrega.
 *
 * Las letras SÍ se reconocen, pero no aquí: esta tubería devuelve sus trazos y
 * `raster-text-recognize.ts` los compara por plantilla contra las fuentes
 * Hershey. VECTORIZE aplica los dos pasos y quita del calco los trazos que ya
 * salieron como TEXT, para que ninguna letra se escriba dos veces.
 *
 * ## El sistema de coordenadas
 *
 * Entra una imagen con la fila 0 ARRIBA (como el archivo) y salen puntos en
 * PÍXELES DE LA IMAGEN CON LA Y HACIA ARRIBA, medidos en el centro del píxel:
 * exactamente lo que come `cadImagePixelToWorld`. Así la escala y el giro de
 * la IMAGE colocada aplican solos, sin que este módulo sepa nada del dibujo.
 */
import { cadRasterLuminance, type CadRasterImage } from "./raster-decode";

/**
 * La línea que habla de las letras. Se publica aparte porque quien SÍ las
 * reconoce —VECTORIZE, con `raster-text-recognize.ts`— tiene que quitarla de
 * su plan: dejarla puesta cuando el rótulo ya salió como TEXT sería declarar
 * un límite que en ese momento no existe.
 */
export const CAD_RASTER_NOT_YET_TEXT = "esta tubería devuelve las letras como trazos: reconocerlas es otro paso, el de `raster-text-recognize.ts`";

/** Lo que esta tubería no reconoce todavía. Se enseña antes de escribir nada. */
export const CAD_RASTER_NOT_YET: readonly string[] = [
  "arcos y círculos salen como polilíneas de tramos rectos, no como ARC ni CIRCLE",
  "los sombreados y las zonas macizas salen como su contorno, no como HATCH",
  CAD_RASTER_NOT_YET_TEXT,
];

export interface CadRasterVectorizeOptions {
  /** Umbral 0–255; sin él, el que decide Otsu. Es tinta lo que queda POR DEBAJO. */
  threshold?: number;
  /** Área mínima de una componente conexa, en píxeles. Por debajo es polvo. */
  minBlobPixels?: number;
  /** Tolerancia de Douglas-Peucker, en píxeles. */
  tolerancePx?: number;
  /** Giro por debajo del cual dos tramos se funden en uno, en grados. */
  collinearDeg?: number;
  /** Longitud mínima de un trazo ajustado, en píxeles. */
  minLengthPx?: number;
}

export interface CadRasterPoint {
  x: number;
  y: number;
}

export interface CadRasterStroke {
  /** Píxeles de la imagen con la Y hacia ARRIBA: el sistema de `cadImagePixelToWorld`. */
  points: CadRasterPoint[];
  closed: boolean;
  /** Longitud del trazo ajustado, en píxeles (incluye el cierre si lo hay). */
  lengthPx: number;
  /** Píxeles de esqueleto que produjeron el trazo. */
  pixels: number;
}

export interface CadRasterVectorizeResult {
  width: number;
  height: number;
  /** El umbral aplicado y si lo decidió Otsu o venía dado. */
  threshold: number;
  thresholdAuto: boolean;
  /** Píxeles por debajo del umbral, antes de limpiar. */
  inkPixels: number;
  minBlobPixels: number;
  /** Manchas tiradas por no llegar al área mínima, y los píxeles que se llevaron. */
  removedBlobs: number;
  removedPixels: number;
  keptBlobs: number;
  /** Píxeles que quedan tras adelgazar. */
  skeletonPixels: number;
  tolerancePx: number;
  strokes: CadRasterStroke[];
  notYet: readonly string[];
}

const DX = [1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, -1, -1, -1, 0, 1, 1, 1];

/** El umbral de Otsu de un mapa de luminancia: donde la varianza entre clases es máxima. */
export function cadRasterOtsuThreshold(luminance: Uint8Array): number {
  const histogram = new Float64Array(256);
  for (const value of luminance) histogram[value] += 1;
  const total = luminance.length;
  let weighted = 0;
  for (let level = 0; level < 256; level += 1) weighted += level * histogram[level];
  let backWeight = 0;
  let backWeighted = 0;
  let best = 0;
  let bestVariance = -1;
  for (let level = 0; level < 256; level += 1) {
    backWeight += histogram[level];
    if (backWeight === 0) continue;
    const foreWeight = total - backWeight;
    if (foreWeight === 0) break;
    backWeighted += level * histogram[level];
    const difference = backWeighted / backWeight - (weighted - backWeighted) / foreWeight;
    const variance = backWeight * foreWeight * difference * difference;
    if (variance > bestVariance) {
      bestVariance = variance;
      best = level;
    }
  }
  return best;
}

export interface CadRasterInkMask {
  /** 1 = tinta, 0 = papel. Fila 0 ARRIBA, como el archivo. */
  ink: Uint8Array;
  width: number;
  height: number;
  threshold: number;
  thresholdAuto: boolean;
  inkPixels: number;
}

/**
 * Tinta contra papel, y nada más. Se publica aparte porque el reconocedor de
 * texto (`raster-text-recognize.ts`) tiene que partir de EXACTAMENTE la misma
 * separación que la tubería: si cada uno umbraliza por su cuenta, las cajas de
 * los glifos leídos y las polilíneas del calco dejan de corresponderse y una
 * letra saldría dos veces —como TEXT y como trazos— sin que nada lo avise.
 */
export function cadRasterInkMask(image: CadRasterImage, threshold?: number): CadRasterInkMask {
  const luminance = cadRasterLuminance(image);
  const thresholdAuto = threshold === undefined;
  const level = thresholdAuto ? cadRasterOtsuThreshold(luminance) : Math.round(Math.min(255, Math.max(0, threshold)));
  const ink = new Uint8Array(image.width * image.height);
  let inkPixels = 0;
  for (let index = 0; index < ink.length; index += 1) {
    if (luminance[index] <= level) {
      ink[index] = 1;
      inkPixels += 1;
    }
  }
  return { ink, width: image.width, height: image.height, threshold: level, thresholdAuto, inkPixels };
}

/** El escaneo entero, de píxeles a trazos. Puro: ni red, ni navegador, ni azar. */
export function cadRasterVectorize(image: CadRasterImage, options: CadRasterVectorizeOptions = {}): CadRasterVectorizeResult {
  const { width, height } = image;
  const minBlobPixels = Math.max(1, Math.round(options.minBlobPixels ?? 8));
  const tolerancePx = Math.max(0, options.tolerancePx ?? 1.5);
  const collinearDeg = Math.max(0, options.collinearDeg ?? 8);
  const minLengthPx = Math.max(0, options.minLengthPx ?? 2);

  const { ink, threshold, thresholdAuto, inkPixels } = cadRasterInkMask(image, options.threshold);

  const cleaned = despeckle(ink, width, height, minBlobPixels);
  cadRasterThin(ink, width, height);
  let skeletonPixels = 0;
  for (const value of ink) skeletonPixels += value;

  const chains = traceSkeleton(ink, width, height);
  const strokes: CadRasterStroke[] = [];
  for (const chain of chains) {
    const raw = chain.indices.map((index) => ({ x: (index % width) + 0.5, y: height - 1 - Math.floor(index / width) + 0.5 }));
    const simplified = mergeCollinear(simplifyChain(raw, chain.closed, tolerancePx), chain.closed, collinearDeg);
    if (simplified.length < (chain.closed ? 3 : 2)) continue;
    const lengthPx = polylineLength(simplified, chain.closed);
    if (lengthPx < minLengthPx) continue;
    strokes.push({ points: simplified, closed: chain.closed, lengthPx, pixels: chain.indices.length });
  }

  return {
    width,
    height,
    threshold,
    thresholdAuto,
    inkPixels,
    minBlobPixels,
    removedBlobs: cleaned.removedBlobs,
    removedPixels: cleaned.removedPixels,
    keptBlobs: cleaned.keptBlobs,
    skeletonPixels,
    tolerancePx,
    strokes,
    notYet: CAD_RASTER_NOT_YET,
  };
}

// ---------------------------------------------------------------------------
// 2. Despeckle
// ---------------------------------------------------------------------------

/**
 * Tira las componentes conexas (8 vecinos) por debajo del área mínima y dice
 * cuántas y cuántos píxeles. El recorrido es con pila explícita a propósito:
 * una mancha de un millón de píxeles desbordaría la de llamadas.
 */
function despeckle(ink: Uint8Array, width: number, height: number, minBlobPixels: number): { removedBlobs: number; removedPixels: number; keptBlobs: number } {
  const seen = new Uint8Array(ink.length);
  const stack: number[] = [];
  const blob: number[] = [];
  let removedBlobs = 0;
  let removedPixels = 0;
  let keptBlobs = 0;
  for (let start = 0; start < ink.length; start += 1) {
    if (!ink[start] || seen[start]) continue;
    blob.length = 0;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length > 0) {
      const index = stack.pop()!;
      blob.push(index);
      const x = index % width;
      const y = (index - x) / width;
      for (let direction = 0; direction < 8; direction += 1) {
        const nx = x + DX[direction];
        const ny = y + DY[direction];
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const neighbour = ny * width + nx;
        if (!ink[neighbour] || seen[neighbour]) continue;
        seen[neighbour] = 1;
        stack.push(neighbour);
      }
    }
    if (blob.length < minBlobPixels) {
      removedBlobs += 1;
      removedPixels += blob.length;
      for (const index of blob) ink[index] = 0;
    } else {
      keptBlobs += 1;
    }
  }
  return { removedBlobs, removedPixels, keptBlobs };
}

// ---------------------------------------------------------------------------
// 3. Adelgazamiento de Zhang-Suen
// ---------------------------------------------------------------------------

/**
 * Deja la línea media de un píxel sin romper la conexión. Trabaja sobre `ink`.
 *
 * Se publica porque el reconocedor de texto compara ESQUELETO contra
 * ESQUELETO: una fuente de trazos es una línea de grosor cero, y comparar un
 * trazo engrosado por la tinta contra una plantilla de un píxel mide sobre
 * todo el grosor, no la forma. Los dos lados tienen que pasar por el MISMO
 * adelgazamiento o la comparación no es una comparación.
 */
export function cadRasterThin(ink: Uint8Array, width: number, height: number): void {
  const doomed: number[] = [];
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : ink[y * width + x]);
  // Un esqueleto converge en pocas pasadas (la mitad del grosor del trazo);
  // el tope sólo impide que un caso patológico gire para siempre.
  for (let pass = 0; pass < 128; pass += 1) {
    let changed = false;
    for (const half of [0, 1]) {
      doomed.length = 0;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (!ink[y * width + x]) continue;
          const p2 = at(x, y - 1);
          const p3 = at(x + 1, y - 1);
          const p4 = at(x + 1, y);
          const p5 = at(x + 1, y + 1);
          const p6 = at(x, y + 1);
          const p7 = at(x - 1, y + 1);
          const p8 = at(x - 1, y);
          const p9 = at(x - 1, y - 1);
          const neighbours = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (neighbours < 2 || neighbours > 6) continue;
          // Transiciones 0 → 1 dando la vuelta: una sola significa que el
          // píxel NO es un puente, y por eso se puede borrar sin partir el trazo.
          let transitions = 0;
          if (p2 === 0 && p3 === 1) transitions += 1;
          if (p3 === 0 && p4 === 1) transitions += 1;
          if (p4 === 0 && p5 === 1) transitions += 1;
          if (p5 === 0 && p6 === 1) transitions += 1;
          if (p6 === 0 && p7 === 1) transitions += 1;
          if (p7 === 0 && p8 === 1) transitions += 1;
          if (p8 === 0 && p9 === 1) transitions += 1;
          if (p9 === 0 && p2 === 1) transitions += 1;
          if (transitions !== 1) continue;
          if (half === 0) {
            if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue;
          } else if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue;
          doomed.push(y * width + x);
        }
      }
      if (doomed.length > 0) {
        changed = true;
        for (const index of doomed) ink[index] = 0;
      }
    }
    if (!changed) return;
  }
}

// ---------------------------------------------------------------------------
// 4. Recorrido del esqueleto
// ---------------------------------------------------------------------------

interface CadRasterChain {
  indices: number[];
  closed: boolean;
}

function traceSkeleton(ink: Uint8Array, width: number, height: number): CadRasterChain[] {
  /**
   * Los vecinos ÚTILES de un píxel. Un enlace en diagonal se descarta cuando
   * uno de sus dos ortogonales también es tinta: ahí el camino corto existe y
   * contar los dos convertiría la esquina de un rectángulo en un nodo de
   * grado 3, partiendo el contorno en trozos.
   */
  const neighboursOf = (index: number): number[] => {
    const x = index % width;
    const y = (index - x) / width;
    const out: number[] = [];
    for (let direction = 0; direction < 8; direction += 1) {
      const dx = DX[direction];
      const dy = DY[direction];
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (!ink[ny * width + nx]) continue;
      if (dx !== 0 && dy !== 0) {
        const sideA = ink[y * width + nx];
        const sideB = ink[ny * width + x];
        if (sideA || sideB) continue;
      }
      out.push(direction);
    }
    return out;
  };

  const directions = new Map<number, number[]>();
  const inkIndices: number[] = [];
  for (let index = 0; index < ink.length; index += 1) {
    if (!ink[index]) continue;
    inkIndices.push(index);
    directions.set(index, neighboursOf(index));
  }
  const step = (index: number, direction: number) => index + DY[direction] * width + DX[direction];
  const used = new Set<number>();
  const markEdge = (index: number, direction: number) => {
    used.add(index * 8 + direction);
    used.add(step(index, direction) * 8 + ((direction + 4) % 8));
  };
  const degreeOf = (index: number) => directions.get(index)!.length;
  const freeDirection = (index: number) => directions.get(index)!.find((direction) => !used.has(index * 8 + direction));

  const chains: CadRasterChain[] = [];
  const guard = inkIndices.length + 2;

  // Primero desde extremos y nodos: todo lo que no es un bucle sale de aquí.
  for (const seed of inkIndices) {
    if (degreeOf(seed) === 2) continue;
    for (const direction of directions.get(seed)!) {
      if (used.has(seed * 8 + direction)) continue;
      const indices = [seed];
      let current = seed;
      let heading = direction;
      for (let hop = 0; hop < guard; hop += 1) {
        const next = step(current, heading);
        markEdge(current, heading);
        indices.push(next);
        if (degreeOf(next) !== 2) break;
        const onward = freeDirection(next);
        if (onward === undefined) break;
        current = next;
        heading = onward;
      }
      chains.push({ indices, closed: false });
    }
  }

  // Lo que queda con todos sus enlaces libres y grado 2 es un bucle cerrado.
  for (const seed of inkIndices) {
    if (degreeOf(seed) !== 2) continue;
    const first = freeDirection(seed);
    if (first === undefined) continue;
    const indices = [seed];
    let current = seed;
    let heading = first;
    for (let hop = 0; hop < guard; hop += 1) {
      const next = step(current, heading);
      markEdge(current, heading);
      if (next === seed) break;
      indices.push(next);
      const onward = freeDirection(next);
      if (onward === undefined) break;
      current = next;
      heading = onward;
    }
    chains.push({ indices, closed: indices.length >= 3 });
  }

  return chains;
}

// ---------------------------------------------------------------------------
// 5. Ajuste de la cadena
// ---------------------------------------------------------------------------

/** Douglas-Peucker; en un bucle se parte por el punto más lejano al primero. */
function simplifyChain(points: readonly CadRasterPoint[], closed: boolean, tolerance: number): CadRasterPoint[] {
  if (points.length <= 2) return points.map((point) => ({ ...point }));
  if (!closed) return douglasPeucker(points, tolerance);
  let far = 0;
  let farthest = -1;
  for (let index = 1; index < points.length; index += 1) {
    const distance = Math.hypot(points[index].x - points[0].x, points[index].y - points[0].y);
    if (distance > farthest) {
      farthest = distance;
      far = index;
    }
  }
  const first = douglasPeucker(points.slice(0, far + 1), tolerance);
  const second = douglasPeucker([...points.slice(far), points[0]], tolerance);
  // Se quitan las dos puntas repetidas: el punto de corte y el de cierre.
  return [...first, ...second.slice(1, second.length - 1)];
}

function douglasPeucker(points: readonly CadRasterPoint[], tolerance: number): CadRasterPoint[] {
  if (points.length <= 2) return points.map((point) => ({ ...point }));
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  // Pila explícita: una cadena de cien mil píxeles desbordaría la recursión.
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [from, to] = stack.pop()!;
    if (to <= from + 1) continue;
    let worst = -1;
    let worstAt = from;
    for (let index = from + 1; index < to; index += 1) {
      const distance = pointToSegment(points[index], points[from], points[to]);
      if (distance > worst) {
        worst = distance;
        worstAt = index;
      }
    }
    if (worst <= tolerance) continue;
    keep[worstAt] = 1;
    stack.push([from, worstAt], [worstAt, to]);
  }
  const out: CadRasterPoint[] = [];
  for (let index = 0; index < points.length; index += 1) if (keep[index]) out.push({ ...points[index] });
  return out;
}

/**
 * Funde los tramos que siguen la misma dirección. Douglas-Peucker deja el
 * vértice donde empezó a caminar aunque no sea una esquina; en un bucle eso es
 * la costura, y sin este paso un rectángulo sale con cinco vértices.
 */
function mergeCollinear(points: CadRasterPoint[], closed: boolean, collinearDeg: number): CadRasterPoint[] {
  if (collinearDeg <= 0) return points;
  const limit = (collinearDeg * Math.PI) / 180;
  const minimum = closed ? 3 : 2;
  const result = points.slice();
  let removed = true;
  while (removed && result.length > minimum) {
    removed = false;
    for (let index = closed ? 0 : 1; index < (closed ? result.length : result.length - 1); index += 1) {
      if (result.length <= minimum) break;
      const previous = result[(index - 1 + result.length) % result.length];
      const current = result[index];
      const next = result[(index + 1) % result.length];
      const inbound = Math.atan2(current.y - previous.y, current.x - previous.x);
      const outbound = Math.atan2(next.y - current.y, next.x - current.x);
      let turn = Math.abs(outbound - inbound);
      if (turn > Math.PI) turn = 2 * Math.PI - turn;
      if (turn > limit) continue;
      result.splice(index, 1);
      removed = true;
      index -= 1;
    }
  }
  return result;
}

function pointToSegment(point: CadRasterPoint, from: CadRasterPoint, to: CadRasterPoint): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const squared = dx * dx + dy * dy;
  if (squared < 1e-12) return Math.hypot(point.x - from.x, point.y - from.y);
  const t = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / squared));
  return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy));
}

function polylineLength(points: readonly CadRasterPoint[], closed: boolean): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  if (closed && points.length > 2) total += Math.hypot(points[0].x - points[points.length - 1].x, points[0].y - points[points.length - 1].y);
  return total;
}
