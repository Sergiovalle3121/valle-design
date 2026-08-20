/**
 * Cotas DIMENSION nativas en el kernel DXF (CAD-NEXT-066).
 *
 * Round-trip completo con el parser real: nuestro export escribe DIMENSION +
 * bloque anónimo *D con la geometría renderizada (extensiones, línea de cota,
 * flechas, texto). También cubre el fallback honesto: DIMENSION sin bloque →
 * texto de la cota + advertencia, nunca geometría inventada.
 *
 * ## Qué cambió, y por qué el cambio es la mejora
 *
 * Este camino —el heredado, el de `measurements`— escribe la DIMENSION SIN la
 * XDATA con la que el producto reconoce las suyas. Antes eso significaba que al
 * volver a leer el fichero la cota se APLANABA: seis líneas, dos flechas y un
 * texto por cota, y este spec fijaba esos recuentos. Desde que el lector sabe
 * rehacer una cota ajena a partir de sus puntos medidos, la misma DIMENSION
 * vuelve como COTA, no como su dibujo. Vuelve DESLIGADA de la geometría —el
 * fichero no lleva con qué reasociarla— y eso se declara.
 *
 * Lo que se mide aquí, por tanto, ya no son los trazos: son los PUNTOS. Que el
 * tramo medido siga siendo el que se exportó es lo que hace que la cota
 * recalcule, y recalcular es lo que la distingue de un dibujo de una cota.
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
assert.equal(roundTrip.semanticDimensions.length, 2, "las dos cotas vuelven como COTAS, no como su dibujo");
assert.equal(
  roundTrip.primitives.filter((p) => p.kind === "line").length,
  0,
  "y por tanto ya no quedan líneas sueltas de la geometría del bloque *D",
);
const [primera, segunda] = roundTrip.semanticDimensions;
assert.deepEqual(
  [primera.a, primera.b],
  [{ x: 0, y: 0 }, { x: 5000, y: 0 }],
  "el tramo medido es el que se exportó: es lo que permite recalcular",
);
assert.deepEqual([segunda.a, segunda.b], [{ x: 0, y: 0 }, { x: 0, y: 3000 }]);
assert.equal(primera.dimensionKind, "aligned", "el código 70 dice la familia");
assert.equal(primera.text, "5000 mm", "la etiqueta pactada sobrevive el round-trip");
assert.equal(segunda.text, "3000", "sin etiqueta, el texto es la medición real");
assert.ok(
  roundTrip.semanticDimensions.every((d) => d.layer === "Measurements"),
  "la capa de cotas se conserva",
);
// El desfase de la línea de cota se recupera del punto 10/20 y su signo.
assert.ok(
  Math.abs((primera.offset ?? 0) - 400) < 1e-6,
  "el desfase de 400 vuelve con su signo, no reflejado al otro lado",
);
// Y se declara que vuelven DESLIGADAS: el fichero heredado no lleva la XDATA
// que las identificaría como propias, así que el lector no puede saber que lo
// eran y no tiene con qué reasociarlas a la geometría.
assert.equal(
  roundTrip.warnings.filter((w) => w.code === "foreign_dimension_detached").length,
  2,
  "una declaración por cota: entra viva y desligada",
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
