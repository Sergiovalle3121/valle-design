/**
 * Medición geométrica del CAD (Fase 67/72 — zonas, regiones y análisis).
 *
 * Helpers PUROS sobre polígonos: área (shoelace), perímetro, centroide,
 * punto-en-polígono (ray casting), bounding box y convex hull (monotone chain).
 * Los usan las zonas/keep-out (área para el take-off), el análisis ("¿en qué
 * zona cae esta estación?") y el ajuste de una zona alrededor de un grupo de
 * estaciones. Coordenadas en unidades del footprint.
 *
 * Correr tests:  npx tsx src/components/line-engineering/geom-measure.spec.ts
 */
import { Point } from './precision-input';

/** Área del polígono (shoelace), siempre ≥ 0. Polígono implícitamente cerrado. */
export function polygonArea(points: Point[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** Perímetro del polígono cerrado. */
export function polygonPerimeter(points: Point[]): number {
  if (points.length < 2) return 0;
  let p = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    p += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return p;
}

/** Centroide (centro de masa) del polígono. Cae al promedio si el área es ~0. */
export function polygonCentroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length < 3) {
    const s = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: s.x / points.length, y: s.y / points.length };
  }
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const p0 = points[i];
    const p1 = points[(i + 1) % points.length];
    const cross = p0.x * p1.y - p1.x * p0.y;
    a += cross;
    cx += (p0.x + p1.x) * cross;
    cy += (p0.y + p1.y) * cross;
  }
  if (Math.abs(a) < 1e-9) {
    const s = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: s.x / points.length, y: s.y / points.length };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/** ¿Está el punto dentro del polígono? Ray casting (borde cuenta como dentro de forma laxa). */
export function pointInPolygon(p: Point, points: Point[]): boolean {
  if (points.length < 3) return false;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    const intersects = a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export interface BBox { minX: number; minY: number; maxX: number; maxY: number; w: number; h: number }

/** Caja contenedora de un conjunto de puntos. */
export function boundingBox(points: Point[]): BBox {
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

/**
 * Convex hull (Andrew's monotone chain). Devuelve los vértices del casco en
 * sentido antihorario, sin repetir el primero. Útil para envolver un grupo de
 * estaciones en una zona.
 */
export function convexHull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  if (pts.length < 3) return pts;
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}
