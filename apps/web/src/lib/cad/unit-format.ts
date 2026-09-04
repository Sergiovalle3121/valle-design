/**
 * Formato de unidades (UNITS / DIMSTYLE) del CAD (VD-CAD-DEPTH-B5).
 *
 * Cómo se ESCRIBE una medida en un plano: decimal (123.46 mm), arquitectónico
 * (1'-6 1/2"), de ingeniería (1'-6.50"), fraccionario (6 1/2) o científico. Es
 * lo que distingue un plano profesional de una hoja con números crudos, y lo
 * que un CAD serio debe soportar para clientes en pulgadas y en métrico. Módulo
 * puro de formato, sin dependencias del editor.
 */

export type UnitSystem =
  | "decimal"
  | "architectural"
  | "engineering"
  | "fractional"
  | "scientific";

export interface UnitFormatOptions {
  system: UnitSystem;
  /** Decimales para decimal/engineering/scientific (por defecto 2). */
  precision?: number;
  /** Denominador de la fracción para architectural/fractional (por defecto 16). */
  denominator?: number;
  /** Sufijo para decimal (p.ej. " mm", " m"). */
  suffix?: string;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    [x, y] = [y, x % y];
  }
  return x || 1;
}

/** Descompone un valor no negativo en entero + fracción reducida n/d. */
function fractionParts(value: number, denom: number): {
  whole: number;
  num: number;
  den: number;
} {
  let whole = Math.floor(value);
  let num = Math.round((value - whole) * denom);
  let den = denom;
  if (num >= den) {
    whole += 1;
    num = 0;
  }
  if (num !== 0) {
    const g = gcd(num, den);
    num /= g;
    den /= g;
  }
  return { whole, num, den };
}

function formatFraction(whole: number, num: number, den: number): string {
  if (num === 0) return `${whole}`;
  if (whole === 0) return `${num}/${den}`;
  return `${whole} ${num}/${den}`;
}

/**
 * Formatea una longitud según el sistema pedido. Para architectural/engineering
 * el valor se interpreta en PULGADAS (12 por pie), como en AutoCAD.
 */
export function formatLength(value: number, options: UnitFormatOptions): string {
  const precision = options.precision ?? 2;
  const denom = options.denominator ?? 16;
  const abs = Math.abs(value);
  // Un valor que REDONDEA a cero no lleva signo: `-0'-0"` no es una
  // longitud, es el orden de las operaciones asomando. El paso depende del
  // sistema —el denominador en los fraccionarios, la potencia de diez en
  // los decimales— y sólo se aplica cuando el número cabe sin perder
  // dígitos al escalarlo.
  const step =
    options.system === "architectural" || options.system === "fractional"
      ? denom
      : 10 ** precision;
  const scaled = abs * step;
  const roundsToZero = scaled < Number.MAX_SAFE_INTEGER && Math.round(scaled) === 0;
  const sign = value < 0 && !roundsToZero ? "-" : "";

  switch (options.system) {
    case "decimal":
      return `${value.toFixed(precision)}${options.suffix ?? ""}`;
    case "scientific":
      return value.toExponential(precision).toUpperCase();
    case "fractional": {
      const { whole, num, den } = fractionParts(abs, denom);
      return `${sign}${formatFraction(whole, num, den)}`;
    }
    case "architectural": {
      let feet = Math.floor(abs / 12);
      const remInches = abs - feet * 12;
      const { whole, num, den } = fractionParts(remInches, denom);
      let inchWhole = whole;
      if (inchWhole >= 12) {
        feet += 1;
        inchWhole -= 12;
      }
      const inchPart = num === 0 ? `${inchWhole}` : `${inchWhole} ${num}/${den}`;
      return `${sign}${feet}'-${inchPart}"`;
    }
    case "engineering": {
      // El acarreo se hace ANTES de partir en pies. Partir primero y
      // redondear después emite `1'-12"` para 23.6" con precisión 0: doce
      // pulgadas en el campo de las pulgadas, que además se relee como 24 y
      // se reescribe `2'-0"` (medido, F4 2026-09-04).
      const rounded = Number(abs.toFixed(precision));
      if (rounded === 0) return `0'-${(0).toFixed(precision)}"`;
      const feet = Math.floor(rounded / 12 + 1e-9);
      const remInches = Math.max(0, rounded - feet * 12);
      return `${sign}${feet}'-${remInches.toFixed(precision)}"`;
    }
  }
}

/** Atajo métrico: milímetros de dibujo → metros con `precision` decimales. */
export function formatMeters(mm: number, precision = 2): string {
  return `${(mm / 1000).toFixed(precision)} m`;
}

/** Atajo métrico: milímetros de dibujo → centímetros. */
export function formatCentimeters(mm: number, precision = 1): string {
  return `${(mm / 10).toFixed(precision)} cm`;
}
