/**
 * Elipses y arcos elípticos del CAD (VD-CAD-DEPTH-B2).
 *
 * La ELIPSE de AutoCAD (óvalos, bocas de tanque en perspectiva, arcos
 * rebajados) no existía en el modelo de caja. Este módulo la modela con centro,
 * semiejes y rotación, y soporta el arco elíptico por ángulos paramétricos.
 * Geometría pura, sin dependencias del editor; también habilita el escalado no
 * uniforme de bloques (un círculo escalado en un eje es una elipse).
 *
 * Convención de ángulos: GRADOS. El ángulo es PARAMÉTRICO (anomalía excéntrica),
 * igual que la entidad ELLIPSE de DXF: el punto local es (rx·cos t, ry·sin t).
 */
import type { CadVec2 } from "./primitives";

export interface CadEllipse {
  center: CadVec2;
  /** Semieje mayor. */
  rx: number;
  /** Semieje menor. */
  ry: number;
  /** Rotación del eje mayor respecto de +X, en grados CCW. */
  rotation: number;
  /** Ángulo paramétrico inicial (grados); omitir para elipse completa. */
  startAngle?: number;
  /** Ángulo paramétrico final (grados); omitir para elipse completa. */
  endAngle?: number;
}

function norm360(a: number): number {
  const w = a % 360;
  return w < 0 ? w + 360 : w;
}

/** Punto sobre la elipse al ángulo paramétrico dado (grados). */
export function ellipsePoint(el: CadEllipse, angleDeg: number): CadVec2 {
  const t = (angleDeg * Math.PI) / 180;
  const lx = el.rx * Math.cos(t);
  const ly = el.ry * Math.sin(t);
  const rot = (el.rotation * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  return {
    x: el.center.x + lx * cos - ly * sin,
    y: el.center.y + lx * sin + ly * cos,
  };
}

function sweepDeg(el: CadEllipse): { start: number; sweep: number } {
  if (el.startAngle == null || el.endAngle == null) return { start: 0, sweep: 360 };
  const start = el.startAngle;
  const raw = norm360(el.endAngle - el.startAngle);
  return { start, sweep: raw === 0 ? 360 : raw };
}

/** Teselado en una polilínea de `segments` tramos (mínimo 3 para completa). */
export function ellipseTessellate(el: CadEllipse, segments = 64): CadVec2[] {
  const { start, sweep } = sweepDeg(el);
  const full = sweep >= 360 - 1e-9;
  const steps = Math.max(full ? 3 : 1, Math.floor(segments));
  const points: CadVec2[] = [];
  // Para completa no repetimos el último punto; para arco sí cerramos en el fin.
  const count = full ? steps : steps + 1;
  for (let i = 0; i < count; i += 1) {
    points.push(ellipsePoint(el, start + (sweep * i) / steps));
  }
  return points;
}

/** Área de la elipse completa (π·rx·ry). Los arcos devuelven 0 (no cerrados). */
export function ellipseArea(el: CadEllipse): number {
  if (el.startAngle != null || el.endAngle != null) return 0;
  return Math.PI * el.rx * el.ry;
}

/**
 * Perímetro de la elipse completa por la aproximación de Ramanujan (exacta para
 * un círculo). Para arcos, longitud por teselado.
 */
export function ellipsePerimeter(el: CadEllipse, samples = 128): number {
  if (el.startAngle == null || el.endAngle == null) {
    const a = el.rx;
    const b = el.ry;
    return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  }
  const pts = ellipseTessellate(el, samples);
  let total = 0;
  for (let i = 1; i < pts.length; i += 1) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return total;
}

/** Caja envolvente: exacta para la elipse completa; por teselado para el arco. */
export function ellipseBounds(el: CadEllipse) {
  if (el.startAngle == null || el.endAngle == null) {
    const rot = (el.rotation * Math.PI) / 180;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const halfX = Math.hypot(el.rx * cos, el.ry * sin);
    const halfY = Math.hypot(el.rx * sin, el.ry * cos);
    return {
      minX: el.center.x - halfX,
      minY: el.center.y - halfY,
      maxX: el.center.x + halfX,
      maxY: el.center.y + halfY,
    };
  }
  const pts = ellipseTessellate(el, 128);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}
