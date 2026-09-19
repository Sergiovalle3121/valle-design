/**
 * Eje Y del plano: un solo sitio que define el signo y las conversiones
 * dibujo ↔ pantalla. Cuando T20 voltee la convención, sólo cambia
 * `PLAN_AXIS_Y_SCREEN_SIGN` aquí.
 */

/** Signo de la Y de pantalla por unidad de Y de dibujo. */
export type PlanAxisYSign = 1 | -1;

/**
 * Convención vigente: `1` significa que la +Y del dibujo crece hacia ABAJO
 * en pantalla (como el canvas HTML, contrario a AutoCAD).
 */
export const PLAN_AXIS_Y_SCREEN_SIGN: PlanAxisYSign = 1;

/** Convierte una Y de dibujo a desplazamiento de pantalla (aplica signo). */
export function planAxisDrawingToScreen(
  dyDrawing: number,
  sign: PlanAxisYSign = PLAN_AXIS_Y_SCREEN_SIGN,
): number {
  return dyDrawing * sign;
}

/** Convierte un desplazamiento de pantalla a Y de dibujo (invierte signo). */
export function planAxisScreenToDrawing(
  dyScreen: number,
  sign: PlanAxisYSign = PLAN_AXIS_Y_SCREEN_SIGN,
): number {
  return dyScreen / sign;
}