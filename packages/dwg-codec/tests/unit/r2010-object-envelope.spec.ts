/**
 * Spec de la envoltura de objeto R2010+: sin campo de tamaño al frente, CRC-16
 * sobre el cuerpo completo, límites derivados del mapa de handles ordenado
 * por offset (hecho medido VALLE-CORPUS-INTAKE-A60EBE2, intake 2026-08-23).
 *
 * Este módulo NO decodifica el tipo del objeto (BOT sigue sin fuente
 * registrada suficiente): estas pruebas verifican SÓLO la delimitación y el
 * CRC del cuerpo opaco.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { AC1015_SECTION_CRC_SEED } from "../../src/container/ac1015-section-frame.js";
import {
  pairR2010ObjectBounds,
  readR2010ObjectBody,
  type R2010ObjectMapEntry,
} from "../../src/container/r2010-object-envelope.js";
import { crc16Dwg } from "../../src/codecs/crc16.js";
import { assertDwgError } from "../support/assert.js";

/** Construye un payload de AcDb:AcDbObjects con N cuerpos [body|CRC16LE]. */
function buildObjectsPayload(
  bodies: readonly number[][],
): { payload: Uint8Array; entries: R2010ObjectMapEntry[] } {
  const bytes: number[] = [];
  const entries: R2010ObjectMapEntry[] = [];
  let handle = 1;
  for (const body of bodies) {
    const start = bytes.length;
    bytes.push(...body);
    const crc = crc16Dwg(Uint8Array.from(body), AC1015_SECTION_CRC_SEED);
    bytes.push(crc & 0xff, (crc >> 8) & 0xff);
    entries.push({ handle, offset: start });
    handle += 1;
  }
  return { payload: Uint8Array.from(bytes), entries };
}

test("los límites se derivan del offset del SIGUIENTE objeto, no de un tamaño declarado", () => {
  const { payload, entries } = buildObjectsPayload([
    [1, 2, 3, 4, 5],
    [9, 8, 7],
    [0xaa, 0xbb, 0xcc, 0xdd],
  ]);
  const bounds = pairR2010ObjectBounds(entries, payload.length);
  assert.equal(bounds.length, 3);
  assert.deepEqual(
    bounds.map((b) => [b.handle, b.start, b.end]),
    [
      [1, 0, 7],
      [2, 7, 12],
      [3, 12, 18],
    ],
  );
  assert.equal(bounds[2]!.end, payload.length);
});

test("el orden de ENTREGA de pairR2010ObjectBounds sigue el offset ascendente, no el orden del mapa", () => {
  const { payload, entries } = buildObjectsPayload([
    [1, 1, 1, 1],
    [2, 2, 2, 2],
  ]);
  // El mapa llega en orden de HANDLE, no de offset: se invierte a propósito.
  const shuffled = [...entries].reverse();
  const bounds = pairR2010ObjectBounds(shuffled, payload.length);
  assert.deepEqual(
    bounds.map((b) => b.handle),
    [1, 2],
  );
});

test("readR2010ObjectBody devuelve el cuerpo exacto cuando el CRC cuadra", () => {
  const { payload, entries } = buildObjectsPayload([[0x11, 0x22, 0x33, 0x44]]);
  const bounds = pairR2010ObjectBounds(entries, payload.length);
  const body = readR2010ObjectBody(payload, bounds[0]!);
  assert.deepEqual([...body.bodyBytes], [0x11, 0x22, 0x33, 0x44]);
  assert.equal(body.byteLength, 6);
});

test("gemelo triste: un CRC roto falla cerrado sin devolver cuerpo alguno", () => {
  const { payload, entries } = buildObjectsPayload([[1, 2, 3]]);
  const bounds = pairR2010ObjectBounds(entries, payload.length);
  const corrupted = Uint8Array.from(payload);
  corrupted[0]! ^= 0xff; // el primer byte del cuerpo cambia; el CRC deja de cuadrar
  assertDwgError(() => readR2010ObjectBody(corrupted, bounds[0]!), "DWG_STRUCTURE_CORRUPT");
});

test("gemelo triste: un slot demasiado pequeño para cuerpo+CRC falla cerrado", () => {
  const payload = Uint8Array.from([0xaa, 0xbb]);
  assertDwgError(
    () => readR2010ObjectBody(payload, { handle: 1, start: 0, end: 2 }),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("gemelo triste: dos entradas del mapa con el mismo offset no dejan hueco para un cuerpo", () => {
  const entries: R2010ObjectMapEntry[] = [
    { handle: 1, offset: 4 },
    { handle: 2, offset: 4 },
  ];
  assertDwgError(() => pairR2010ObjectBounds(entries, 10), "DWG_STRUCTURE_CORRUPT");
});

test("gemelo triste: un offset del mapa fuera del payload falla cerrado", () => {
  const entries: R2010ObjectMapEntry[] = [{ handle: 1, offset: 100 }];
  assertDwgError(() => pairR2010ObjectBounds(entries, 10), "DWG_STRUCTURE_CORRUPT");
});

test("determinismo: el mismo payload produce exactamente los mismos límites y cuerpo", () => {
  const { payload, entries } = buildObjectsPayload([
    [5, 4, 3, 2, 1],
    [7, 7, 7],
  ]);
  const boundsA = pairR2010ObjectBounds(entries, payload.length);
  const boundsB = pairR2010ObjectBounds(entries, payload.length);
  assert.deepEqual(boundsA, boundsB);
  const bodyA = readR2010ObjectBody(payload, boundsA[0]!);
  const bodyB = readR2010ObjectBody(payload, boundsB[0]!);
  assert.deepEqual([...bodyA.bodyBytes], [...bodyB.bodyBytes]);
});
