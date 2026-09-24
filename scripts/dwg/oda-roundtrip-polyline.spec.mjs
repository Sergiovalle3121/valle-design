import assert from "node:assert/strict";
import test from "node:test";
import { compareCase } from "./oda-roundtrip.mjs";

const polyline = {
  kind: "lwpolyline",
  closed: true,
  vertices: [
    { x: 0, y: 0 },
    { x: 8, y: 0 },
    { x: 8, y: 5 },
  ],
  bulges: [0, 0.5, 0],
  widths: [
    { start: 0.1, end: 0.2 },
    { start: 0.2, end: 0.3 },
    { start: 0.3, end: 0.4 },
  ],
  constantWidth: undefined,
};

const expected = {
  expectedLayers: [{ name: "0", color: 7 }],
  expectedEntities: [{ kind: "lwpolyline", layer: "0", entity: polyline }],
  expectedBlocks: {},
};

function dxf({ x = 8, bulge = 0.5, startWidth = 0.2 } = {}) {
  const pairs = [
    0, "SECTION", 2, "TABLES", 0, "TABLE", 2, "LAYER",
    0, "LAYER", 2, "0", 62, "7", 0, "ENDTAB", 0, "ENDSEC",
    0, "SECTION", 2, "ENTITIES", 0, "LWPOLYLINE", 8, "0",
    90, "3", 70, "1",
    10, "0", 20, "0", 40, "0.1", 41, "0.2", 42, "0",
    10, String(x), 20, "0", 40, String(startWidth), 41, "0.3", 42, String(bulge),
    10, "8", 20, "5", 40, "0.3", 41, "0.4", 42, "0",
    0, "ENDSEC", 0, "EOF",
  ];
  return `${pairs.join("\n")}\n`;
}

function blockDxf(x = 8) {
  const pairs = [
    0, "SECTION", 2, "BLOCKS", 0, "BLOCK", 2, "CAJETIN",
    0, "LWPOLYLINE", 8, "0", 90, "3", 70, "1",
    10, "0", 20, "0", 40, "0.1", 41, "0.2", 42, "0",
    10, String(x), 20, "0", 40, "0.2", 41, "0.3", 42, "0.5",
    10, "8", 20, "5", 40, "0.3", 41, "0.4", 42, "0",
    0, "ENDBLK", 0, "ENDSEC", 0, "EOF",
  ];
  return `${pairs.join("\n")}\n`;
}

test("the independent DXF comparison accepts the expected LWPOLYLINE", () => {
  assert.deepEqual(compareCase(expected, dxf()).mismatches, []);
});

test("a changed XY coordinate fails even when vertex count and closed flag match", () => {
  assert.match(compareCase(expected, dxf({ x: 9 })).mismatches.join("\n"), /vértice|vertex|coordenada/iu);
});

test("a changed bulge and vertex width fail the independent comparison", () => {
  assert.match(compareCase(expected, dxf({ bulge: 0.25 })).mismatches.join("\n"), /bulge|curvatura/iu);
  assert.match(compareCase(expected, dxf({ startWidth: 0.7 })).mismatches.join("\n"), /ancho|width/iu);
});

test("a deformed LWPOLYLINE inside a named block also fails", () => {
  const block = {
    expectedLayers: [],
    expectedEntities: [],
    expectedBlocks: { CAJETIN: [{ kind: "lwpolyline", entity: polyline }] },
  };
  assert.deepEqual(compareCase(block, blockDxf()).mismatches, []);
  assert.match(compareCase(block, blockDxf(9)).mismatches.join("\n"), /vértice/iu);
});

test("a changed constant width fails when that DXF group is present", () => {
  const constant = {
    expectedLayers: [{ name: "0", color: 7 }],
    expectedEntities: [{
      kind: "lwpolyline", layer: "0",
      entity: { ...polyline, widths: undefined, constantWidth: 0.5 },
    }],
    expectedBlocks: {},
  };
  const withConstant = dxf().replace("90\n3\n70\n1", "90\n3\n70\n1\n43\n0.5")
    .replaceAll("40\n0.1\n41\n0.2\n", "")
    .replaceAll("40\n0.2\n41\n0.3\n", "")
    .replaceAll("40\n0.3\n41\n0.4\n", "");
  assert.deepEqual(compareCase(constant, withConstant).mismatches, []);
  assert.match(compareCase(constant, withConstant.replace("43\n0.5", "43\n0.8")).mismatches.join("\n"), /ancho constante/iu);
});
