import assert from "node:assert/strict";
import test from "node:test";
import { BoundedByteCursor } from "../../src/binary/byte-cursor.js";
import { DwgBitReader } from "../../src/codecs/bitcodes.js";
import { DwgBitEmitter } from "../../src/writer/dwg-bit-emitter.js";

/**
 * Propiedades de ida y vuelta de los códigos de bits — OLA 5.2.
 *
 * Para cada código emitible, `decode(encode(x)) === x` sobre valores
 * generados con una semilla FIJA (xorshift32): mismos vectores en cada
 * ejecución, sin Math.random. La comparación de doubles es `Object.is`
 * (un −0.0 debe sobrevivir bit a bit, como exige el emisor).
 */

function createRng(seedText: string): () => number {
  let state = 0;
  for (const ch of seedText) state = (state * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  if (state === 0) state = 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

const CASES = 300;

/** Doubles variados: magnitudes extremas, negativos, -0.0, enteros, finos. */
function randomDouble(rng: () => number): number {
  const shape = Math.floor(rng() * 6);
  switch (shape) {
    case 0:
      return 0;
    case 1:
      return -0;
    case 2:
      return (rng() - 0.5) * 2 ** Math.floor(rng() * 64);
    case 3:
      return Math.floor((rng() - 0.5) * 1e9);
    case 4:
      return rng() * 1e-12;
    default:
      return (rng() - 0.5) * 1e20;
  }
}

function roundTrip(emit: (e: DwgBitEmitter) => void): DwgBitReader {
  const emitter = new DwgBitEmitter();
  emit(emitter);
  return new DwgBitReader(new BoundedByteCursor(emitter.toBytes()));
}

test("propiedad: RC/RS/RL crudos hacen ida y vuelta exacta", () => {
  const rng = createRng("props:raw");
  for (let index = 0; index < CASES; index += 1) {
    const rc = Math.floor(rng() * 256);
    const rs = Math.floor(rng() * 65536);
    const rl = Math.floor(rng() * 4294967296);
    const reader = roundTrip((e) => {
      e.emitRC(rc);
      e.emitRS(rs);
      e.emitRL(rl);
    });
    assert.equal(reader.readRC(), rc);
    assert.equal(reader.readRS(), rs);
    assert.equal(reader.readRL(), rl);
  }
});

test("propiedad: BS y BL con sus formas cortas hacen ida y vuelta", () => {
  const rng = createRng("props:bsbl");
  for (let index = 0; index < CASES; index += 1) {
    const shape = rng();
    const bs =
      shape < 0.25 ? 0 : shape < 0.5 ? 256 : shape < 0.75 ? Math.floor(rng() * 256) : Math.floor(rng() * 65536);
    const bl = shape < 0.3 ? 0 : shape < 0.6 ? Math.floor(rng() * 256) : Math.floor(rng() * 4294967296);
    const reader = roundTrip((e) => {
      e.emitBS(bs);
      e.emitBL(bl);
    });
    assert.equal(reader.readBS(), bs);
    assert.equal(reader.readBL(), bl);
  }
});

test("propiedad: BD y RD conservan cada double bit a bit (−0.0 incluido)", () => {
  const rng = createRng("props:doubles");
  for (let index = 0; index < CASES; index += 1) {
    const bd = randomDouble(rng);
    const rd = randomDouble(rng);
    const reader = roundTrip((e) => {
      e.emitBD(bd);
      e.emitRD(rd);
    });
    assert.ok(Object.is(reader.readBD(), bd), `BD ${bd}`);
    assert.ok(Object.is(reader.readRD(), rd), `RD ${rd}`);
  }
});

test("propiedad: DD contra su defecto hace ida y vuelta en las formas emitidas", () => {
  const rng = createRng("props:dd");
  for (let index = 0; index < CASES; index += 1) {
    const defaultValue = randomDouble(rng);
    // El emisor sólo usa las formas 00 (igual al defecto) y 11 (RD completo).
    const value = rng() < 0.4 ? defaultValue : randomDouble(rng);
    const reader = roundTrip((e) => e.emitDD(value, defaultValue));
    assert.ok(Object.is(reader.readDD(defaultValue), value), `DD ${value}`);
  }
});

test("propiedad: BT y BE con sus atajos hacen ida y vuelta", () => {
  const rng = createRng("props:btbe");
  for (let index = 0; index < CASES; index += 1) {
    const thickness = rng() < 0.5 ? 0 : randomDouble(rng);
    const canonical = rng() < 0.5;
    const extrusion = canonical
      ? { x: 0, y: 0, z: 1 }
      : { x: randomDouble(rng), y: randomDouble(rng), z: randomDouble(rng) };
    const reader = roundTrip((e) => {
      e.emitBT(thickness);
      e.emitBE(extrusion);
    });
    assert.ok(Object.is(reader.readBT(), thickness));
    const decoded = reader.readBE();
    assert.ok(Object.is(decoded.x, extrusion.x));
    assert.ok(Object.is(decoded.y, extrusion.y));
    assert.ok(Object.is(decoded.z, extrusion.z));
  }
});

test("propiedad: H conserva código y valor en todo el rango seguro", () => {
  const rng = createRng("props:handles");
  for (let index = 0; index < CASES; index += 1) {
    const code = Math.floor(rng() * 13);
    const bytes = Math.floor(rng() * 7);
    const value =
      bytes === 0 ? 0 : Math.floor(rng() * 2 ** Math.min(8 * bytes, 52)) + 1;
    const reader = roundTrip((e) => e.emitH(code, value));
    const decoded = reader.readH();
    assert.equal(decoded.code, code);
    assert.equal(decoded.value, value);
  }
});

test("propiedad: TV conserva longitud y bytes exactos", () => {
  const rng = createRng("props:tv");
  for (let index = 0; index < CASES; index += 1) {
    const length = Math.floor(rng() * 300);
    const bytes = Array.from({ length }, () => Math.floor(rng() * 256));
    const reader = roundTrip((e) => e.emitTV(bytes));
    const decoded = reader.readTV();
    assert.deepEqual([...decoded.bytes], bytes);
  }
});

test("propiedad: secuencias mixtas largas hacen ida y vuelta en orden", () => {
  const rng = createRng("props:mixed");
  for (let round = 0; round < 20; round += 1) {
    const plan: Array<{ kind: string; value: unknown; extra?: number }> = [];
    for (let index = 0; index < 60; index += 1) {
      const pick = Math.floor(rng() * 6);
      if (pick === 0) plan.push({ kind: "bs", value: Math.floor(rng() * 65536) });
      else if (pick === 1) plan.push({ kind: "bl", value: Math.floor(rng() * 4294967296) });
      else if (pick === 2) plan.push({ kind: "bd", value: randomDouble(rng) });
      else if (pick === 3) plan.push({ kind: "bit", value: rng() < 0.5 ? 1 : 0 });
      else if (pick === 4) plan.push({ kind: "rc", value: Math.floor(rng() * 256) });
      else {
        const defaultValue = randomDouble(rng);
        plan.push({
          kind: "dd",
          value: rng() < 0.5 ? defaultValue : randomDouble(rng),
          extra: defaultValue,
        });
      }
    }
    const reader = roundTrip((e) => {
      for (const step of plan) {
        if (step.kind === "bs") e.emitBS(step.value as number);
        else if (step.kind === "bl") e.emitBL(step.value as number);
        else if (step.kind === "bd") e.emitBD(step.value as number);
        else if (step.kind === "bit") e.pushBit(step.value as 0 | 1);
        else if (step.kind === "rc") e.emitRC(step.value as number);
        else e.emitDD(step.value as number, step.extra as number);
      }
    });
    for (const step of plan) {
      if (step.kind === "bs") assert.equal(reader.readBS(), step.value);
      else if (step.kind === "bl") assert.equal(reader.readBL(), step.value);
      else if (step.kind === "bd") assert.ok(Object.is(reader.readBD(), step.value as number));
      else if (step.kind === "bit") assert.equal(reader.readB(), step.value);
      else if (step.kind === "rc") assert.equal(reader.readRC(), step.value);
      else assert.ok(Object.is(reader.readDD(step.extra as number), step.value as number));
    }
  }
});
