import {
  frozenByteValues,
  inspectOrdinaryByteView,
} from "../security/byte-view.js";
import { throwDwgError } from "../security/parse-error.js";

export interface DwgHandle {
  readonly kind: "handle";
  readonly bytes: readonly number[];
}

export function createDwgHandle(
  bytes: Uint8Array,
  maximumBytes = 32,
): DwgHandle {
  const inspected = inspectOrdinaryByteView(bytes);
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The handle byte limit is invalid.",
    );
  }
  if (inspected.byteLength === 0 || inspected.byteLength > maximumBytes) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      0,
      "A neutral handle has an invalid bounded length.",
    );
  }
  return Object.freeze({
    kind: "handle",
    bytes: frozenByteValues(inspected),
  });
}

export function dwgHandleKey(handle: DwgHandle): string {
  return handle.bytes
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function sameDwgHandle(left: DwgHandle, right: DwgHandle): boolean {
  if (left.bytes.length !== right.bytes.length) return false;
  return left.bytes.every((byte, index) => byte === right.bytes[index]);
}
