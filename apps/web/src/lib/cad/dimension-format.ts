/**
 * Formato de cotas / estilos de dimensión para el CAD (Fase 73).
 *
 * Helpers PUROS para presentar medidas como lo hace un CAD: conversión de unidad,
 * precisión (decimales), separador de miles, tolerancias (± o +x/−y), área y
 * ángulo. Los usan las herramientas de cota (cad-command) y el escalímetro al
 * etiquetar. Sin estado ni React.
 *
 * Correr tests:  npx tsx src/lib/cad/dimension-format.spec.ts
 */

export type LengthUnit = 'mm' | 'cm' | 'm';

const TO_MM: Record<LengthUnit, number> = { mm: 1, cm: 10, m: 1000 };

/** Convierte una longitud entre unidades. */
export function convertLength(value: number, from: LengthUnit, to: LengthUnit): number {
  return (value * TO_MM[from]) / TO_MM[to];
}

export interface FormatOptions {
  unit?: LengthUnit;
  /** Decimales (default 0). */
  precision?: number;
  /** Mostrar el sufijo de unidad (default true). */
  showUnit?: boolean;
  /** Separador de miles (default false). */
  group?: boolean;
}

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Redondea a `precision` decimales y formatea, con grupos de miles opcionales. */
function formatNumber(value: number, precision: number, group: boolean): string {
  const fixed = (Math.abs(value) < 1e-12 ? 0 : value).toFixed(Math.max(0, precision));
  if (!group) return fixed;
  const [int, dec] = fixed.split('.');
  const sign = int.startsWith('-') ? '-' : '';
  const digits = sign ? int.slice(1) : int;
  return `${sign}${groupThousands(digits)}${dec ? '.' + dec : ''}`;
}

/** Formatea una longitud (ya expresada en `unit`) como etiqueta de cota. */
export function formatLength(value: number, opts: FormatOptions = {}): string {
  const unit = opts.unit ?? 'mm';
  const precision = opts.precision ?? 0;
  const showUnit = opts.showUnit ?? true;
  const num = formatNumber(value, precision, opts.group ?? false);
  return showUnit ? `${num} ${unit}` : num;
}

export type Tolerance = number | { plus: number; minus: number };

/**
 * Formatea una medida con tolerancia. Tolerancia simétrica (número) → "v ± t";
 * asimétrica ({plus,minus}) → "v +p/−m". Usa el signo menos tipográfico (−).
 */
export function formatWithTolerance(value: number, tol: Tolerance, opts: FormatOptions = {}): string {
  const precision = opts.precision ?? 0;
  const group = opts.group ?? false;
  const unit = opts.unit ?? 'mm';
  const showUnit = opts.showUnit ?? true;
  const base = formatNumber(value, precision, group);
  const suffix = showUnit ? ` ${unit}` : '';
  if (typeof tol === 'number') {
    return `${base} ± ${formatNumber(Math.abs(tol), precision, group)}${suffix}`;
  }
  const plus = formatNumber(Math.abs(tol.plus), precision, group);
  const minus = formatNumber(Math.abs(tol.minus), precision, group);
  return `${base} +${plus}/−${minus}${suffix}`;
}

/** Formatea un área (en `unit`²) con el sufijo de unidad al cuadrado. */
export function formatArea(value: number, opts: FormatOptions = {}): string {
  const unit = opts.unit ?? 'mm';
  const precision = opts.precision ?? 2;
  const showUnit = opts.showUnit ?? true;
  const num = formatNumber(value, precision, opts.group ?? false);
  return showUnit ? `${num} ${unit}²` : num;
}

/** Formatea un ángulo en grados. */
export function formatAngle(deg: number, precision = 1): string {
  return `${formatNumber(deg, precision, false)}°`;
}

/** Unidades en las que una cota puede ROTULAR su medida. */
export type CadDimensionUnitName = 'mm' | 'cm' | 'm' | 'in' | 'ft';
/** Remates admitidos para la línea de cota (ISO 129-1). */
export type CadDimensionArrowhead = 'closed-filled' | 'open' | 'architectural-tick' | 'dot';

export interface CadDimensionStyleShape {
  precision?: number;
  units?: CadDimensionUnitName;
  arrowhead?: CadDimensionArrowhead;
  prefix?: string;
  suffix?: string;
  arrowSize?: number;
  extensionGap?: number;
  extensionOvershoot?: number;
  textGap?: number;
  /** DIMSCALE — multiplica los tamaños que el ESTILO declara al hornear. */
  overallScale?: number;
}

/**
 * Qué manda cuando el ESTILO y el borrador de la paleta dicen cosas distintas.
 *
 * Manda el estilo. No es una preferencia: es la única forma de que una norma de
 * dibujo llegue al usuario sin que la teclee. Un documento nacido de plantilla
 * mexicana trae `COTA 1:50` en metros, con dos decimales y con garrapata; si el
 * borrador de la paleta ganara, cada cota nueva nacería en milímetros con flecha
 * y el arquitecto tendría que corregirlas de una en una — que es exactamente lo
 * que hace hoy en AutoCAD y lo que este producto existe para evitar.
 *
 * Las claves que el estilo no declara NO se emiten, en vez de emitirse como
 * `undefined`. Escribir `units: undefined` sobre una entidad borraría lo que el
 * borrador sí sabía, y el resultado sería peor que no haber consultado el
 * estilo.
 */
export function cadDimensionStyleOverrides(
  style: CadDimensionStyleShape,
  draft: CadDimensionStyleShape = {},
): CadDimensionStyleShape {
  // DIMSCALE multiplica los TAMAÑOS que el estilo declara: un solo número
  // escala flechas, huecos y separaciones — para eso existe. Los tamaños que
  // vienen del borrador no se escalan: no pertenecen a la norma.
  const scale = style.overallScale ?? 1;
  const pick = <K extends keyof CadDimensionStyleShape>(key: K) =>
    style[key] ?? draft[key];
  const pickScaled = (
    key: 'arrowSize' | 'extensionGap' | 'extensionOvershoot' | 'textGap',
  ) => (style[key] === undefined ? draft[key] : style[key]! * scale);
  const emit = <T>(value: T | undefined, key: string) =>
    value === undefined ? {} : { [key]: value };
  return {
    ...emit(pick('precision'), 'precision'),
    ...emit(pick('units'), 'units'),
    ...emit(pick('arrowhead'), 'arrowhead'),
    ...emit(pick('prefix'), 'prefix'),
    ...emit(pick('suffix'), 'suffix'),
    ...emit(pickScaled('arrowSize'), 'arrowSize'),
    ...emit(pickScaled('extensionGap'), 'extensionGap'),
    ...emit(pickScaled('extensionOvershoot'), 'extensionOvershoot'),
    ...emit(pickScaled('textGap'), 'textGap'),
  };
}
