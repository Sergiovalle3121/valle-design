/**
 * Emisor de bits MSB-first del writer R2000 — extraído en la fase D4 (mismo
 * código de las fases D2/D3, movido para respetar el presupuesto de líneas).
 *
 * Es el espejo exacto de `DwgBitReader` (`src/codecs/bitcodes.ts`): mismo
 * orden de bits, mismos atajos BS/BL/BD/DD/BT/BE/H/TV, y por eso los tests de
 * round-trip delatan cualquier asimetría. Los atajos con valor por defecto
 * sólo se toman con igualdad EXACTA de bits (`Object.is`): un −0.0 viaja como
 * RD completo para que el round-trip devuelva el mismo double, bit a bit.
 *
 * Reglas del laboratorio: determinista, fallo cerrado ante valores fuera de
 * rango, presupuesto de bits de LABORATORIO por cuerpo y cero dependencias.
 * Hechos de ODA-ODS-DWG-5.4.1-PUBLIC (SOURCE_REGISTER); implementación
 * original; certezas y pendientes en DWG0_WORKLOG.
 */
import type { DwgPoint3 } from "../model/entity-geometry.js";
import { throwDwgError } from "../security/parse-error.js";

const FLOAT_SCRATCH = new DataView(new ArrayBuffer(8));

/** Tope de bits por cuerpo emitido: límite de LABORATORIO, no del formato. */
export const AC1015_ENTITY_WRITER_MAX_BITS = 0x1_0000;

/**
 * Emisor de bits MSB-first con todos los códigos que esta fase escribe. Es el
 * espejo de `DwgBitReader`: mismo orden de bits, mismos atajos, y por eso los
 * tests de round-trip delatan cualquier asimetría. Se exporta para que los
 * specs compongan también cuerpos HOSTILES a mano (gemelos tristes).
 */
export class DwgBitEmitter {
  readonly #bits: (0 | 1)[] = [];

  get bitLength(): number {
    return this.#bits.length;
  }

  pushBit(bit: 0 | 1): void {
    if (bit !== 0 && bit !== 1) {
      throwDwgError("DWG_INPUT_INVALID", "input", 0, "A bit must be 0 or 1.");
    }
    if (this.#bits.length >= AC1015_ENTITY_WRITER_MAX_BITS) {
      throwDwgError(
        "DWG_FILE_LIMIT_EXCEEDED",
        "resource",
        0,
        "An entity body exceeds the phase-D2 laboratory bit limit.",
      );
    }
    this.#bits.push(bit);
  }

  /** `width` bits de `value`, del más significativo al menos (como el lector). */
  pushBits(value: number, width: number): void {
    if (
      !Number.isSafeInteger(value) ||
      value < 0 ||
      !Number.isSafeInteger(width) ||
      width < 0 ||
      width > 32 ||
      value >= 2 ** width
    ) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "A bit field must be a non-negative integer that fits its width.",
      );
    }
    for (let shift = width - 1; shift >= 0; shift -= 1) {
      this.pushBit(Math.floor(value / 2 ** shift) % 2 === 1 ? 1 : 0);
    }
  }

  /** Replica los bits de otro emisor (composición en dos pasadas). */
  pushEmitter(other: DwgBitEmitter): void {
    for (const bit of other.#bits) {
      this.pushBit(bit);
    }
  }

  emitRC(value: number): void {
    this.pushBits(value, 8);
  }

  /** RS: 16 bits crudos, bytes little-endian dentro del flujo de bits. */
  emitRS(value: number): void {
    this.emitRC(value & 0xff);
    this.emitRC((value >> 8) & 0xff);
  }

  /** RL: 32 bits crudos, bytes little-endian. */
  emitRL(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "An RL value must fit in an unsigned 32-bit integer.",
      );
    }
    this.emitRS(value % 0x1_0000);
    this.emitRS(Math.floor(value / 0x1_0000));
  }

  /** RD: double IEEE-754 de 8 bytes little-endian. */
  emitRD(value: number): void {
    FLOAT_SCRATCH.setFloat64(0, value, true);
    for (let index = 0; index < 8; index += 1) {
      this.emitRC(FLOAT_SCRATCH.getUint8(index));
    }
  }

  /** BS: la forma más corta que el formato define (espejo de readBS). */
  emitBS(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "A BS value must fit in an unsigned 16-bit integer.",
      );
    }
    if (value === 0) {
      this.pushBits(0b10, 2);
    } else if (value === 256) {
      this.pushBits(0b11, 2);
    } else if (value <= 0xff) {
      this.pushBits(0b01, 2);
      this.emitRC(value);
    } else {
      this.pushBits(0b00, 2);
      this.emitRS(value);
    }
  }

  /** BL: como BS pero sin el atajo de 256 (la bandera 11 no existe). */
  emitBL(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "A BL value must fit in an unsigned 32-bit integer.",
      );
    }
    if (value === 0) {
      this.pushBits(0b10, 2);
    } else if (value <= 0xff) {
      this.pushBits(0b01, 2);
      this.emitRC(value);
    } else {
      this.pushBits(0b00, 2);
      this.emitRL(value);
    }
  }

  /**
   * BD: los atajos de 0.0 y 1.0 sólo se toman con igualdad EXACTA de bits
   * (`Object.is`): un −0.0 viaja como RD completo para que el round-trip
   * devuelva el mismo double, bit a bit.
   */
  emitBD(value: number): void {
    assertFiniteDouble(value);
    if (Object.is(value, 1)) {
      this.pushBits(0b01, 2);
    } else if (Object.is(value, 0)) {
      this.pushBits(0b10, 2);
    } else {
      this.pushBits(0b00, 2);
      this.emitRD(value);
    }
  }

  /**
   * DD: esta fase emite sólo las dos formas totales — 00 (igual al defecto,
   * con igualdad exacta) o 11 (RD completo). Los parches de 4/6 bytes son
   * formas de COMPRESIÓN opcionales que el lector ya acepta; no emitirlas es
   * válido y mantiene el writer simple y sin ambigüedad.
   */
  emitDD(value: number, defaultValue: number): void {
    assertFiniteDouble(value);
    if (Object.is(value, defaultValue)) {
      this.pushBits(0b00, 2);
    } else {
      this.pushBits(0b11, 2);
      this.emitRD(value);
    }
  }

  /** BT: grosor cero en un bit; cualquier otro, bit 0 + BD (espejo de readBT). */
  emitBT(value: number): void {
    assertFiniteDouble(value);
    if (Object.is(value, 0)) {
      this.pushBit(1);
    } else {
      this.pushBit(0);
      this.emitBD(value);
    }
  }

  /** BE: la extrusión canónica (0,0,1) en un bit; cualquier otra, 3BD. */
  emitBE(extrusion: DwgPoint3): void {
    if (
      Object.is(extrusion.x, 0) &&
      Object.is(extrusion.y, 0) &&
      Object.is(extrusion.z, 1)
    ) {
      this.pushBit(1);
    } else {
      this.pushBit(0);
      this.emitBD(extrusion.x);
      this.emitBD(extrusion.y);
      this.emitBD(extrusion.z);
    }
  }

  /**
   * TV: longitud BS + esos bytes tal cual (la página de códigos es de una
   * capa superior, igual que en `readTV`). Espejo exacto del lector.
   */
  emitTV(bytes: readonly number[]): void {
    if (!Array.isArray(bytes) || bytes.length > 0xffff) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "A text value needs at most 65535 byte values.",
      );
    }
    this.emitBS(bytes.length);
    for (const byte of bytes) {
      // pushBits valida que cada valor sea un entero de 0 a 255.
      this.emitRC(byte);
    }
  }

  /** H: código de 4 bits + contador + bytes big-endian mínimos del valor. */
  emitH(code: number, value: number): void {
    if (
      !Number.isInteger(code) ||
      code < 0 ||
      code > 0xf ||
      !Number.isSafeInteger(value) ||
      value < 0
    ) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "A handle needs a 4-bit code and a non-negative safe value.",
      );
    }
    const bytes: number[] = [];
    let rest = value;
    while (rest > 0) {
      bytes.unshift(rest % 0x100);
      rest = Math.floor(rest / 0x100);
    }
    this.pushBits(code, 4);
    this.pushBits(bytes.length, 4);
    for (const byte of bytes) {
      this.emitRC(byte);
    }
  }

  /** Bytes emitidos; los bits sobrantes del último byte quedan a cero. */
  toBytes(): Uint8Array {
    const bytes = new Uint8Array(Math.ceil(this.#bits.length / 8));
    this.#bits.forEach((bit, index) => {
      if (bit === 1) {
        bytes[Math.floor(index / 8)]! |= 1 << (7 - (index % 8));
      }
    });
    return bytes;
  }
}

/** NaN o ±Infinity no viajan: el emisor de doubles falla cerrado. */
function assertFiniteDouble(value: number): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A double field must be a finite number.",
    );
  }
}
