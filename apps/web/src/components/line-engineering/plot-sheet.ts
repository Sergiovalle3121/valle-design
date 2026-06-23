/**
 * Plot-sheet model — pure, side-effect-free (Fase 65).
 *
 * A complete CAD has to ISSUE drawings, not just edit them. This computes the
 * structured content of a printable layout sheet — title, subtitle, the title
 * block field rows and a formatted footprint — from the editor's state. The
 * actual PDF (image + title block) is drawn from this model by the exporter, so
 * the formatting/derivation can be unit-tested without jsPDF or a canvas.
 */

export interface PlotInput {
  model: string;
  revision: string;
  /** Working unit of the layout ('mm' | 'cm' | 'm'). */
  unit: string;
  footprintW: number;
  footprintH: number;
  placedStations: number;
  totalStations: number;
  equipmentCount: number;
  /** Floor utilisation, 0..100. */
  utilPct: number;
  /** Total material-flow travel distance, in footprint units (0 = none). */
  flowLen: number;
  /** Generation timestamp. */
  date: Date | string | number;
  preparedBy?: string;
}

export interface PlotField {
  label: string;
  value: string;
}

export interface PlotSheet {
  title: string;
  subtitle: string;
  /** Title-block rows, in print order. */
  fields: PlotField[];
  /** Footprint formatted as "W × H m". */
  footprintLabel: string;
  /** Localised date string. */
  dateLabel: string;
}

/** Divisor that turns a length in `unit` into metres. */
function toMetreDivisor(unit: string): number {
  return unit === 'mm' ? 1000 : unit === 'cm' ? 100 : 1;
}

function metres(v: number, unit: string, dp = 1): string {
  const d = toMetreDivisor(unit);
  const m = (Number.isFinite(v) ? v : 0) / d;
  return `${m.toLocaleString('es-MX', { minimumFractionDigits: dp, maximumFractionDigits: dp })} m`;
}

function fmtDate(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  const valid = !Number.isNaN(d.getTime());
  const safe = valid ? d : new Date(0);
  return safe.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Build the structured content for a printable layout sheet. Never throws. */
export function plotSheetModel(input: PlotInput): PlotSheet {
  const model = String(input?.model ?? '').trim() || '—';
  const revision = String(input?.revision ?? '').trim() || '—';
  const unit = input?.unit || 'mm';
  const util = Number.isFinite(input?.utilPct) ? Math.max(0, Math.min(100, input.utilPct)) : 0;
  const placed = Math.max(0, Math.floor(Number(input?.placedStations) || 0));
  const total = Math.max(placed, Math.floor(Number(input?.totalStations) || 0));
  const equip = Math.max(0, Math.floor(Number(input?.equipmentCount) || 0));
  const flow = Number(input?.flowLen) || 0;

  const footprintLabel = `${metres(input?.footprintW ?? 0, unit)} × ${metres(input?.footprintH ?? 0, unit)}`;
  const dateLabel = fmtDate(input?.date ?? Date.now());

  const fields: PlotField[] = [
    { label: 'Modelo', value: model },
    { label: 'Revisión', value: revision },
    { label: 'Huella', value: footprintLabel },
    { label: 'Estaciones', value: `${placed}/${total}` },
    { label: 'Equipos', value: `${equip}` },
    { label: 'Aprovechamiento', value: `${util.toFixed(1)} %` },
    { label: 'Flujo total', value: flow > 0 ? metres(flow, unit) : '—' },
    { label: 'Fecha', value: dateLabel },
    { label: 'Preparó', value: String(input?.preparedBy ?? '').trim() || '—' },
  ];

  return {
    title: 'Layout de planta',
    subtitle: `${model} · Rev ${revision}`,
    fields,
    footprintLabel,
    dateLabel,
  };
}
