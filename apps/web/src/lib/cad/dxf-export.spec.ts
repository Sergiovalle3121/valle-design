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
      },
      { kind: "text", layer: "Labels", points: [{ x: 2, y: 3 }], text: "AOI" },
    ],
    measurements: [
      { from: { x: 0, y: 0 }, to: { x: 0, y: 12 }, label: "12 mm" },
    ],
  },
  { units: "mm", fileComment: "AXOS CAD export" },
);

assert.ok(result.content.includes("SECTION\n2\nHEADER"), "writes DXF header");
assert.ok(result.content.includes("0\nTABLE\n2\nLAYER"), "writes layer table");
assert.ok(result.content.includes("0\nLINE"), "exports lines");
assert.ok(
  result.content.includes("0\nPOLYLINE"),
  "exports rectangles as closed polylines",
);
assert.ok(result.content.includes("1\nAOI"), "exports text labels");
assert.ok(result.content.includes("1\n12 mm"), "exports measurement labels");
assert.ok(result.layers.includes("Equipment"), "tracks explicit layers");
assert.ok(
  result.layers.includes("Measurements"),
  "tracks implicit measurement layer",
);
assert.equal(result.entityCount, 5, "counts exported entities");
assert.ok(result.content.endsWith("0\nEOF\n"), "terminates DXF");
console.log("cad dxf export specs passed");
