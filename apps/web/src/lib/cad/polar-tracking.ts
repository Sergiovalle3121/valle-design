/**
 * Rastreo polar y ortogonal (POLAR / ORTHO) del CAD (VD-CAD-DEPTH-B7).
 *
 * Al dibujar, AutoCAD "engancha" el cursor a ángulos preferidos: ORTHO lo fuerza
 * a 0/90/180/270, y el rastreo POLAR a múltiplos de 15/30/45°. Es lo que permite
 * trazar líneas perfectamente rectas o a un ángulo exacto sin teclear números.
 * Este módulo restringe un punto de cursor respecto de un punto base. Geometría
 * pura, sin dependencias del editor.
 */
import type { CadVec2 } from "./primitives";

export interface PolarResult {
  /** Punto del cursor ya restringido (proyectado sobre el rayo enganchado). */
  point: CadVec2;
  /** Ángulo resultante en grados (el enganchado si snapped, si no el crudo). */
  angle: number;
  /** Distancia desde la base a lo largo del rayo. */
  distance: number;
  /** ¿Se enganchó a un incremento? */
  snapped: boolean;
}

function norm360(a: number): number {
  const w = a % 360;
  return w < 0 ? w + 360 : w;
}
function angularDistance(a: number, b: number): number {
  const d = Math.abs(norm360(a) - norm360(b));
  return Math.min(d, 360 - d);
}

/**
 * Engancha la dirección base→cursor al múltiplo de `increment` más cercano si el
 * cursor está dentro de `tolerance` grados de él; si no, deja el punto libre. El
 * punto se proyecta perpendicularmente sobre el rayo enganchado (tracking real).
 */
export function polarSnap(
  base: CadVec2,
  cursor: CadVec2,
  increment = 45,
  tolerance = increment / 2,
): PolarResult {
  const dx = cursor.x - base.x;
  const dy = cursor.y - base.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-9) {
    return { point: { ...base }, angle: 0, distance: 0, snapped: false };
  }
  const rawAngle = norm360((Math.atan2(dy, dx) * 180) / Math.PI);
  const nearest = norm360(Math.round(rawAngle / increment) * increment);
  if (angularDistance(rawAngle, nearest) <= tolerance + 1e-9) {
    const rad = (nearest * Math.PI) / 180;
    const dir = { x: Math.cos(rad), y: Math.sin(rad) };
    const proj = dx * dir.x + dy * dir.y;
    return {
      point: { x: base.x + dir.x * proj, y: base.y + dir.y * proj },
      angle: nearest,
      distance: proj,
      snapped: true,
    };
  }
  return { point: { ...cursor }, angle: rawAngle, distance: dist, snapped: false };
}

/** ORTHO: fuerza a 0/90/180/270 (siempre engancha al más cercano). */
export function orthoSnap(base: CadVec2, cursor: CadVec2): PolarResult {
  return polarSnap(base, cursor, 90, 45);
}

/** Redondea una distancia al múltiplo de `step` más cercano (snap de longitud). */
export function snapDistance(distance: number, step: number): number {
  if (step <= 0) return distance;
  return Math.round(distance / step) * step;
}

/**
 * Como polarSnap pero además cuantiza la distancia a múltiplos de `step` (útil
 * para dibujar en rejilla: ángulo exacto + longitud redonda).
 */
export function polarSnapWithStep(
  base: CadVec2,
  cursor: CadVec2,
  increment = 45,
  step = 0,
  tolerance = increment / 2,
): PolarResult {
  const result = polarSnap(base, cursor, increment, tolerance);
  if (step <= 0) return result;
  const snappedDist = snapDistance(result.distance, step);
  const rad = (result.angle * Math.PI) / 180;
  return {
    ...result,
    distance: snappedDist,
    point: {
      x: base.x + Math.cos(rad) * snappedDist,
      y: base.y + Math.sin(rad) * snappedDist,
    },
  };
}
