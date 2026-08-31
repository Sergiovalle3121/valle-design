/**
 * Módulo de región: una sola fuente de verdad para el locale de números y
 * fechas, el sistema de unidades, el papel por defecto, y la familia de norma
 * de acotación — todo lo que hoy vive incrustado a mano (`"es-MX"`, `"es-ES"`,
 * `"en-US"`) en decenas de sitios del producto. Ver `types.ts` para el porqué
 * "región" es un eje distinto de "idioma de interfaz".
 *
 * No importar `./client` ni `./server` desde aquí: cada uno trae su propio
 * entorno (`document`/`navigator` uno, `next/headers` el otro) y mezclarlos en
 * el barrel rompería el import en el entorno contrario. Cada consumidor
 * importa el que le toca: `region/client` en un Client Component, o pasa un
 * `RegionProfile` ya resuelto por `region/server` desde un Server Component.
 */
export type {
  DimensionStandardFamily,
  MeasurementSystem,
  PaperSeries,
  RegionCode,
  RegionProfile,
} from "./types";
export {
  DEFAULT_REGION_CODE,
  DEFAULT_REGION_PROFILE,
  REGION_PROFILES,
  getRegionProfile,
  isRegionCode,
} from "./profiles";
export {
  formatRegionDate,
  formatRegionDateTime,
  formatRegionMagnitude,
  formatRegionNumber,
} from "./format";
export {
  regionFromAcceptLanguage,
  regionFromLanguageTags,
  resolveRegionCode,
} from "./resolve";
