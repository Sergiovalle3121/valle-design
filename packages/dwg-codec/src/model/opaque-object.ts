import type { DwgLimits } from "../api/limits.js";
import { assertNonNegativeSafeInteger } from "../binary/checked-arithmetic.js";
import {
  frozenByteValues,
  inspectOrdinaryByteView,
} from "../security/byte-view.js";
import { throwDwgError } from "../security/parse-error.js";
import type { DwgHandle } from "./handle.js";
import type { DwgReference } from "./reference.js";

export interface OpaqueDwgObject {
  readonly representation: "opaque";
  readonly typeTag: number;
  readonly handle: DwgHandle;
  readonly owner: DwgHandle | null;
  readonly references: readonly DwgReference[];
  readonly rawPayload: readonly number[];
}

export interface OpaqueDwgObjectInput {
  readonly typeTag: number;
  readonly handle: DwgHandle;
  readonly owner?: DwgHandle | null;
  readonly references?: readonly DwgReference[];
  readonly rawPayload: Uint8Array;
}

function copyBoundedReferences(
  value: readonly DwgReference[] | undefined,
  maximum: number,
): readonly DwgReference[] {
  if (value === undefined) return Object.freeze([]);
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

  let length: number;
  try {
    length = value.length;
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

  const copy = new Array<DwgReference>(length);
  try {
    for (let index = 0; index < length; index += 1) {
      copy[index] = value[index]!;
    }
    if (value.length !== length) throw new TypeError("length changed");
  } catch {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "Opaque object references changed during their bounded copy.",
    );
  }
  return Object.freeze(copy);
}

export function createOpaqueDwgObject(
  input: OpaqueDwgObjectInput,
  limits: DwgLimits,
): OpaqueDwgObject {
  assertNonNegativeSafeInteger(input.typeTag);
  const inspectedPayload = inspectOrdinaryByteView(input.rawPayload);
  if (inspectedPayload.byteLength > limits.maxExpandedBytes) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "resource",
      0,
      "An opaque object payload exceeds the expanded-byte limit.",
    );
  }
  const references = copyBoundedReferences(
    input.references,
    limits.maxReferences,
  );

  return Object.freeze({
    representation: "opaque",
    typeTag: input.typeTag,
    handle: input.handle,
    owner: input.owner ?? null,
    references,
    rawPayload: frozenByteValues(inspectedPayload),
  });
}
