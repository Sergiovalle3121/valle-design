import type { DwgLimits } from "../api/limits.js";
import {
  assertNonNegativeSafeInteger,
  checkedAdd,
  checkedMultiply,
} from "../binary/checked-arithmetic.js";
import { inspectOrdinaryByteView } from "../security/byte-view.js";
import {
  createOwnedDwgBytes,
  type DwgByteSequence,
} from "../security/owned-bytes.js";
import { throwDwgError } from "../security/parse-error.js";
import type { ResourceBudget } from "../security/resource-budget.js";
import { assertDwgHandle, type DwgHandle } from "./handle.js";
import { assertDwgReference, type DwgReference } from "./reference.js";

const ARRAY_OVERHEAD_BYTES = 128;
const ARRAY_SLOT_BYTES = 16;
const OPAQUE_OBJECT_OVERHEAD_BYTES = 256;
const EMPTY_REFERENCES: readonly DwgReference[] = Object.freeze([]);
const OWNED_OPAQUE_DWG_OBJECTS = new WeakSet<object>();

export interface OpaqueDwgObject {
  readonly representation: "opaque";
  readonly typeTag: number;
  readonly handle: DwgHandle;
  readonly owner: DwgHandle | null;
  readonly references: readonly DwgReference[];
  readonly rawPayload: DwgByteSequence;
}

export interface OpaqueDwgObjectInput {
  readonly typeTag: number;
  readonly handle: DwgHandle;
  readonly owner?: DwgHandle | null;
  readonly references?: readonly DwgReference[];
  readonly rawPayload: Uint8Array;
}

function copyBoundedReferences(
  value: unknown,
  maximum: number,
  budget?: ResourceBudget,
): readonly DwgReference[] {
  if (value === undefined) return EMPTY_REFERENCES;
  let isArray = false;
  try {
    isArray = Array.isArray(value);
  } catch {
    // The typed error below deliberately hides hostile proxy details.
  }
  if (!isArray) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "Opaque object references must be an array.",
    );
  }
  const array = value as readonly unknown[];

  let length: number;
  try {
    length = array.length;
  } catch {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "Opaque object references cannot be inspected.",
    );
  }
  if (!Number.isSafeInteger(length) || length < 0) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "Opaque object references have an invalid length.",
    );
  }
  if (length > maximum) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "resource",
      0,
      "An opaque object exceeds the reference limit.",
    );
  }

  budget?.assertWorkAvailable(length, 0);
  const retainedBytes = checkedAdd(
    ARRAY_OVERHEAD_BYTES,
    checkedMultiply(length, ARRAY_SLOT_BYTES),
  );
  budget?.reserveMemory(retainedBytes, 0);
  let succeeded = false;
  try {
    const copy = new Array<DwgReference>(length);
    for (let index = 0; index < length; index += 1) {
      budget?.consume(1, index);
      let reference: unknown;
      try {
        reference = array[index];
      } catch {
        throwDwgError(
          "DWG_INPUT_INVALID",
          "input",
          0,
          "Opaque object references changed during their bounded copy.",
        );
      }
      assertDwgReference(reference);
      copy[index] = reference;
    }
    try {
      if (array.length !== length) throw new TypeError("length changed");
    } catch {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "Opaque object references changed during their bounded copy.",
      );
    }
    succeeded = true;
    return Object.freeze(copy);
  } finally {
    if (!succeeded) budget?.releaseMemory(retainedBytes, 0);
  }
}

export function createOpaqueDwgObject(
  input: OpaqueDwgObjectInput,
  limits: DwgLimits,
  budget?: ResourceBudget,
): OpaqueDwgObject {
  const memoryCheckpoint = budget?.memoryBytes ?? 0;
  let succeeded = false;
  try {
    budget?.consume(1, 0);
    let typeTag: unknown;
    let handle: unknown;
    let owner: unknown;
    let referenceInput: unknown;
    let rawPayload: unknown;
    try {
      typeTag = input.typeTag;
      handle = input.handle;
      owner = input.owner;
      referenceInput = input.references;
      rawPayload = input.rawPayload;
    } catch {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "An opaque object input cannot be inspected.",
      );
    }

    if (typeof typeTag !== "number") {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "An opaque object type tag must be a number.",
      );
    }
    const normalizedTypeTag = assertNonNegativeSafeInteger(typeTag);
    assertDwgHandle(handle);
    const normalizedOwner = owner === undefined ? null : owner;
    if (normalizedOwner !== null) assertDwgHandle(normalizedOwner);
    const inspectedPayload = inspectOrdinaryByteView(rawPayload);
    if (inspectedPayload.byteLength > limits.maxExpandedBytes) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "resource",
        0,
        "An opaque object payload exceeds the expanded-byte limit.",
      );
    }
    const references = copyBoundedReferences(
      referenceInput,
      limits.maxReferences,
      budget,
    );

    budget?.reserveMemory(OPAQUE_OBJECT_OVERHEAD_BYTES, 0);
    const object = Object.freeze({
      representation: "opaque" as const,
      typeTag: normalizedTypeTag,
      handle,
      owner: normalizedOwner,
      references,
      rawPayload: createOwnedDwgBytes(inspectedPayload.view, budget),
    });
    OWNED_OPAQUE_DWG_OBJECTS.add(object);
    succeeded = true;
    return object;
  } finally {
    if (!succeeded && budget !== undefined) {
      const reserved = budget.memoryBytes - memoryCheckpoint;
      if (reserved > 0) budget.releaseMemory(reserved, 0);
    }
  }
}

export function assertOpaqueDwgObject(
  value: unknown,
): asserts value is OpaqueDwgObject {
  if (
    typeof value !== "object" ||
    value === null ||
    !OWNED_OPAQUE_DWG_OBJECTS.has(value)
  ) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "An opaque object must be created by this codec instance.",
    );
  }
}
