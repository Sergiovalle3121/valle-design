/**
 * Spec de la tabla ACI básica en las dos direcciones (`objects/aci-basic.ts`)
 * y del color de capa en el writer PÚBLICO.
 *
 * ESTA SPEC EXISTE POR UN FALLO REAL. Hasta el 2026-09-01 `writeCanonicalDwg`
 * empujaba las capas con su nombre y nada más, así que TODA capa exportada por
 * el camino público salía con el color por defecto —el 7, blanco— y el color
 * del dibujo se perdía SIN declararlo. El writer interno, que recibe el índice
 * ya resuelto, siempre estuvo bien: por eso ninguna prueba lo veía.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { ACI_BASIC_HEX, aciIndexFromHex } from "../../src/objects/aci-basic.js";
import { writeCanonicalDwg } from "../../src/api/write.js";
import { readDwg } from "../../src/api/read.js";

/** Un documento canónico mínimo con una capa de color y una línea en ella. */
const documentWithLayer = (color: string) => ({
  schemaVersion: 9 as const,
  units: "mm",
  layers: [
    { id: "0", name: "0", color: "#FFFFFF", visible: true, locked: false },
    { id: "MUROS", name: "MUROS", color, visible: true, locked: false },
  ],
  entities: [
    {
      id: "e1",
      type: "line",
      layer: "MUROS",
      start: { x: 0, y: 0, z: 0 },
      end: { x: 10, y: 5, z: 0 },
    },
  ],
  history: [],
  modelSpace: { entityIds: ["e1"] },
  paperSpaces: [],
  blocks: [],
  styles: { text: {}, dimension: {}, table: {} },
}) as never;

const decode = (bytes: readonly number[]): string => String.fromCharCode(...bytes);

test("la ida y la vuelta de la tabla ACI son consistentes entre sí", () => {
  // Una segunda lista escrita a mano se desincroniza el día que alguien toque
  // un valor; por eso el inverso se deriva de la misma tabla y esto lo vigila.
  for (const [index, hex] of Object.entries(ACI_BASIC_HEX)) {
    const back = aciIndexFromHex(hex);
    assert.notEqual(back, undefined, `${hex} debería resolver a un índice`);
    assert.equal(ACI_BASIC_HEX[back!], hex, `${hex} debe volver a un índice del mismo color`);
  }
});

test("el blanco ambiguo resuelve al índice MENOR, que es el convencional", () => {
  // #FFFFFF es a la vez el 7 y el 255. Escribir 255 donde el dibujo dice
  // blanco sería válido y sorprendente para quien abra el archivo.
  assert.equal(aciIndexFromHex("#FFFFFF"), 7);
});

test("el color se lee sin importar la caja, y uno desconocido no se aproxima", () => {
  assert.equal(aciIndexFromHex("#00ffff"), 4);
  assert.equal(aciIndexFromHex("  #00FFFF  "), 4);
  // Un color que no está en la tabla NO cae al más cercano: devuelve ausencia
  // para que el llamador la declare. Aproximar convertiría «no sé escribir
  // este color» en «este color es gris».
  assert.equal(aciIndexFromHex("#123456"), undefined);
});

test("EL FALLO QUE ESTA SPEC GUARDA: el writer público conserva el color de la capa", () => {
  const result = writeCanonicalDwg(documentWithLayer("#00FFFF"));
  const database = readDwg(result.bytes);
  const muros = database.layers.find((layer) => decode(layer.name) === "MUROS");
  assert.ok(muros, "la capa MUROS debe existir en el archivo escrito");
  assert.equal(muros.colorIndex, 4, "cian es el ACI 4, no el 7 por defecto");
});

test("un color fuera de la tabla se DECLARA como pérdida, no se escribe en silencio", () => {
  const result = writeCanonicalDwg(documentWithLayer("#123456"));
  assert.ok(
    result.lossManifest.some(
      (loss) => loss.code === "layer-color-not-in-aci-basic" && loss.detail.includes("MUROS"),
    ),
    "el color que no se sabe escribir se nombra en el manifiesto",
  );
});
