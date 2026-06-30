import { strict as assert } from "node:assert";
import { evaluateCadDxfExportReadiness } from "./dxf-export-readiness";

const baseEntities = [
  {
    id: "station-1",
    kind: "object" as const,
    layer: "Layout",
    selected: true,
    visible: true,
  },
  {
    id: "rack-1",
    kind: "object" as const,
    layer: "Equipment",
    selected: false,
    visible: false,
  },
  {
    id: "flow-1",
    kind: "connector" as const,
    layer: "Flow",
    selected: true,
    visible: true,
  },
  {
    id: "dim-1",
    kind: "measurement" as const,
    layer: "Measurements",
    selected: true,
    visible: true,
  },
  {
    id: "note-1",
    kind: "label" as const,
    layer: "Text",
    selected: true,
    visible: true,
  },
];

const all = evaluateCadDxfExportReadiness({
  scope: "all",
  includeHidden: false,
  includeMeasurements: true,
  includeLabels: true,
  selectedObjectCount: 1,
  entities: baseEntities,
  dxfImportWarnings: 2,
});

assert.equal(all.canExport, true, "visible entities can export");
assert.equal(all.counts.object, 1, "excludes hidden objects when requested");
assert.equal(all.counts.connector, 1, "counts visible flow connectors");
assert.equal(all.counts.measurement, 1, "counts measurements");
assert.equal(all.counts.label, 1, "counts labels");
assert.ok(all.includedLayers.includes("Layout"), "tracks included layers");
assert.equal(
  all.layerSummary.find((layer) => layer.layer === "Equipment")?.hidden,
  1,
  "summarizes hidden layer exclusions",
);
assert.ok(
  all.issues.some((issue) => issue.code === "hidden_layers_excluded"),
  "warns about hidden layers",
);
assert.ok(
  all.issues.some((issue) => issue.code === "dxf_import_warnings_active"),
  "warns about active DXF import warnings",
);

const selected = evaluateCadDxfExportReadiness({
  scope: "selection",
  includeHidden: true,
  includeMeasurements: false,
  includeLabels: false,
  selectedObjectCount: 1,
  entities: baseEntities,
});

assert.equal(selected.counts.object, 1, "selection scope filters objects");
assert.equal(selected.counts.measurement, 0, "measurement toggle is honored");
assert.equal(selected.counts.label, 0, "label toggle is honored");
assert.ok(
  selected.issues.some((issue) => issue.code === "measurements_omitted"),
  "explains omitted measurements",
);

const emptySelection = evaluateCadDxfExportReadiness({
  scope: "selection",
  includeHidden: true,
  includeMeasurements: true,
  includeLabels: true,
  selectedObjectCount: 0,
  entities: baseEntities.map((entity) => ({ ...entity, selected: false })),
});

assert.equal(emptySelection.canExport, false, "empty selection blocks export");
assert.ok(
  emptySelection.issues.some((issue) => issue.code === "empty_selection"),
  "reports empty selection blocker",
);

const criticalLabels = evaluateCadDxfExportReadiness({
  scope: "all",
  includeHidden: false,
  includeMeasurements: true,
  includeLabels: true,
  selectedObjectCount: 1,
  entities: [
    {
      id: "rack-missing",
      kind: "object" as const,
      layer: "Equipment",
      requiresLabel: true,
      selected: true,
      visible: true,
    },
    {
      id: "aoi-labeled",
      kind: "object" as const,
      layer: "Equipment",
      label: "AOI 1",
      requiresLabel: true,
      selected: true,
      visible: true,
    },
    {
      id: "hidden-path",
      kind: "object" as const,
      layer: "Aisles",
      requiresLabel: true,
      selected: true,
      visible: false,
    },
  ],
});

assert.equal(
  criticalLabels.canExport,
  true,
  "missing critical labels warn but do not block export",
);
assert.equal(
  criticalLabels.issues.find((issue) => issue.code === "critical_labels_missing")
    ?.count,
  1,
  "warns only for included unlabeled critical footprints",
);

const selectedCriticalLabels = evaluateCadDxfExportReadiness({
  scope: "selection",
  includeHidden: true,
  includeMeasurements: true,
  includeLabels: true,
  selectedObjectCount: 1,
  entities: [
    {
      id: "rack-unselected",
      kind: "object" as const,
      layer: "Equipment",
      requiresLabel: true,
      selected: false,
      visible: true,
    },
    {
      id: "zone-selected",
      kind: "object" as const,
      layer: "Safety",
      requiresLabel: true,
      selected: true,
      visible: true,
    },
  ],
});

assert.equal(
  selectedCriticalLabels.issues.find(
    (issue) => issue.code === "critical_labels_missing",
  )?.count,
  1,
  "selection scope only warns for selected unlabeled footprints",
);

console.log("cad dxf export readiness specs passed");
