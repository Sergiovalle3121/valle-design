import { throwDwgError } from "../security/parse-error.js";
import type { ResourceBudget } from "../security/resource-budget.js";

export type DecimalDigit =
  "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
export type DwgSignatureCode = `AC10${DecimalDigit}${DecimalDigit}`;

export interface DwgSignature {
  readonly code: DwgSignatureCode;
  readonly bytes: readonly [65, 67, 49, 48, number, number];
}

const PREFIX = Object.freeze([65, 67, 49, 48] as const);
const DIGITS = Object.freeze([
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
] as const);

function expectedAt(index: number, value: number): boolean {
  if (index < PREFIX.length) {
    return value === PREFIX[index];
  }
  return value >= 48 && value <= 57;
}

export function detectDwgSignature(
  bytes: Uint8Array,
  budget: ResourceBudget,
): DwgSignature {
  const inspected = Math.min(bytes.byteLength, 6);
  for (let index = 0; index < inspected; index += 1) {
    budget.consume(1, index);
    if (!expectedAt(index, bytes[index]!)) {
      throwDwgError(
        "DWG_SIGNATURE_INVALID",
        "input",
        index,
        "The input does not contain a strict AC10dd signature at offset zero.",
      );
    }
  }
  if (bytes.byteLength < 6) {
    throwDwgError(
      "DWG_SIGNATURE_TRUNCATED",
      "input",
      bytes.byteLength,
      "The AC10dd signature is truncated.",
    );
  }

  const highValue = bytes[4]! - 48;
  const lowValue = bytes[5]! - 48;
  const high = DIGITS[highValue];
  const low = DIGITS[lowValue];
  if (high === undefined || low === undefined) {
    throwDwgError(
      "DWG_SIGNATURE_INVALID",
      "input",
      high === undefined ? 4 : 5,
      "The input does not contain a strict AC10dd signature at offset zero.",
    );
  }

  return Object.freeze({
    code: `AC10${high}${low}`,
    bytes: Object.freeze([65, 67, 49, 48, bytes[4]!, bytes[5]!] as const),
  });
}
