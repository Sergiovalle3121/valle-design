/**
 * Intersecciones de geometría del CAD (VD-CAD-DEPTH-A7).
 *
 * Saber DÓNDE se cruzan dos entidades es la base de casi todo lo que hace a un
 * CAD sentirse profesional: recortar (TRIM) y extender (EXTEND) hasta un borde,
 * el OSNAP "intersección", empalmes generales y acotar a un cruce. AutoCAD lo
 * da por sentado; la caja rectangular no lo tenía. Este módulo resuelve las
 * intersecciones línea-línea, línea-círculo, círculo-círculo y sus variantes
 * con arcos (recortadas al barrido). Geometría pura, sin dependencias del
 * editor.
 */
import { arcContainsAngle, type CadVec2 } from "./primitives";

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
function angleDeg(center: CadVec2, point: CadVec2): number {
  return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
}

/**
 * Intersección de dos rectas dadas por dos puntos cada una. Con `asSegments`
 * exige que el cruce caiga dentro de ambos segmentos. Null si son paralelas (o
 * fuera de los segmentos en modo segmento).
 */
export function lineLineIntersection(
  p1: CadVec2,
  p2: CadVec2,
  p3: CadVec2,
  p4: CadVec2,
  asSegments = false,
): CadVec2 | null {
  const d1 = sub(p2, p1);
  const d2 = sub(p4, p3);
  const denom = cross(d1, d2);
  if (Math.abs(denom) < EPS) return null;
  const diff = sub(p3, p1);
  const t = cross(diff, d2) / denom;
  const u = cross(diff, d1) / denom;
  if (
    asSegments &&
    (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS)
  )
    return null;
  return add(p1, scale(d1, t));
}

/**
 * Intersecciones de una recta (o segmento, con `asSegment`) con una
 * circunferencia. Devuelve 0, 1 (tangente) o 2 puntos.
 */
export function lineCircleIntersections(
  a: CadVec2,
  b: CadVec2,
  center: CadVec2,
  radius: number,
  asSegment = false,
): CadVec2[] {
  const d = sub(b, a);
  const f = sub(a, center);
  const A = dot(d, d);
  if (A < EPS) return [];
  const B = 2 * dot(f, d);
  const C = dot(f, f) - radius * radius;
  const disc = B * B - 4 * A * C;
  if (disc < -EPS) return [];
  const sq = Math.sqrt(Math.max(0, disc));
  const ts = disc < EPS ? [-B / (2 * A)] : [(-B - sq) / (2 * A), (-B + sq) / (2 * A)];
  const points: CadVec2[] = [];
  for (const t of ts) {
    if (asSegment && (t < -EPS || t > 1 + EPS)) continue;
    points.push(add(a, scale(d, t)));
  }
  return points;
}

/**
 * Intersecciones de dos circunferencias. Devuelve 0 (disjuntas, contenidas o
 * concéntricas), 1 (tangentes) o 2 puntos.
 */
export function circleCircleIntersections(
  c1: CadVec2,
  r1: number,
  c2: CadVec2,
  r2: number,
): CadVec2[] {
  const between = sub(c2, c1);
  const d = Math.hypot(between.x, between.y);
  if (d < EPS) return []; // concéntricas
  if (d > r1 + r2 + EPS) return []; // demasiado lejos
  if (d < Math.abs(r1 - r2) - EPS) return []; // una dentro de la otra
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const hSq = r1 * r1 - a * a;
  const h = Math.sqrt(Math.max(0, hSq));
  const mid = add(c1, scale(between, a / d));
  if (h < EPS) return [mid]; // tangentes
  const perp = { x: -between.y / d, y: between.x / d };
  return [add(mid, scale(perp, h)), sub(mid, scale(perp, h))];
}

/** Intersecciones de una recta/segmento con un arco (recortadas al barrido). */
export function lineArcIntersections(
  a: CadVec2,
  b: CadVec2,
  center: CadVec2,
  radius: number,
  startAngle: number,
  endAngle: number,
  asSegment = false,
): CadVec2[] {
  return lineCircleIntersections(a, b, center, radius, asSegment).filter((p) =>
    arcContainsAngle(angleDeg(center, p), startAngle, endAngle),
  );
}

/** Intersecciones de dos arcos (círculo-círculo recortado a ambos barridos). */
export function arcArcIntersections(
  c1: CadVec2,
  r1: number,
  start1: number,
  end1: number,
  c2: CadVec2,
  r2: number,
  start2: number,
  end2: number,
): CadVec2[] {
  return circleCircleIntersections(c1, r1, c2, r2).filter(
    (p) =>
      arcContainsAngle(angleDeg(c1, p), start1, end1) &&
      arcContainsAngle(angleDeg(c2, p), start2, end2),
  );
}
