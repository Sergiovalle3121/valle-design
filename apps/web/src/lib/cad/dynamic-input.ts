import { polarPoint, type Point } from './precision-input';
import { parseImperialLength } from './units-imperial';
import { DEFAULT_REGION_PROFILE } from './region';

export type CadDynamicInputMode = 'absolute' | 'relative' | 'polar' | 'radius' | 'diameter' | 'offset';
export type CadLengthUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft';

export interface CadDynamicInputValues {
  x?: string;
  y?: string;
  distance?: string;
  angle?: string;
  radius?: string;
  diameter?: string;
  offset?: string;
}

export interface CadDynamicInputContext {
  mode: CadDynamicInputMode;
  anchor?: Point | null;
  documentUnit: CadLengthUnit;
  locale?: string;
  defaults?: Partial<Record<keyof CadDynamicInputValues, number>>;
}

export type CadDynamicInputResult =
  | { ok: true; mode: CadDynamicInputMode; point: Point; previewLabel: string }
  | { ok: true; mode: 'radius' | 'diameter' | 'offset'; scalar: number; previewLabel: string }
  | { ok: false; field: keyof CadDynamicInputValues | 'form'; error: string };

const UNIT_TO_MM: Record<CadLengthUnit, number> = {
  mm: 1,
  cm: 10,
  m: 1_000,
  in: 25.4,
  ft: 304.8,
};

/**
 * El número desnudo de un campo de la entrada dinámica (sin la marca de
 * unidad, que ya se separó antes de llegar aquí).
 *
 * ANTES esto era `normalizedNumber(raw, locale)`, y la coma valía decimal
 * cuando el idioma empezaba por «es» o «de» — «1,5m» eran 1500 mm en
 * es-MX. Era una TRAMPA activa: `precision-input.ts` trata la MISMA coma
 * como AutoCAD, que la usa solo para separar componentes de una coordenada
 * (`5,300`) y JAMÁS como separador decimal, sea cual sea el idioma. Con dos
 * analizadores que no coinciden, la misma tecla producía un número distinto
 * según qué mitad del formulario la leyera.
 *
 * Ahora los dos caminos comparten gramática: se delega en
 * `parseImperialLength` (la de `precision-input.ts`), que además regala
 * pies/pulgadas tecleados directos (`1'-6"`) en cualquier campo de
 * longitud. `dynamic-input-precision-input-parity.spec.ts` compara las dos
 * rutas con la misma entrada.
 */
function parseBareLengthToken(text: string): { value: number; isInches: boolean } | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const parsed = parseImperialLength(trimmed);
  if (!parsed.ok) return null;
  return { value: parsed.inches, isInches: parsed.explicit };
}

export function parseCadDynamicScalar(
  raw: string,
  documentUnit: CadLengthUnit,
  locale = DEFAULT_REGION_PROFILE.numberLocale,
  kind: 'length' | 'angle' = 'length',
): number | null {
  void locale; // La coma nunca es decimal: ver el porqué en `parseBareLengthToken`.
  const match = raw.trim().toLocaleLowerCase().match(/^(.+?)(mm|cm|m|in|ft|°|deg)?$/);
  if (!match) return null;
  const token = parseBareLengthToken(match[1]!);
  if (token === null) return null;
  if (kind === 'angle') {
    // Un ángulo no lleva marca de pie/pulgada: `45'` como ángulo no significa
    // nada, así que un texto que SÍ trajo esas marcas se rechaza en vez de
    // convertir 45 pies en 540 grados en silencio.
    if (token.isInches) return null;
    return match[2] && !['°', 'deg'].includes(match[2]) ? null : token.value;
  }
  // Si el propio texto traía marca de pie/pulgada (`6"`, `1'-6"`), la unidad
  // la puso el usuario y gana sobre cualquier sufijo o unidad del documento.
  const inputUnit = token.isInches ? 'in' : ((match[2] || documentUnit) as CadLengthUnit);
  if (!(inputUnit in UNIT_TO_MM)) return null;
  // Sin conversión de unidad — igual que el atajo de `convertCadLength` en
  // `units-imperial.ts` — para que un valor que no cambia de unidad no
  // arrastre el redondeo binario de multiplicar y volver a dividir por el
  // mismo factor (`6 * 25.4 / 25.4` no siempre da 6 exacto).
  if (inputUnit === documentUnit) return token.value;
  const millimeters = token.value * UNIT_TO_MM[inputUnit];
  const docMm = UNIT_TO_MM[documentUnit] ?? 1;
  return millimeters / docMm;
}

function rawOrDefault(
  values: CadDynamicInputValues,
  context: CadDynamicInputContext,
  field: keyof CadDynamicInputValues,
): string {
  const raw = values[field]?.trim();
  if (raw) return raw;
  const fallback = context.defaults?.[field];
  return fallback == null ? '' : String(fallback);
}

function lengthField(
  values: CadDynamicInputValues,
  context: CadDynamicInputContext,
  field: keyof CadDynamicInputValues,
): number | CadDynamicInputResult {
  const raw = rawOrDefault(values, context, field);
  const value = parseCadDynamicScalar(raw, context.documentUnit, context.locale, 'length');
  return value === null ? { ok: false, field, error: `Valor inválido para ${field}.` } : value;
}

export function resolveCadDynamicInput(
  values: CadDynamicInputValues,
  context: CadDynamicInputContext,
): CadDynamicInputResult {
  if (context.mode === 'absolute' || context.mode === 'relative') {
    const x = lengthField(values, context, 'x');
    if (typeof x !== 'number') return x;
    const y = lengthField(values, context, 'y');
    if (typeof y !== 'number') return y;
    if (context.mode === 'relative' && !context.anchor)
      return { ok: false, field: 'form', error: 'La coordenada relativa requiere un punto base.' };
    const point = context.mode === 'relative'
      ? { x: context.anchor!.x + x, y: context.anchor!.y + y }
      : { x, y };
    return { ok: true, mode: context.mode, point, previewLabel: `${context.mode === 'relative' ? '@' : ''}${x}, ${y}` };
  }
  if (context.mode === 'polar') {
    if (!context.anchor) return { ok: false, field: 'form', error: 'La entrada polar requiere un punto base.' };
    const distance = lengthField(values, context, 'distance');
    if (typeof distance !== 'number') return distance;
    const angleRaw = rawOrDefault(values, context, 'angle');
    const angle = parseCadDynamicScalar(angleRaw, context.documentUnit, context.locale, 'angle');
    if (angle === null) return { ok: false, field: 'angle', error: 'Ángulo inválido.' };
    return {
      ok: true,
      mode: 'polar',
      point: polarPoint(context.anchor, distance, angle),
      previewLabel: `@${distance}<${angle}°`,
    };
  }
  const field = context.mode;
  const scalar = lengthField(values, context, field);
  if (typeof scalar !== 'number') return scalar;
  const normalized = context.mode === 'diameter' ? Math.abs(scalar) / 2 : context.mode === 'radius' ? Math.abs(scalar) : scalar;
  if (normalized === 0) return { ok: false, field, error: `${field} no puede ser cero.` };
  return {
    ok: true,
    mode: context.mode,
    scalar: normalized,
    previewLabel: context.mode === 'diameter' ? `Ø ${Math.abs(scalar)}` : `${context.mode} ${normalized}`,
  };
}

export function defaultCadDynamicValues(anchor: Point | null, cursor: Point | null): Partial<Record<keyof CadDynamicInputValues, number>> {
  if (!cursor) return {};
  if (!anchor) return { x: cursor.x, y: cursor.y };
  return {
    x: cursor.x - anchor.x,
    y: cursor.y - anchor.y,
    distance: Math.hypot(cursor.x - anchor.x, cursor.y - anchor.y),
    angle: (Math.atan2(cursor.y - anchor.y, cursor.x - anchor.x) * 180) / Math.PI,
    radius: Math.hypot(cursor.x - anchor.x, cursor.y - anchor.y),
    diameter: Math.hypot(cursor.x - anchor.x, cursor.y - anchor.y) * 2,
  };
}
