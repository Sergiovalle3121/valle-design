import {
  checkedAdd,
  checkedMultiply,
  checkedRange,
} from "../binary/checked-arithmetic.js";
import { copyInspectedByteView, inspectOrdinaryByteView } from "./byte-view.js";
import { isInputSnapshot, type DwgInputSnapshot } from "./input-snapshot.js";
import { throwDwgError } from "./parse-error.js";
import type { ResourceBudget } from "./resource-budget.js";

// These are deliberately conservative accounting units, not claims about a
// particular JavaScript engine's object layout. The outer worker deadline
// remains responsible for runtime/GC overhead that cannot be measured exactly.
const BYTE_SEQUENCE_OVERHEAD_BYTES = 256;
const BYTE_ARRAY_OVERHEAD_BYTES = 128;
const HEX_RESULT_OVERHEAD_BYTES = 128;
const HEX_SCRATCH_OVERHEAD_BYTES = 64 * 1_024;
const HEX_RESULT_BYTES_PER_INPUT_BYTE = 4;
const HEX_SCRATCH_BYTES_PER_INPUT_BYTE = 8;
const HEX_CHUNK_CODE_UNITS = 4_096;
const HEX_DIGIT_CODES = Object.freeze([
  0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x61, 0x62, 0x63,
  0x64, 0x65, 0x66,
]);
const OWNED_DWG_BYTE_SEQUENCES = new WeakSet<object>();

/**
 * Immutable, compact byte storage for the neutral model.
 *
 * The backing typed array is never exposed. A sequence may own a dedicated
 * copy or point at a bounded region of the single input snapshot.
 */
export interface DwgByteSequence {
  readonly byteLength: number;
  readonly length: number;
  at(index: number): number | undefined;
  equals(other: DwgByteSequence): boolean;
  toHex(budget?: ResourceBudget, offset?: number): string;
  toUint8Array(
    budget?: ResourceBudget,
    offset?: number,
  ): Uint8Array<ArrayBuffer>;
}

class ImmutableDwgBytes implements DwgByteSequence {
  readonly #storage: Uint8Array<ArrayBuffer>;
  readonly #start: number;
  readonly byteLength: number;

  public constructor(
    storage: Uint8Array<ArrayBuffer>,
    start: number,
    byteLength: number,
  ) {
    this.#storage = storage;
    this.#start = start;
    this.byteLength = byteLength;
    OWNED_DWG_BYTE_SEQUENCES.add(this);
    Object.freeze(this);
  }

  public get length(): number {
    return this.byteLength;
  }

  public at(index: number): number | undefined {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.byteLength) {
      return undefined;
    }
    return this.#storage[this.#start + index];
  }

  public equals(other: DwgByteSequence): boolean {
    assertOwnedDwgByteSequence(other);
    if (other.byteLength !== this.byteLength) return false;
    for (let index = 0; index < this.byteLength; index += 1) {
      if (this.at(index) !== other.at(index)) return false;
    }
    return true;
  }

  public toHex(budget?: ResourceBudget, offset = 0): string {
    const resultBytes = checkedAdd(
      HEX_RESULT_OVERHEAD_BYTES,
      checkedMultiply(this.byteLength, HEX_RESULT_BYTES_PER_INPUT_BYTE, offset),
      offset,
    );
    const scratchBytes = checkedAdd(
      HEX_SCRATCH_OVERHEAD_BYTES,
      checkedMultiply(
        this.byteLength,
        HEX_SCRATCH_BYTES_PER_INPUT_BYTE,
        offset,
      ),
      offset,
    );
    const peakBytes = checkedAdd(resultBytes, scratchBytes, offset);
    budget?.consume(this.byteLength, offset);
    budget?.reserveMemory(peakBytes, offset);
    let succeeded = false;
    try {
      const codeUnits = new Uint16Array(
        checkedMultiply(this.byteLength, 2, offset),
      );
      for (let index = 0; index < this.byteLength; index += 1) {
        const byte = this.#storage[this.#start + index]!;
        codeUnits[index * 2] = HEX_DIGIT_CODES[Math.floor(byte / 16)]!;
        codeUnits[index * 2 + 1] = HEX_DIGIT_CODES[byte % 16]!;
      }
      let value = "";
      for (
        let start = 0;
        start < codeUnits.length;
        start += HEX_CHUNK_CODE_UNITS
      ) {
        const end = Math.min(codeUnits.length, start + HEX_CHUNK_CODE_UNITS);
        value += String.fromCharCode(...codeUnits.subarray(start, end));
      }
      succeeded = true;
      return value;
    } finally {
      if (budget !== undefined) {
        budget.releaseMemory(succeeded ? scratchBytes : peakBytes, offset);
      }
    }
  }

  public toUint8Array(
    budget?: ResourceBudget,
    offset = 0,
  ): Uint8Array<ArrayBuffer> {
    const retainedBytes = checkedAdd(
      BYTE_ARRAY_OVERHEAD_BYTES,
      this.byteLength,
      offset,
    );
    budget?.consume(this.byteLength, offset);
    budget?.reserveMemory(retainedBytes, offset);
    try {
      const copy = new Uint8Array(this.byteLength);
      copy.set(
        this.#storage.subarray(this.#start, this.#start + this.byteLength),
      );
      return copy;
    } catch (error: unknown) {
      budget?.releaseMemory(retainedBytes, offset);
      throw error;
    }
  }
}

export function assertOwnedDwgByteSequence(
  value: unknown,
): asserts value is DwgByteSequence {
  if (
    typeof value !== "object" ||
    value === null ||
    !OWNED_DWG_BYTE_SEQUENCES.has(value)
  ) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A neutral byte sequence must be created by this codec instance.",
    );
  }
}

export function dwgHexResultReservationBytes(
  value: DwgByteSequence,
  offset = 0,
): number {
  assertOwnedDwgByteSequence(value);
  return checkedAdd(
    HEX_RESULT_OVERHEAD_BYTES,
    checkedMultiply(value.byteLength, HEX_RESULT_BYTES_PER_INPUT_BYTE, offset),
    offset,
  );
}

export function createOwnedDwgBytes(
  input: Uint8Array,
  budget?: ResourceBudget,
  offset = 0,
): DwgByteSequence {
  const inspected = inspectOrdinaryByteView(input);
  const retainedBytes = checkedAdd(
    inspected.byteLength,
    BYTE_SEQUENCE_OVERHEAD_BYTES,
    offset,
  );
  budget?.consume(inspected.byteLength, offset);
  budget?.reserveMemory(retainedBytes, offset);
  try {
    const copy = copyInspectedByteView(inspected);
    return new ImmutableDwgBytes(copy, 0, copy.byteLength);
  } catch (error: unknown) {
    budget?.releaseMemory(retainedBytes, offset);
    throw error;
  }
}

export function createSnapshotDwgBytes(
  snapshot: DwgInputSnapshot,
  start: number,
  byteLength: number,
  budget?: ResourceBudget,
): DwgByteSequence {
  if (!isInputSnapshot(snapshot)) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A byte span requires an owned DWG input snapshot.",
    );
  }
  const range = checkedRange(start, byteLength, snapshot.byteLength, start);
  budget?.consume(1, start);
  budget?.reserveMemory(BYTE_SEQUENCE_OVERHEAD_BYTES, start);
  try {
    return new ImmutableDwgBytes(snapshot, range.start, range.length);
  } catch (error: unknown) {
    budget?.releaseMemory(BYTE_SEQUENCE_OVERHEAD_BYTES, start);
    throw error;
  }
}
