/** Pure CAD object properties smoke tests. */
import { strict as assert } from "node:assert";
import {
  cadObjectSourceFromTags,
  cadSafetyClassificationFromTags,
  describeCadObjectProperties,
  parseCadObjectTags,
  summarizeCadSelectionProperties,
} from "./object-properties";

const tags = parseCadObjectTags("dxf, dxf-layer:LINE_A, editable-wall, safety");
assert.deepEqual(
  tags,
  ["dxf", "dxf-layer:LINE_A", "editable-wall", "safety"],
  "tags are trimmed and kept in order",
);
assert.deepEqual(
  cadObjectSourceFromTags(tags),
  { source: "dxf", dxfLayer: "LINE_A", editableImport: true },
  "DXF source metadata is derived from tags",
);
assert.equal(
  cadSafetyClassificationFromTags(["no_go", "controlled-area"]),
  "no-go",
  "safety classification normalizes underscores",
);
assert.equal(
  cadSafetyClassificationFromTags(["emergency", "exit", "keep-clear"]),
  "aisle",
  "emergency keep-clear routes surface as aisle safety classification",
);

const object = describeCadObjectProperties({
  id: "as-1",
  type: "asset",
  label: "Restricted area",
  x: 100,
  y: 200,
  width: 400,
  height: 300,
  rotation: 90,
  layerId: "safety",
  layerLabel: "Safety",
  layerVisible: true,
  layerLocked: true,
  tags: "restricted, safety",
});
assert.equal(object.area, 120000, "area is width times height");
assert.deepEqual(object.center, { x: 300, y: 350 }, "center is derived");
assert.equal(
  object.safetyClassification,
  "restricted",
  "restricted tags surface classification",
);
assert.equal(object.warnings.length, 1, "locked layer warning is reported");

const wall = describeCadObjectProperties({
  id: "wall-1",
  type: "asset",
  label: "North wall",
  kind: "wall",
  x: 0,
  y: 0,
  width: 6000,
  height: 150,
  rotation: 0,
  layerId: "architecture",
  layerLabel: "Architecture",
  layerVisible: true,
  layerLocked: false,
  tags: "wall",
});
assert.equal(wall.architecture?.role, "wall", "wall metadata is exposed");
assert.equal(wall.architecture?.length, 6000, "wall length is exposed");

const summary = summarizeCadSelectionProperties([
  object.object,
  {
    id: "st-1",
    type: "station",
    label: "SMT",
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    rotation: 0,
    layerId: "layout",
    layerLabel: "Layout",
    layerVisible: false,
    layerLocked: false,
    tags: "smt",
  },
]);
assert.equal(summary?.count, 2, "summary counts objects");
assert.equal(summary?.assetCount, 1, "summary counts assets");
assert.equal(summary?.stationCount, 1, "summary counts stations");
assert.equal(summary?.lockedCount, 1, "summary counts locked layers");
assert.equal(summary?.hiddenCount, 1, "summary counts hidden layers");
assert.deepEqual(
  summary?.bounds,
  { x: 0, y: 0, width: 500, height: 500 },
  "summary bounds wrap all objects",
);

console.log("cad object properties specs passed");
