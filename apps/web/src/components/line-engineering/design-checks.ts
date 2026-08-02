/**
 * Layout design checks — pure, side-effect-free validation (Fase 63).
 *
 * A complete CAD doesn't just draw — it tells you whether the drawing is sound.
 * This runs the everyday "¿está bien el layout?" review over the editor's own
 * geometry and flags what a line engineer would: stations still in the tray,
 * objects spilling outside the footprint, objects overlapping, and placed
 * stations left out of the material-flow chain. Each finding is a graded item
 * (ok / warn / error) with a human detail, so the panel reads like a checklist.
 *
 * Geometry is checked on the axis-aligned box (rotation ignored) — good enough
 * to surface problems for review. Kept pure (no three/DOM) for unit testing.
 */

export interface CheckBox {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DesignCheckInput {
  /** Placed station boxes. */
  stations: CheckBox[];
  /** Equipment boxes (zones/paths can be excluded by the caller). */
  assets: CheckBox[];
  /** How many stations are still unplaced (in the tray). */
  unplacedStations: number;
  footprintW: number;
  footprintH: number;
  /** Flow connectors between station ids. */
  connectors: { from: string; to: string }[];
}

export type CheckLevel = 'ok' | 'warn' | 'error';

export interface CheckItem {
  key: string;
  level: CheckLevel;
  label: string;
  detail: string;
  /** How many objects/items the finding concerns (0 when all clear). */
  count: number;
}

export interface DesignReport {
  items: CheckItem[];
  errors: number;
  warnings: number;
  /** Worst level across all items — the headline verdict. */
  score: CheckLevel;
}

const fin = (n: number, d = 0): number => (Number.isFinite(n) ? n : d);

/** Positive-area overlap of two axis-aligned boxes (touching edges don't count). */
function overlaps(a: CheckBox, b: CheckBox, eps: number): boolean {
  return (
    a.x + a.w - eps > b.x &&
    b.x + b.w - eps > a.x &&
    a.y + a.h - eps > b.y &&
    b.y + b.h - eps > a.y
  );
}

const OVERLAP_CAP = 400; // skip the O(n²) scan above this many objects (perf guardrail)

/** Run the layout checks and return a graded report. Never throws. */
export function designChecks(input: DesignCheckInput): DesignReport {
  const W = Math.max(0, fin(input?.footprintW));
  const H = Math.max(0, fin(input?.footprintH));
  const clean = (arr: CheckBox[] | undefined): CheckBox[] =>
    (Array.isArray(arr) ? arr : [])
      .filter((b) => b && typeof b.id === 'string')
      .map((b) => ({ id: b.id, label: typeof b.label === 'string' ? b.label : b.id, x: fin(b.x), y: fin(b.y), w: Math.max(0, fin(b.w)), h: Math.max(0, fin(b.h)) }));
  const stations = clean(input?.stations);
  const assets = clean(input?.assets);
  const all = [...stations, ...assets];
  const eps = Math.max(1, Math.max(W, H) * 0.0005);
  const items: CheckItem[] = [];

  // 1) Unplaced stations.
  const unplaced = Math.max(0, Math.floor(fin(input?.unplacedStations)));
  items.push(
    unplaced > 0
      ? { key: 'unplaced', level: 'warn', label: 'Estaciones sin colocar', detail: `${unplaced} estación(es) siguen en la bandeja, fuera del plano.`, count: unplaced }
      : { key: 'unplaced', level: 'ok', label: 'Estaciones colocadas', detail: 'Todas las estaciones están en el plano.', count: 0 },
  );

  // 2) Out of footprint bounds.
  const outside = W > 0 && H > 0
    ? all.filter((b) => b.x < -eps || b.y < -eps || b.x + b.w > W + eps || b.y + b.h > H + eps)
    : [];
  items.push(
    outside.length > 0
      ? { key: 'bounds', level: 'error', label: 'Objetos fuera de la huella', detail: `${outside.length} objeto(s) se salen del plano: ${outside.slice(0, 3).map((b) => b.label).join(', ')}${outside.length > 3 ? '…' : ''}.`, count: outside.length }
      : { key: 'bounds', level: 'ok', label: 'Dentro de la huella', detail: 'Todos los objetos caben en el plano.', count: 0 },
  );

  // 3) Overlaps (axis-aligned, capped for performance).
  let overlapCount = 0;
  const overlapLabels: string[] = [];
  if (all.length <= OVERLAP_CAP) {
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        if (overlaps(all[i], all[j], eps)) {
          overlapCount++;
          if (overlapLabels.length < 3) overlapLabels.push(`${all[i].label}↔${all[j].label}`);
        }
      }
    }
  }
  items.push(
    overlapCount > 0
      ? { key: 'overlap', level: 'warn', label: 'Posibles traslapes', detail: `${overlapCount} par(es) se traslapan: ${overlapLabels.join(', ')}${overlapCount > 3 ? '…' : ''}.`, count: overlapCount }
      : { key: 'overlap', level: 'ok', label: 'Sin traslapes', detail: 'Ningún objeto se encima con otro.', count: 0 },
  );

  // 4) Placed stations left out of the flow chain (only meaningful with ≥2).
  if (stations.length >= 2) {
    const linked = new Set<string>();
    for (const c of Array.isArray(input?.connectors) ? input.connectors : []) {
      if (c && typeof c.from === 'string') linked.add(c.from);
      if (c && typeof c.to === 'string') linked.add(c.to);
    }
    const loose = stations.filter((s) => !linked.has(s.id));
    items.push(
      loose.length > 0
        ? { key: 'flow', level: 'warn', label: 'Estaciones sin conectar', detail: `${loose.length} estación(es) no están en el flujo: ${loose.slice(0, 3).map((b) => b.label).join(', ')}${loose.length > 3 ? '…' : ''}.`, count: loose.length }
        : { key: 'flow', level: 'ok', label: 'Flujo completo', detail: 'Cada estación está conectada al flujo de la línea.', count: 0 },
    );
  }

  const errors = items.filter((i) => i.level === 'error').length;
  const warnings = items.filter((i) => i.level === 'warn').length;
  const score: CheckLevel = errors > 0 ? 'error' : warnings > 0 ? 'warn' : 'ok';
  return { items, errors, warnings, score };
}
