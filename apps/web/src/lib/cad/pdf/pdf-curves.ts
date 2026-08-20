/**
 * Curvas de Bézier del PDF → geometría del dibujo, con el error MEDIDO.
 *
 * ## Las dos conversiones, y por qué existen las dos
 *
 * Un `c` del PDF es una Bézier cúbica. El dibujo tiene dos sitios donde puede
 * caber, y no son intercambiables:
 *
 *  - **SPLINE**: una Bézier cúbica ES una NURBS de grado 3 con cuatro puntos de
 *    control y nudos `[0 0 0 0 1 1 1 1]`. No es una aproximación: es la misma
 *    curva escrita en otra notación. Error CERO, exactamente cero, y se puede
 *    afirmar sin medir nada porque es álgebra.
 *  - **POLILÍNEA**: la curva se parte en tramos rectos hasta que la desviación
 *    baja de una tolerancia. Es lo que hace `PDFIMPORT` de AutoCAD y lo que casi
 *    todo el mundo quiere, porque una polilínea se recorta, se empalma, se acota
 *    y se exporta a cualquier sitio; una spline, a medias.
 *
 * La elección es del usuario y la consecuencia se DECLARA. Lo que no se hace es
 * elegir por él y callar el error: una curva aproximada sin decir cuánto se
 * desvía es geometría plausible de precisión desconocida, y en un plano eso vale
 * menos que nada.
 *
 * ## El error se mide, no se promete
 *
 * La subdivisión adaptativa GARANTIZA la tolerancia por construcción, pero la
 * garantía es una propiedad del algoritmo y este repositorio no acepta
 * propiedades sin comprobar. Así que después de aplanar se MUESTREA la curva
 * original y se calcula la distancia real a la polilínea resultante. Lo que se
 * publica es esa distancia, no la tolerancia pedida.
 */
import type { CadPdfPoint, CadPdfSegment, CadPdfSubpath } from "./pdf-content";

const distance = (a: CadPdfPoint, b: CadPdfPoint) => Math.hypot(b.x - a.x, b.y - a.y);

/** Punto de una Bézier cúbica en el parámetro `t`. */
export function cadPdfBezierAt(
  p0: CadPdfPoint, p1: CadPdfPoint, p2: CadPdfPoint, p3: CadPdfPoint, t: number,
): CadPdfPoint {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/**
 * Distancia del punto al SEGMENTO (no a la recta que lo contiene).
 *
 * La diferencia importa en los extremos: contra la recta infinita, un punto que
 * se sale por detrás del arranque daría una distancia pequeña y falsa, y el
 * error medido saldría mejor de lo que es.
 */
function pointToSegment(point: CadPdfPoint, from: CadPdfPoint, to: CadPdfPoint): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-18) return distance(point, from);
  let t = ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy));
}

/** Desviación máxima de los puntos de control respecto de la cuerda. */
function flatness(p0: CadPdfPoint, p1: CadPdfPoint, p2: CadPdfPoint, p3: CadPdfPoint): number {
  return Math.max(pointToSegment(p1, p0, p3), pointToSegment(p2, p0, p3));
}

/**
 * Aplana una Bézier cúbica por subdivisión adaptativa.
 *
 * Adaptativa y no por número fijo de tramos: una curva casi recta se resuelve
 * con un tramo y una cerrada con veinte. Un número fijo gasta vértices donde no
 * hacen falta —y una polilínea de un plano puede tener miles de curvas— o se
 * queda corto justo donde se nota.
 *
 * `depth` tope 16: son 65 536 tramos como máximo por curva. Una curva que a esa
 * profundidad todavía no cumple la tolerancia es degenerada, y seguir sería
 * agotar la memoria del navegador por un archivo mal escrito.
 */
export function cadPdfFlattenBezier(
  p0: CadPdfPoint, p1: CadPdfPoint, p2: CadPdfPoint, p3: CadPdfPoint,
  tolerance: number,
  into: CadPdfPoint[] = [],
  depth = 0,
): CadPdfPoint[] {
  if (depth >= 16 || flatness(p0, p1, p2, p3) <= tolerance) {
    into.push(p3);
    return into;
  }
  // De Casteljau en t = 0,5. Es una subdivisión EXACTA: las dos mitades juntas
  // son la misma curva, así que subdividir no introduce error propio.
  const mid = (a: CadPdfPoint, b: CadPdfPoint): CadPdfPoint => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  const p01 = mid(p0, p1);
  const p12 = mid(p1, p2);
  const p23 = mid(p2, p3);
  const p012 = mid(p01, p12);
  const p123 = mid(p12, p23);
  const middle = mid(p012, p123);
  cadPdfFlattenBezier(p0, p01, p012, middle, tolerance, into, depth + 1);
  cadPdfFlattenBezier(middle, p123, p23, p3, tolerance, into, depth + 1);
  return into;
}

/**
 * Distancia máxima REAL entre la curva y la polilínea que la sustituye.
 *
 * Se muestrea la Bézier en 64 parámetros y se mide contra el tramo más cercano.
 * No es una cota superior demostrada —para eso está la subdivisión— sino una
 * medida independiente: si el aplanado tuviera un fallo, este número lo delata
 * en vez de repetir la promesa del algoritmo.
 */
export function cadPdfMeasureFlattenError(
  p0: CadPdfPoint, p1: CadPdfPoint, p2: CadPdfPoint, p3: CadPdfPoint,
  polyline: readonly CadPdfPoint[],
): number {
  if (polyline.length < 2) return 0;
  let worst = 0;
  const SAMPLES = 64;
  for (let index = 1; index < SAMPLES; index += 1) {
    const point = cadPdfBezierAt(p0, p1, p2, p3, index / SAMPLES);
    let best = Number.POSITIVE_INFINITY;
    for (let segment = 0; segment + 1 < polyline.length; segment += 1)
      best = Math.min(best, pointToSegment(point, polyline[segment], polyline[segment + 1]));
    worst = Math.max(worst, best);
  }
  return worst;
}

/** Un trozo de camino ya resuelto: recto o curvo, con sus puntos. */
export type CadPdfFlatPiece =
  | { kind: "polyline"; points: CadPdfPoint[]; closed: boolean }
  /** Bézier cúbica EXACTA, para emitir como spline de grado 3. */
  | { kind: "bezier"; points: [CadPdfPoint, CadPdfPoint, CadPdfPoint, CadPdfPoint] };

export interface CadPdfFlattenResult {
  pieces: CadPdfFlatPiece[];
  /** Cuántas Béziers había en el camino. */
  curves: number;
  /** El peor error medido al aplanar, en las mismas unidades de los puntos. */
  maxError: number;
}

export type CadPdfCurveMode = "polyline" | "spline";

/**
 * Convierte un subcamino del PDF en piezas listas para volverse entidades.
 *
 * En modo `polyline` sale UNA pieza por subcamino: es lo que un arquitecto
 * espera al designar «esa pared» y encontrarse una sola polilínea. En modo
 * `spline`, cada Bézier sale entera y los tramos rectos consecutivos se agrupan:
 * más entidades, error cero.
 */
export function cadPdfFlattenSubpath(
  subpath: CadPdfSubpath,
  mode: CadPdfCurveMode,
  tolerance: number,
): CadPdfFlattenResult {
  const pieces: CadPdfFlatPiece[] = [];
  let curves = 0;
  let maxError = 0;

  if (mode === "polyline") {
    const points: CadPdfPoint[] = [subpath.start];
    let cursor = subpath.start;
    for (const segment of subpath.segments) {
      if (segment.type === "line") {
        points.push(segment.to);
        cursor = segment.to;
        continue;
      }
      curves += 1;
      const flattened = cadPdfFlattenBezier(cursor, segment.c1, segment.c2, segment.to, tolerance);
      const withStart = [cursor, ...flattened];
      maxError = Math.max(
        maxError,
        cadPdfMeasureFlattenError(cursor, segment.c1, segment.c2, segment.to, withStart),
      );
      points.push(...flattened);
      cursor = segment.to;
    }
    pieces.push({ kind: "polyline", points, closed: subpath.closed });
    return { pieces, curves, maxError };
  }

  let run: CadPdfPoint[] = [subpath.start];
  let cursor = subpath.start;
  const flushRun = () => {
    if (run.length >= 2) pieces.push({ kind: "polyline", points: run, closed: false });
    run = [];
  };
  for (const segment of subpath.segments) {
    if (segment.type === "line") {
      if (run.length === 0) run.push(cursor);
      run.push(segment.to);
      cursor = segment.to;
      continue;
    }
    flushRun();
    curves += 1;
    pieces.push({ kind: "bezier", points: [cursor, segment.c1, segment.c2, segment.to] });
    cursor = segment.to;
  }
  // Un subcamino cerrado necesita el tramo de vuelta al arranque, que el PDF no
  // escribe: lo implica el operador `h`. Sin él, un rectángulo entra abierto.
  if (subpath.closed && distance(cursor, subpath.start) > 1e-9) {
    if (run.length === 0) run.push(cursor);
    run.push(subpath.start);
  }
  flushRun();
  return { pieces, curves, maxError };
}

/** El camino no dibuja nada: un solo punto o tramos de longitud cero. */
export function cadPdfIsDegenerate(points: readonly CadPdfPoint[]): boolean {
  if (points.length < 2) return true;
  const first = points[0];
  return points.every((point) => distance(point, first) < 1e-9);
}

/** Quita vértices repetidos, que el PDF emite en abundancia. */
export function cadPdfDedupe(points: readonly CadPdfPoint[], epsilon = 1e-9): CadPdfPoint[] {
  const out: CadPdfPoint[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (!last || distance(last, point) > epsilon) out.push(point);
  }
  return out;
}

/** Los segmentos de un subcamino, para contar sin aplanar. */
export const cadPdfCurveCount = (segments: readonly CadPdfSegment[]): number =>
  segments.filter((segment) => segment.type === "curve").length;
