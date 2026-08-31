/**
 * Formateadores de región: la parte que consumen los sitios que hoy escriben
 * `.toLocaleString("es-MX")` o `.toLocaleDateString("es-ES")` a mano.
 *
 * Todos aceptan `region` como último argumento, con default a
 * `DEFAULT_REGION_PROFILE` (México) — así un caller que todavía no resuelve la
 * región del visitante sigue viendo exactamente el mismo resultado que hoy, y
 * uno que sí la resuelve sólo tiene que pasarla.
 */
import { DEFAULT_REGION_PROFILE } from "./profiles";
import type { RegionProfile } from "./types";

/** `Intl.NumberFormat` con el locale de número de la región. */
export function formatRegionNumber(
  value: number,
  region: RegionProfile = DEFAULT_REGION_PROFILE,
  options?: Intl.NumberFormatOptions,
): string {
  return value.toLocaleString(region.numberLocale, options);
}

/** `Intl.DateTimeFormat` con el locale de fecha de la región. */
export function formatRegionDate(
  date: Date,
  region: RegionProfile = DEFAULT_REGION_PROFILE,
  options?: Intl.DateTimeFormatOptions,
): string {
  return date.toLocaleDateString(region.dateLocale, options);
}

/** `Intl.DateTimeFormat` para fecha+hora, con el locale de la región. */
export function formatRegionDateTime(
  date: Date,
  region: RegionProfile = DEFAULT_REGION_PROFILE,
  options?: Intl.DateTimeFormatOptions,
): string {
  return date.toLocaleString(region.dateLocale, options);
}

/**
 * Formatea una magnitud para los mensajes de consulta del motor (MASSPROP,
 * INTERFERE, …). Generaliza `engine/commands/solids-support.ts::formatMagnitude`
 * — el criterio (notación científica fuera de [1e-3, 1e9), guion para lo no
 * finito, sin decimales inventados en un entero) es el mismo, sólo que el
 * locale de número sale de la región en vez de estar fijo en `es-MX`.
 */
export function formatRegionMagnitude(
  value: number,
  region: RegionProfile = DEFAULT_REGION_PROFILE,
): string {
  if (!Number.isFinite(value)) return "—";
  const absolute = Math.abs(value);
  if (absolute !== 0 && (absolute < 1e-3 || absolute >= 1e9))
    return value.toExponential(4);
  return formatRegionNumber(value, region, { maximumFractionDigits: 4 });
}
