/**
 * REDONDEO MONETARIO CANÓNICO — una sola fuente para el núcleo contable.
 *
 * El modelo OBJETIVO del dinero de plataforma es el value-object entero de
 * `money.ts` (unidades menores, aritmética exacta, sin punto flotante). Pero el
 * núcleo contable de hoy guarda los importes como `DECIMAL(18, s)` que TypeORM
 * devuelve como `number` (float64), y cada servicio traía su PROPIO
 * `round`/`round2`: ~15 definiciones y DOS escalas (4 decimales para importes,
 * 6 para costos/precios unitarios) conviviendo sin un solo sitio. La misma
 * cifra podía redondearse distinto según qué motor la tocara.
 *
 * Este módulo centraliza ESE redondeo —el del modelo decimal-como-`number` que
 * hoy existe— como paso INCREMENTAL hacia el VO entero. No cambia
 * almacenamiento ni moneda: es exactamente el mismo half-up
 * (`Math.round(v * 10**dp) / 10**dp`) que el ERP ya hacía, ahora en un solo
 * lugar y con las escalas nombradas. Cambiar el modo de redondeo (p. ej. a
 * banker's rounding) pasa a ser una edición de UN sitio, no de quince.
 */

/** Decimales de un importe monetario (columnas `DECIMAL(18,4)`). */
export const MONEY_AMOUNT_DP = 4;

/** Decimales de un costo o precio unitario (columnas `DECIMAL(18,6)`). */
export const MONEY_UNIT_COST_DP = 6;

/**
 * Redondeo half-up a `dp` decimales, tolerante a `null`/`NaN` (→ 0). Idéntico
 * al `Math.round((Number(v) || 0) * 10**dp) / 10**dp` que los servicios del ERP
 * ya usaban (`10**4 === 10000`, `10**6 === 1000000`): es la FUENTE ÚNICA del
 * redondeo monetario del núcleo contable, no un cambio de comportamiento.
 */
export function roundMoney(
  value: number,
  dp: number = MONEY_AMOUNT_DP,
): number {
  const factor = 10 ** dp;
  return Math.round((Number(value) || 0) * factor) / factor;
}
