import type { RegionCode, RegionProfile } from "./types";

/**
 * México es el arranque, no el techo (IDENTITY.md). El producto nace en
 * México y el default de región lo dice con todas sus letras — no es una
 * constante que alguien tenga que adivinar leyendo el código.
 */
export const DEFAULT_REGION_CODE: RegionCode = "MX";

/**
 * El registro de perfiles. Tres hoy, porque tres son las convenciones que se
 * encontraron incrustadas a mano en el código (`es-MX`, `es-ES`, `en-US`) — no
 * porque el producto esté limitado a tres países. Vender en un país nuevo con
 * una convención de formato distinta es añadir una entrada aquí; ningún
 * consumidor de este módulo necesita cambiar, porque todos leen el perfil por
 * `RegionCode`, nunca por un locale incrustado.
 */
const MX: RegionProfile = {
  code: "MX",
  label: "México",
  numberLocale: "es-MX",
  dateLocale: "es-MX",
  measurementSystem: "metric",
  paperSeries: "ISO_A",
  defaultPaper: "A4",
  dimensionStandardFamily: "ISO",
};

const ES: RegionProfile = {
  code: "ES",
  label: "España",
  numberLocale: "es-ES",
  dateLocale: "es-ES",
  measurementSystem: "metric",
  paperSeries: "ISO_A",
  defaultPaper: "A4",
  dimensionStandardFamily: "ISO",
};

const US: RegionProfile = {
  code: "US",
  label: "Estados Unidos",
  numberLocale: "en-US",
  dateLocale: "en-US",
  measurementSystem: "imperial",
  paperSeries: "ANSI",
  defaultPaper: "letter",
  dimensionStandardFamily: "ASME",
};

export const REGION_PROFILES: Readonly<Record<RegionCode, RegionProfile>> = {
  MX,
  ES,
  US,
};

export const DEFAULT_REGION_PROFILE: RegionProfile =
  REGION_PROFILES[DEFAULT_REGION_CODE];

export function isRegionCode(value: unknown): value is RegionCode {
  return typeof value === "string" && value in REGION_PROFILES;
}

/** El perfil de un código de región, o el de México si el código no existe. */
export function getRegionProfile(
  code: RegionCode | string | null | undefined,
): RegionProfile {
  if (isRegionCode(code)) return REGION_PROFILES[code];
  return DEFAULT_REGION_PROFILE;
}
