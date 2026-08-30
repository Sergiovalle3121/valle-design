/**
 * Normalización del barrido angular de un arco — la única puerta por la que
 * un par (ángulo inicial, ángulo final) puede convertirse en un barrido.
 *
 * Por qué existe este módulo: seis sitios repetían el mismo
 * `while (sweep <= 0) sweep += 360;`. Ese bucle no termina con un barrido
 * finito enorme y negativo —`-1e300 + 360 === -1e300`, porque 360 queda por
 * debajo del ULP— y un DXF con el grupo 51 corrupto puede traer exactamente
 * eso: colgaba la pestaña en TypeScript y el módulo entero en wasm. El caso
 * positivo enorme no colgaba el bucle pero producía millones de puntos (OOM
 * en TypeScript, desbordamiento de la aritmética de capacidad en el kernel).
 *
 * Semántica, idéntica al bucle en todo el rango sano:
 *   - barrido en (0, 360]: sin cambio; 0 y los múltiplos de -360 dan 360
 *     (convención DXF: arco completo), igual que el bucle.
 *   - barrido negativo: módulo con signo + 360 — mismo resultado que sumar
 *     vueltas, en tiempo constante.
 *   - barrido > 360: se conserva — hay arcos importados que declaran más de
 *     una vuelta y recortarlos inventaría geometría — hasta MAX_SWEEP_DEGREES;
 *     por encima se recorta a ese tope: ninguna pieza real declara un millón
 *     de grados, y el recorte mantiene el coste acotado.
 *   - no finito (NaN, ±Infinity): NaN, que en todos los consumidores produce
 *     la teselación vacía (el mismo «no se puede honrar → cero puntos» que
 *     declara el kernel wasm).
 *
 * El kernel Rust (`crates/valle-cad-kernel/src/lib.rs`, `normalized_sweep`)
 * implementa EXACTAMENTE estas reglas con estas mismas constantes; el spec de
 * paridad los mantiene iguales. Cambiar aquí sin cambiar allí es romper la
 * paridad a sabiendas.
 */

/** Tope del barrido: ~2 778 vueltas. Corrupción acotada, no un OOM. */
export const MAX_SWEEP_DEGREES = 1_000_000;

/**
 * Barrido normalizado de `startDeg` a `endDeg`, en grados, convención DXF
 * (siempre CCW): resultado en (0, MAX_SWEEP_DEGREES], o NaN si los ángulos no
 * son finitos.
 */
export function normalizeArcSweepDegrees(
  startDeg: number,
  endDeg: number,
): number {
  const sweep = endDeg - startDeg;
  if (!Number.isFinite(sweep)) return Number.NaN;
  if (sweep <= 0) {
    // (sweep % 360) está en (-360, 0]; +360 lo deja en (0, 360]. El caso
    // exacto 0 (y -360, -720…) da 360: arco completo, igual que el bucle.
    return (sweep % 360) + 360;
  }
  return Math.min(sweep, MAX_SWEEP_DEGREES);
}
