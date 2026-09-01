/**
 * Spec del enlace capa → tipo de línea
 * (`objects/layer-linetype.ts` y `reader/layer-linetype-resolve.ts`,
 * VALLE-CORPUS-LAYER-TIPO-DE-LINEA).
 *
 * La POSICIÓN la mide `scripts/dwg/probe-layer-linetype.mjs` contra el
 * oráculo DXF sobre 98 capas de las cinco versiones. Aquí se fija el CONTRATO
 * y, sobre todo, lo que debe pasar cuando el dato NO está: que la ausencia se
 * transporte en vez de rellenarse con `CONTINUOUS`, que es un tipo de línea
 * real y no un «no sé».
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  LAYER_LINETYPE_HANDLE_POSITION,
  selectLayerLinetypeHandle,
} from "../../src/objects/layer-linetype.js";
import { resolveLayerLinetypeNames } from "../../src/reader/layer-linetype-resolve.js";

const absolute = (handle: number) => ({ kind: "absolute" as const, handle });
const nulo = { kind: "null" as const, handle: 0 };
const bytes = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));

/** Una capa de la base con lo justo para ejercitar la resolución. */
const capa = (handle: number, nombre: string, linetypeHandle: number | undefined) => ({
  handle,
  name: bytes(nombre),
  colorIndex: 7,
  stateFlags: 1008,
  frozen: false,
  locked: false,
  unmeasuredStateBits: 0,
  linetypeHandle,
  linetypeName: undefined,
});

/** Una entrada LTYPE con lo justo: la resolución sólo mira handle y nombre. */
const entrada = (handle: number, nombre: string) => ({
  handle,
  name: bytes(nombre),
  fields: {},
});

test("el tipo de línea sale de la posición medida y no de otra", () => {
  assert.equal(LAYER_LINETYPE_HANDLE_POSITION, 4);
  const flujo = [absolute(1), absolute(2), absolute(3), absolute(4), absolute(33), absolute(6)];
  assert.equal(selectLayerLinetypeHandle(flujo), 33);
});

test("un flujo más corto que la posición medida NO lanza: devuelve ausencia", () => {
  // Un objeto con menos handles de los medidos se leyó entero y su CRC cuadra:
  // es una forma que este intake no cubre, no corrupción. Reventar la apertura
  // del dibujo por no saber su tipo de línea sería un fallo cerrado mal puesto.
  assert.equal(selectLayerLinetypeHandle([absolute(1), absolute(2)]), undefined);
  assert.equal(selectLayerLinetypeHandle([]), undefined);
});

test("un handle nulo es ausencia, no el tipo de línea cero", () => {
  const flujo = [absolute(1), absolute(2), absolute(3), absolute(4), nulo];
  assert.equal(selectLayerLinetypeHandle(flujo), undefined);
});

test("el nombre se resuelve contra la tabla LTYPE del MISMO dibujo", () => {
  const resueltas = resolveLayerLinetypeNames(
    [capa(0x10, "EJES", 33), capa(0x11, "MUROS", 22)],
    [entrada(22, "CONTINUOUS"), entrada(33, "TRAZOS")],
  );
  assert.equal(resueltas[0]?.linetypeName, "TRAZOS");
  assert.equal(resueltas[1]?.linetypeName, "CONTINUOUS");
});

test("un handle que la tabla no trae deja el nombre AUSENTE, no CONTINUOUS", () => {
  // Éste es el caso que importa: suponer CONTINUOUS convertiría «apunta a algo
  // que no está» en «es continua», que es una afirmación sobre el dibujo que
  // el dibujo no hace. El handle se conserva para poder nombrar a qué apuntaba.
  const resueltas = resolveLayerLinetypeNames(
    [capa(0x10, "HUERFANA", 47)],
    [entrada(22, "CONTINUOUS")],
  );
  assert.equal(resueltas[0]?.linetypeName, undefined);
  assert.equal(resueltas[0]?.linetypeHandle, 47);
});

test("sin handle no se inventa nombre, y el resto de la capa no se toca", () => {
  const resueltas = resolveLayerLinetypeNames(
    [capa(0x10, "SIN_LTYPE", undefined)],
    [entrada(22, "CONTINUOUS")],
  );
  assert.equal(resueltas[0]?.linetypeName, undefined);
  assert.equal(resueltas[0]?.stateFlags, 1008);
  assert.equal(resueltas[0]?.colorIndex, 7);
});
