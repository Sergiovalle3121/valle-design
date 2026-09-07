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

// Bloques por nombre: la definición de cada INSERT sale de un mapa, no de
// `find` sobre todos los bloques (I×B comparaciones por exportación). Ante un
// nombre repetido gana la PRIMERA definición, como antes, y los INSERT anidados
// dentro de un bloque resuelven igual. La complejidad se afirma contando las
// llamadas a `Array.prototype.find`: no pueden crecer con el número de INSERT.
function exportWithInserts(count: number) {
  return exportCadDxf({
    blocks: [
      { name: "SILLA", primitives: [], attributes: { TAG: { defaultValue: "S" } } },
      { name: "SILLA", primitives: [] },
      { name: "MESA", primitives: [], inserts: [{ block: "SILLA", x: 1, y: 1, attributes: { TAG: "anidada" } }] },
    ],
    inserts: Array.from({ length: count }, (_, index) => ({ block: "SILLA", x: index, y: 0, attributes: { TAG: `s${index}` } })),
  });
}
const nativeFind = Array.prototype.find;
function findCallsDuring(run: () => void): number {
  let calls = 0;
  Array.prototype.find = function countingFind(this: unknown[], ...args: unknown[]) {
    calls += 1;
    return nativeFind.apply(this, args as Parameters<typeof nativeFind>);
  } as typeof Array.prototype.find;
  try {
    run();
  } finally {
    Array.prototype.find = nativeFind;
  }
  return calls;
}
const withBlocks = exportWithInserts(1);
assert.ok(withBlocks.content.includes("1\ns0\n2\nTAG"), "el ATTRIB sale de la PRIMERA definición de SILLA (la segunda no declara TAG)");
assert.ok(withBlocks.content.includes("1\nanidada\n2\nTAG"), "un INSERT anidado dentro de un bloque resuelve su definición igual");
const findsWithOne = findCallsDuring(() => exportWithInserts(1));
const findsWithMany = findCallsDuring(() => exportWithInserts(200));
assert.equal(
  findsWithMany,
  findsWithOne,
  `resolver bloques no crece con los INSERT: ${findsWithOne} find con 1 INSERT frente a ${findsWithMany} con 200`,
);

console.log("cad dxf export specs passed");
