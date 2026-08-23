import { BoundedByteCursor } from "./byte-cursor.js";
import { throwDwgError } from "../security/parse-error.js";

export type BitOrder = "least-significant-first" | "most-significant-first";

/**
 * Powers of two for chunk widths 0..8 — a chunk never exceeds the 8 bits of
 * one byte, so this is the whole table `readBits` needs to accumulate a
 * multi-bit chunk without calling `Math.pow`/`**` on the hot path.
 */
const BYTE_CHUNK_POW2: readonly number[] = Object.freeze([
  1, 2, 4, 8, 16, 32, 64, 128, 256,
]);

export class BitCursor {
  readonly #bytes: BoundedByteCursor;
  readonly #order: BitOrder;
  #currentByte = 0;
  #bitsRemaining = 0;
  #bitPosition: number;

  constructor(
    bytes: BoundedByteCursor,
    order: BitOrder = "least-significant-first",
  ) {
    if (!(bytes instanceof BoundedByteCursor)) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "A bit cursor requires a bounded byte cursor.",
      );
    }
    if (
      order !== "least-significant-first" &&
      order !== "most-significant-first"
    ) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        bytes.position,
        "The requested bit order is invalid.",
      );
    }
    this.#bytes = bytes;
    this.#order = order;
    this.#bitPosition = bytes.position * 8;
  }

  get position(): number {
    return this.#bitPosition;
  }

  get remaining(): number {
    return this.#bitsRemaining + this.#bytes.remaining * 8;
  }

  get aligned(): boolean {
    return this.#bitsRemaining === 0;
  }

  readBit(): 0 | 1 {
    if (this.#bitsRemaining === 0) {
      this.#currentByte = this.#bytes.readUint8();
      this.#bitsRemaining = 8;
    }
    const shift =
      this.#order === "least-significant-first"
        ? 8 - this.#bitsRemaining
        : this.#bitsRemaining - 1;
    this.#bitsRemaining -= 1;
    this.#bitPosition += 1;
    // #currentByte is always an unsigned byte (0-255) fresh off readUint8()
    // and shift is always 0-7, so an integer shift+mask is exactly
    // equivalent to the previous `Math.floor(x / 2 ** shift) % 2` — just
    // without the float division, exponentiation and modulo on the hottest
    // call in the whole decoder (profiled at ~38% of self time).
    return ((this.#currentByte >>> shift) & 1) as 0 | 1;
  }

  readBits(bitCount: number): number {
    if (!Number.isSafeInteger(bitCount) || bitCount < 0 || bitCount > 32) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        Math.floor(this.#bitPosition / 8),
        "A bit-field width must be between zero and 32.",
      );
    }
    if (bitCount > this.remaining) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        Math.floor(this.#bitPosition / 8),
        "A bit read extends outside the input.",
      );
    }

    // Bits are pulled in byte-sized (or smaller, at a boundary) CHUNKS
    // instead of one `readBit()` call per bit: same bit sequence and the
    // same numeric result as the original bit-by-bit loop, with far fewer
    // function calls and branches on a path that profiled at ~13% of
    // self-time. Each chunk take is bounded by the 8 bits of a byte, so the
    // shift/mask staying within Int32 range is always safe.
    let result = 0;
    let remainingBits = bitCount;
    let consumedBits = 0;
    const leastSignificantFirst = this.#order === "least-significant-first";
    while (remainingBits > 0) {
      if (this.#bitsRemaining === 0) {
        this.#currentByte = this.#bytes.readUint8();
        this.#bitsRemaining = 8;
      }
      const take =
        remainingBits < this.#bitsRemaining
          ? remainingBits
          : this.#bitsRemaining;
      const mask = BYTE_CHUNK_POW2[take]! - 1;
      if (leastSignificantFirst) {
        const shift = 8 - this.#bitsRemaining;
        const chunk = (this.#currentByte >>> shift) & mask;
        result += chunk * 2 ** consumedBits;
      } else {
        const shift = this.#bitsRemaining - take;
        const chunk = (this.#currentByte >>> shift) & mask;
        result = result * BYTE_CHUNK_POW2[take]! + chunk;
      }
      this.#bitsRemaining -= take;
      this.#bitPosition += take;
      remainingBits -= take;
      consumedBits += take;
    }
    return result;
  }

  alignToByte(): number {
    const discarded = this.#bitsRemaining;
    this.#bitsRemaining = 0;
    this.#bitPosition += discarded;
    return discarded;
  }

  requireByteAlignment(): void {
    if (!this.aligned) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        Math.floor(this.#bitPosition / 8),
        "The bit cursor is not byte-aligned.",
      );
    }
  }
}
