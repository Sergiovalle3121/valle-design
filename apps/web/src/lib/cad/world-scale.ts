/**
 * Factory-scale world sizing for the CAD plant editor.
 *
 * A layout's footprint is stored in the layout's own unit (typically `mm`).
 * These pure helpers let the editor reason in real metres regardless of that
 * unit, offer one-click factory-scale presets (a single workcell up to a full
 * nave), keep the footprint inside safe bounds, and pick a readable grid step
 * for any plant span. No DOM, no React — directly unit-testable.
 *
 * This is the backbone of EPIC 0: the editor used to top out at a tiny box;
 * a plant editor needs to model a 200×150 m nave without feeling cramped.
 */

export type WorldUnit = 'mm' | 'cm' | 'm';

// Millimetres per one world unit — the footprint lives in `unit`.
const MM_PER_UNIT: Record<WorldUnit, number> = { mm: 1, cm: 10, m: 1000 };

/** Real metres → a count expressed in the given footprint unit. */
export function metersToUnit(meters: number, unit: WorldUnit): number {
  const mmPer = MM_PER_UNIT[unit] ?? 1;
  return (meters * 1000) / mmPer;
}

/** A count expressed in the footprint unit → real metres. */
export function unitToMeters(value: number, unit: WorldUnit): number {
  const mmPer = MM_PER_UNIT[unit] ?? 1;
  return (value * mmPer) / 1000;
}

// Factory-scale bounds, in metres. A plant editor that tops out at a few metres
// is exactly the "the box is tiny" pain; these open it up to a full nave.
export const MIN_WORLD_M = 4; // a single, tight workcell
export const MAX_WORLD_M = 2000; // up to a 2 km campus per side — room for the largest plants/logistics parks
export const MIN_GRID_M = 0.1; // 100 mm — finest practical grid
export const MAX_GRID_M = 50; // coarse grid for a mega plant

/** Clamp a span in metres into the supported plant range. */
export function clampMeters(m: number): number {
  if (!Number.isFinite(m)) return MIN_WORLD_M;
  return Math.min(MAX_WORLD_M, Math.max(MIN_WORLD_M, m));
}

/** Clamp a grid step in metres into the supported range. */
export function clampGridMeters(m: number): number {
  if (!Number.isFinite(m) || m <= 0) return MIN_GRID_M;
  return Math.min(MAX_GRID_M, Math.max(MIN_GRID_M, m));
}

/**
 * Clamp a footprint expressed in its own unit (e.g. mm) to the plant bounds,
 * returning whole units. Used by the footprint editor so a typo can never blow
 * the world out to a kilometre or collapse it to nothing.
 */
export function clampFootprintUnit(value: number, unit: WorldUnit): number {
  const meters = clampMeters(unitToMeters(value, unit));
  return Math.round(metersToUnit(meters, unit));
}

export function clampGridUnit(value: number, unit: WorldUnit): number {
  const meters = clampGridMeters(unitToMeters(value, unit));
  return Math.round(metersToUnit(meters, unit));
}

export interface FactoryPreset {
  id: string;
  label: string;
  hint: string;
  /** Plant width, in metres. */
  widthM: number;
  /** Plant depth/length, in metres. */
  heightM: number;
  /** Default grid step, in metres. */
  gridM: number;
}

/**
 * Factory-scale presets, smallest → largest. The labels are Spanish to match
 * the rest of the CAD UI. Each is already inside [MIN_WORLD_M, MAX_WORLD_M].
 */
export const FACTORY_PRESETS: FactoryPreset[] = [
  { id: 'cell', label: 'Celda', hint: '10 × 8 m · rejilla 0.5 m', widthM: 10, heightM: 8, gridM: 0.5 },
  { id: 'bay', label: 'Bahía de línea', hint: '40 × 20 m · rejilla 1 m', widthM: 40, heightM: 20, gridM: 1 },
  { id: 'nave-m', label: 'Nave mediana', hint: '80 × 50 m · rejilla 2 m', widthM: 80, heightM: 50, gridM: 2 },
  { id: 'nave-l', label: 'Nave grande', hint: '150 × 100 m · rejilla 5 m', widthM: 150, heightM: 100, gridM: 5 },
  { id: 'plant', label: 'Planta completa', hint: '300 × 200 m · rejilla 10 m', widthM: 300, heightM: 200, gridM: 10 },
  { id: 'mega', label: 'Mega planta', hint: '500 × 300 m · rejilla 10 m', widthM: 500, heightM: 300, gridM: 10 },
  { id: 'complex', label: 'Complejo', hint: '800 × 500 m · rejilla 20 m', widthM: 800, heightM: 500, gridM: 20 },
  { id: 'campus', label: 'Campus / parque', hint: '1500 × 900 m · rejilla 25 m', widthM: 1500, heightM: 900, gridM: 25 },
  { id: 'macro', label: 'Macroplanta', hint: '2000 × 1200 m · rejilla 50 m', widthM: 2000, heightM: 1200, gridM: 50 },
];

/** A preset translated into the editor's footprint unit (whole units). */
export interface FootprintInUnit { width: number; height: number; grid: number }

export function presetToUnit(preset: FactoryPreset, unit: WorldUnit): FootprintInUnit {
  return {
    width: clampFootprintUnit(metersToUnit(preset.widthM, unit), unit),
    height: clampFootprintUnit(metersToUnit(preset.heightM, unit), unit),
    grid: clampGridUnit(metersToUnit(preset.gridM, unit), unit),
  };
}

// "Nice" grid steps in metres — the rungs an architect would actually draw.
const NICE_GRID_STEPS_M = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 25, 50];

/**
 * Pick a readable grid step (in metres) for a plant span, aiming for roughly
 * `targetDivisions` grid lines across the largest side. Adapts as the world
 * grows so a 300 m plant doesn't draw thousands of 1 m lines.
 */
export function adaptiveGridStepM(spanM: number, targetDivisions = 24): number {
  const span = clampMeters(spanM);
  const ideal = span / Math.max(2, targetDivisions);
  // Smallest nice step that is at least the ideal — keeps the line count under
  // the target rather than over it.
  for (const step of NICE_GRID_STEPS_M) {
    if (step >= ideal) return step;
  }
  return NICE_GRID_STEPS_M[NICE_GRID_STEPS_M.length - 1];
}

/**
 * Round a raw metre length down to a "nice" 1/2/5 × 10ⁿ value — the standard
 * map/CAD scale-bar convention (so a bar reads "50 m", never "47.3 m").
 */
export function niceScaleBarMeters(rawMeters: number): number {
  if (!Number.isFinite(rawMeters) || rawMeters <= 0) return MIN_GRID_M;
  const pow = Math.pow(10, Math.floor(Math.log10(rawMeters)));
  const n = rawMeters / pow; // 1 … <10
  const nice = n >= 5 ? 5 : n >= 2 ? 2 : 1;
  return nice * pow;
}

/** Format a metre value for rulers/labels: `1.5 m`, `0.25 m`, `200 m`. */
export function formatMeters(m: number): string {
  if (!Number.isFinite(m)) return '0 m';
  const rounded = Math.round(m * 100) / 100;
  return `${rounded.toLocaleString('es-MX')} m`;
}
