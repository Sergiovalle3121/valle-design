import { BoundedByteCursor } from "./byte-cursor.js";
import { throwDwgError } from "../security/parse-error.js";

export type BitOrder = "least-significant-first" | "most-significant-first";

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
    const bit = Math.floor(this.#currentByte / 2 ** shift) % 2;
    this.#bitsRemaining -= 1;
    this.#bitPosition += 1;
    return bit === 0 ? 0 : 1;
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

    let result = 0;
    for (let index = 0; index < bitCount; index += 1) {
      const bit = this.readBit();
      result =
        this.#order === "least-significant-first"
          ? result + bit * 2 ** index
          : result * 2 + bit;
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
