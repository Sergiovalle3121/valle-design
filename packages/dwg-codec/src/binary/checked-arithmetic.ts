import { throwDwgError } from "../security/parse-error.js";

function corrupt(offset: number, message: string): never {
  const normalizedOffset =
    Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
  throwDwgError("DWG_STRUCTURE_CORRUPT", "input", normalizedOffset, message);
}

export function assertNonNegativeSafeInteger(
  value: number,
  offset = 0,
): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    corrupt(offset, "A binary integer is outside the non-negative safe range.");
  }
  return value;
}

export function checkedAdd(left: number, right: number, offset = 0): number {
  assertNonNegativeSafeInteger(left, offset);
  assertNonNegativeSafeInteger(right, offset);
  if (right > Number.MAX_SAFE_INTEGER - left) {
    corrupt(offset, "Binary integer addition overflowed.");
  }
  return left + right;
}

export function checkedSubtract(
  left: number,
  right: number,
  offset = 0,
): number {
  assertNonNegativeSafeInteger(left, offset);
  assertNonNegativeSafeInteger(right, offset);
  if (right > left) {
    corrupt(offset, "Binary integer subtraction underflowed.");
  }
  return left - right;
}

export function checkedMultiply(
  left: number,
  right: number,
  offset = 0,
): number {
  assertNonNegativeSafeInteger(left, offset);
  assertNonNegativeSafeInteger(right, offset);
  if (left !== 0 && right > Math.floor(Number.MAX_SAFE_INTEGER / left)) {
    corrupt(offset, "Binary integer multiplication overflowed.");
  }
  return left * right;
}

export function checkedBigIntToNumber(
  value: bigint,
  maximum = Number.MAX_SAFE_INTEGER,
  offset = 0,
): number {
  assertNonNegativeSafeInteger(maximum, offset);
  if (value < 0n || value > BigInt(maximum)) {
    corrupt(
      offset,
      "A binary integer cannot be represented within the configured range.",
    );
  }
  return Number(value);
}

export interface CheckedRange {
  readonly start: number;
  readonly length: number;
  readonly end: number;
}

export function checkedRange(
  start: number,
  length: number,
  containerLength: number,
  errorOffset = start,
): CheckedRange {
  assertNonNegativeSafeInteger(start, errorOffset);
  assertNonNegativeSafeInteger(length, errorOffset);
  assertNonNegativeSafeInteger(containerLength, errorOffset);
  const end = checkedAdd(start, length, errorOffset);
  if (end > containerLength) {
    corrupt(errorOffset, "A binary range extends outside its container.");
  }
  return Object.freeze({ start, length, end });
}
