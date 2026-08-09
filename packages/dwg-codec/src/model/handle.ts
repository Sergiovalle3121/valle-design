import { inspectOrdinaryByteView } from "../security/byte-view.js";
import {
  assertOwnedDwgByteSequence,
  createOwnedDwgBytes,
  dwgHexResultReservationBytes,
  type DwgByteSequence,
} from "../security/owned-bytes.js";
import { throwDwgError } from "../security/parse-error.js";
import type { ResourceBudget } from "../security/resource-budget.js";

const HANDLE_OVERHEAD_BYTES = 256;
const OWNED_DWG_HANDLES = new WeakSet<object>();

export interface DwgHandle {
  readonly kind: "handle";
  readonly bytes: DwgByteSequence;
}

export function createDwgHandle(
  bytes: Uint8Array,
  maximumBytes = 32,
  budget?: ResourceBudget,
): DwgHandle {
  const memoryCheckpoint = budget?.memoryBytes ?? 0;
  let succeeded = false;
  try {
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
    budget?.reserveMemory(HANDLE_OVERHEAD_BYTES, 0);
    const handle = Object.freeze({
      kind: "handle" as const,
      bytes: createOwnedDwgBytes(inspected.view, budget),
    });
    OWNED_DWG_HANDLES.add(handle);
    succeeded = true;
    return handle;
  } finally {
    if (!succeeded && budget !== undefined) {
      const reserved = budget.memoryBytes - memoryCheckpoint;
      if (reserved > 0) budget.releaseMemory(reserved, 0);
    }
  }
}

export function assertDwgHandle(value: unknown): asserts value is DwgHandle {
  if (
    typeof value !== "object" ||
    value === null ||
    !OWNED_DWG_HANDLES.has(value)
  ) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A neutral handle must be created by this codec instance.",
    );
  }
}

export function dwgHandleKey(
  handle: DwgHandle,
  budget?: ResourceBudget,
): string {
  assertDwgHandle(handle);
  assertOwnedDwgByteSequence(handle.bytes);
  return handle.bytes.toHex(budget);
}

export function dwgHandleKeyReservationBytes(handle: DwgHandle): number {
  assertDwgHandle(handle);
  return dwgHexResultReservationBytes(handle.bytes);
}

export function sameDwgHandle(left: DwgHandle, right: DwgHandle): boolean {
  assertDwgHandle(left);
  assertDwgHandle(right);
  return left.bytes.equals(right.bytes);
}
