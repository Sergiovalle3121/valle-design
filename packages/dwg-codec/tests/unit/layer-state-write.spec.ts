/**
 * Spec de la ESCRITURA del estado de capa (`encodeLayerStateFlags` y el
 * camino público), VALLE-CORPUS-LAYER-ESTADO-SEMANTICA.
 *
 * ESTA SPEC EXISTE POR UNA PÉRDIDA MEDIDA. Hasta el 2026-09-01 el archivo
 * mínimo nunca recibía el estado de la capa, así que caía al 1008 por defecto
 * y TODA capa exportada salía descongelada y desbloqueada: escribir una capa
 * congelada y volver a leerla la devolvía normal, sin nada en el manifiesto.
 *
 * Lo que se prueba de verdad es la IDA Y VUELTA: que lo que escribe el códec
 * lo lee el códec con el mismo significado. Un encoder y un decoder que se
 * equivocaran igual serían coherentes entre sí y estarían los dos mal, y por
 * eso los valores esperados son los MEDIDOS en el corpus real —1008, 1009 y
 * 1016— y no los que produzca la implementación.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeLayerStateFlags,
  interpretLayerStateFlags,
} from "../../src/objects/layer-state.js";
import { writeAc1015MinimalFile } from "../../src/writer/ac1015-minimal-file-writer.js";
import { readDwg } from "../../src/api/read.js";

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));
const decode = (bytes: readonly number[]): string => String.fromCharCode(...bytes);

test("el estado se compone con los MISMOS valores que trae el corpus real", () => {
  assert.equal(encodeLayerStateFlags({}), 1008, "capa normal");
  assert.equal(encodeLayerStateFlags({ frozen: true }), 1009, "congelada");
  assert.equal(encodeLayerStateFlags({ locked: true }), 1016, "bloqueada");
  assert.equal(encodeLayerStateFlags({ frozen: true, locked: true }), 1017, "las dos");
});

test("componer y volver a interpretar devuelve lo mismo, y sin bits sin medir", () => {
  for (const frozen of [true, false]) {
    for (const locked of [true, false]) {
      const back = interpretLayerStateFlags(encodeLayerStateFlags({ frozen, locked }));
      assert.equal(back.frozen, frozen);
      assert.equal(back.locked, locked);
      assert.equal(back.unmeasuredBits, 0, "lo compuesto no puede salirse de lo medido");
    }
  }
});

test("LA PÉRDIDA QUE ESTA SPEC GUARDA: el estado sobrevive a escribir y leer", () => {
  const bytes = writeAc1015MinimalFile({
    layers: [
      { name: ascii("CONGELADA"), colorIndex: 4, frozen: true },
      { name: ascii("BLOQUEADA"), colorIndex: 5, locked: true },
      { name: ascii("NORMAL"), colorIndex: 2 },
    ],
  });
  const database = readDwg(bytes);
  const layer = (name: string) =>
    database.layers.find((candidate) => decode(candidate.name) === name);

  assert.equal(layer("CONGELADA")?.frozen, true);
  assert.equal(layer("CONGELADA")?.locked, false);
  assert.equal(layer("BLOQUEADA")?.locked, true);
  assert.equal(layer("BLOQUEADA")?.frozen, false);
  assert.equal(layer("NORMAL")?.frozen, false);
  assert.equal(layer("NORMAL")?.locked, false);
});

test("una capa sin estado declarado se escribe como capa normal, no como cero", () => {
  // Un `stateFlags` de cero no es «capa normal»: le faltan los seis bits que
  // el corpus trae SIEMPRE encendidos, y el propio lector lo marcaría como
  // fuera de lo medido. La base los pone.
  const bytes = writeAc1015MinimalFile({ layers: [{ name: ascii("SIN_ESTADO") }] });
  const database = readDwg(bytes);
  const layer = database.layers.find((c) => decode(c.name) === "SIN_ESTADO");
  assert.equal(layer?.stateFlags, 1008);
  assert.equal(layer?.unmeasuredStateBits, 0);
});
