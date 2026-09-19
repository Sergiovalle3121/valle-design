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
  const from = points[holeVertex];
  const holeEdges: [Vec2, Vec2][] = [];
  for (let k = 0; k < range.length; k += 1) {
    holeEdges.push([points[range.start + k], points[range.start + ((k + 1) % range.length)]]);
  }
  let bridge = findBridgeVertex(points, polygon, from, tolerance);
  if (bridge >= 0 && !bridgeIsClear(points, polygon, holeEdges, from, bridge, tolerance)) {
    // El candidato del rayo puede no servir: cuando el rayo pega en un puente
    // anterior, el vértice elegido es el de ese puente y el nuevo puente puede
    // quedar SOBRE una arista del propio agujero (dos ventanas una encima de la
    // otra en un muro: el puente bajaba pegado al costado de la ventana de
    // abajo). Un puente que solapa una arista no es una ranura, es un cruce, y
    // el recorte de orejas devolvía triángulos del revés. Se busca entonces el
    // vértice visible MÁS CERCANO cuyo segmento no cruce, toque ni solape nada.
    bridge = nearestClearVertex(points, polygon, holeEdges, from, tolerance);
  }
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

function samePoint(a: Vec2, b: Vec2, tolerance: number): boolean {
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
}

function onSegment(a: Vec2, b: Vec2, p: Vec2, tolerance: number): boolean {
  return (
    p.x >= Math.min(a.x, b.x) - tolerance &&
    p.x <= Math.max(a.x, b.x) + tolerance &&
    p.y >= Math.min(a.y, b.y) - tolerance &&
    p.y <= Math.max(a.y, b.y) + tolerance
  );
}

/**
 * ¿Los segmentos `p1p2` y `q1q2` se cruzan, se tocan por el medio o se solapan?
 * Compartir un extremo no cuenta, salvo que además sean colineales y sigan
 * juntos más allá de ese extremo (un solape).
 */
function segmentsConflict(p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2, tolerance: number): boolean {
  const d1 = cross(p1, p2, q1);
  const d2 = cross(p1, p2, q2);
  const d3 = cross(q1, q2, p1);
  const d4 = cross(q1, q2, p2);
  const collinear = Math.abs(d1) <= tolerance && Math.abs(d2) <= tolerance;
  const shared =
    samePoint(p1, q1, tolerance) || samePoint(p1, q2, tolerance) || samePoint(p2, q1, tolerance) || samePoint(p2, q2, tolerance);
  if (shared) {
    if (!collinear) return false;
    const [origin, mine] = samePoint(p1, q1, tolerance) || samePoint(p1, q2, tolerance) ? [p1, p2] : [p2, p1];
    const theirs = samePoint(origin, q1, tolerance) ? q2 : q1;
    return (mine.x - origin.x) * (theirs.x - origin.x) + (mine.y - origin.y) * (theirs.y - origin.y) > tolerance;
  }
  if (collinear) return onSegment(p1, p2, q1, tolerance) || onSegment(p1, p2, q2, tolerance) || onSegment(q1, q2, p1, tolerance);
  const crossing =
    ((d1 > tolerance && d2 < -tolerance) || (d1 < -tolerance && d2 > tolerance)) &&
    ((d3 > tolerance && d4 < -tolerance) || (d3 < -tolerance && d4 > tolerance));
  if (crossing) return true;
  if (Math.abs(d1) <= tolerance && onSegment(p1, p2, q1, tolerance)) return true;
  if (Math.abs(d2) <= tolerance && onSegment(p1, p2, q2, tolerance)) return true;
  if (Math.abs(d3) <= tolerance && onSegment(q1, q2, p1, tolerance)) return true;
  return Math.abs(d4) <= tolerance && onSegment(q1, q2, p2, tolerance);
}

/** ¿El puente `from → polygon[at]` no cruza, toca ni solapa ninguna arista del polígono ni del agujero? */
function bridgeIsClear(
  points: readonly Vec2[],
  polygon: readonly number[],
  holeEdges: readonly [Vec2, Vec2][],
  from: Vec2,
  at: number,
  tolerance: number,
): boolean {
  const target = points[polygon[at]];
  if (samePoint(from, target, tolerance)) return false;
  for (let k = 0; k < polygon.length; k += 1) {
    const next = (k + 1) % polygon.length;
    if (k === at || next === at) continue;
    if (segmentsConflict(from, target, points[polygon[k]], points[polygon[next]], tolerance)) return false;
  }
  for (const [a, b] of holeEdges) {
    if (segmentsConflict(from, target, a, b, tolerance)) return false;
  }
  return bridgeFitsPass(points, polygon, at, from, tolerance);
}

/** El vértice del polígono más cercano a `from` con un puente limpio, o −1. */
function nearestClearVertex(
  points: readonly Vec2[],
  polygon: readonly number[],
  holeEdges: readonly [Vec2, Vec2][],
  from: Vec2,
  tolerance: number,
): number {
  const order = polygon
    .map((index, at) => ({ at, distance: Math.hypot(points[index].x - from.x, points[index].y - from.y) }))
    .sort((a, b) => a.distance - b.distance);
  for (const { at } of order) {
    if (bridgeIsClear(points, polygon, holeEdges, from, at, tolerance)) return at;
  }
  return -1;
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
    // Otra aparición del propio ápice (un puente anterior lo duplicó) no es un
    // vértice reflejo que se interponga: es el mismo punto.
    if (point === apex) continue;
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
  // El vértice elegido puede aparecer VARIAS veces en el polígono si ya recibió
  // un puente. Cada aparición es un paso distinto por el mismo punto, con su
  // propio ángulo interior, y el nuevo puente sólo puede coserse en el paso
  // cuyo ángulo lo contiene: cosido en otro, la frontera se cruza a sí misma
  // en ese vértice y el recorte de orejas produce triángulos del revés (dos
  // ventanas alineadas en un muro dejaban el volumen mal, sin ningún aviso).
  const chosen = points[polygon[candidate]];
  for (let k = 0; k < polygon.length; k += 1) {
    if (points[polygon[k]] !== chosen) continue;
    if (bridgeFitsPass(points, polygon, k, from, tolerance)) return k;
  }
  return candidate;
}

/** ¿La dirección `polygon[at] → toward` cae en el ángulo INTERIOR de ese paso? */
function bridgeFitsPass(points: readonly Vec2[], polygon: readonly number[], at: number, toward: Vec2, tolerance: number): boolean {
  const n = polygon.length;
  const previous = points[polygon[(at - 1 + n) % n]];
  const current = points[polygon[at]];
  const next = points[polygon[(at + 1) % n]];
  if (cross(previous, current, next) > tolerance) {
    // Esquina convexa: entre `→ next` y `→ previous`, en sentido antihorario.
    return cross(current, next, toward) > tolerance && cross(current, toward, previous) > tolerance;
  }
  // Esquina refleja: fuera sólo si cae en el ángulo exterior, de `→ previous` a `→ next`.
  return !(cross(current, previous, toward) > -tolerance && cross(current, toward, next) > -tolerance);
}

/**
 * ¿La arista que sale de `corner` hacia `toward` entra ESTRICTAMENTE en el
 * ángulo interior de la oreja `abc` (antihoraria) en esa esquina?
 *
 * En `a` el interior barre de `a→b` a `a→c` en sentido antihorario; en `b`, de
 * `b→c` a `b→a`; en `c`, de `c→a` a `c→b`. Una arista que cae sobre un lado de
 * la oreja (producto vectorial nulo) no entra: es el puente de ida y vuelta,
 * una ranura de anchura cero, no un solape.
 */
function edgeEntersEar(a: Vec2, b: Vec2, c: Vec2, corner: Vec2, toward: Vec2, tolerance: number): boolean {
  const [first, second] = corner === a ? [b, c] : corner === b ? [c, a] : [a, b];
  const dx = toward.x - corner.x;
  const dy = toward.y - corner.y;
  return (
    (first.x - corner.x) * dy - (first.y - corner.y) * dx > tolerance &&
    dx * (second.y - corner.y) - dy * (second.x - corner.x) > tolerance
  );
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
      const previousAt = (i - 1 + polygon.length) % polygon.length;
      const nextAt = (i + 1) % polygon.length;
      const previous = polygon[previousAt];
      const current = polygon[i];
      const next = polygon[nextAt];
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
        // Por POSICIÓN y no por índice del punto: un puente repite el índice,
        // y saltar todas sus apariciones escondería las aristas que hay que
        // comprobar.
        if (k === i || k === previousAt || k === nextAt) continue;
        const point = points[polygon[k]];
        if (point === a || point === b || point === c) {
          // Un DUPLICADO de una esquina de la oreja (los puentes los crean).
          // Saltarlo sin más deja pasar orejas cuyo triángulo cruza una arista
          // del duplicado; la oreja sólo vale si ninguna de sus dos aristas
          // entra en el ángulo interior de la oreja en esa esquina.
          const before = points[polygon[(k - 1 + polygon.length) % polygon.length]];
          const after = points[polygon[(k + 1) % polygon.length]];
          if (edgeEntersEar(a, b, c, point, before, tolerance) || edgeEntersEar(a, b, c, point, after, tolerance)) {
            clean = false;
            break;
          }
          continue;
        }
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
