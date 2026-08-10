import assert from "node:assert/strict";
import {
  DwgParseError,
  type DwgErrorCode,
} from "../../src/security/parse-error.js";

export function ascii(value: string): Uint8Array {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

export function assertDwgError(
  action: () => unknown,
  expectedCode: DwgErrorCode,
): DwgParseError {
  let caught: unknown;
  try {
    action();
  } catch (error: unknown) {
    caught = error;
  }
  assert.ok(caught instanceof DwgParseError, "expected a typed DwgParseError");
  assert.equal(caught.detail.code, expectedCode);
  assert.equal(Number.isSafeInteger(caught.detail.offset), true);
  assert.ok(caught.detail.offset >= 0);
  return caught;
}
