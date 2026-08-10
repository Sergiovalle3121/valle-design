import {
  assertNonNegativeSafeInteger,
  checkedRange,
} from "./checked-arithmetic.js";
import { throwDwgError } from "../security/parse-error.js";

export interface BoundedRange {
  readonly id: string;
  readonly start: number;
  readonly length: number;
  readonly end: number;
}

export class RangeTable {
  readonly #containerLength: number;
  readonly #maximumRanges: number;
  readonly #ranges: BoundedRange[] = [];

  constructor(containerLength: number, maximumRanges: number) {
    this.#containerLength = assertNonNegativeSafeInteger(containerLength);
    this.#maximumRanges = assertNonNegativeSafeInteger(maximumRanges);
    if (maximumRanges === 0) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "A range table must allow at least one range.",
      );
    }
  }

  get size(): number {
    return this.#ranges.length;
  }

  get ranges(): readonly BoundedRange[] {
    return Object.freeze([...this.#ranges]);
  }

  add(id: string, start: number, length: number): BoundedRange {
    if (typeof id !== "string" || id.length === 0) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        start,
        "A range identifier is missing.",
      );
    }
    if (this.#ranges.length >= this.#maximumRanges) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "resource",
        start,
        "The range count exceeds its configured limit.",
      );
    }
    const checked = checkedRange(start, length, this.#containerLength, start);
    for (const existing of this.#ranges) {
      if (
        existing.id === id ||
        (existing.start === start && existing.length === length)
      ) {
        throwDwgError(
          "DWG_STRUCTURE_CORRUPT",
          "input",
          start,
          "A duplicate binary range was rejected.",
        );
      }
      if (start < existing.end && existing.start < checked.end) {
        throwDwgError(
          "DWG_STRUCTURE_CORRUPT",
          "input",
          start,
          "Overlapping binary ranges were rejected.",
        );
      }
    }

    const range: BoundedRange = Object.freeze({ id, ...checked });
    this.#ranges.push(range);
    this.#ranges.sort((left, right) => left.start - right.start);
    return range;
  }
}
