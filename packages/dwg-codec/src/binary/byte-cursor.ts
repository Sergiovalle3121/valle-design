import {
  assertNonNegativeSafeInteger,
  checkedRange,
} from "./checked-arithmetic.js";
import {
  copyInspectedByteView,
  inspectOrdinaryByteView,
} from "../security/byte-view.js";
import { throwDwgError } from "../security/parse-error.js";
import type { ResourceBudget } from "../security/resource-budget.js";

export class BoundedByteCursor {
  readonly #bytes: Uint8Array<ArrayBuffer>;
  readonly #length: number;
  readonly #budget: ResourceBudget | undefined;
  #operationActive = false;
  #position = 0;

  constructor(bytes: Uint8Array, budget?: ResourceBudget) {
    const inspected = inspectOrdinaryByteView(bytes);
    budget?.consume(inspected.byteLength, 0);
    this.#bytes = copyInspectedByteView(inspected);
    this.#length = inspected.byteLength;
    this.#budget = budget;
    budget?.checkpoint(this.#length, true);
  }

  get position(): number {
    return this.#position;
  }

  get length(): number {
    return this.#length;
  }

  get remaining(): number {
    return this.length - this.#position;
  }

  seek(position: number): void {
    this.assertNotReentrant();
    assertNonNegativeSafeInteger(position, this.#position);
    if (position > this.length) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        this.#position,
        "A cursor seek is outside the input.",
      );
    }
    this.#position = position;
  }

  skip(length: number): void {
    this.assertNotReentrant();
    const range = checkedRange(
      this.#position,
      length,
      this.length,
      this.#position,
    );
    this.consumeBudget(length, this.#position);
    this.#position = range.end;
  }

  readUint8(): number {
    this.assertNotReentrant();
    const offset = this.#position;
    this.ensureAvailable(1);
    this.consumeBudget(1, offset);
    const value = this.#bytes[offset]!;
    this.#position += 1;
    return value;
  }

  readUint16LE(): number {
    const offset = this.reserveRead(2);
    const low = this.#bytes[offset]!;
    const high = this.#bytes[offset + 1]!;
    return low + high * 0x100;
  }

  readUint16BE(): number {
    const offset = this.reserveRead(2);
    const high = this.#bytes[offset]!;
    const low = this.#bytes[offset + 1]!;
    return high * 0x100 + low;
  }

  readUint32LE(): number {
    const offset = this.reserveRead(4);
    const byte0 = this.#bytes[offset]!;
    const byte1 = this.#bytes[offset + 1]!;
    const byte2 = this.#bytes[offset + 2]!;
    const byte3 = this.#bytes[offset + 3]!;
    return byte0 + byte1 * 0x100 + byte2 * 0x1_0000 + byte3 * 0x100_0000;
  }

  readUint32BE(): number {
    const offset = this.reserveRead(4);
    const byte3 = this.#bytes[offset]!;
    const byte2 = this.#bytes[offset + 1]!;
    const byte1 = this.#bytes[offset + 2]!;
    const byte0 = this.#bytes[offset + 3]!;
    return byte3 * 0x100_0000 + byte2 * 0x1_0000 + byte1 * 0x100 + byte0;
  }

  readBytes(length: number): Uint8Array<ArrayBuffer> {
    this.assertNotReentrant();
    const offset = this.#position;
    const range = checkedRange(offset, length, this.length, offset);
    this.consumeBudget(length, offset);
    const copy = new Uint8Array(length);
    // set(subarray) es un memcpy nativo; la copia byte a byte que hubo aquí
    // era el coste dominante en archivos con secciones largas. subarray no
    // toca los bytes fuente: la vista muere dentro de esta línea.
    copy.set(this.#bytes.subarray(range.start, range.end));
    this.#position = range.end;
    return copy;
  }

  private ensureAvailable(length: number): void {
    checkedRange(this.#position, length, this.length, this.#position);
  }

  private assertNotReentrant(): void {
    if (this.#operationActive) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        this.#position,
        "Reentrant byte-cursor access is not permitted.",
      );
    }
  }

  private consumeBudget(length: number, offset: number): void {
    if (this.#budget === undefined) return;
    this.#operationActive = true;
    try {
      this.#budget.consume(length, offset);
    } finally {
      this.#operationActive = false;
    }
  }

  private reserveRead(length: number): number {
    this.assertNotReentrant();
    const offset = this.#position;
    this.ensureAvailable(length);
    this.consumeBudget(length, offset);
    this.#position += length;
    return offset;
  }
}
