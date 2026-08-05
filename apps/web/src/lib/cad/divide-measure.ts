/**
 * DIVIDE y MEASURE del CAD (VD-CAD-DEPTH-B6).
 *
 * Repartir puntos a lo largo de una curva: DIVIDE la parte en N tramos iguales;
 * MEASURE coloca una marca cada cierta distancia. Sirve para postes de una
 * cerca, escalones de una rampa, luminarias equiespaciadas, marcas de una regla.
 * Opera sobre una polilínea (las curvas —arco, spline— se teselan finamente
 * antes, de modo que "distancia igual" es longitud de arco real). Devuelve el
 * punto y el ángulo de la tangente en cada marca. Geometría pura.
 */
import type { CadVec2 } from "./primitives";

export interface PathMark {
  point: CadVec2;
  /** Ángulo de la tangente del camino en la marca, en grados. */
  angle: number;
}

function polylineLength(points: CadVec2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

/** Punto y ángulo de la tangente a distancia `d` (recortada a [0, longitud]). */
export function pointAtDistance(points: CadVec2[], d: number): PathMark {
  if (points.length === 0) return { point: { x: 0, y: 0 }, angle: 0 };
  if (points.length === 1) return { point: points[0], angle: 0 };
  const total = polylineLength(points);
  const target = Math.max(0, Math.min(d, total));
  let acc = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (seg < 1e-12) continue;
    if (acc + seg >= target - 1e-12) {
      const t = (target - acc) / seg;
      return {
        point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
      };
    }
    acc += seg;
  }
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  return {
    point: last,
    angle: (Math.atan2(last.y - prev.y, last.x - prev.x) * 180) / Math.PI,
  };
}

/**
 * DIVIDE: reparte el camino en `parts` tramos iguales y devuelve los puntos de
 * división. Por defecto sólo los interiores (parts−1 puntos); con `includeEnds`
 * añade el inicio y el fin (parts+1 puntos). Devuelve [] si parts < 1.
 */
export function dividePath(
  points: CadVec2[],
  parts: number,
  includeEnds = false,
): PathMark[] {
  const n = Math.floor(parts);
  if (n < 1 || points.length < 2) return [];
  const total = polylineLength(points);
  const marks: PathMark[] = [];
  const from = includeEnds ? 0 : 1;
  const to = includeEnds ? n : n - 1;
  for (let k = from; k <= to; k += 1) {
    marks.push(pointAtDistance(points, (total * k) / n));
  }
  return marks;
}

/**
 * MEASURE: coloca marcas cada `interval` a lo largo del camino, empezando por el
 * inicio. Por defecto no marca el punto de inicio (distancia 0); con
 * `includeStart` sí. Devuelve [] si interval ≤ 0.
 */
export function measurePath(
  points: CadVec2[],
  interval: number,
  includeStart = false,
): PathMark[] {
  if (interval <= 0 || points.length < 2) return [];
  const total = polylineLength(points);
  const marks: PathMark[] = [];
  if (includeStart) marks.push(pointAtDistance(points, 0));
  for (let d = interval; d <= total + 1e-9; d += interval) {
    marks.push(pointAtDistance(points, d));
  }
  return marks;
}
