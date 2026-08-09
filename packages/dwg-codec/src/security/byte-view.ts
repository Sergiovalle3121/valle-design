import { throwDwgError } from "./parse-error.js";

type IntrinsicGetter = (this: unknown) => unknown;

export interface InspectedByteView {
  readonly byteLength: number;
  readonly view: Uint8Array;
}

function requiredGetter(
  prototype: object,
  property: PropertyKey,
): IntrinsicGetter {
  const getter = Object.getOwnPropertyDescriptor(prototype, property)?.get;
  if (getter === undefined) {
    throw new Error("Required typed-array intrinsic is unavailable.");
  }
  return getter;
}

const OWNED_UINT8_ARRAY = Uint8Array;
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(
  Uint8Array.prototype,
) as object;
const TYPED_ARRAY_TAG = requiredGetter(
  TYPED_ARRAY_PROTOTYPE,
  Symbol.toStringTag,
);
const TYPED_ARRAY_BUFFER = requiredGetter(TYPED_ARRAY_PROTOTYPE, "buffer");
const TYPED_ARRAY_BYTE_LENGTH = requiredGetter(
  TYPED_ARRAY_PROTOTYPE,
  "byteLength",
);
const ARRAY_BUFFER_BYTE_LENGTH = requiredGetter(
  ArrayBuffer.prototype,
  "byteLength",
);
const SHARED_ARRAY_BUFFER_BYTE_LENGTH =
  typeof SharedArrayBuffer === "undefined"
    ? undefined
    : requiredGetter(SharedArrayBuffer.prototype, "byteLength");
const TYPED_ARRAY_SET = Uint8Array.prototype.set;
const EMPTY_BYTES = new OWNED_UINT8_ARRAY();

function applyGetter(getter: IntrinsicGetter, value: unknown): unknown {
  return Reflect.apply(getter, value, []);
}

function matchesBufferIntrinsic(
  value: unknown,
  getter: IntrinsicGetter | undefined,
): boolean {
  if (getter === undefined) return false;
  try {
    applyGetter(getter, value);
    return true;
  } catch {
    return false;
  }
}

export function inspectOrdinaryByteView(input: unknown): InspectedByteView {
  try {
    if (applyGetter(TYPED_ARRAY_TAG, input) !== "Uint8Array") {
      throw new TypeError("not Uint8Array");
    }
  } catch {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The DWG laboratory accepts only Uint8Array bytes.",
    );
  }

  let backing: unknown;
  try {
    backing = applyGetter(TYPED_ARRAY_BUFFER, input);
  } catch {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The Uint8Array backing storage is invalid.",
    );
  }
  if (matchesBufferIntrinsic(backing, SHARED_ARRAY_BUFFER_BYTE_LENGTH)) {
    throwDwgError(
      "DWG_SHARED_BUFFER_REJECTED",
      "input",
      0,
      "SharedArrayBuffer-backed views are not accepted.",
    );
  }
  if (!matchesBufferIntrinsic(backing, ARRAY_BUFFER_BYTE_LENGTH)) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The Uint8Array backing storage is invalid.",
    );
  }

  try {
    Reflect.apply(TYPED_ARRAY_SET, input, [EMPTY_BYTES, 0]);
    const byteLength = applyGetter(TYPED_ARRAY_BYTE_LENGTH, input);
    if (
      typeof byteLength !== "number" ||
      !Number.isSafeInteger(byteLength) ||
      byteLength < 0
    ) {
      throw new TypeError("invalid byte length");
    }
    return Object.freeze({
      byteLength,
      view: input as Uint8Array,
    });
  } catch {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A detached or invalid Uint8Array is not accepted.",
    );
  }
}

export function copyInspectedByteView(
  inspected: InspectedByteView,
): Uint8Array<ArrayBuffer> {
  const current = inspectOrdinaryByteView(inspected.view);
  if (current.byteLength !== inspected.byteLength) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The Uint8Array length changed before its bounded copy.",
    );
  }
  const copy = new OWNED_UINT8_ARRAY(current.byteLength);
  try {
    Reflect.apply(TYPED_ARRAY_SET, copy, [current.view, 0]);
  } catch {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The Uint8Array could not be copied into owned storage.",
    );
  }
  return copy;
}

export function frozenByteValues(
  inspected: InspectedByteView,
): readonly number[] {
  const copy = copyInspectedByteView(inspected);
  const values = new Array<number>(copy.byteLength);
  for (let index = 0; index < copy.byteLength; index += 1) {
    values[index] = copy[index]!;
  }
  return Object.freeze(values);
}
