/**
 * Spec del CUERPO de objeto R2010+ para entidades sin cadenas
 * (`reader/r2010-entity-body.ts`, VALLE-CORPUS-R2010-OBJECT-BODY).
 *
 * Los cuerpos son sintéticos, construidos a mano bit a bit con
 * `DwgBitEmitter` (espejo exacto del lector) siguiendo la estructura MEDIDA:
 * MS + UMC + BOT + H + [tramo opaco de anchura fija] + datos de tipo + bit de
 * presencia de cadenas + flujo de handles. No hay bytes DWG reales aquí.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { DwgBitEmitter } from "../../src/writer/dwg-bit-emitter.js";
import {
  R2010_TYPE_DATA_OFFSET_BITS,
  readR2010EntityBody,
} from "../../src/reader/r2010-entity-body.js";
import { assertDwgError } from "../support/assert.js";

const AC1024_PREFIX = R2010_TYPE_DATA_OFFSET_BITS.AC1024;

/**
 * Cabecera R2010+ sintética común a todos los cuerpos: MS(objectSize) se
 * calcula al final a partir del tamaño real (excluyendo sus propios 2 bytes
 * y el byte de UMC, hecho medido), UMC(handleStreamBits) es el valor que el
 * llamador declara (puede ser deliberadamente INCONSISTENTE con el relleno
 * real, para probar el fallo cerrado de aterrizaje), y BOT(type)/H(handle)
 * van tal cual. El llamador es responsable de que el total cierre en un
 * múltiplo de 8 bits: `toBytes()` no debe rellenar nada por su cuenta o la
 * aritmética de la prueba dejaría de controlar el layout exacto.
 */
function buildBody(options: {
  readonly type: number;
  readonly handle: number;
  readonly handleStreamBits: number;
  readonly build: (body: DwgBitEmitter) => void;
}): Uint8Array {
  const body = new DwgBitEmitter();
  body.pushBits(0b00, 2); // BOT selector 0: RC literal
  body.emitRC(options.type);
  body.emitH(0, options.handle);
  options.build(body);
  if (body.bitLength % 8 !== 0) {
    throw new Error(
      `test body is not byte-aligned (${body.bitLength} bits) — fix the test's bit budget`,
    );
  }
  const bodyBytes = body.toBytes();
  const objectSize = bodyBytes.length - 2 /* MS */ - 1; /* UMC (small value) */

  const withHeader = new DwgBitEmitter();
  withHeader.emitRS(objectSize); // MS: una sola palabra, sin continuación
  withHeader.emitRC(options.handleStreamBits); // UMC: un solo byte, sin continuación
  withHeader.pushEmitter(body);
  return withHeader.toBytes();
}

/** Rellena `count` bits en cero: el tramo opaco medido, o relleno de prueba. */
function padZeroBits(body: DwgBitEmitter, count: number): void {
  for (let index = 0; index < count; index += 1) body.pushBit(0);
}

test("LINE: geometría exacta con el tramo opaco medido de AC1024 y el bit de cadenas en 0", () => {
  // datos de tipo = 263 bits; header+opaco = 89; +1 (hasStrings) = 353;
  // 353 % 8 == 1, asi que 7 bits de relleno cierran en 360 (45 bytes).
  const bytes = buildBody({
    type: 0x13,
    handle: 1,
    handleStreamBits: 7,
    build: (body) => {
      padZeroBits(body, AC1024_PREFIX);
      body.pushBit(1); // zeroZ: Z es cero
      body.emitRD(10);
      body.emitDD(90, 10);
      body.emitRD(20);
      body.emitDD(5, 20);
      body.emitBT(0);
      body.emitBE({ x: 0, y: 0, z: 1 });
      body.pushBit(0); // bit de presencia de cadenas: ninguna
      padZeroBits(body, 7); // flujo de handles declarado por UMC arriba
    },
  });

  const result = readR2010EntityBody(bytes, "AC1024", 1);
  assert.equal(result.header.type, 0x13);
  assert.equal(result.header.handle, 1);
  assert.deepEqual(result.entity, {
    kind: "line",
    start: { x: 10, y: 20, z: 0 },
    end: { x: 90, y: 5, z: 0 },
    thickness: 0,
    extrusion: { x: 0, y: 0, z: 1 },
  });
});

test("CIRCLE: geometría exacta reutilizando el mismo decodificador que R2000", () => {
  // datos de tipo = 202 bits; header+opaco = 89; +1 = 292; 292 % 8 == 4,
  // asi que 4 bits de relleno cierran en 296 (37 bytes).
  const bytes = buildBody({
    type: 0x12,
    handle: 2,
    handleStreamBits: 4,
    build: (body) => {
      padZeroBits(body, AC1024_PREFIX);
      body.emitBD(50);
      body.emitBD(45);
      body.emitBD(0);
      body.emitBD(20);
      body.emitBT(0);
      body.emitBE({ x: 0, y: 0, z: 1 });
      body.pushBit(0);
      padZeroBits(body, 4);
    },
  });

  const result = readR2010EntityBody(bytes, "AC1024", 2);
  assert.deepEqual(result.entity, {
    kind: "circle",
    center: { x: 50, y: 45, z: 0 },
    radius: 20,
    thickness: 0,
    extrusion: { x: 0, y: 0, z: 1 },
  });
});

test("un tipo sin decodificador R2010+ medido falla UNSUPPORTED antes de tocar el resto del cuerpo", () => {
  // El chequeo de tipo ocurre justo tras el encabezado: el resto del cuerpo
  // no importa para esta prueba, sólo que exista y quede byte-alineado.
  const bytes = buildBody({
    // 0x2C (MTEXT): lleva cadena y NINGÚN decodificador R2010+ lo cubre. Antes
    // esta prueba usaba TEXT (0x01), que desde el intake del 2026-09-01 sí se
    // decodifica: seguir usándolo probaría lo contrario de lo que dice.
    type: 0x2c,
    handle: 3,
    handleStreamBits: 0,
    build: (body) => padZeroBits(body, 6), // 50 (header) + 6 = 56 bits = 7 bytes
  });

  assertDwgError(
    () => readR2010EntityBody(bytes, "AC1024", 3),
    "DWG_VERSION_DECODER_UNSUPPORTED",
  );
});

test("el bit de presencia de cadenas en 1 falla UNSUPPORTED: el flujo de strings no se decodifica", () => {
  // datos de tipo (POINT) = 138 bits; header+opaco = 89; +1 = 228;
  // 228 % 8 == 4, asi que 4 bits de relleno cierran en 232 (29 bytes).
  const bytes = buildBody({
    type: 0x1b, // POINT
    handle: 4,
    handleStreamBits: 4,
    build: (body) => {
      padZeroBits(body, AC1024_PREFIX);
      body.emitBD(5);
      body.emitBD(80);
      body.emitBD(0);
      body.emitBT(0);
      body.emitBE({ x: 0, y: 0, z: 1 });
      body.emitBD(0); // xAxisAngle
      body.pushBit(1); // bit de presencia de cadenas: SÍ hay strings
      padZeroBits(body, 4);
    },
  });

  assertDwgError(
    () => readR2010EntityBody(bytes, "AC1024", 4),
    "DWG_VERSION_DECODER_UNSUPPORTED",
  );
});

test("un aterrizaje que no cae exacto un bit antes del flujo de handles falla STRUCTURE_CORRUPT", () => {
  // Mismo cuerpo POINT que la prueba anterior (relleno real de 4 bits), pero
  // UMC declara un flujo de handles MÁS ANCHO del que en realidad queda: el
  // aterrizaje esperado (handleStreamStart-1) ya no coincide con el bit real
  // de presencia de cadenas, y el chequeo debe fallar ANTES de leerlo.
  const bytes = buildBody({
    type: 0x1b, // POINT
    handle: 5,
    handleStreamBits: 12, // real: 4 — deliberadamente inconsistente
    build: (body) => {
      padZeroBits(body, AC1024_PREFIX);
      body.emitBD(5);
      body.emitBD(80);
      body.emitBD(0);
      body.emitBT(0);
      body.emitBE({ x: 0, y: 0, z: 1 });
      body.emitBD(0);
      body.pushBit(0);
      padZeroBits(body, 4);
    },
  });

  assertDwgError(
    () => readR2010EntityBody(bytes, "AC1024", 5),
    "DWG_STRUCTURE_CORRUPT",
  );
});
