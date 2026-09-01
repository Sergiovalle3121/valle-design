/**
 * Spec de la semántica de las banderas de estado de capa
 * (`objects/layer-state.ts`, VALLE-CORPUS-LAYER-ESTADO-SEMANTICA).
 *
 * Los valores no son inventados: 1008, 1009 y 1016 son los TRES estados que
 * el corpus admitido produce en las cinco versiones, con el oráculo DXF
 * diciendo cuál es cuál. La sonda mide; esto fija el CONTRATO, y sobre todo
 * fija los LÍMITES, que es lo que se rompe solo con el tiempo:
 *
 *  - que el bit de bloqueo siga siendo el 3 y no el 2 del grupo 70 del DXF;
 *  - que un bit constante en el corpus NO se interprete;
 *  - que una capa apagada no se pueda afirmar, porque no se midió.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  LAYER_STATE_FROZEN_BIT,
  LAYER_STATE_LOCKED_BIT,
  interpretLayerStateFlags,
} from "../../src/objects/layer-state.js";

/** Los tres valores observados en el corpus, tal cual. */
const NORMAL = 1008;
const CONGELADA = 1009;
const BLOQUEADA = 1016;

test("los tres estados del corpus se interpretan como los declara el oráculo DXF", () => {
  const normal = interpretLayerStateFlags(NORMAL);
  assert.equal(normal.frozen, false);
  assert.equal(normal.locked, false);
  assert.equal(normal.unmeasuredBits, 0);

  const congelada = interpretLayerStateFlags(CONGELADA);
  assert.equal(congelada.frozen, true);
  assert.equal(congelada.locked, false);
  assert.equal(congelada.unmeasuredBits, 0);

  const bloqueada = interpretLayerStateFlags(BLOQUEADA);
  assert.equal(bloqueada.frozen, false);
  assert.equal(bloqueada.locked, true);
  assert.equal(bloqueada.unmeasuredBits, 0);
});

test("el bit de bloqueo es el 3 del DWG y NO el 2 del grupo 70 del DXF", () => {
  // Esta prueba existe por un error concreto que estuvo a punto de cometerse:
  // el DXF marca bloqueada con el valor 4 —el bit 2— y copiar esa convención
  // habría acertado en congelada y fallado en bloqueada. Si alguien
  // «armoniza» las dos posiciones algún día, esto se cae aquí y no en el
  // dibujo de un cliente.
  assert.equal(LAYER_STATE_FROZEN_BIT, 0);
  assert.equal(LAYER_STATE_LOCKED_BIT, 3);
  const conBit2 = interpretLayerStateFlags(NORMAL | (1 << 2));
  assert.equal(conBit2.locked, false, "el bit 2 no es el bloqueo del DWG");
  assert.notEqual(conBit2.unmeasuredBits, 0, "el bit 2 está fuera de lo medido y se declara");
});

test("las dos banderas medidas son independientes entre sí", () => {
  const ambas = interpretLayerStateFlags(NORMAL | 1 | 8);
  assert.equal(ambas.frozen, true);
  assert.equal(ambas.locked, true);
  assert.equal(ambas.unmeasuredBits, 0);
});

test("un bit encendido que el corpus siempre trajo a cero se DECLARA, no se interpreta", () => {
  const conBit10 = interpretLayerStateFlags(NORMAL | (1 << 10));
  assert.equal(conBit10.frozen, false);
  assert.equal(conBit10.locked, false);
  assert.equal(conBit10.unmeasuredBits, 1 << 10);
});

test("un bit apagado que el corpus siempre trajo a uno también se declara", () => {
  // La desviación se acusa en los DOS sentidos. Mirar sólo los unos nuevos
  // dejaría pasar en silencio la mitad de los archivos fuera de lo medido.
  const sinBit4 = interpretLayerStateFlags(NORMAL & ~(1 << 4));
  assert.equal(sinBit4.unmeasuredBits, 1 << 4);
});

test("el estado cero no finge ser el estado normal del corpus", () => {
  // Un `stateFlags` de cero no es una capa normal: le faltan los seis bits
  // que el corpus trajo SIEMPRE encendidos. Se lee lo que se sabe leer y se
  // declara el resto.
  const cero = interpretLayerStateFlags(0);
  assert.equal(cero.frozen, false);
  assert.equal(cero.locked, false);
  assert.equal(cero.unmeasuredBits, 0b11_1111_0000);
});

test("nunca lanza: el estado fuera de lo medido es un hecho que se transporta", () => {
  // Fallar cerrado es lo correcto para una CAPACIDAD AUSENTE —no saber leer
  // un campo—, pero aquí el campo se lee entero y lo único incierto es el
  // significado de unos bits. Reventar la apertura de un dibujo entero por
  // eso sería un fallo cerrado mal colocado.
  for (const value of [0, 0xffff, 0x8000, 12345]) {
    assert.doesNotThrow(() => interpretLayerStateFlags(value));
  }
});
