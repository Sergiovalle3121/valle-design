import { strict as assert } from "node:assert";
import {
  buildFlowReorderPreview,
  calculateTotalFlowDistance,
  detectBacktracking,
  detectFlowCrossings,
  scoreFlowLayout,
  suggestSimpleFlowReorder,
} from "./flow-optimization";

const nodes = [
  { id: "smt", x: 0, y: 0 },
  { id: "pack", x: 10, y: 10 },
  { id: "aoi", x: 10, y: 0 },
  { id: "inspect", x: 0, y: 10 },
];
assert.ok(calculateTotalFlowDistance(nodes) > 30, "total distance is summed");
assert.equal(detectFlowCrossings(nodes).length, 1, "detects crossing segments");
assert.equal(
  detectBacktracking(nodes).length,
  1,
  "detects x-axis backtracking",
);
assert.deepEqual(
  suggestSimpleFlowReorder(nodes).map((node) => node.id),
  ["smt", "inspect", "pack", "aoi"],
  "suggests x-order reorder",
);
assert.ok(
  scoreFlowLayout(nodes).suggestions.length >= 2,
  "score includes actionable suggestions",
);
const reorderPreview = buildFlowReorderPreview(nodes);
assert.ok(reorderPreview, "builds reorder preview");
assert.equal(reorderPreview?.axis, "x", "chooses the strongest flow axis");
assert.ok(
  (reorderPreview?.deltas.score ?? 0) > 0,
  "reorder preview improves the score",
);
assert.ok(
  (reorderPreview?.deltas.totalDistance ?? 0) > 0,
  "reorder preview reduces travel distance",
);
assert.deepEqual(
  reorderPreview?.moves.map((move) => move.id),
  ["smt", "pack", "aoi", "inspect"],
  "reorder preview keeps process sequence and assigns better physical slots",
);
assert.ok(
  scoreFlowLayout(nodes).reorderPreview?.improves,
  "score exposes actionable reorder preview",
);
console.log("cad flow optimization specs passed");
