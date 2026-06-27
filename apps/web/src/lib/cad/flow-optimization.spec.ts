import { strict as assert } from "node:assert";
import {
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
console.log("cad flow optimization specs passed");
