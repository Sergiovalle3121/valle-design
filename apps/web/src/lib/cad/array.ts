/**
 * Matrices / arreglos (ARRAY) del CAD (VD-CAD-DEPTH-B3).
 *
 * ARRAY es el multiplicador de AutoCAD: repetir una geometría en una rejilla
 * (rectangular), alrededor de un centro (polar) o a lo largo de un camino
 * (path). Butacas de un cine, tornillos de una brida, luminarias de un techo,
 * columnas de una nave. Este módulo genera las copias transformadas de un grupo
 * de primitivas. Geometría pura, sin dependencias del editor.
 */
import {
  rotatePrimitive,
  translatePrimitive,
  type CadPrimitive,
  type CadVec2,
} from "./primitives";

function rotateVec(v: CadVec2, angleDeg: number): CadVec2 {
  const r = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}
function rotatePointAbout(p: CadVec2, center: CadVec2, angleDeg: number): CadVec2 {
  const v = rotateVec({ x: p.x - center.x, y: p.y - center.y }, angleDeg);
  return { x: center.x + v.x, y: center.y + v.y };
}
function translateGroup(group: CadPrimitive[], dx: number, dy: number): CadPrimitive[] {
  return group.map((p) => translatePrimitive(p, dx, dy));
}

export interface RectangularArrayOptions {
  rows: number;
  cols: number;
  rowSpacing: number;
  colSpacing: number;
  /** Rotación de los ejes de la rejilla, en grados (por defecto 0). */
  angle?: number;
}

/**
 * Matriz rectangular: rows×cols copias separadas por rowSpacing/colSpacing. La
 * primera celda coincide con el original. Devuelve un grupo de primitivas por
 * copia, en orden fila-mayor (índice = fila·cols + columna).
 */
export function rectangularArray(
  source: CadPrimitive[],
  options: RectangularArrayOptions,
): CadPrimitive[][] {
  const { rows, cols, rowSpacing, colSpacing, angle = 0 } = options;
  const out: CadPrimitive[][] = [];
  for (let r = 0; r < Math.max(0, Math.floor(rows)); r += 1) {
    for (let c = 0; c < Math.max(0, Math.floor(cols)); c += 1) {
      const off = rotateVec({ x: c * colSpacing, y: r * rowSpacing }, angle);
      out.push(translateGroup(source, off.x, off.y));
    }
  }
  return out;
}

export interface PolarArrayOptions {
  center: CadVec2;
  count: number;
  /** Ángulo total a llenar en grados (por defecto 360). */
  totalAngle?: number;
  /** Si true, cada copia gira con el radio; si false, conserva su orientación. */
  rotateItems?: boolean;
  /** Punto de referencia de la copia cuando rotateItems=false. */
  itemBase?: CadVec2;
}

/**
 * Matriz polar: `count` copias alrededor de `center`. Con 360° el paso es
 * 360/count; con un ángulo parcial, se reparte en count−1 pasos (copias en
 * ambos extremos). `rotateItems` gira la geometría con el radio (por defecto),
 * o la mantiene orientada trasladando su `itemBase` por el arco.
 */
export function polarArray(
  source: CadPrimitive[],
  options: PolarArrayOptions,
): CadPrimitive[][] {
  const { center, count, totalAngle = 360, rotateItems = true, itemBase } = options;
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];
  const full = Math.abs(totalAngle - 360) < 1e-9;
  const step = full ? 360 / n : n > 1 ? totalAngle / (n - 1) : 0;
  const out: CadPrimitive[][] = [];
  for (let k = 0; k < n; k += 1) {
    const ang = step * k;
    if (rotateItems) {
      out.push(source.map((p) => rotatePrimitive(p, center, ang)));
    } else {
      const base = itemBase ?? center;
      const moved = rotatePointAbout(base, center, ang);
      out.push(translateGroup(source, moved.x - base.x, moved.y - base.y));
    }
  }
  return out;
}

function polylineLength(path: CadVec2[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  }
  return total;
}

function atDistance(
  path: CadVec2[],
  distance: number,
): { point: CadVec2; angle: number } {
  if (path.length === 1) return { point: path[0], angle: 0 };
  const total = polylineLength(path);
  const d = Math.max(0, Math.min(distance, total));
  let acc = 0;
  for (let i = 1; i < path.length; i += 1) {
    const seg = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    if (seg < 1e-12) continue;
    if (acc + seg >= d - 1e-12) {
      const t = (d - acc) / seg;
      const a = path[i - 1];
      const b = path[i];
      return {
        point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
      };
    }
    acc += seg;
  }
  const last = path[path.length - 1];
  const prev = path[path.length - 2];
  return {
    point: last,
    angle: (Math.atan2(last.y - prev.y, last.x - prev.x) * 180) / Math.PI,
  };
}

export interface PathArrayOptions {
  path: CadVec2[];
  count: number;
  /** Si true, cada copia se alinea con la tangente del camino (por defecto). */
  align?: boolean;
  /** Punto de referencia del origen que se posa sobre el camino (por defecto (0,0)). */
  sourceBase?: CadVec2;
}

/**
 * Matriz de camino: `count` copias repartidas uniformemente por longitud de
 * arco a lo largo de la polilínea `path` (copias en ambos extremos). Con
 * `align`, cada copia gira para seguir la tangente del camino.
 */
export function pathArray(
  source: CadPrimitive[],
  options: PathArrayOptions,
): CadPrimitive[][] {
  const { path, count, align = true, sourceBase = { x: 0, y: 0 } } = options;
  const n = Math.max(0, Math.floor(count));
  if (n === 0 || path.length < 2) return [];
  const total = polylineLength(path);
  const out: CadPrimitive[][] = [];
  for (let k = 0; k < n; k += 1) {
    const d = n === 1 ? 0 : (total * k) / (n - 1);
    const { point, angle } = atDistance(path, d);
    let group = source;
    if (align && angle !== 0) group = group.map((p) => rotatePrimitive(p, sourceBase, angle));
    out.push(translateGroup(group, point.x - sourceBase.x, point.y - sourceBase.y));
  }
  return out;
}

/** Aplana los grupos de copias en una sola lista de primitivas. */
export function flattenArray(groups: CadPrimitive[][]): CadPrimitive[] {
  return groups.flat();
}
