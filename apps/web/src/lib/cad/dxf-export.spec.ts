/** Pure CAD DXF export smoke tests. */
import { strict as assert } from "node:assert";
import { exportCadDxf } from "./dxf-export";

const result = exportCadDxf(
  {
    layers: [{ name: "Equipment", color: 3 }],
    primitives: [
      {
        kind: "line",
        layer: "Flow",
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
      },
      {
        kind: "rect",
        layer: "Equipment",
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 5 },
        ],
        text: "Station 1",
      },
      { kind: "text", layer: "Labels", points: [{ x: 2, y: 3 }], text: "AOI" },
    ],
    measurements: [
      { from: { x: 0, y: 0 }, to: { x: 0, y: 12 }, label: "12 mm" },
    ],
  },
  { units: "mm", fileComment: "Valle Design CAD export" },
);

assert.ok(result.content.includes("SECTION\n2\nHEADER"), "writes DXF header");
assert.ok(result.content.includes("0\nTABLE\n2\nLAYER"), "writes layer table");
assert.ok(result.content.includes("0\nLINE"), "exports lines");
assert.ok(
  result.content.includes("0\nPOLYLINE"),
  "exports rectangles as closed polylines",
);
assert.ok(result.content.includes("1\nStation 1"), "exports primitive labels");
assert.ok(result.content.includes("1\nAOI"), "exports text labels");
// Cotas nativas (CAD-NEXT-066): DIMENSION + bloque anónimo *D con la geometría.
assert.ok(result.content.includes("0\nDIMENSION"), "exports native DIMENSION");
assert.ok(result.content.includes("2\n*D1"), "DIMENSION references its *D block");
assert.ok(
  result.content.includes("0\nBLOCK") && result.content.includes("0\nENDBLK"),
  "measurement geometry lives in a BLOCKS section",
);
assert.ok(result.content.includes("1\n12 mm"), "exports measurement labels");
assert.ok(result.content.includes("42\n12"), "DIMENSION carries the real measurement");
assert.ok(result.layers.includes("Equipment"), "tracks explicit layers");
assert.ok(
  result.layers.includes("Measurements"),
  "tracks implicit measurement layer",
);
assert.equal(result.entityCount, 5, "counts exported entities");
assert.ok(result.content.endsWith("0\nEOF\n"), "terminates DXF");

// Geometría curva real (VD-CAD-DEPTH-A1): círculo y arco nativos.
const curved = exportCadDxf({
  primitives: [
    { kind: "circle", layer: "Holes", points: [{ x: 100, y: 50 }], radius: 12 },
    {
      kind: "arc",
      layer: "Fillets",
      points: [{ x: 0, y: 0 }],
      radius: 20,
      startAngle: 0,
      endAngle: 90,
    },
  ],
});
assert.ok(curved.content.includes("0\nCIRCLE"), "exports native CIRCLE");
assert.ok(curved.content.includes("0\nARC"), "exports native ARC");
assert.ok(curved.content.includes("40\n12"), "CIRCLE carries radius via code 40");
assert.ok(
  curved.content.includes("50\n0") && curved.content.includes("51\n90"),
  "ARC carries start/end angles via codes 50/51",
);
assert.equal(curved.entityCount, 2, "curved geometry counts two entities");

console.log("cad dxf export specs passed");
