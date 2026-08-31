import { polarPoint, type Point } from './precision-input';
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
  documentUnit: 'mm' | 'm';
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

function normalizedNumber(raw: string, locale: string): number | null {
  let value = raw.trim().replace(/\s+/g, '');
  const commaDecimal = locale.toLocaleLowerCase().startsWith('es') || locale.toLocaleLowerCase().startsWith('de');
  if (value.includes(',') && value.includes('.')) {
    value = commaDecimal ? value.replace(/\./g, '').replace(',', '.') : value.replace(/,/g, '');
  } else if (value.includes(',')) {
    value = value.replace(',', '.');
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseCadDynamicScalar(
  raw: string,
  documentUnit: 'mm' | 'm',
  locale = DEFAULT_REGION_PROFILE.numberLocale,
  kind: 'length' | 'angle' = 'length',
): number | null {
  const match = raw.trim().toLocaleLowerCase().match(/^(.+?)(mm|cm|m|in|ft|°|deg)?$/);
  if (!match) return null;
  const value = normalizedNumber(match[1], locale);
  if (value === null) return null;
  if (kind === 'angle') return match[2] && !['°', 'deg'].includes(match[2]) ? null : value;
  const inputUnit = (match[2] || documentUnit) as CadLengthUnit;
  if (!(inputUnit in UNIT_TO_MM)) return null;
  const millimeters = value * UNIT_TO_MM[inputUnit];
  return documentUnit === 'm' ? millimeters / 1_000 : millimeters;
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
