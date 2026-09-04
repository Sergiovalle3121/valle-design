/**
 * Douglas–Peucker, en un módulo neutral.
 *
 * Vivía dentro de `engine/commands/draw-spline.ts`, que es un COMANDO: un
 * adaptador de entidad no puede importar de ahí sin cerrar un ciclo —los
 * comandos están por encima de los adaptadores, no al lado—. Se extrae tal cual,
 * sin tocar la aritmética, y `draw-spline` lo reexporta para que siga habiendo
 * UNA implementación. Dos copias del mismo algoritmo se separan el día que
 * alguien toca una.
 */
import type { CadPoint2 } from "./cad-document";

/** Distancia de un punto al SEGMENTO (no a la recta): fuera de los extremos manda el extremo. */
function distanceToSegment(point: CadPoint2, a: CadPoint2, b: CadPoint2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-18) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/**
 * Douglas–Peucker: conserva los puntos que se apartan más de `tolerance` de la
 * cuerda. Con `tolerance` 0 devuelve la lista intacta.
 *
 * Los EXTREMOS nunca se tocan: una polilínea simplificada empieza y acaba donde
 * empezaba y acababa. Es lo que permite usarlo para dibujar sin mover nada de
 * sitio.
 */
export function simplifyWithinTolerance(
  points: readonly CadPoint2[],
  tolerance: number,
): CadPoint2[] {
  if (!(tolerance > 0) || points.length <= 2) return [...points];
  let worst = 0;
  let index = 0;
  for (let current = 1; current < points.length - 1; current += 1) {
    const distance = distanceToSegment(points[current], points[0], points[points.length - 1]);
    if (distance > worst) {
      worst = distance;
      index = current;
    }
  }
  if (worst <= tolerance) return [points[0], points[points.length - 1]];
  return [
    ...simplifyWithinTolerance(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplifyWithinTolerance(points.slice(index), tolerance),
  ];
}
