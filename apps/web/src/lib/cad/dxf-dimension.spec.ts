/**
 * Cotas DIMENSION nativas en el kernel DXF (CAD-NEXT-066).
 *
 * Round-trip completo con el parser real: nuestro export escribe DIMENSION +
 * bloque anónimo *D con la geometría renderizada (extensiones, línea de cota,
 * flechas, texto) y nuestro import la expande de vuelta a primitivas. También
 * cubre el fallback honesto: DIMENSION sin bloque → texto de la cota +
 * advertencia, nunca geometría inventada.
 */
import { strict as assert } from "node:assert";
import { exportCadDxf } from "./dxf-export";
import { importDxfPrimitives } from "./dxf-import";

// --- export: DIMENSION nativa + bloque *D -----------------------------------
const exported = exportCadDxf(
  {
    measurements: [
      { from: { x: 0, y: 0 }, to: { x: 5000, y: 0 }, label: "5000 mm", offset: 400 },
      { from: { x: 0, y: 0 }, to: { x: 0, y: 3000 } },
    ],
  },
  { units: "mm" },
);
assert.equal(exported.entityCount, 2, "dos cotas → dos entidades DIMENSION");
assert.ok(exported.content.includes("0\nDIMENSION"), "escribe DIMENSION nativa");
assert.ok(
  exported.content.includes("2\n*D1") && exported.content.includes("2\n*D2"),
  "cada cota referencia su bloque anónimo",
);
assert.ok(exported.content.includes("70\n33"), "tipo alineada + geometría en bloque");
assert.ok(exported.content.includes("1\n5000 mm"), "conserva la etiqueta pactada");
assert.ok(exported.content.includes("42\n3000"), "la segunda cota mide 3000 sin etiqueta");

// La cota degenerada (from == to) no produce entidad ni bloque fantasma.
const degenerate = exportCadDxf({
  measurements: [{ from: { x: 7, y: 7 }, to: { x: 7, y: 7 } }],
});
assert.equal(degenerate.entityCount, 0, "cota degenerada → nada que medir");
assert.ok(!degenerate.content.includes("DIMENSION"), "sin DIMENSION fantasma");

// --- round-trip: nuestro export → parser real → nuestra expansión ------------
const roundTrip = importDxfPrimitives(exported.content);
assert.equal(
  roundTrip.warnings.filter((w) => w.code === "dimension_without_block").length,
  0,
  "las cotas propias siempre traen su bloque",
);
const dimLines = roundTrip.primitives.filter((p) => p.kind === "line");
const dimPolys = roundTrip.primitives.filter((p) => p.kind === "polyline");
const dimTexts = roundTrip.primitives.filter((p) => p.kind === "text");
// Por cota: 3 líneas (2 extensiones + línea de cota), 2 flechas, 1 texto.
assert.equal(dimLines.length, 6, "3 líneas por cota × 2 cotas");
assert.equal(dimPolys.length, 4, "2 flechas por cota × 2 cotas");
assert.equal(dimTexts.length, 2, "1 texto por cota × 2 cotas");
assert.ok(
  dimTexts.some((t) => t.text === "5000 mm"),
  "la etiqueta sobrevive el round-trip",
);
assert.ok(
  dimTexts.some((t) => t.text === "3000"),
  "sin etiqueta, el texto es la medición real",
);
assert.ok(
  roundTrip.primitives.every((p) => p.layer === "Measurements"),
  "la capa de cotas se conserva",
);
// La línea de cota de la primera medición vive desfasada 400 del tramo medido.
assert.ok(
  dimLines.some(
    (l) =>
      Math.abs(l.points[0].y - 400) < 1e-6 && Math.abs(l.points[1].y - 400) < 1e-6,
  ),
  "el desfase de la línea de cota se respeta",
);

// --- fallback honesto: DIMENSION ajena sin bloque ----------------------------
const foreign = [
  "0", "SECTION", "2", "ENTITIES",
  "0", "DIMENSION", "8", "Cotas",
  "10", "500", "20", "100", "30", "0",
  "11", "250", "21", "140", "31", "0",
  "70", "1",
  "42", "500",
  "0", "ENDSEC",
  "0", "EOF",
].join("\n") + "\n";
const fallback = importDxfPrimitives(foreign);
assert.equal(
  fallback.warnings.filter((w) => w.code === "dimension_without_block").length,
  1,
  "avisa que la cota vino sin geometría",
);
assert.equal(fallback.primitives.length, 1, "conserva el texto de la medición");
assert.equal(fallback.primitives[0].kind, "text");
assert.equal(fallback.primitives[0].text, "500", "usa la medición real 42");
assert.equal(fallback.primitives[0].layer, "Cotas", "en la capa original");

console.log("cad dxf dimension specs passed");
