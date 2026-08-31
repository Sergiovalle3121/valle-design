/**
 * Los tres formateadores de unidades del estudio.
 *
 * Vivían como constantes de módulo dentro de `Layout3DEditor.tsx`, donde no
 * estorbaban a nadie hasta que hubo que sacar de allí un cuadro que los usa:
 * el panel de cantidades formatea áreas y longitudes en cada fila. O se
 * duplicaban —dos definiciones del mismo redondeo es la forma de que un día
 * discrepen— o salían a un módulo propio. Salieron.
 *
 * La conversión a metros y a metros cuadrados es la del producto y no una
 * genérica: el documento canónico guarda milímetros por defecto. El locale de
 * número y si el resultado se publica en métrico o en imperial ya no están
 * fijos: salen de `region`, con México (métrico, `es-MX`) como default
 * explícito — un caller que no resuelve la región del visitante ve
 * exactamente lo mismo que antes.
 */
import { formatLength as formatImperialLength } from "@/lib/cad/unit-format";
import {
  DEFAULT_REGION_PROFILE,
  formatRegionNumber,
  type RegionProfile,
} from "@/lib/cad/region";

const MM_PER_UNIT: Record<string, number> = { mm: 1, cm: 10, m: 1000 };

function toMm(v: number, unit: string): number {
  return v * (MM_PER_UNIT[unit] ?? 1);
}

/** Una distancia en la unidad del documento, redondeada y con su sufijo. */
export const fmtDist = (
  d: number,
  unit: string,
  region: RegionProfile = DEFAULT_REGION_PROFILE,
) => `${formatRegionNumber(Math.round(d), region)} ${unit}`;

/** Un área en la unidad del documento, siempre publicada en m² (o en ft² en imperial). */
export const fmtArea = (
  v: number,
  unit: string,
  region: RegionProfile = DEFAULT_REGION_PROFILE,
) => {
  const m2 = unit === "mm" ? v / 1e6 : unit === "cm" ? v / 1e4 : v; // → m²
  if (region.measurementSystem === "imperial") {
    const ft2 = m2 * 10.7639;
    return `${formatRegionNumber(ft2, region, { maximumFractionDigits: ft2 < 100 ? 2 : 0 })} ft²`;
  }
  return `${formatRegionNumber(m2, region, { maximumFractionDigits: m2 < 100 ? 2 : 0 })} m²`;
};

/**
 * Una longitud en la unidad del documento. En métrico se publica en metros,
 * igual que siempre; en imperial se publica en pies-pulgadas (`1'-6 1/2"`),
 * la notación arquitectónica de `lib/cad/unit-format.ts`, y no en metros
 * convertidos — es la diferencia entre "vender fuera de México sin tocar
 * código" y sólo traducir el separador decimal de una unidad que igual no es
 * la que ese mercado usa.
 */
export const fmtLen = (
  v: number,
  unit: string,
  region: RegionProfile = DEFAULT_REGION_PROFILE,
) => {
  if (region.measurementSystem === "imperial") {
    const inches = toMm(v, unit) / 25.4;
    return formatImperialLength(inches, { system: "architectural", denominator: 16 });
  }
  const m = unit === "mm" ? v / 1000 : unit === "cm" ? v / 100 : v; // → m
  return `${formatRegionNumber(m, region, { maximumFractionDigits: 2 })} m`;
};
