/**
 * Tipos del módulo de región.
 *
 * "Región" es un eje distinto de "idioma de la interfaz" (`src/i18n/config.ts`,
 * que sólo decide en qué idioma se leen los textos: `en` | `es`). La región
 * decide en qué CONVENCIÓN se presentan los números, las fechas, las unidades,
 * el papel por defecto y la familia de norma de acotación — cosas que un
 * usuario de habla inglesa en México también espera ver a la mexicana, y que un
 * usuario de habla hispana en España espera ver a la española. Confundir los
 * dos ejes fue exactamente el defecto que arrastraba el producto: un `es-MX`
 * incrustado a mano no es idioma, es región, y estaba resuelto en el sitio
 * equivocado (o en ningún sitio).
 */

/**
 * Regiones con perfil propio hoy. No es una lista cerrada: añadir una región
 * nueva es añadir una entrada a `REGION_PROFILES` en `profiles.ts`, no tocar
 * a ningún consumidor — ver la nota de extensibilidad allí.
 */
export type RegionCode = "MX" | "US" | "ES";

/** Sistema de medida por defecto: métrico o imperial. */
export type MeasurementSystem = "metric" | "imperial";

/** Familia de tamaños de papel por defecto. */
export type PaperSeries = "ISO_A" | "ANSI";

/**
 * Familia de norma de acotación por defecto. No sustituye el registro
 * detallado de normas y costumbres mexicanas de dibujo
 * (`standards/mexican-drafting-sources.ts`) — ese registro sigue siendo la
 * fuente de verdad para lo que YA está normado en el catálogo mexicano. Este
 * campo es más burdo a propósito: decide únicamente si un dibujo NUEVO, sin
 * plantilla, arranca con la convención ISO (flecha o garrapata, admite ambas)
 * o con la convención ASME (flecha rellena, la única que admite Y14.5).
 */
export type DimensionStandardFamily = "ISO" | "ASME";

/**
 * El perfil completo de una región: todo lo que hoy vive incrustado a mano en
 * decenas de sitios, en un solo lugar.
 */
export interface RegionProfile {
  readonly code: RegionCode;
  /** Nombre visible, en español (el vocabulario del producto es español). */
  readonly label: string;
  /** BCP-47 para `Intl.NumberFormat`: separador de millares y de decimales. */
  readonly numberLocale: string;
  /** BCP-47 para `Intl.DateTimeFormat`. */
  readonly dateLocale: string;
  readonly measurementSystem: MeasurementSystem;
  readonly paperSeries: PaperSeries;
  /** Papel por defecto de un dibujo nuevo, como llave de `CAD_SHEET_PAPERS`. */
  readonly defaultPaper: "A4" | "letter";
  readonly dimensionStandardFamily: DimensionStandardFamily;
}
