/**
 * Spec de la ESCRITURA de patrones de tipo de línea
 * (`writeAc1015LinetypeBody` y el camino público).
 *
 * ESTA SPEC EXISTE POR UNA PÉRDIDA MEDIDA. El writer emitía longitud 0 y CERO
 * trazos SIEMPRE, así que el archivo sólo podía llevar líneas continuas: una
 * capa con `TRAZOS` se exportaba sólida y, leída de vuelta, decía
 * «Continuous». No una ausencia — un valor equivocado con aspecto de dato.
 *
 * Lo que se prueba es la IDA Y VUELTA con los valores del CORPUS REAL
 * (`TRAZOS`, longitud 1, trazos [0.75, -0.25]): que lo escrito se lea igual.
 * Un emisor y un lector que se equivocaran del mismo modo serían coherentes
 * entre sí y estarían los dos mal.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { writeAc1015MinimalFile } from "../../src/writer/ac1015-minimal-file-writer.js";
import { writeCanonicalDwg } from "../../src/api/write.js";
import { readDwg } from "../../src/api/read.js";

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));
const decode = (bytes: readonly number[]): string => String.fromCharCode(...bytes);

/** Los valores que trae `04-capas` del corpus admitido, no unos inventados. */
const TRAZOS_PATTERN = [0.75, -0.25];

test("un patrón escrito se lee de vuelta con sus mismos trazos", () => {
  const bytes = writeAc1015MinimalFile({
    linetypes: [
      { name: ascii("TRAZOS"), patternLength: 1, dashes: TRAZOS_PATTERN.map((length) => ({ length })) },
    ],
    layers: [{ name: ascii("EJES"), colorIndex: 2, linetypeName: "TRAZOS" }],
  });
  const database = readDwg(bytes);
  const trazos = database.tables?.linetypes.find((e) => decode(e.name) === "TRAZOS");
  assert.ok(trazos, "la entrada TRAZOS debe existir en la tabla del archivo");
  assert.equal(trazos.fields["patternLength"], 1);
  assert.deepEqual(trazos.fields["dashLengths"], TRAZOS_PATTERN);
});

test("LA PÉRDIDA QUE ESTA SPEC GUARDA: la capa apunta a SU tipo de línea", () => {
  const bytes = writeAc1015MinimalFile({
    linetypes: [
      { name: ascii("TRAZOS"), patternLength: 1, dashes: TRAZOS_PATTERN.map((length) => ({ length })) },
    ],
    layers: [
      { name: ascii("EJES"), colorIndex: 2, linetypeName: "TRAZOS" },
      { name: ascii("MUROS"), colorIndex: 1 },
    ],
  });
  const database = readDwg(bytes);
  const layer = (name: string) => database.layers.find((l) => decode(l.name) === name);
  assert.equal(layer("EJES")?.linetypeName, "TRAZOS");
  // Una capa que no pide nada sigue en Continuous: escribir el patrón de otra
  // capa «porque estaba ahí» sería inventarle un trazo al dibujo.
  assert.equal(layer("MUROS")?.linetypeName, "Continuous");
});

test("un nombre que la opción no define cae a Continuous en vez de romper", () => {
  const bytes = writeAc1015MinimalFile({
    layers: [{ name: ascii("EJES"), colorIndex: 2, linetypeName: "NO_EXISTE" }],
  });
  const database = readDwg(bytes);
  const ejes = database.layers.find((l) => decode(l.name) === "EJES");
  assert.equal(ejes?.linetypeName, "Continuous");
});

/** Documento canónico mínimo con una capa por cada tipo de línea a probar. */
const canonicalWith = (styles: Record<string, unknown>) =>
  ({
    schemaVersion: 9,
    units: "mm",
    layers: [
      { id: "0", name: "0", color: "#FFFFFF", visible: true, locked: false },
      { id: "EJES", name: "EJES", color: "#FFFF00", visible: true, locked: false, linetype: "TRAZOS" },
      { id: "OCULTA", name: "OCULTA", color: "#FF00FF", visible: true, locked: false, linetype: "FANTASMA" },
    ],
    entities: [
      { id: "e0", type: "line", layer: "EJES", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 } },
      { id: "e1", type: "line", layer: "OCULTA", start: { x: 0, y: 1, z: 0 }, end: { x: 10, y: 1, z: 0 } },
    ],
    history: [],
    modelSpace: { entityIds: ["e0", "e1"] },
    paperSpaces: [],
    blocks: [],
    styles: { text: {}, dimension: {}, table: {}, ...styles },
  }) as never;

test("el camino público escribe el patrón que el documento DEFINE", () => {
  const result = writeCanonicalDwg(
    canonicalWith({ linetype: { TRAZOS: { pattern: TRAZOS_PATTERN } } }),
  );
  const database = readDwg(result.bytes);
  const trazos = database.tables?.linetypes.find((e) => decode(e.name) === "TRAZOS");
  assert.ok(trazos, "el patrón del documento llega al archivo");
  assert.deepEqual(trazos.fields["dashLengths"], TRAZOS_PATTERN);
  assert.equal(
    database.layers.find((l) => decode(l.name) === "EJES")?.linetypeName,
    "TRAZOS",
  );
});

test("un tipo de línea que el documento NOMBRA pero no DEFINE se declara", () => {
  // `FANTASMA` no tiene patrón en `styles`: no se le inventan trazos, se
  // escribe continua y se dice. Es la diferencia entre «no sé» y un dato falso.
  const result = writeCanonicalDwg(
    canonicalWith({ linetype: { TRAZOS: { pattern: TRAZOS_PATTERN } } }),
  );
  assert.ok(
    result.lossManifest.some(
      (loss) => loss.code === "layer-linetype-not-writable" && loss.detail.includes("OCULTA"),
    ),
    "la capa sin patrón definido se nombra en el manifiesto",
  );
  assert.equal(
    result.lossManifest.filter((l) => l.code === "layer-linetype-not-writable").length,
    1,
    "la capa que SÍ tiene patrón no genera ruido",
  );
});
