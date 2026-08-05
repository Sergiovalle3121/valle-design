/**
 * Operaciones de modificación de primitivas del CAD (VD-CAD-DEPTH-A2).
 *
 * Fillet, chamfer y offset: las tres modificaciones icónicas que un CAD real
 * (AutoCAD) tiene y que el modelo de caja rectangular no podía expresar. El
 * fillet produce un ARCO REAL —la primitiva que añadió la fase A1—, no una
 * aproximación. Todo aquí es geometría pura, sin dependencias del editor.
 *
 * Convención de ángulos idéntica a primitives.ts: GRADOS, CCW desde +X.
 */
import { offsetPath } from "./geom-edit";
import {
  norm360,
  type CadPrimitive,
  type CadVec2,
} from "./primitives";

interface FilletResult {
  /** Arco de empalme tangente a ambos segmentos. */
  arc: Extract<CadPrimitive, { kind: "arc" }>;
  /** Punto de tangencia sobre el segmento previo (corner→prev). */
  tangentPrev: CadVec2;
  /** Punto de tangencia sobre el segmento siguiente (corner→next). */
  tangentNext: CadVec2;
}

function sub(a: CadVec2, b: CadVec2): CadVec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}
function add(a: CadVec2, b: CadVec2): CadVec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}
function scale(a: CadVec2, k: number): CadVec2 {
  return { x: a.x * k, y: a.y * k };
}
function len(a: CadVec2): number {
  return Math.hypot(a.x, a.y);
}
function normalize(a: CadVec2): CadVec2 | null {
  const l = len(a);
  return l === 0 ? null : { x: a.x / l, y: a.y / l };
}
function cross(a: CadVec2, b: CadVec2): number {
  return a.x * b.y - a.y * b.x;
}
function angleOf(a: CadVec2): number {
  return norm360((Math.atan2(a.y, a.x) * 180) / Math.PI);
}

/**
 * Empalme (fillet) en la esquina prev-corner-next con radio `radius`. Devuelve
 * el arco tangente a ambos segmentos y los puntos de tangencia (donde deben
 * recortarse los segmentos). Devuelve null si la esquina es colineal o si el
 * radio no cabe (la distancia de tangencia excede alguno de los segmentos).
 */
export function filletCorner(
  prev: CadVec2,
  corner: CadVec2,
  next: CadVec2,
  radius: number,
): FilletResult | null {
  if (radius <= 0) return null;
  const toPrev = normalize(sub(prev, corner));
  const toNext = normalize(sub(next, corner));
  if (!toPrev || !toNext) return null;

  // Ángulo interior entre los dos segmentos.
  const dot = toPrev.x * toNext.x + toPrev.y * toNext.y;
  const clamped = Math.max(-1, Math.min(1, dot));
  const theta = Math.acos(clamped); // 0..π
  // Colineal (0 o π): no hay esquina que redondear.
  if (theta < 1e-9 || Math.abs(theta - Math.PI) < 1e-9) return null;

  const tangentDist = radius / Math.tan(theta / 2);
  const maxPrev = len(sub(prev, corner));
  const maxNext = len(sub(next, corner));
  if (tangentDist > maxPrev + 1e-9 || tangentDist > maxNext + 1e-9) return null;

  const tangentPrev = add(corner, scale(toPrev, tangentDist));
  const tangentNext = add(corner, scale(toNext, tangentDist));

  // Centro del arco: sobre la bisectriz, a distancia radius/sin(theta/2).
  const bisector = normalize(add(toPrev, toNext));
  if (!bisector) return null;
  const centerDist = radius / Math.sin(theta / 2);
  const center = add(corner, scale(bisector, centerDist));

  // Ángulos desde el centro a los puntos de tangencia; orientar el barrido en
  // el sentido corto (el que recorre el arco de empalme, no el complementario).
  const aPrev = angleOf(sub(tangentPrev, center));
  const aNext = angleOf(sub(tangentNext, center));
  // Determinar sentido: el giro de toPrev a toNext indica CCW/CW.
  const turn = cross(toPrev, toNext);
  const [startAngle, endAngle] = turn >= 0 ? [aNext, aPrev] : [aPrev, aNext];

  return {
    arc: {
      kind: "arc",
      center,
      radius,
      startAngle: norm360(startAngle),
      endAngle: norm360(endAngle),
    },
    tangentPrev,
    tangentNext,
  };
}

/**
 * Chaflán (chamfer) en la esquina prev-corner-next: recorta la esquina con un
 * segmento recto, a `distPrev` sobre el lado previo y `distNext` sobre el
 * siguiente. Devuelve los dos puntos del corte, o null si no cabe.
 */
export function chamferCorner(
  prev: CadVec2,
  corner: CadVec2,
  next: CadVec2,
  distPrev: number,
  distNext: number,
): { a: CadVec2; b: CadVec2 } | null {
  if (distPrev <= 0 || distNext <= 0) return null;
  const toPrev = normalize(sub(prev, corner));
  const toNext = normalize(sub(next, corner));
  if (!toPrev || !toNext) return null;
  if (distPrev > len(sub(prev, corner)) + 1e-9) return null;
  if (distNext > len(sub(next, corner)) + 1e-9) return null;
  return {
    a: add(corner, scale(toPrev, distPrev)),
    b: add(corner, scale(toNext, distNext)),
  };
}

/**
 * Desplaza (offset) un segmento a distancia `distance` perpendicular. Signo
 * positivo → lado izquierdo del vector a→b (normal (-dy, dx)); negativo → lado
 * derecho.
 */
export function offsetSegment(
  a: CadVec2,
  b: CadVec2,
  distance: number,
): { a: CadVec2; b: CadVec2 } | null {
  const dir = normalize(sub(b, a));
  if (!dir) return null;
  const normal = { x: -dir.y, y: dir.x };
  const shift = scale(normal, distance);
  return { a: add(a, shift), b: add(b, shift) };
}

/**
 * Desplaza una polilínea a distancia `distance` (mismo criterio de signo que
 * offsetSegment).
 *
 * La matemática vive en `geom-edit.offsetPath`: había DOS motores de offset en
 * el producto y sólo uno resolvía bien el vértice de cierre. Este módulo
 * conserva su firma —devuelve el recorrido original cuando no hay desfase
 * posible— y delega el cálculo para que exista una sola implementación.
 */
export function offsetPolyline(
  points: CadVec2[],
  distance: number,
  closed = false,
): CadVec2[] {
  if (points.length < 2) return [...points];
  return offsetPath(points, distance, { closed }) ?? [...points];
}

/**
 * Círculo concéntrico desplazado: radio + distance (positivo hacia afuera).
 * Null si el resultado colapsa a radio ≤ 0.
 */
export function offsetCircle(
  center: CadVec2,
  radius: number,
  distance: number,
): { center: CadVec2; radius: number } | null {
  const r = radius + distance;
  return r > 0 ? { center, radius: r } : null;
}
