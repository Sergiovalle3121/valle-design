/**
 * Plot-sheet model - pure, side-effect-free (Fase 65).
 *
 * A complete CAD has to issue drawings, not just edit them. This computes the
 * structured content of a printable layout sheet - title, subtitle, the title
 * block field rows and a formatted footprint - from the editor's state. The
 * actual PDF (image + title block) is drawn from this model by the exporter, so
 * the formatting/derivation can be unit-tested without jsPDF or a canvas.
 *
 * El número y la fecha que se imprimen salen del módulo de región
 * (`lib/cad/region`), no de un locale fijo: un `PlotInput` sin `region`
 * explícita sigue viendo exactamente el default de México — es lo que
 * garantiza que esta migración no cambie ni un plano ya emitido.
 */
import {
  DEFAULT_REGION_PROFILE,
  formatRegionDate,
  formatRegionNumber,
  type RegionProfile,
} from "@/lib/cad/region";

export interface PlotInput {
  /** Región de formato del cliente que emite. Default: México. */
  region?: RegionProfile;
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
  /** Generation timestamp. */
  date: Date | string | number;
  preparedBy?: string;
  /** Paper/export target shown in the title block, for example "A4 landscape". */
  sheetSize?: string;
  /** Package format shown in the title block, for example "PDF". */
  exportFormat?: string;
  /** Approval state from the layout release workflow. */
  approvalStatus?: string;
  /** Active CAD layer when the package was generated. */
  activeLayer?: string;
  /** Number of CAD layers in the drawing. */
  layerCount?: number;
  /** Number of visible CAD layers in the drawing. */
  visibleLayerCount?: number;
  /** Number of locked CAD layers in the drawing. */
  lockedLayerCount?: number;
  connectorCount?: number;
  dimensionCount?: number;
  labelCount?: number;
  /** Last validation severity, or "pending" when no validation has been run. */
  validationSeverity?: "ok" | "warning" | "critical" | "pending";
  /** Combined validation issue count included in the package metadata. */
  validationIssueCount?: number;
  /** Active DXF import warnings at package time. */
  dxfWarningCount?: number;
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
  /** Footprint formatted as "W x H m". */
  footprintLabel: string;
  /** Localised date string. */
  dateLabel: string;
}

/** Divisor that turns a length in `unit` into metres. */
function toMetreDivisor(unit: string): number {
  return unit === "mm" ? 1000 : unit === "cm" ? 100 : 1;
}

function metres(v: number, unit: string, region: RegionProfile, dp = 1): string {
  const d = toMetreDivisor(unit);
  const m = (Number.isFinite(v) ? v : 0) / d;
  return `${formatRegionNumber(m, region, { minimumFractionDigits: dp, maximumFractionDigits: dp })} m`;
}

function fmtDate(date: Date | string | number, region: RegionProfile): string {
  const d = date instanceof Date ? date : new Date(date);
  const valid = !Number.isNaN(d.getTime());
  const safe = valid ? d : new Date(0);
  return formatRegionDate(safe, region, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function cleanLabel(value: unknown, fallback = "---"): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function safeInt(value: unknown): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function severityLabel(
  severity: PlotInput["validationSeverity"],
  issues: number,
): string {
  if (!severity || severity === "pending") return "Pendiente";
  if (severity === "critical")
    return issues ? `Critica (${issues})` : "Critica";
  if (severity === "warning")
    return issues ? `Con avisos (${issues})` : "Con avisos";
  return issues ? `OK (${issues})` : "OK";
}

function layerSummary(
  layerCount: number,
  visibleLayerCount: number,
  lockedLayerCount: number,
): string {
  if (!layerCount) return "---";
  const visible = Math.min(layerCount, Math.max(0, visibleLayerCount));
  const locked = lockedLayerCount ? ` / ${lockedLayerCount} lock` : "";
  return `${visible}/${layerCount} visibles${locked}`;
}

/** Build the structured content for a printable layout sheet. Never throws. */
export function plotSheetModel(input: PlotInput): PlotSheet {
  const region = input?.region ?? DEFAULT_REGION_PROFILE;
  const model = cleanLabel(input?.model);
  const revision = cleanLabel(input?.revision);
  const unit = input?.unit || "mm";
  const util = Number.isFinite(input?.utilPct)
    ? Math.max(0, Math.min(100, input.utilPct))
    : 0;
  const placed = safeInt(input?.placedStations);
  const total = Math.max(placed, safeInt(input?.totalStations));
  const equip = safeInt(input?.equipmentCount);
  const layerCount = safeInt(input?.layerCount);
  const visibleLayerCount =
    input?.visibleLayerCount == null
      ? layerCount
      : safeInt(input?.visibleLayerCount);
  const lockedLayerCount = safeInt(input?.lockedLayerCount);
  const connectorCount = safeInt(input?.connectorCount);
  const dimensionCount = safeInt(input?.dimensionCount);
  const labelCount = safeInt(input?.labelCount);
  const validationIssueCount = safeInt(input?.validationIssueCount);
  const dxfWarningCount = safeInt(input?.dxfWarningCount);

  const footprintLabel = `${metres(input?.footprintW ?? 0, unit, region)} x ${metres(input?.footprintH ?? 0, unit, region)}`;
  const dateLabel = fmtDate(input?.date ?? Date.now(), region);
  const defaultSheetSize =
    region.paperSeries === "ANSI" ? "Letter landscape" : "A4 landscape";

  const fields: PlotField[] = [
    { label: "Modelo", value: model },
    { label: "Revision", value: revision },
    { label: "Huella", value: footprintLabel },
    /*
     * UN CAJETÍN NO IMPRIME UN RENGLÓN QUE NO DICE NADA.
     *
     * «Flujo total» se ha ido del todo: NADIE alimenta `flowLen` —no queda un
     * solo productor en el árbol— así que imprimía «---» en cada lámina
     * publicada, y un campo vacío en el cajetín es lo primero que nota un
     * arquitecto.
     *
     * Los tres contadores del planificador de plantas —estaciones, equipos y
     * conectores— sí pueden tener valor en un documento HEREDADO, así que no se
     * borran: se emiten sólo cuando tienen algo que contar. En un plano
     * dibujado con entidades nativas los tres son cero y el cajetín queda
     * limpio; en un documento viejo siguen diciendo lo que decían.
     */
    ...(total > 0
      ? [{ label: "Estaciones", value: `${placed}/${total}` }]
      : []),
    ...(equip > 0 ? [{ label: "Equipos", value: `${equip}` }] : []),
    { label: "Aprovechamiento", value: `${util.toFixed(1)} %` },
    ...(connectorCount > 0
      ? [{ label: "Conectores", value: `${connectorCount}` }]
      : []),
    {
      label: "Anotaciones",
      value: `${dimensionCount} cotas / ${labelCount} notas`,
    },
    {
      label: "Capas",
      value: layerSummary(layerCount, visibleLayerCount, lockedLayerCount),
    },
    { label: "Capa activa", value: cleanLabel(input?.activeLayer) },
    {
      label: "Validacion CAD",
      value: severityLabel(input?.validationSeverity, validationIssueCount),
    },
    { label: "Warnings DXF", value: `${dxfWarningCount}` },
    {
      label: "Paquete",
      value: `${cleanLabel(input?.exportFormat, "PDF")} / ${cleanLabel(input?.sheetSize, defaultSheetSize)}`,
    },
    { label: "Estado", value: cleanLabel(input?.approvalStatus, "Borrador") },
    { label: "Fecha", value: dateLabel },
    { label: "Preparo", value: cleanLabel(input?.preparedBy) },
  ];

  return {
    title: "Layout de planta",
    subtitle: `${model} - Rev ${revision}`,
    fields,
    footprintLabel,
    dateLabel,
  };
}
