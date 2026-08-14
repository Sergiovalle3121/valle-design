/**
 * Spec de los códigos de bits DWG.
 *
 * Los vectores se construyen A MANO con un empaquetador de bits first-party
 * (MSB-first, como lee el formato): así cada caso dice exactamente qué bits
 * entran y qué valor debe salir, y el gemelo triste —truncado, bandera
 * reservada, contador imposible— comprueba que el lector falla CERRADO con el
 * error tipado, nunca con un valor a medias.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { BoundedByteCursor } from "../../src/binary/byte-cursor.js";
import {
  DwgBitReader,
  resolveDwgHandleReference,
} from "../../src/codecs/bitcodes.js";
import { assertDwgError } from "../support/assert.js";

/** Empaquetador MSB-first: espejo de cómo el formato serializa sus bits. */
class BitBuilder {
  #bits: Array<0 | 1> = [];

  bit(value: 0 | 1): this {
    this.#bits.push(value);
    return this;
  }

  bits(value: number, width: number): this {
    for (let index = width - 1; index >= 0; index -= 1) {
      this.bit(((value >> index) & 1) as 0 | 1);
    }
    return this;
  }

  byte(value: number): this {
    return this.bits(value, 8);
  }

  bytes(...values: number[]): this {
    for (const value of values) this.byte(value);
    return this;
  }

  /** Double IEEE little-endian, byte a byte. */
  doubleLE(value: number): this {
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, value, true);
    for (let index = 0; index < 8; index += 1) this.byte(view.getUint8(index));
    return this;
  }

  reader(): DwgBitReader {
    const byteLength = Math.ceil(this.#bits.length / 8);
    const packed = new Uint8Array(byteLength);
    for (let index = 0; index < this.#bits.length; index += 1) {
      if (this.#bits[index] === 1) {
        packed[Math.floor(index / 8)]! |= 0x80 >> index % 8;
      }
    }
    return new DwgBitReader(new BoundedByteCursor(packed));
  }
}

test("B, BB y 3B leen sus bits en orden MSB-first", () => {
  const reader = new BitBuilder()
    .bit(1)
    .bits(0b10, 2)
    .bits(0b101, 3)
    .reader();
  assert.equal(reader.readB(), 1);
  assert.equal(reader.readBB(), 0b10);
  assert.equal(reader.read3B(), 0b101);
});

test("RC/RS/RL/RD componen bytes little-endian dentro del flujo de bits", () => {
  const reader = new BitBuilder()
    .byte(0xab)
    .bytes(0x34, 0x12)
    .bytes(0x78, 0x56, 0x34, 0x12)
    .doubleLE(-123.456)
    .reader();
  assert.equal(reader.readRC(), 0xab);
  assert.equal(reader.readRS(), 0x1234);
  assert.equal(reader.readRL(), 0x12345678);
  assert.equal(reader.readRD(), -123.456);
});

test("los crudos no exigen alineación: un bit de por medio no los rompe", () => {
  const reader = new BitBuilder().bit(1).byte(0x5a).reader();
  assert.equal(reader.readB(), 1);
  assert.equal(reader.readRC(), 0x5a);
});

test("BS: literal de 16, byte corto, cero y el atajo 256", () => {
  const reader = new BitBuilder()
    .bits(0b00, 2)
    .bytes(0x34, 0x12)
    .bits(0b01, 2)
    .byte(0x2a)
    .bits(0b10, 2)
    .bits(0b11, 2)
    .reader();
  assert.equal(reader.readBS(), 0x1234);
  assert.equal(reader.readBS(), 42);
  assert.equal(reader.readBS(), 0);
  assert.equal(reader.readBS(), 256);
});

test("BL: literal de 32, byte corto y cero; la bandera 11 es corrupción", () => {
  const reader = new BitBuilder()
    .bits(0b00, 2)
    .bytes(0x78, 0x56, 0x34, 0x12)
    .bits(0b01, 2)
    .byte(0x07)
    .bits(0b10, 2)
    .reader();
  assert.equal(reader.readBL(), 0x12345678);
  assert.equal(reader.readBL(), 7);
  assert.equal(reader.readBL(), 0);

  const invalid = new BitBuilder().bits(0b11, 2).reader();
  assertDwgError(() => invalid.readBL(), "DWG_STRUCTURE_CORRUPT");
});

test("BD: double literal, los atajos 1.0 y 0.0, y la bandera 11 corrupta", () => {
  const reader = new BitBuilder()
    .bits(0b00, 2)
    .doubleLE(2.5)
    .bits(0b01, 2)
    .bits(0b10, 2)
    .reader();
  assert.equal(reader.readBD(), 2.5);
  assert.equal(reader.readBD(), 1);
  assert.equal(reader.readBD(), 0);

  const invalid = new BitBuilder().bits(0b11, 2).reader();
  assertDwgError(() => invalid.readBD(), "DWG_STRUCTURE_CORRUPT");
});

test("2BD y 3BD encadenan doubles con banderas mixtas", () => {
  const reader = new BitBuilder()
    .bits(0b01, 2)
    .bits(0b10, 2)
    .bits(0b00, 2)
    .doubleLE(4.25)
    .bits(0b01, 2)
    .bits(0b10, 2)
    .reader();
  assert.deepEqual(reader.read2BD(), { x: 1, y: 0 });
  assert.deepEqual(reader.read3BD(), { x: 4.25, y: 1, z: 0 });
});

test("DD devuelve el defecto, parchea 4 o 6 bytes bajos o trae el double entero", () => {
  const untouched = new BitBuilder().bits(0b00, 2).reader();
  assert.equal(untouched.readDD(9.75), 9.75);

  const full = new BitBuilder().bits(0b11, 2).doubleLE(-1.5).reader();
  assert.equal(full.readDD(9.75), -1.5);

  // Parche de 4 bytes: se sustituyen los 4 bytes BAJOS de la representación
  // LE del defecto. Construimos el esperado con la misma aritmética de vista
  // para que el caso no dependa de ninguna constante mágica.
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, 9.75, true);
  view.setUint8(0, 0x11);
  view.setUint8(1, 0x22);
  view.setUint8(2, 0x33);
  view.setUint8(3, 0x44);
  const expected4 = view.getFloat64(0, true);
  const patch4 = new BitBuilder()
    .bits(0b01, 2)
    .bytes(0x11, 0x22, 0x33, 0x44)
    .reader();
  assert.equal(patch4.readDD(9.75), expected4);

  view.setFloat64(0, 9.75, true);
  for (let index = 0; index < 6; index += 1) view.setUint8(index, 0x50 + index);
  const expected6 = view.getFloat64(0, true);
  const patch6 = new BitBuilder()
    .bits(0b10, 2)
    .bytes(0x50, 0x51, 0x52, 0x53, 0x54, 0x55)
    .reader();
  assert.equal(patch6.readDD(9.75), expected6);
});

test("BT y BE comprimen el caso común en un solo bit", () => {
  const thickness = new BitBuilder()
    .bit(1)
    .bit(0)
    .bits(0b00, 2)
    .doubleLE(12.5)
    .reader();
  assert.equal(thickness.readBT(), 0);
  assert.equal(thickness.readBT(), 12.5);

  const extrusion = new BitBuilder()
    .bit(1)
    .bit(0)
    .bits(0b01, 2)
    .bits(0b10, 2)
    .bits(0b01, 2)
    .reader();
  assert.deepEqual(extrusion.readBE(), { x: 0, y: 0, z: 1 });
  assert.deepEqual(extrusion.readBE(), { x: 1, y: 0, z: 1 });
});

test("el modular char compone 7 bits por byte, del menos al más significativo", () => {
  const reader = new BitBuilder()
    .byte(0x00)
    .byte(0x7f)
    .bytes(0x80 | 0x02, 0x01)
    .bytes(0x80 | 0x00, 0x80 | 0x00, 0x04)
    .reader();
  assert.equal(reader.readUnsignedMC(), 0);
  assert.equal(reader.readUnsignedMC(), 127);
  assert.equal(reader.readUnsignedMC(), 0x82);
  assert.equal(reader.readUnsignedMC(), 4 * 0x80 * 0x80);
});

test("el modular char con signo guarda el signo en el bit 0x40 del último byte", () => {
  const reader = new BitBuilder()
    .byte(0x40 | 0x05)
    .byte(0x05)
    .bytes(0x80 | 0x01, 0x40 | 0x01)
    .reader();
  assert.equal(reader.readSignedMC(), -5);
  assert.equal(reader.readSignedMC(), 5);
  assert.equal(reader.readSignedMC(), -(1 + 0x80));
});

test("un modular char que nunca termina es corrupción, no un bucle", () => {
  const endless = new BitBuilder()
    .bytes(0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80)
    .reader();
  assertDwgError(() => endless.readUnsignedMC(), "DWG_STRUCTURE_CORRUPT");
});

test("el modular short compone palabras de 15 bits little-endian", () => {
  const reader = new BitBuilder()
    .bytes(0x34, 0x12)
    .bytes(0x01, 0x80, 0x02, 0x00)
    .reader();
  assert.equal(reader.readMS(), 0x1234);
  assert.equal(reader.readMS(), 1 + 2 * 0x8000);
});

test("los handles llevan código, contador y bytes big-endian", () => {
  const reader = new BitBuilder()
    .bits(0x4, 4)
    .bits(2, 4)
    .bytes(0x01, 0xf2)
    .bits(0x0, 4)
    .bits(0, 4)
    .reader();
  const absolute = reader.readH();
  assert.deepEqual(
    { code: absolute.code, value: absolute.value, byteLength: absolute.byteLength },
    { code: 0x4, value: 0x01f2, byteLength: 2 },
  );
  const nullReference = reader.readH();
  assert.deepEqual(
    {
      code: nullReference.code,
      value: nullReference.value,
      byteLength: nullReference.byteLength,
    },
    { code: 0, value: 0, byteLength: 0 },
  );
});

test("un contador de handle de ocho bytes falla cerrado", () => {
  const oversized = new BitBuilder()
    .bits(0x4, 4)
    .bits(8, 4)
    .bytes(1, 2, 3, 4, 5, 6, 7, 8)
    .reader();
  assertDwgError(() => oversized.readH(), "DWG_STRUCTURE_CORRUPT");
});

test("resolver referencias: absolutas, ±1, offset y nula", () => {
  const absolute = resolveDwgHandleReference(
    { code: 0x2, value: 0x2f, byteLength: 1 },
    100,
  );
  assert.deepEqual(absolute, { kind: "absolute", handle: 0x2f });
  assert.deepEqual(
    resolveDwgHandleReference({ code: 0x6, value: 0, byteLength: 0 }, 100),
    { kind: "relative", handle: 101 },
  );
  assert.deepEqual(
    resolveDwgHandleReference({ code: 0x8, value: 0, byteLength: 0 }, 100),
    { kind: "relative", handle: 99 },
  );
  assert.deepEqual(
    resolveDwgHandleReference({ code: 0xa, value: 7, byteLength: 1 }, 100),
    { kind: "relative", handle: 107 },
  );
  assert.deepEqual(
    resolveDwgHandleReference({ code: 0xc, value: 7, byteLength: 1 }, 100),
    { kind: "relative", handle: 93 },
  );
  assert.deepEqual(
    resolveDwgHandleReference({ code: 0x0, value: 0, byteLength: 0 }, 100),
    { kind: "null", handle: 0 },
  );
});

test("resolver referencias imposibles falla cerrado", () => {
  assertDwgError(
    () => resolveDwgHandleReference({ code: 0xc, value: 200, byteLength: 1 }, 100),
    "DWG_STRUCTURE_CORRUPT",
  );
  assertDwgError(
    () => resolveDwgHandleReference({ code: 0xf, value: 1, byteLength: 1 }, 100),
    "DWG_STRUCTURE_CORRUPT",
  );
  assertDwgError(
    () => resolveDwgHandleReference({ code: 0x8, value: 0, byteLength: 0 }, 0),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("TV entrega los bytes exactos y declara su longitud", () => {
  const reader = new BitBuilder()
    .bits(0b01, 2)
    .byte(3)
    .bytes(0x56, 0x61, 0x6c)
    .reader();
  const text = reader.readTV();
  assert.equal(text.declaredLength, 3);
  assert.deepEqual(Array.from(text.bytes), [0x56, 0x61, 0x6c]);
});

test("un TV truncado falla cerrado sin entregar bytes parciales", () => {
  const truncated = new BitBuilder().bits(0b01, 2).byte(200).byte(0x41).reader();
  assertDwgError(() => truncated.readTV(), "DWG_STRUCTURE_CORRUPT");
});

test("CmC en forma R2000 es un índice BS", () => {
  const reader = new BitBuilder().bits(0b01, 2).byte(1).reader();
  assert.deepEqual(reader.readCmC(), { index: 1 });
});

test("todo código truncado a mitad falla con el error estructural tipado", () => {
  // El empaquetador rellena a byte completo, así que el truncado mínimo
  // representable es UN BYTE menos de lo que el código necesita.
  for (const [drain, build] of [
    [(r: DwgBitReader) => r.readBB(), () => new BitBuilder()],
    [(r: DwgBitReader) => r.readRS(), () => new BitBuilder().byte(0x10)],
    [(r: DwgBitReader) => r.readRD(), () => new BitBuilder().bytes(1, 2, 3)],
    [(r: DwgBitReader) => r.readBS(), () => new BitBuilder().bits(0b00, 2).byte(1)],
    [
      // El contador declara dos bytes de valor y el flujo sólo trae uno.
      (r: DwgBitReader) => r.readH(),
      () => new BitBuilder().bits(0x4, 4).bits(2, 4).byte(0x01),
    ],
    [
      (r: DwgBitReader) => r.readUnsignedMC(),
      () => new BitBuilder().byte(0x80 | 0x01),
    ],
  ] as const) {
    assertDwgError(() => drain(build().reader()), "DWG_STRUCTURE_CORRUPT");
  }
});

console.log(
  "bitcodes.spec: códigos de bits DWG verdes — B/BB/3B, crudos LE, BS/BL/BD/DD, BT/BE, modulares, handles, TV y CmC, con sus gemelos tristes fallando cerrados.",
);
