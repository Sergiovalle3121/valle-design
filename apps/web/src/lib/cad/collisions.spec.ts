import { strict as assert } from "node:assert";
import {
  boxesOverlap,
  detectCadCollisions,
  edgeDistance,
  findClearanceIssues,
} from "./collisions";

const a = { id: "a", label: "AOI", x: 0, y: 0, width: 10, height: 10 };
const b = { id: "b", label: "Pack", x: 5, y: 0, width: 10, height: 10 };
const c = { id: "c", x: 30, y: 0, width: 5, height: 5 };
assert.equal(boxesOverlap(a, b)?.area, 50, "overlap area is computed");
assert.equal(detectCadCollisions([a, b, c]).length, 1, "detects one collision");
assert.equal(edgeDistance(a, c), 22.5, "edge distance is computed");
assert.equal(
  findClearanceIssues([a, c], 25).length,
  1,
  "clearance issue is detected",
);
console.log("cad collision specs passed");
