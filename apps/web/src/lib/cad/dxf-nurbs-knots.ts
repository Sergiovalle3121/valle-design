/**
 * Vector de nudos sujeto para una NURBS de grado `degree`.
 *
 * Vivía DUPLICADO —una copia en la exportación y otra en el ensamblado del
 * documento, idénticas salvo el nombre del índice del bucle—. Dos copias de la
 * misma fórmula son dos sitios donde arreglar el mismo error, y sólo se
 * descubre que existía la segunda cuando el spline sale mal por un lado y bien
 * por el otro. Aquí hay una sola.
 */
export function clampedKnots(controlCount: number, degree: number): number[] {
  const knots: number[] = [];
  const spans = controlCount - degree;
  for (let index = 0; index <= degree; index += 1) knots.push(0);
  for (let index = 1; index < spans; index += 1) knots.push(index / spans);
  for (let index = 0; index <= degree; index += 1) knots.push(1);
  return knots;
}
