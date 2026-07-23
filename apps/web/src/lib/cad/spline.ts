/**
 * Curvas spline (Bézier cúbica) del CAD (AXOS-CAD-DEPTH-A10).
 *
 * La SPLINE es la curva libre de AutoCAD: trazos suaves que pasan por una serie
 * de puntos (una rampa, un mueble curvo, un contorno orgánico). La caja
 * rectangular no tenía nada parecido. Este módulo modela la curva de Bézier
 * cúbica —evaluar, tangente, teselar, medir, partir— y además convierte una
 * lista de puntos en una spline suave que pasa por todos ellos (Catmull-Rom).
 * Geometría pura, sin dependencias del editor.
 */
import type { CadVec2 } from "./primitives";

export interface CubicBezier {
  p0: CadVec2;
  p1: CadVec2;
  p2: CadVec2;
  p3: CadVec2;
}

function lerp(a: CadVec2, b: CadVec2, t: number): CadVec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Punto sobre la curva al parámetro t ∈ [0,1]. B(0)=p0, B(1)=p3. */
export function bezierPoint(bez: CubicBezier, t: number): CadVec2 {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * bez.p0.x + b * bez.p1.x + c * bez.p2.x + d * bez.p3.x,
    y: a * bez.p0.y + b * bez.p1.y + c * bez.p2.y + d * bez.p3.y,
  };
}

/** Vector tangente (derivada) en el parámetro t. */
export function bezierTangent(bez: CubicBezier, t: number): CadVec2 {
  const mt = 1 - t;
  const a = 3 * mt * mt;
  const b = 6 * mt * t;
  const c = 3 * t * t;
  return {
    x: a * (bez.p1.x - bez.p0.x) + b * (bez.p2.x - bez.p1.x) + c * (bez.p3.x - bez.p2.x),
    y: a * (bez.p1.y - bez.p0.y) + b * (bez.p2.y - bez.p1.y) + c * (bez.p3.y - bez.p2.y),
  };
}

/** Teselado en una polilínea de `segments` tramos (mínimo 1): segments+1 puntos. */
export function bezierTessellate(bez: CubicBezier, segments = 32): CadVec2[] {
  const steps = Math.max(1, Math.floor(segments));
  const points: CadVec2[] = [];
  for (let i = 0; i <= steps; i += 1) points.push(bezierPoint(bez, i / steps));
  return points;
}

/** Longitud aproximada por teselado (más `samples`, más precisión). */
export function bezierLength(bez: CubicBezier, samples = 64): number {
  const pts = bezierTessellate(bez, samples);
  let total = 0;
  for (let i = 1; i < pts.length; i += 1) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return total;
}

/** Parte la curva en t (De Casteljau) en dos Béziers que la reconstruyen. */
export function bezierSplit(
  bez: CubicBezier,
  t: number,
): [CubicBezier, CubicBezier] {
  const a = lerp(bez.p0, bez.p1, t);
  const b = lerp(bez.p1, bez.p2, t);
  const c = lerp(bez.p2, bez.p3, t);
  const d = lerp(a, b, t);
  const e = lerp(b, c, t);
  const f = lerp(d, e, t);
  return [
    { p0: bez.p0, p1: a, p2: d, p3: f },
    { p0: f, p1: e, p2: c, p3: bez.p3 },
  ];
}

/** Caja envolvente aproximada por teselado. */
export function bezierBounds(bez: CubicBezier, samples = 32) {
  const pts = bezierTessellate(bez, samples);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Convierte una lista de puntos en una spline suave (Catmull-Rom → Béziers) que
 * PASA por todos los puntos. Devuelve una Bézier por cada tramo entre puntos
 * consecutivos. Con menos de 2 puntos devuelve []. `tension` 0 = suave estándar.
 */
export function catmullRomToBeziers(
  points: CadVec2[],
  tension = 0,
): CubicBezier[] {
  if (points.length < 2) return [];
  const beziers: CubicBezier[] = [];
  const s = (1 - tension) / 6;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : points.length - 1];
    beziers.push({
      p0: p1,
      p1: { x: p1.x + (p2.x - p0.x) * s, y: p1.y + (p2.y - p0.y) * s },
      p2: { x: p2.x - (p3.x - p1.x) * s, y: p2.y - (p3.y - p1.y) * s },
      p3: p2,
    });
  }
  return beziers;
}
