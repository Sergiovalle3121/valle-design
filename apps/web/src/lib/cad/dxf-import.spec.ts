/** Pure CAD DXF import smoke tests. */
import { strict as assert } from "node:assert";
import { mapDxfEntityToPrimitive, summarizeDxfImportWarnings } from "./dxf-import";

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
// El cierre se DECLARA (bit 1 del grupo 70). Antes se afirmaba `points.length
// === 5`, es decir el canal lateral: repetir el primer vértice al final. Eso
// arrastraba un segmento nulo hasta el documento canónico y no distinguía un
// contorno cerrado de una polilínea abierta de extremos coincidentes.
assert.equal(rect?.closed, true, "closed rectangle carries the explicit flag");
assert.equal(
  rect?.points.length,
  4,
  "four unique corners: closure is the flag, not a repeated point",
);
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
// SPLINE ya es nativa (CAD-NEXT-061): puntos de control + grado + nudos.
const spline = mapDxfEntityToPrimitive({
  type: "SPLINE",
  layer: "CURVES",
  degree: 3,
  controlPoints: [
    { x: 0, y: 0 },
    { x: 10, y: 20 },
    { x: 30, y: 20 },
    { x: 40, y: 0 },
  ],
  knotValues: [0, 0, 0, 0, 1, 1, 1, 1],
}).primitive;
assert.equal(spline?.kind, "spline", "SPLINE maps to spline");
assert.equal(spline?.points.length, 4, "conserva los 4 puntos de control");
assert.equal(spline?.degree, 3, "conserva el grado");
assert.equal(spline?.knots?.length, 8, "conserva el vector de nudos");
assert.equal(
  mapDxfEntityToPrimitive({ type: "SPLINE", layer: "X" }).warning?.code,
  "invalid_spline",
  "SPLINE sin puntos de control avisa como inválida",
);
assert.equal(
  mapDxfEntityToPrimitive({ type: "3DSOLID", layer: "X" }).warning?.code,
  "unsupported_entity",
  "unsupported entities warn",
);

const grouped = summarizeDxfImportWarnings([
  {
    code: "unsupported_entity",
    message: "No soportado",
    entityType: "ARC",
    layer: "A",
  },
  {
    code: "unsupported_entity",
    message: "No soportado",
    entityType: "ARC",
    layer: "A",
  },
  {
    code: "invalid_text",
    message: "Texto inválido",
    entityType: "TEXT",
    layer: "NOTES",
  },
]);
assert.equal(grouped[0].count, 2, "groups repeated warnings");
assert.equal(grouped[0].entityType, "ARC", "keeps warning entity type");
console.log("cad dxf import specs passed");
