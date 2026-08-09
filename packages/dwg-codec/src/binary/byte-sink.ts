import { inspectOrdinaryByteView } from "../security/byte-view.js";
import { throwDwgError } from "../security/parse-error.js";
import type { ResourceBudget } from "../security/resource-budget.js";

const MAX_UINT8 = 0xff;
const MAX_UINT16 = 0xffff;
const MAX_UINT32 = 0xffff_ffff;

function boundedUnsigned(value: number, maximum: number, offset: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      offset,
      "A binary output value is outside its unsigned integer range.",
    );
  }
}

export class ByteSink {
  readonly #maximumByteLength: number;
  readonly #budget: ResourceBudget | undefined;
  #bytes: Uint8Array<ArrayBuffer>;
  #length = 0;

  public constructor(
    maximumByteLength: number,
    budget?: ResourceBudget,
    initialCapacity = 256,
  ) {
    if (!Number.isSafeInteger(maximumByteLength) || maximumByteLength < 1) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "The output byte limit must be a positive safe integer.",
      );
    }
    if (!Number.isSafeInteger(initialCapacity) || initialCapacity < 0) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "The output sink initial capacity is invalid.",
      );
    }
    this.#maximumByteLength = maximumByteLength;
    this.#budget = budget;
    const capacity = Math.min(maximumByteLength, Math.max(1, initialCapacity));
    this.#budget?.reserveMemory(capacity, 0);
    this.#bytes = new Uint8Array(capacity);
  }

  public get byteLength(): number {
    return this.#length;
  }

  public get remaining(): number {
    return this.#maximumByteLength - this.#length;
  }

  public writeUint8(value: number): void {
    boundedUnsigned(value, MAX_UINT8, this.#length);
    this.reserve(1);
    this.#bytes[this.#length] = value;
    this.#length += 1;
  }

  public writeUint16LE(value: number): void {
    boundedUnsigned(value, MAX_UINT16, this.#length);
    this.reserve(2);
    this.#bytes[this.#length] = value % 0x100;
    this.#bytes[this.#length + 1] = Math.floor(value / 0x100);
    this.#length += 2;
  }

  public writeUint16BE(value: number): void {
    boundedUnsigned(value, MAX_UINT16, this.#length);
    this.reserve(2);
    this.#bytes[this.#length] = Math.floor(value / 0x100);
    this.#bytes[this.#length + 1] = value % 0x100;
    this.#length += 2;
  }

  public writeUint32LE(value: number): void {
    boundedUnsigned(value, MAX_UINT32, this.#length);
    this.reserve(4);
    this.#bytes[this.#length] = value % 0x100;
    this.#bytes[this.#length + 1] = Math.floor(value / 0x100) % 0x100;
    this.#bytes[this.#length + 2] = Math.floor(value / 0x1_0000) % 0x100;
    this.#bytes[this.#length + 3] = Math.floor(value / 0x100_0000);
    this.#length += 4;
  }

  public writeUint32BE(value: number): void {
    boundedUnsigned(value, MAX_UINT32, this.#length);
    this.reserve(4);
    this.#bytes[this.#length] = Math.floor(value / 0x100_0000);
    this.#bytes[this.#length + 1] = Math.floor(value / 0x1_0000) % 0x100;
    this.#bytes[this.#length + 2] = Math.floor(value / 0x100) % 0x100;
    this.#bytes[this.#length + 3] = value % 0x100;
    this.#length += 4;
  }

  public writeBytes(value: Uint8Array): void {
    const inspected = inspectOrdinaryByteView(value);
    this.reserve(inspected.byteLength);
    this.#budget?.reserveMemory(inspected.byteLength, this.#length);
    try {
      const snapshot = new Uint8Array(inspected.byteLength);
      snapshot.set(inspected.view);
      this.#bytes.set(snapshot, this.#length);
      this.#length += snapshot.byteLength;
    } finally {
      this.#budget?.releaseMemory(inspected.byteLength, this.#length);
    }
  }

  public toUint8Array(): Uint8Array<ArrayBuffer> {
    this.#budget?.consume(this.#length, this.#length);
    this.#budget?.reserveMemory(this.#length, this.#length);
    const output = new Uint8Array(this.#length);
    output.set(this.#bytes.subarray(0, this.#length));
    return output;
  }

  private reserve(byteLength: number): void {
    if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        this.#length,
        "The output reservation length is invalid.",
      );
    }
    if (byteLength > this.remaining) {
      throwDwgError(
        "DWG_OUTPUT_LIMIT_EXCEEDED",
        "resource",
        this.#length,
        "The bounded output sink exceeded its byte limit.",
      );
    }
    this.#budget?.consume(byteLength, this.#length);
    const required = this.#length + byteLength;
    if (required <= this.#bytes.byteLength) return;
    let capacity = this.#bytes.byteLength;
    while (capacity < required) {
      capacity = Math.min(this.#maximumByteLength, capacity * 2);
    }
    this.#budget?.reserveMemory(capacity, this.#length);
    const grown = new Uint8Array(capacity);
    grown.set(this.#bytes.subarray(0, this.#length));
    this.#budget?.releaseMemory(this.#bytes.byteLength, this.#length);
    this.#bytes = grown;
  }
}
