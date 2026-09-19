/**
 * Resolución de punto de dibujo: ORTHO/POLAR manda sobre OTRACK.
 *
 * Extraído de Layout3DEditor.tsx para corregir el bug de prioridad: OTRACK
 * se comprobaba ANTES que ORTHO, así que con ORTHO encendido una línea podía
 * salir a 1,06° si un punto de rastreo ofrecía una coordenada ligeramente
 * inclinada. La regla de AutoCAD es clara: ORTHO es absoluto; OTRACK sólo
 * opera cuando ORTHO/POLAR no imponen dirección.
 *
 * Puro: sin React, sin refs, sin DOM. Recibe todo por argumento.
 */
import {
  resolveCadPolarTracking,
  trackFromAcquiredPoints,
} from "../../../lib/cad/precision-tracking";

export interface DraftPointInput {
  /** Cursor en coordenadas del mundo. */
  cursor: { x: number; y: number };
  /** Punto ancla (último punto fijado por el comando). */
  anchor: { x: number; y: number } | null;
  /** Tolerancia de captura en unidades del mundo. */
  tolerance: number;
  /** ORTHO encendido. */
  ortho: boolean;
  /** POLAR encendido. */
  polar: boolean;
  /** Incremento polar en grados. */
  polarIncrement: number;
  /** OTRACK encendido. */
  objectSnapTracking: boolean;
  /** Puntos adquiridos por el rastreo de objeto. */
  trackingPoints: readonly { x: number; y: number }[];
  /** Redondeo de coordenadas (rejilla, snap). */
  snapWorld: (value: number) => number;
}

export interface DraftPointResult {
  x: number;
  y: number;
  /** Qué fijó el punto: "ortho", "polar", "object" (OTRACK) o undefined (crudo). */
  tracking?: "ortho" | "polar" | "object";
  /** Ángulo en grados si fue fijado por ORTHO/POLAR. */
  trackingAngle?: number;
  /**
   * Guías visuales para el rastreo de OTRACK: X e Y si algún eje se imantó.
   * El anfitrión las dibuja como líneas de referencia.
   */
  guideX: number | null;
  guideY: number | null;
}

/**
 * Resuelve el punto de dibujo respetando la jerarquía de AutoCAD:
 * ORTHO/POLAR → OTRACK → punto crudo.
 */
export function resolveDraftPoint(input: DraftPointInput): DraftPointResult {
  const {
    cursor,
    anchor,
    tolerance,
    ortho,
    polar,
    polarIncrement,
    objectSnapTracking,
    trackingPoints,
    snapWorld,
  } = input;

  // 1. ORTHO/POLAR tiene la máxima prioridad.
  if (anchor && (ortho || polar)) {
    const increment = ortho ? 90 : polarIncrement;
    const tracked = resolveCadPolarTracking(
      anchor,
      cursor,
      increment,
      ortho ? 45 : Math.min(6, increment / 4),
    );
    if (tracked.snapped) {
      const along = Math.hypot(tracked.point.x - anchor.x, tracked.point.y - anchor.y);
      const stepped = snapWorld(along);
      const ratio = along > 1e-9 ? stepped / along : 0;
      return {
        x: anchor.x + (tracked.point.x - anchor.x) * ratio,
        y: anchor.y + (tracked.point.y - anchor.y) * ratio,
        tracking: ortho ? "ortho" : "polar",
        trackingAngle: tracked.angle,
        guideX: null,
        guideY: null,
      };
    }
  }

  // 2. OTRACK sólo si ORTHO/POLAR no fijaron el punto.
  if (objectSnapTracking && trackingPoints.length) {
    const tracked = trackFromAcquiredPoints(cursor, trackingPoints, tolerance);
    if (tracked.snapped) {
      return {
        x: tracked.point.x,
        y: tracked.point.y,
        tracking: "object",
        guideX: tracked.guides.find((g) => g.axis === "x")?.value ?? null,
        guideY: tracked.guides.find((g) => g.axis === "y")?.value ?? null,
      };
    }
  }

  // 3. Punto crudo con snap de rejilla.
  return { x: snapWorld(cursor.x), y: snapWorld(cursor.y), guideX: null, guideY: null };
}