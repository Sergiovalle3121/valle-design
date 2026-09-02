/**
 * LA COTA DE FABRICACIÓN: tolerancia por cota y ajustes ISO 286 (Ola I,
 * 2026-09-02).
 *
 * Medido antes: `dimension-format.ts` sabía FORMATEAR «v ± t» desde la fase 73
 * y ninguna cota del documento podía llevar una tolerancia —la entidad no la
 * guarda, el estilo no la declara, la rúbrica lo decía («TOLERANCE existe
 * como marco de control; las cotas con tolerancia no»)—.
 *
 * ## Dónde vive, y por qué ahí
 *
 * En `context.metadata` de la propia cota, que el formato YA tiene (es donde
 * viaja la marca anotativa y donde la Ola F dejó la receta de una tubería).
 * Cinco claves planas:
 *
 *   tolerance          "symmetric" | "deviation" | "limits"
 *   toleranceUpper     desviación superior, con signo
 *   toleranceLower     desviación inferior, con signo (≤ superior)
 *   toleranceDecimals  decimales con que se rotula la tolerancia
 *   toleranceFit       "H7", "g6"… si nació de un ajuste; informativo
 *
 * Las desviaciones van en MILÍMETROS para las cotas de longitud y en GRADOS
 * para la angular, sea cual sea la unidad del dibujo o la unidad con que la
 * cota rotula: así cambiar la cota de mm a pulgadas no cambia la pieza. Una
 * entidad nueva o un campo nuevo en `dimension` sería tocar el formato
 * persistido, decisión del titular; esto no lo toca.
 *
 * ## El ajuste
 *
 * `cadIsoFit` calcula las desviaciones de un ajuste ISO 286-1 (IT5 a IT11,
 * nominal hasta 500 mm) para agujeros D, E, F, G, H, JS y ejes d, e, f, g, h,
 * js, k, m, n, p: las tablas de grados IT y de desviaciones fundamentales son
 * las de la norma pública. Los agujeros K, M, N y P llevan una corrección Δ
 * por grado que NO está aquí, y se rechazan diciéndolo en vez de calcularse
 * mal.
 */
import type { CadEntity, CadEntityMetadata } from "./cad-document";

export type CadDimensionToleranceMode = "symmetric" | "deviation" | "limits";

export interface CadDimensionTolerance {
  mode: CadDimensionToleranceMode;
  /** Desviación superior (mm o grados), con signo. */
  upper: number;
  /** Desviación inferior (mm o grados), con signo; nunca mayor que `upper`. */
  lower: number;
  /** Decimales del rótulo de la tolerancia (0–6). */
  decimals: number;
  /** Ajuste ISO 286 del que nació («H7»), si lo hubo. */
  fit?: string;
}

/** Decimales que trae un número tecleado: 0,025 → 3; 5 → 0. Tope 6. */
export function cadDecimalsOf(...values: number[]): number {
  let decimals = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    const text = Math.abs(value).toString();
    const exponent = /e-(\d+)$/u.exec(text);
    if (exponent) decimals = Math.max(decimals, Number(exponent[1]));
    const point = text.indexOf(".");
    if (point >= 0) decimals = Math.max(decimals, text.length - point - 1);
  }
  return Math.min(6, decimals);
}

/** Las claves de metadatos de una tolerancia, listas para `context.metadata`. */
export function cadDimensionToleranceMetadata(tolerance: CadDimensionTolerance): CadEntityMetadata {
  return {
    tolerance: tolerance.mode,
    toleranceUpper: tolerance.upper,
    toleranceLower: tolerance.lower,
    toleranceDecimals: Math.max(0, Math.min(6, Math.round(tolerance.decimals))),
    ...(tolerance.fit ? { toleranceFit: tolerance.fit } : {}),
  };
}

export const CAD_DIMENSION_TOLERANCE_KEYS = ["tolerance", "toleranceUpper", "toleranceLower", "toleranceDecimals", "toleranceFit"] as const;

/** La tolerancia de una cota, leída con tolerancia: una clave rota = sin tolerancia. */
export function cadDimensionToleranceOf(
  entity: Pick<Extract<CadEntity, { type: "dimension" }>, "context"> | { context?: { metadata?: CadEntityMetadata } },
): CadDimensionTolerance | null {
  const metadata = entity.context?.metadata;
  if (!metadata) return null;
  const mode = metadata.tolerance;
  if (mode !== "symmetric" && mode !== "deviation" && mode !== "limits") return null;
  const upper = Number(metadata.toleranceUpper);
  const lower = Number(metadata.toleranceLower);
  if (!Number.isFinite(upper) || !Number.isFinite(lower) || lower > upper) return null;
  const decimals = Number(metadata.toleranceDecimals);
  const fit = typeof metadata.toleranceFit === "string" && metadata.toleranceFit ? metadata.toleranceFit : undefined;
  return {
    mode,
    upper,
    lower,
    decimals: Number.isFinite(decimals) ? Math.max(0, Math.min(6, Math.round(decimals))) : 3,
    ...(fit ? { fit } : {}),
  };
}

/** `{ tolerance }` para el modelo de export DXF, o `{}`: la cota sube su tolerancia por el mismo camino que la marca anotativa. */
export function cadDimensionToleranceExport(entity: { context?: { metadata?: CadEntityMetadata } }): { tolerance?: CadDimensionTolerance } {
  const tolerance = cadDimensionToleranceOf(entity);
  return tolerance ? { tolerance } : {};
}

/** Los metadatos de la cota sin las claves de tolerancia (para `Quitar`). */
export function cadDimensionMetadataWithoutTolerance(metadata: CadEntityMetadata | undefined): CadEntityMetadata | undefined {
  if (!metadata) return undefined;
  const rest: CadEntityMetadata = {};
  for (const [key, value] of Object.entries(metadata))
    if (!(CAD_DIMENSION_TOLERANCE_KEYS as readonly string[]).includes(key)) rest[key] = value;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

const MINUS = "−";

function signed(value: number, decimals: number): string {
  const fixed = Math.abs(value).toFixed(decimals);
  if (Number(fixed) === 0) return "0";
  return `${value < 0 ? MINUS : "+"}${fixed}`;
}

/**
 * El rótulo de la medida CON su tolerancia, tal como sale en visor, lámina y
 * DXF. `value` ya viene convertido a la unidad con que rotula la cota y
 * `factor` convierte las desviaciones (mm o grados) a esa unidad.
 *
 *   simétrica  → «40.00 ±0.05»
 *   desviación → «40.00 +0.025/0», «40.00 +0.050/−0.010»
 *   límites    → «40.025 / 40.000» (máximo, mínimo)
 */
export function cadDimensionToleranceText(
  value: number,
  precision: number,
  tolerance: CadDimensionTolerance,
  factor = 1,
): string {
  const decimals = Math.max(0, Math.min(6, Math.round(tolerance.decimals)));
  const upper = tolerance.upper * factor;
  const lower = tolerance.lower * factor;
  if (tolerance.mode === "limits") {
    const limitDecimals = Math.max(precision, decimals);
    return `${(value + upper).toFixed(limitDecimals)} / ${(value + lower).toFixed(limitDecimals)}`;
  }
  const base = value.toFixed(precision);
  if (tolerance.mode === "symmetric" || Math.abs(upper + lower) < 1e-12)
    return `${base} ±${Math.abs(upper).toFixed(decimals)}`;
  return `${base} ${signed(upper, decimals)}/${signed(lower, decimals)}`;
}

/* ───────────────────────────── ISO 286-1 ─────────────────────────────── */

/** Límites superiores de los 13 escalones de diámetro nominal (mm). */
const NOMINAL_STEPS = [3, 6, 10, 18, 30, 50, 80, 120, 180, 250, 315, 400, 500] as const;

/** Tolerancias fundamentales IT5–IT11 por escalón, en micrómetros. */
const IT_GRADES: Readonly<Record<number, readonly number[]>> = {
  5: [4, 5, 6, 8, 9, 11, 13, 15, 18, 20, 23, 25, 27],
  6: [6, 8, 9, 11, 13, 16, 19, 22, 25, 29, 32, 36, 40],
  7: [10, 12, 15, 18, 21, 25, 30, 35, 40, 46, 52, 57, 63],
  8: [14, 18, 22, 27, 33, 39, 46, 54, 63, 72, 81, 89, 97],
  9: [25, 30, 36, 43, 52, 62, 74, 87, 100, 115, 130, 140, 155],
  10: [40, 48, 58, 70, 84, 100, 120, 140, 160, 185, 210, 230, 250],
  11: [60, 75, 90, 110, 130, 160, 190, 220, 250, 290, 320, 360, 400],
};

/** Desviación SUPERIOR (es) de los ejes d–h, en µm; los agujeros D–H la reflejan. */
const UPPER_DEVIATIONS: Readonly<Record<string, readonly number[]>> = {
  d: [-20, -30, -40, -50, -65, -80, -100, -120, -145, -170, -190, -210, -230],
  e: [-14, -20, -25, -32, -40, -50, -60, -72, -85, -100, -110, -125, -135],
  f: [-6, -10, -13, -16, -20, -25, -30, -36, -43, -50, -56, -62, -68],
  g: [-2, -4, -5, -6, -7, -9, -10, -12, -14, -15, -17, -18, -20],
  h: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

/** Desviación INFERIOR (ei) de los ejes k–p, en µm. La de k vale para IT4–IT7. */
const LOWER_DEVIATIONS: Readonly<Record<string, readonly number[]>> = {
  k: [0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 5],
  m: [2, 4, 6, 7, 8, 9, 11, 13, 15, 17, 20, 21, 23],
  n: [4, 8, 10, 12, 15, 17, 20, 23, 27, 31, 34, 37, 40],
  p: [6, 12, 15, 18, 22, 26, 32, 37, 43, 50, 56, 62, 68],
};

export interface CadIsoFit {
  fit: string;
  /** `true` si es un agujero (letra mayúscula). */
  hole: boolean;
  grade: number;
  /** Desviaciones en mm, con signo. */
  upper: number;
  lower: number;
  /** IT del grado en mm. */
  it: number;
}

export const CAD_ISO_FIT_LETTERS = "D, E, F, G, H, JS (agujero) · d, e, f, g, h, js, k, m, n, p (eje)";

/**
 * Desviaciones de un ajuste ISO 286 para un nominal en mm. Devuelve `string`
 * con el motivo cuando no se puede calcular: la clase de negativa que evita
 * una pieza mecanizada con una tolerancia inventada.
 */
export function cadIsoFit(nominalMm: number, code: string): CadIsoFit | string {
  const match = /^([A-Za-z]{1,2})(\d{1,2})$/u.exec(code.trim());
  if (!match) return `«${code.trim()}» no es un ajuste ISO 286: se escribe letra y grado, como H7 o g6.`;
  const letters = match[1];
  const grade = Number(match[2]);
  const hole = letters === letters.toUpperCase();
  const letter = letters.toLowerCase();
  if (!(nominalMm > 0) || nominalMm > 500)
    return `El ajuste ${code.trim()} sólo se calcula para nominales de 0 a 500 mm (esta cota mide ${nominalMm.toFixed(3)} mm).`;
  const it = IT_GRADES[grade];
  if (!it) return `El grado IT${grade} no está en la tabla: se admiten IT5 a IT11.`;
  const step = NOMINAL_STEPS.findIndex((limit) => nominalMm <= limit);
  const tolerance = it[step];
  let upper: number;
  let lower: number;
  if (letter === "js") {
    upper = tolerance / 2;
    lower = -tolerance / 2;
  } else if (letter in UPPER_DEVIATIONS) {
    const fundamental = UPPER_DEVIATIONS[letter][step];
    if (hole) {
      lower = -fundamental;
      upper = lower + tolerance;
    } else {
      upper = fundamental;
      lower = upper - tolerance;
    }
  } else if (letter in LOWER_DEVIATIONS) {
    if (hole)
      return `El agujero ${letters}${grade} lleva la corrección Δ de la norma, que no está en esta tabla: admite ${CAD_ISO_FIT_LETTERS}.`;
    const fundamental = letter === "k" && (grade < 4 || grade > 7) ? 0 : LOWER_DEVIATIONS[letter][step];
    lower = fundamental;
    upper = lower + tolerance;
  } else {
    return `La letra «${letters}» no está en la tabla: admite ${CAD_ISO_FIT_LETTERS}.`;
  }
  return {
    fit: `${hole ? letters.toUpperCase() : letter}${grade}`,
    hole,
    grade,
    // `|| 0` mata el −0 de una desviación fundamental nula (h, H): un cero
    // con signo no es un número distinto, pero sí una cadena distinta.
    upper: (upper || 0) / 1000,
    lower: (lower || 0) / 1000,
    it: tolerance / 1000,
  };
}

/** La tolerancia de cota que corresponde a un ajuste ya calculado. */
export function cadDimensionToleranceFromFit(fit: CadIsoFit): CadDimensionTolerance {
  return { mode: "deviation", upper: fit.upper, lower: fit.lower, decimals: 3, fit: fit.fit };
}
