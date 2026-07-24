/**
 * Restricciones geométricas paramétricas sobre segmentos (CAD-NEXT-110).
 *
 * El corazón del "dibujo paramétrico" que distingue a un CAD profesional: en
 * vez de arrastrar a ojo, el proyectista IMPONE una relación —"este muro es
 * paralelo a aquél", "hazlo horizontal", "igual de largo"— y la geometría se
 * ajusta con precisión. AutoCAD lo hace con GEOMCONSTRAINT; aquí son
 * operaciones deterministas de aplicar-una-vez (no un solver bidireccional
 * vivo — ese es el alcance honesto).
 *
 * Cada operación pivota el segmento sobre su PUNTO MEDIO (se ajusta "en su
 * lugar", como espera el usuario) y —salvo igualar-longitud/colineal— preserva
 * la longitud. Puro y determinista: misma entrada → misma salida.
 */

import type { CadVec2 } from "./primitives";

export interface Segment {
  a: CadVec2;
  b: CadVec2;
}

const TWO_PI = Math.PI * 2;

const midpoint = (s: Segment): CadVec2 => ({ x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 });
const length = (s: Segment): number => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
/** Ángulo del segmento a→b en radianes (−π, π]. */
export const segmentAngle = (s: Segment): number => Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x);

/** Reconstruye un segmento desde su punto medio, ángulo y longitud. */
function fromMidAngleLen(mid: CadVec2, angle: number, len: number): Segment {
  const hx = (Math.cos(angle) * len) / 2;
  const hy = (Math.sin(angle) * len) / 2;
  return { a: { x: mid.x - hx, y: mid.y - hy }, b: { x: mid.x + hx, y: mid.y + hy } };
}

/** Diferencia angular con signo, normalizada a (−π, π]. */
function angleDelta(from: number, to: number): number {
  let d = (to - from) % TWO_PI;
  if (d <= -Math.PI) d += TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  return d;
}

/**
 * Gira el segmento sobre su punto medio hasta el ángulo objetivo módulo π —
 * conserva la ORIENTACIÓN a→b eligiendo entre `target` y `target+π` el que
 * quede más cerca del ángulo actual, para no voltear el segmento. Preserva la
 * longitud.
 */
function rotateToLineAngle(s: Segment, target: number): Segment {
  const current = segmentAngle(s);
  const optA = target;
  const optB = target + Math.PI;
  const chosen = Math.abs(angleDelta(current, optA)) <= Math.abs(angleDelta(current, optB)) ? optA : optB;
  return fromMidAngleLen(midpoint(s), chosen, length(s));
}

/** Horizontal: gira el segmento al eje X (0 ó π, el más cercano). */
export function makeHorizontal(s: Segment): Segment {
  return rotateToLineAngle(s, 0);
}

/** Vertical: gira el segmento al eje Y (π/2 ó −π/2, el más cercano). */
export function makeVertical(s: Segment): Segment {
  return rotateToLineAngle(s, Math.PI / 2);
}

/** Paralelo: alinea la dirección del objetivo con la del segmento de referencia. */
export function makeParallel(target: Segment, reference: Segment): Segment {
  return rotateToLineAngle(target, segmentAngle(reference));
}

/** Perpendicular: gira el objetivo 90° respecto a la referencia. */
export function makePerpendicular(target: Segment, reference: Segment): Segment {
  return rotateToLineAngle(target, segmentAngle(reference) + Math.PI / 2);
}

/** Igual longitud: escala el objetivo sobre su punto medio a la longitud de la referencia. */
export function makeEqualLength(target: Segment, reference: Segment): Segment {
  return fromMidAngleLen(midpoint(target), segmentAngle(target), length(reference));
}

/** Extremo que permanece fijo al aplicar una restricción dimensional. */
export type Anchor = "start" | "end" | "mid";

/** Dirección unitaria actual del segmento; si es degenerado, eje +X. */
function unitDir(s: Segment): CadVec2 {
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const m = Math.hypot(dx, dy);
  return m === 0 ? { x: 1, y: 0 } : { x: dx / m, y: dy / m };
}

/**
 * Restricción dimensional de LONGITUD (CAD-NEXT-112): fija la longitud exacta
 * del segmento conservando su dirección y el extremo `anchor`. Con `start` (por
 * defecto) el primer punto queda fijo y el segundo se mueve; con `mid` ambos se
 * mueven simétricamente respecto al centro. Una longitud ≤ 0 se ignora
 * (devuelve el segmento sin cambio) — no existe un segmento de longitud nula.
 */
export function setLength(s: Segment, length: number, anchor: Anchor = "start"): Segment {
  if (!(length > 0)) return s;
  const d = unitDir(s);
  if (anchor === "start") {
    return { a: { ...s.a }, b: { x: s.a.x + d.x * length, y: s.a.y + d.y * length } };
  }
  if (anchor === "end") {
    return { a: { x: s.b.x - d.x * length, y: s.b.y - d.y * length }, b: { ...s.b } };
  }
  const mx = (s.a.x + s.b.x) / 2, my = (s.a.y + s.b.y) / 2;
  const h = length / 2;
  return { a: { x: mx - d.x * h, y: my - d.y * h }, b: { x: mx + d.x * h, y: my + d.y * h } };
}

/**
 * Restricción dimensional de ÁNGULO (CAD-NEXT-112): fija el ángulo ABSOLUTO del
 * segmento (grados, 0° = eje +X, sentido antihorario) conservando su longitud y
 * el extremo `anchor`.
 */
export function setAngle(s: Segment, angleDeg: number, anchor: Anchor = "start"): Segment {
  const len = length(s);
  const rad = (angleDeg * Math.PI) / 180;
  const vx = Math.cos(rad) * len, vy = Math.sin(rad) * len;
  if (anchor === "start") {
    return { a: { ...s.a }, b: { x: s.a.x + vx, y: s.a.y + vy } };
  }
  if (anchor === "end") {
    return { a: { x: s.b.x - vx, y: s.b.y - vy }, b: { ...s.b } };
  }
  const mx = (s.a.x + s.b.x) / 2, my = (s.a.y + s.b.y) / 2;
  return { a: { x: mx - vx / 2, y: my - vy / 2 }, b: { x: mx + vx / 2, y: my + vy / 2 } };
}

/**
 * Colineal: proyecta ambos extremos del objetivo sobre la recta infinita que
 * pasa por la referencia. A diferencia de las demás, cambia posición y
 * longitud (es lo correcto: dos segmentos colineales comparten recta soporte).
 * Si la referencia es degenerada (longitud 0) devuelve el objetivo sin cambio.
 */
export function makeCollinear(target: Segment, reference: Segment): Segment {
  const dx = reference.b.x - reference.a.x;
  const dy = reference.b.y - reference.a.y;
  const denom = dx * dx + dy * dy;
  if (denom === 0) return target;
  const project = (p: CadVec2): CadVec2 => {
    const t = ((p.x - reference.a.x) * dx + (p.y - reference.a.y) * dy) / denom;
    return { x: reference.a.x + t * dx, y: reference.a.y + t * dy };
  };
  return { a: project(target.a), b: project(target.b) };
}
