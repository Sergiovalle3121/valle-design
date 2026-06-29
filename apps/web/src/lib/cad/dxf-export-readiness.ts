export type CadDxfExportScope = "all" | "selection";
export type CadDxfExportEntityKind =
  | "object"
  | "connector"
  | "measurement"
  | "label";
export type CadDxfExportReadinessLevel = "blocker" | "warning" | "info";

export interface CadDxfExportReadinessEntity {
  id: string;
  kind: CadDxfExportEntityKind;
  layer: string;
  selected?: boolean;
  visible?: boolean;
}

export interface CadDxfExportReadinessIssue {
  code: string;
  level: CadDxfExportReadinessLevel;
  message: string;
  count?: number;
}

export interface CadDxfExportLayerSummary {
  layer: string;
  total: number;
  included: number;
  hidden: number;
}

export interface CadDxfExportReadinessInput {
  scope: CadDxfExportScope;
  includeHidden: boolean;
  includeMeasurements: boolean;
  includeLabels: boolean;
  selectedObjectCount: number;
  entities: CadDxfExportReadinessEntity[];
  validationBlockers?: number;
  validationWarnings?: number;
  dxfImportWarnings?: number;
  selectionKeepsAnnotations?: boolean;
}

export interface CadDxfExportReadiness {
  canExport: boolean;
  counts: Record<CadDxfExportEntityKind, number>;
  totalEntities: number;
  includedLayers: string[];
  layerSummary: CadDxfExportLayerSummary[];
  issues: CadDxfExportReadinessIssue[];
}

const EMPTY_COUNTS: Record<CadDxfExportEntityKind, number> = {
  object: 0,
  connector: 0,
  measurement: 0,
  label: 0,
};

function scopeAndToggleAllow(
  entity: CadDxfExportReadinessEntity,
  input: CadDxfExportReadinessInput,
) {
  if (entity.kind === "measurement" && !input.includeMeasurements)
    return false;
  if (entity.kind === "label" && !input.includeLabels) return false;
  if (input.scope === "selection" && !entity.selected) return false;
  return true;
}

function optionAllows(
  entity: CadDxfExportReadinessEntity,
  input: CadDxfExportReadinessInput,
) {
  if (!scopeAndToggleAllow(entity, input)) return false;
  if (!input.includeHidden && entity.visible === false) return false;
  return true;
}

export function evaluateCadDxfExportReadiness(
  input: CadDxfExportReadinessInput,
): CadDxfExportReadiness {
  const counts = { ...EMPTY_COUNTS };
  const layers = new Map<string, CadDxfExportLayerSummary>();
  const issues: CadDxfExportReadinessIssue[] = [];
  const includedLayers = new Set<string>();

  for (const entity of input.entities) {
    const layerName = entity.layer.trim() || "0";
    const summary =
      layers.get(layerName) ??
      { layer: layerName, total: 0, included: 0, hidden: 0 };
    summary.total += 1;

    const hiddenByOption =
      scopeAndToggleAllow(entity, input) &&
      !input.includeHidden &&
      entity.visible === false;
    if (hiddenByOption) summary.hidden += 1;

    if (optionAllows(entity, input)) {
      counts[entity.kind] += 1;
      summary.included += 1;
      includedLayers.add(layerName);
    }
    layers.set(layerName, summary);
  }

  const totalEntities = Object.values(counts).reduce(
    (sum, count) => sum + count,
    0,
  );
  const hiddenCount = [...layers.values()].reduce(
    (sum, layer) => sum + layer.hidden,
    0,
  );
  const availableMeasurements = input.entities.filter(
    (entity) => entity.kind === "measurement",
  ).length;
  const availableLabels = input.entities.filter(
    (entity) => entity.kind === "label",
  ).length;

  if (input.scope === "selection" && input.selectedObjectCount === 0)
    issues.push({
      code: "empty_selection",
      level: "blocker",
      message: "La exportacion por seleccion necesita al menos un objeto seleccionado.",
    });
  if (totalEntities === 0)
    issues.push({
      code: "empty_export",
      level: "blocker",
      message: "No hay entidades DXF exportables con las opciones actuales.",
    });
  if (hiddenCount > 0)
    issues.push({
      code: "hidden_layers_excluded",
      level: "warning",
      message: "Las capas ocultas quedan fuera de este paquete DXF.",
      count: hiddenCount,
    });
  if ((input.validationBlockers ?? 0) > 0)
    issues.push({
      code: "layout_blockers_active",
      level: "warning",
      message: "Hay bloqueos de validacion activos; revisa la geometria exportada.",
      count: input.validationBlockers,
    });
  if ((input.validationWarnings ?? 0) > 0)
    issues.push({
      code: "layout_warnings_active",
      level: "info",
      message: "Hay avisos de validacion activos en este layout.",
      count: input.validationWarnings,
    });
  if ((input.dxfImportWarnings ?? 0) > 0)
    issues.push({
      code: "dxf_import_warnings_active",
      level: "warning",
      message: "El ultimo DXF importado aun tiene advertencias.",
      count: input.dxfImportWarnings,
    });
  if (!input.includeMeasurements && availableMeasurements > 0)
    issues.push({
      code: "measurements_omitted",
      level: "info",
      message: "Las cotas guardadas quedan omitidas por la opcion actual.",
      count: availableMeasurements,
    });
  if (!input.includeLabels && availableLabels > 0)
    issues.push({
      code: "labels_omitted",
      level: "info",
      message: "Las notas guardadas quedan omitidas por la opcion actual.",
      count: availableLabels,
    });
  if (
    input.scope === "selection" &&
    input.selectionKeepsAnnotations &&
    (counts.measurement > 0 || counts.label > 0)
  )
    issues.push({
      code: "annotations_export_globally",
      level: "info",
      message: "La seleccion filtra objetos y flujo; las anotaciones siguen globales.",
      count: counts.measurement + counts.label,
    });

  return {
    canExport: !issues.some((issue) => issue.level === "blocker"),
    counts,
    totalEntities,
    includedLayers: [...includedLayers].sort((a, b) => a.localeCompare(b)),
    layerSummary: [...layers.values()].sort((a, b) =>
      a.layer.localeCompare(b.layer),
    ),
    issues,
  };
}
