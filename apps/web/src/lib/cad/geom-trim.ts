/**
 * Recortar, extender y partir segmentos del CAD (VD-CAD-DEPTH-A8).
 *
 * TRIM, EXTEND y BREAK son de los comandos más usados en AutoCAD y el modelo de
 * caja no los tenía. Este módulo los implementa sobre segmentos reales usando
 * las intersecciones de la fase A7: recortar contra un borde, extender hasta
 * tocar un borde y partir en uno o dos puntos. Geometría pura, sin dependencias
 * del editor.
 */
import type { CadVec2 } from "./primitives";

export interface Segment {
  a: CadVec2;
  b: CadVec2;
}

const EPS = 1e-9;

function sub(a: CadVec2, b: CadVec2): CadVec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}
function add(a: CadVec2, b: CadVec2): CadVec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}
function scale(a: CadVec2, k: number): CadVec2 {
  return { x: a.x * k, y: a.y * k };
}
function dot(a: CadVec2, b: CadVec2): number {
  return a.x * b.x + a.y * b.y;
}
function cross(a: CadVec2, b: CadVec2): number {
  return a.x * b.y - a.y * b.x;
}
function distance(a: CadVec2, b: CadVec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

interface IntersectionParams {
  point: CadVec2;
  /** Parámetro sobre la recta ab (0 = a, 1 = b; puede salir del rango). */
  t: number;
  /** Parámetro sobre la recta cd. */
  u: number;
}

function intersectParams(
  a: CadVec2,
  b: CadVec2,
  c: CadVec2,
  d: CadVec2,
): IntersectionParams | null {
  const r = sub(b, a);
  const s = sub(d, c);
  const denom = cross(r, s);
  if (Math.abs(denom) < EPS) return null;
  const diff = sub(c, a);
  const t = cross(diff, s) / denom;
  const u = cross(diff, r) / denom;
  return { point: add(a, scale(r, t)), t, u };
}

function projectOnSegment(
  p: CadVec2,
  a: CadVec2,
  b: CadVec2,
): { point: CadVec2; t: number } {
  const ab = sub(b, a);
  const lenSq = dot(ab, ab);
  if (lenSq < EPS) return { point: a, t: 0 };
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / lenSq));
  return { point: add(a, scale(ab, t)), t };
}

/**
 * Recorta el segmento ab contra el borde (segmento cd), conservando el trozo
 * del lado de `keepPoint`. El cruce debe caer dentro de ambos segmentos. Null si
 * no hay cruce interior (nada que recortar).
 */
export function trimSegment(
  a: CadVec2,
  b: CadVec2,
  c: CadVec2,
  d: CadVec2,
  keepPoint: CadVec2,
): Segment | null {
  const hit = intersectParams(a, b, c, d);
  if (!hit) return null;
  if (hit.t <= EPS || hit.t >= 1 - EPS) return null; // cruce no interior a ab
  if (hit.u < -EPS || hit.u > 1 + EPS) return null; // fuera del borde
  const first: Segment = { a, b: hit.point };
  const second: Segment = { a: hit.point, b };
  const dFirst = Math.min(distance(keepPoint, a), distance(keepPoint, hit.point));
  const dSecond = Math.min(distance(keepPoint, hit.point), distance(keepPoint, b));
  return dFirst <= dSecond ? first : second;
}

/**
 * Extiende el segmento ab hasta tocar el borde (segmento cd). Alarga el extremo
 * que apunta hacia el borde (b si el cruce queda más allá de b; a si queda antes
 * de a). Null si el borde queda fuera de su segmento o si ab ya lo cruza.
 */
export function extendSegment(
  a: CadVec2,
  b: CadVec2,
  c: CadVec2,
  d: CadVec2,
): Segment | null {
  const hit = intersectParams(a, b, c, d);
  if (!hit) return null;
  if (hit.u < -EPS || hit.u > 1 + EPS) return null; // no alcanza el borde
  if (hit.t > 1 + EPS) return { a, b: hit.point }; // extiende el extremo b
  if (hit.t < -EPS) return { a: hit.point, b }; // extiende el extremo a
  return null; // el cruce ya está dentro de ab
}

/**
 * Parte el segmento ab en el punto dado (proyectado sobre ab) en dos tramos.
 * Null si el punto cae en un extremo (no habría dos tramos).
 */
export function breakSegment(
  a: CadVec2,
  b: CadVec2,
  at: CadVec2,
): [Segment, Segment] | null {
  const { point, t } = projectOnSegment(at, a, b);
  if (t <= EPS || t >= 1 - EPS) return null;
  return [
    { a, b: point },
    { a: point, b },
  ];
}

/**
 * Parte el segmento ab quitando el tramo entre p1 y p2 (proyectados), y devuelve
 * los dos tramos exteriores. Null si ambos puntos coinciden.
 */
export function breakSegmentBetween(
  a: CadVec2,
  b: CadVec2,
  p1: CadVec2,
  p2: CadVec2,
): [Segment, Segment] | null {
  const j1 = projectOnSegment(p1, a, b);
  const j2 = projectOnSegment(p2, a, b);
  const [lo, hi] = j1.t <= j2.t ? [j1, j2] : [j2, j1];
  if (hi.t - lo.t <= EPS) return null;
  return [
    { a, b: lo.point },
    { a: hi.point, b },
  ];
}
