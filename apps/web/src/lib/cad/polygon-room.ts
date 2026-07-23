/**
 * Cuartos poligonales del CAD (AXOS-CAD-DEPTH-A6).
 *
 * El CAD histórico sólo sabía de cuartos rectangulares (la caja): un cuarto en
 * L, un salón hexagonal o una nave con chaflán eran imposibles. Este módulo
 * trata un cuarto como un POLÍGONO arbitrario y ofrece las consultas que un CAD
 * real necesita: ¿este punto está dentro?, ¿cuánto mide el área y el perímetro?,
 * ¿dónde está el centro (para poner la etiqueta)?, ¿es convexo?, ¿en qué sentido
 * están los vértices? Geometría pura, sin dependencias del editor.
 */
import type { CadVec2 } from "./primitives";

/** Muro (arista) de un cuarto poligonal. */
export interface RoomWall {
  a: CadVec2;
  b: CadVec2;
}

/** Área con signo (regla del zapatero): > 0 si los vértices van CCW. */
export function signedArea(points: CadVec2[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const cur = points[i];
    const next = points[(i + 1) % points.length];
    sum += cur.x * next.y - next.x * cur.y;
  }
  return sum / 2;
}

/** Área (siempre positiva) del cuarto. */
export function polygonArea(points: CadVec2[]): number {
  return Math.abs(signedArea(points));
}

/** Perímetro del cuarto (suma de todos los muros). */
export function polygonPerimeter(points: CadVec2[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    const cur = points[i];
    const next = points[(i + 1) % points.length];
    total += Math.hypot(next.x - cur.x, next.y - cur.y);
  }
  return total;
}

/**
 * Centro (centroide de área) del cuarto, ideal para colocar la etiqueta. Null
 * si el polígono es degenerado (área cero). Para un triángulo coincide con el
 * promedio de sus vértices.
 */
export function polygonCentroid(points: CadVec2[]): CadVec2 | null {
  const area = signedArea(points);
  if (Math.abs(area) < 1e-12) return null;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i += 1) {
    const cur = points[i];
    const next = points[(i + 1) % points.length];
    const cross = cur.x * next.y - next.x * cur.y;
    cx += (cur.x + next.x) * cross;
    cy += (cur.y + next.y) * cross;
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

/**
 * ¿El punto está dentro del cuarto? Lanzado de rayos con regla par-impar. La
 * frontera se considera exterior de forma consistente (no garantizada), así que
 * úsese para pruebas de interior claro.
 */
export function pointInPolygon(point: CadVec2, polygon: CadVec2[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];
    const intersect =
      pi.y > point.y !== pj.y > point.y &&
      point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Muros del cuarto como aristas cerradas (n vértices → n muros). */
export function polygonWalls(points: CadVec2[]): RoomWall[] {
  if (points.length < 2) return [];
  const walls: RoomWall[] = [];
  for (let i = 0; i < points.length; i += 1) {
    walls.push({ a: points[i], b: points[(i + 1) % points.length] });
  }
  return walls;
}

/** ¿El cuarto es convexo? (todos los giros en el mismo sentido.) */
export function isConvex(points: CadVec2[]): boolean {
  if (points.length < 3) return false;
  let sign = 0;
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const c = points[(i + 2) % n];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-12) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** ¿Los vértices están en sentido horario? (área con signo negativa.) */
export function isClockwise(points: CadVec2[]): boolean {
  return signedArea(points) < 0;
}

/**
 * Devuelve los vértices en la orientación pedida (por defecto CCW), invirtiendo
 * el orden si hace falta. Útil para normalizar cuartos antes de exportar o de
 * achurar.
 */
export function ensureOrientation(
  points: CadVec2[],
  clockwise = false,
): CadVec2[] {
  const cw = isClockwise(points);
  return cw === clockwise ? [...points] : [...points].reverse();
}
