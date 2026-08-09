/**
 * Triangulación de polígonos con agujeros (recorte de orejas + puentes).
 *
 * Hace falta en tres sitios distintos del kernel: las tapas de una extrusión, el
 * teselado de una cara plana con agujeros, y la conversión a triángulos que
 * necesitan las booleanas (un BSP sólo sabe partir polígonos CONVEXOS, y el
 * triángulo es el único polígono convexo por construcción).
 *
 * DOS PASOS.
 *
 *   1. PUENTES. Un agujero se conecta al contorno con una arista de ida y
 *      vuelta, convirtiendo un polígono con agujeros en uno simple con dos
 *      vértices repetidos. El puente se busca desde el vértice más a la
 *      izquierda del agujero lanzando un rayo hacia −x, que es el algoritmo de
 *      Eberly que usa earcut. La sutileza está en elegir el vértice del contorno
 *      cuando el rayo no cae sobre uno: hay que quedarse con el vértice REFLEJO
 *      de menor ángulo dentro del triángulo de visibilidad, o el puente cruza el
 *      contorno y la triangulación sale del revés.
 *   2. OREJAS. Recorte clásico O(n²). Una oreja es un vértice convexo cuyo
 *      triángulo no contiene ningún otro vértice del polígono.
 *
 * SI NO HAY OREJAS. Un polígono con vértices casi colineales puede dejar el
 * recorte sin candidatos. En vez de girar para siempre, se corta el vértice
 * menos malo y se sigue, y `degenerate` sale a `true` en el resultado. Un
 * triangulador que se cuelga es peor que uno que avisa: quien llama puede
 * decidir si el caso le vale.
 */
import type { Vec2 } from "./profile";

export interface Triangulation {
  /** Índices dentro de la lista concatenada `[...outer, ...holes]`. */
  triangles: [number, number, number][];
  /** `true` si hubo que forzar algún corte por falta de orejas. */
  degenerate: boolean;
}

function cross(o: Vec2, a: Vec2, b: Vec2): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** ¿Está `p` dentro del triángulo `abc` (bordes incluidos)? */
function pointInTriangle(a: Vec2, b: Vec2, c: Vec2, p: Vec2, tol: number): boolean {
  const d1 = cross(a, b, p);
  const d2 = cross(b, c, p);
  const d3 = cross(c, a, p);
  const hasNegative = d1 < -tol || d2 < -tol || d3 < -tol;
  const hasPositive = d1 > tol || d2 > tol || d3 > tol;
  return !(hasNegative && hasPositive);
}

/**
 * Triangula un contorno antihorario con agujeros horarios.
 * Los índices devueltos apuntan a `[...outer, ...holes.flat()]`.
 */
export function triangulateWithHoles(
  outer: readonly Vec2[],
  holes: readonly (readonly Vec2[])[] = [],
  tolerance = 1e-12,
): Triangulation {
  const points: Vec2[] = [...outer];
  const holeRanges: Array<{ start: number; length: number }> = [];
  for (const hole of holes) {
    holeRanges.push({ start: points.length, length: hole.length });
    points.push(...hole);
  }

  let polygon: number[] = outer.map((_, index) => index);
  const sortedHoles = holeRanges
    .map((range, index) => ({ range, leftmost: leftmostIndex(points, range), order: index }))
    .sort((a, b) => points[a.leftmost].x - points[b.leftmost].x);
  for (const hole of sortedHoles) {
    polygon = bridgeHole(points, polygon, hole.range, hole.leftmost, tolerance);
  }

  return earClip(points, polygon, tolerance);
}

function leftmostIndex(points: readonly Vec2[], range: { start: number; length: number }): number {
  let best = range.start;
  for (let i = range.start; i < range.start + range.length; i += 1) {
    if (points[i].x < points[best].x || (points[i].x === points[best].x && points[i].y < points[best].y)) best = i;
  }
  return best;
}

/**
 * Une un agujero al polígono con una arista de ida y vuelta.
 *
 * El agujero se recorre HORARIO (así llega del convenio de perfiles) y se
 * inserta tal cual: recorrido en sentido contrario al contorno, es lo que hace
 * que el resultado siga siendo un polígono simple antihorario.
 */
function bridgeHole(
  points: readonly Vec2[],
  polygon: readonly number[],
  range: { start: number; length: number },
  holeVertex: number,
  tolerance: number,
): number[] {
  const bridge = findBridgeVertex(points, polygon, points[holeVertex], tolerance);
  if (bridge < 0) {
    throw new Error("No se encontró un puente visible para el agujero: ¿está fuera del contorno o lo corta?");
  }
  const holeLoop: number[] = [];
  for (let k = 0; k < range.length; k += 1) {
    holeLoop.push(range.start + ((holeVertex - range.start + k) % range.length));
  }
  const out: number[] = [];
  for (let i = 0; i <= bridge; i += 1) out.push(polygon[i]);
  for (const index of holeLoop) out.push(index);
  out.push(holeLoop[0]);
  for (let i = bridge; i < polygon.length; i += 1) out.push(polygon[i]);
  return out;
}

/** Posición DENTRO de `polygon` del vértice del contorno visible desde `from`. */
function findBridgeVertex(points: readonly Vec2[], polygon: readonly number[], from: Vec2, tolerance: number): number {
  let bestX = -Infinity;
  let bestEdge = -1;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = points[polygon[i]];
    const b = points[polygon[(i + 1) % polygon.length]];
    // Sólo aristas que cruzan la altura del punto; el rayo va hacia −x.
    if (a.y > from.y === b.y > from.y) continue;
    const x = a.x + ((from.y - a.y) * (b.x - a.x)) / (b.y - a.y);
    if (x > from.x + tolerance) continue;
    if (x > bestX) {
      bestX = x;
      bestEdge = i;
    }
  }
  if (bestEdge < 0) return -1;

  const i = bestEdge;
  const j = (bestEdge + 1) % polygon.length;
  // Candidato inicial: el extremo de la arista con mayor x (el más cercano al
  // agujero por el lado del rayo).
  let candidate = points[polygon[i]].x > points[polygon[j]].x ? i : j;
  const contact: Vec2 = { x: bestX, y: from.y };
  const apex = points[polygon[candidate]];

  // Vértices reflejos dentro del triángulo de visibilidad: si hay alguno, el
  // puente directo lo cruzaría. Se toma el de menor ángulo respecto del rayo.
  let bestAngle = Infinity;
  for (let k = 0; k < polygon.length; k += 1) {
    if (k === candidate) continue;
    const point = points[polygon[k]];
    if (point.x < contact.x - tolerance || point.x > from.x + tolerance) continue;
    if (!pointInTriangle(contact, apex, from, point, tolerance)) continue;
    const dx = point.x - from.x;
    const dy = Math.abs(point.y - from.y);
    const angle = dx === 0 ? Infinity : dy / -dx;
    if (angle < bestAngle) {
      bestAngle = angle;
      candidate = k;
    }
  }
  return candidate;
}

function earClip(points: readonly Vec2[], polygonIndices: readonly number[], tolerance: number): Triangulation {
  const polygon = [...polygonIndices];
  const triangles: [number, number, number][] = [];
  let degenerate = false;
  let guard = 0;
  const limit = polygon.length * polygon.length + 16;

  while (polygon.length > 3) {
    guard += 1;
    if (guard > limit) {
      degenerate = true;
      break;
    }
    let cut = -1;
    let fallback = -1;
    let fallbackArea = -Infinity;
    for (let i = 0; i < polygon.length; i += 1) {
      const previous = polygon[(i - 1 + polygon.length) % polygon.length];
      const current = polygon[i];
      const next = polygon[(i + 1) % polygon.length];
      const a = points[previous];
      const b = points[current];
      const c = points[next];
      const area = cross(a, b, c);
      if (area > fallbackArea) {
        fallbackArea = area;
        fallback = i;
      }
      if (area <= tolerance) continue; // Vértice reflejo o degenerado.
      let clean = true;
      for (let k = 0; k < polygon.length; k += 1) {
        const index = polygon[k];
        if (index === previous || index === current || index === next) continue;
        const point = points[index];
        if (point === a || point === b || point === c) continue;
        if (pointInTriangle(a, b, c, point, tolerance)) {
          clean = false;
          break;
        }
      }
      if (clean) {
        cut = i;
        break;
      }
    }
    if (cut < 0) {
      // Sin orejas: se corta el vértice menos malo para no girar eternamente.
      degenerate = true;
      cut = fallback >= 0 ? fallback : 0;
      const previous = polygon[(cut - 1 + polygon.length) % polygon.length];
      const next = polygon[(cut + 1) % polygon.length];
      if (fallbackArea > tolerance) triangles.push([previous, polygon[cut], next]);
      polygon.splice(cut, 1);
      continue;
    }
    const previous = polygon[(cut - 1 + polygon.length) % polygon.length];
    const next = polygon[(cut + 1) % polygon.length];
    triangles.push([previous, polygon[cut], next]);
    polygon.splice(cut, 1);
  }
  if (polygon.length === 3) triangles.push([polygon[0], polygon[1], polygon[2]]);
  return { triangles, degenerate };
}
