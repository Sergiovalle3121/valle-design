import { assertDwgHandle, type DwgHandle } from "./handle.js";
import { throwDwgError } from "../security/parse-error.js";
import type { ResourceBudget } from "../security/resource-budget.js";

const REFERENCE_OBJECT_OVERHEAD_BYTES = 256;
const OWNED_DWG_REFERENCES = new WeakSet<object>();

export type DwgReferenceRole = "owner" | "reference";

export interface DwgReference {
  readonly role: DwgReferenceRole;
  readonly source: DwgHandle;
  readonly target: DwgHandle;
}

export function createDwgReference(
  role: DwgReferenceRole,
  source: DwgHandle,
  target: DwgHandle,
  budget?: ResourceBudget,
): DwgReference {
  if (role !== "owner" && role !== "reference") {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A neutral reference role is invalid.",
    );
  }
  assertDwgHandle(source);
  assertDwgHandle(target);
  budget?.consume(1, 0);
  const memoryCheckpoint = budget?.memoryBytes ?? 0;
  let succeeded = false;
  try {
    budget?.reserveMemory(REFERENCE_OBJECT_OVERHEAD_BYTES, 0);
    const reference = Object.freeze({ role, source, target });
    OWNED_DWG_REFERENCES.add(reference);
    succeeded = true;
    return reference;
  } finally {
    if (!succeeded && budget !== undefined) {
      const reserved = budget.memoryBytes - memoryCheckpoint;
      if (reserved > 0) budget.releaseMemory(reserved, 0);
    }
  }
}

export function assertDwgReference(
  value: unknown,
): asserts value is DwgReference {
  if (
    typeof value !== "object" ||
    value === null ||
    !OWNED_DWG_REFERENCES.has(value)
  ) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A neutral reference must be created by this codec instance.",
    );
  }
}
