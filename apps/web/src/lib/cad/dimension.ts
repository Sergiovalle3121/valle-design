/**
 * Cotas asociativas del CAD (VD-CAD-DEPTH-A3).
 *
 * Una cota de verdad no es una etiqueta suelta: es geometría derivada de dos
 * puntos —líneas de extensión, línea de cota, flechas y texto orientado— que
 * se recalcula cuando los puntos cambian. Este módulo produce esa geometría en
 * unidades reales, pura y sin dependencias del editor. Feeds tanto el render
 * del editor como la exportación DXF (más adelante, entidad DIMENSION).
 *
 * Convención de ángulos idéntica al resto de lib/cad: GRADOS, CCW desde +X.
 */
import type { CadVec2 } from "./primitives";

export interface DimensionStyle {
  /** Hueco entre el punto medido y el arranque de la línea de extensión. */
  extensionGap: number;
  /** Cuánto sobresale la línea de extensión más allá de la línea de cota. */
  extensionOvershoot: number;
  /** Longitud de la flecha. */
  arrowSize: number;
  /** Separación del texto respecto de la línea de cota. */
  textGap: number;
}

export const DEFAULT_DIMENSION_STYLE: DimensionStyle = {
  extensionGap: 40,
  extensionOvershoot: 120,
  arrowSize: 180,
  textGap: 90,
};

export interface DimensionSegment {
  a: CadVec2;
  b: CadVec2;
}

export interface DimensionGeometry {
  /** Distancia medida, en unidades reales. */
  measurement: number;
  /** Línea de cota (paralela al tramo medido, en el desfase). */
  dimLine: DimensionSegment;
  /** Líneas de extensión desde cada punto medido hasta la línea de cota. */
  extensionA: DimensionSegment;
  extensionB: DimensionSegment;
  /** Flechas como triángulos (3 puntos) en cada extremo de la línea de cota. */
  arrowA: CadVec2[];
  arrowB: CadVec2[];
  /** Ancla del texto (centro), y ángulo legible en grados. */
  textAnchor: CadVec2;
  textAngle: number;
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
function midpoint(a: CadVec2, b: CadVec2): CadVec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Ángulo legible: el texto nunca queda de cabeza (rango (-90, 90]). */
function readableAngle(dir: CadVec2): number {
  let deg = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
  while (deg > 90) deg -= 180;
  while (deg <= -90) deg += 180;
  return deg;
}

/** Triángulo de flecha: punta en `tip`, apuntando en `dir` (unitario), longitud `size`. */
function arrowTriangle(tip: CadVec2, dir: CadVec2, size: number): CadVec2[] {
  const base = add(tip, scale(dir, size));
  const perp = { x: -dir.y, y: dir.x };
  const half = scale(perp, size * 0.35);
  return [tip, add(base, half), sub(base, half)];
}

function buildDimension(
  witnessA: CadVec2,
  witnessB: CadVec2,
  dimA: CadVec2,
  dimB: CadVec2,
  measurement: number,
  style: DimensionStyle,
): DimensionGeometry | null {
  const uExtA = normalize(sub(dimA, witnessA));
  const uExtB = normalize(sub(dimB, witnessB));
  const dimDir = normalize(sub(dimB, dimA));
  if (!dimDir) return null;
  // Si las extensiones son de longitud cero (desfase 0), usamos la normal de la
  // línea de cota como dirección de extensión y de texto.
  const fallbackNormal = { x: -dimDir.y, y: dimDir.x };
  const extDirA = uExtA ?? fallbackNormal;
  const extDirB = uExtB ?? fallbackNormal;

  const extensionA: DimensionSegment = {
    a: add(witnessA, scale(extDirA, style.extensionGap)),
    b: add(dimA, scale(extDirA, style.extensionOvershoot)),
  };
  const extensionB: DimensionSegment = {
    a: add(witnessB, scale(extDirB, style.extensionGap)),
    b: add(dimB, scale(extDirB, style.extensionOvershoot)),
  };

  const arrowA = arrowTriangle(dimA, dimDir, style.arrowSize);
  const arrowB = arrowTriangle(dimB, scale(dimDir, -1), style.arrowSize);

  const textAnchor = add(
    midpoint(dimA, dimB),
    scale(extDirA, style.textGap),
  );

  return {
    measurement,
    dimLine: { a: dimA, b: dimB },
    extensionA,
    extensionB,
    arrowA,
    arrowB,
    textAnchor,
    textAngle: readableAngle(dimDir),
  };
}

/**
 * Cota alineada: la línea de cota es paralela al tramo p1-p2, desfasada
 * `offset` (con signo, elige el lado) perpendicularmente. Mide la distancia
 * real entre los dos puntos. Null si p1 == p2.
 */
export function alignedDimension(
  p1: CadVec2,
  p2: CadVec2,
  offset: number,
  style: DimensionStyle = DEFAULT_DIMENSION_STYLE,
): DimensionGeometry | null {
  const dir = normalize(sub(p2, p1));
  if (!dir) return null;
  const normal = { x: -dir.y, y: dir.x };
  const off = scale(normal, offset);
  const dimA = add(p1, off);
  const dimB = add(p2, off);
  return buildDimension(p1, p2, dimA, dimB, len(sub(p2, p1)), style);
}

/**
 * Cota lineal horizontal o vertical: la línea de cota es paralela al eje dado y
 * mide la proyección sobre ese eje. `offset` (con signo) separa la línea de
 * cota del punto más externo en el eje perpendicular. Null si la proyección es
 * cero (los puntos coinciden en ese eje).
 */
export function linearDimension(
  p1: CadVec2,
  p2: CadVec2,
  offset: number,
  axis: "x" | "y",
  style: DimensionStyle = DEFAULT_DIMENSION_STYLE,
): DimensionGeometry | null {
  if (axis === "x") {
    if (Math.abs(p2.x - p1.x) < 1e-9) return null;
    const baseY = Math.max(p1.y, p2.y) + offset;
    const dimA = { x: p1.x, y: baseY };
    const dimB = { x: p2.x, y: baseY };
    return buildDimension(p1, p2, dimA, dimB, Math.abs(p2.x - p1.x), style);
  }
  if (Math.abs(p2.y - p1.y) < 1e-9) return null;
  const baseX = Math.max(p1.x, p2.x) + offset;
  const dimA = { x: baseX, y: p1.y };
  const dimB = { x: baseX, y: p2.y };
  return buildDimension(p1, p2, dimA, dimB, Math.abs(p2.y - p1.y), style);
}
