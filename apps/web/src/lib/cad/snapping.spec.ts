/** Pure CAD snapping smoke tests. */
import { strict as assert } from "node:assert";
import {
  collectSnapAnchors,
  snapBoxPosition,
  snapScalarToGrid,
} from "./snapping";

assert.equal(snapScalarToGrid(149, 100), 100, "grid rounds down");
assert.equal(snapScalarToGrid(151, 100), 200, "grid rounds up");

const boxes = [
  { id: "a", x: 100, y: 100, w: 200, h: 100 },
  { id: "b", x: 600, y: 100, w: 200, h: 100 },
];
const anchors = collectSnapAnchors(boxes, [{ from: "a", to: "b" }], {
  gridSize: 100,
  gridEnabled: false,
  objectEnabled: true,
  centerEnabled: true,
  edgeEnabled: true,
  connectorEnabled: true,
  tolerance: 30,
});
assert.equal(
  anchors.some((a) => a.kind === "center"),
  true,
  "center anchors collected",
);
assert.equal(
  anchors.some((a) => a.kind === "edge"),
  true,
  "edge anchors collected",
);
assert.equal(
  anchors.some((a) => a.kind === "connector"),
  true,
  "connector anchors collected",
);

const snapped = snapBoxPosition({ x: 381, y: 100, w: 200, h: 100 }, anchors, {
  gridSize: 100,
  gridEnabled: false,
  objectEnabled: true,
  centerEnabled: true,
  edgeEnabled: true,
  connectorEnabled: true,
  tolerance: 25,
});
assert.equal(snapped.x, 400, "box right edge snaps to b left edge");
assert.equal(snapped.applied.includes("edge"), true, "edge snap reported");

console.log("cad snapping specs passed");
