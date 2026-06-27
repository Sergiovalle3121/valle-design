/** Pure CAD DXF import smoke tests. */
import { strict as assert } from "node:assert";
import { mapDxfEntityToPrimitive } from "./dxf-import";

assert.equal(
  mapDxfEntityToPrimitive({
    type: "LINE",
    layer: "WALLS",
    vertices: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
  }).primitive?.kind,
  "line",
  "LINE maps to line",
);
const rect = mapDxfEntityToPrimitive({
  type: "LWPOLYLINE",
  layer: "ROOM",
  closed: true,
  vertices: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 5 },
    { x: 0, y: 5 },
  ],
}).primitive;
assert.equal(rect?.kind, "rect", "closed axis-aligned polyline maps to rect");
assert.equal(rect?.points.length, 5, "closed rectangle is explicitly closed");
assert.equal(
  mapDxfEntityToPrimitive({
    type: "TEXT",
    layer: "NOTES",
    position: { x: 1, y: 2 },
    text: "Dock",
  }).primitive?.text,
  "Dock",
  "TEXT maps content",
);
assert.equal(
  mapDxfEntityToPrimitive({ type: "SPLINE", layer: "X" }).warning?.code,
  "unsupported_entity",
  "unsupported entities warn",
);
console.log("cad dxf import specs passed");
