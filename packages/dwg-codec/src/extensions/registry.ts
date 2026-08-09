import type { DwgVersionCode } from "../container/version-registry.js";
import { lookupDwgVersion } from "../container/version-registry.js";
import { throwDwgError } from "../security/parse-error.js";

const MAX_EXTENSION_ITEMS = 1_024;
const OWNED_ARRAY = Array;
const OWNED_ARRAY_PROTOTYPE = Array.prototype;
const OWNED_MAP = Map;
const OWNED_OBJECT_PROTOTYPE = Object.prototype;
const OWNED_SET = Set;
const INTRINSIC_ARRAY_IS_ARRAY = Array.isArray;
const INTRINSIC_GET_OWN_PROPERTY_DESCRIPTOR = Reflect.getOwnPropertyDescriptor;
const INTRINSIC_GET_PROTOTYPE_OF = Reflect.getPrototypeOf;
const INTRINSIC_MAP_GET = Map.prototype.get;
const INTRINSIC_MAP_HAS = Map.prototype.has;
const INTRINSIC_MAP_SET = Map.prototype.set;
const INTRINSIC_OBJECT_CREATE = Object.create;
const INTRINSIC_OBJECT_FREEZE = Object.freeze;
const INTRINSIC_OWN_KEYS = Reflect.ownKeys;
const INTRINSIC_REFLECT_APPLY = Reflect.apply;
const INTRINSIC_REGEXP_TEST = RegExp.prototype.test;
const INTRINSIC_SET_ADD = Set.prototype.add;
const INTRINSIC_SET_HAS = Set.prototype.has;
const CODEC_ID_PATTERN = /^[a-z0-9][a-z0-9.-]{0,127}$/;
const OBJECT_TYPE_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;
const CODEC_FIELDS = INTRINSIC_OBJECT_FREEZE([
  "id",
  "schemaVersion",
  "origin",
  "supportedVersions",
  "objectTypes",
] as const);

export interface DwgExtensionCodec {
  readonly id: string;
  readonly schemaVersion: number;
  readonly origin: "valle-first-party";
  readonly supportedVersions: readonly DwgVersionCode[];
  readonly objectTypes: readonly string[];
}

export interface DwgExtensionRegistry {
  readonly schemaVersion: 1;
  readonly codecs: readonly DwgExtensionCodec[];
  get(codecId: string): DwgExtensionCodec | null;
}

function invalid(message: string): never {
  throwDwgError("DWG_INPUT_INVALID", "input", 0, message);
}

function isCodecField(value: string): boolean {
  for (let index = 0; index < CODEC_FIELDS.length; index += 1) {
    if (CODEC_FIELDS[index] === value) return true;
  }
  return false;
}

function copyDenseArray(value: unknown, label: string): readonly unknown[] {
  let isArray = false;
  let prototype: object | null = null;
  let lengthDescriptor: PropertyDescriptor | undefined;
  try {
    isArray = INTRINSIC_REFLECT_APPLY(INTRINSIC_ARRAY_IS_ARRAY, Array, [
      value,
    ]) as boolean;
    if (isArray && typeof value === "object" && value !== null) {
      prototype = INTRINSIC_REFLECT_APPLY(INTRINSIC_GET_PROTOTYPE_OF, Reflect, [
        value,
      ]) as object | null;
      lengthDescriptor = INTRINSIC_REFLECT_APPLY(
        INTRINSIC_GET_OWN_PROPERTY_DESCRIPTOR,
        Reflect,
        [value, "length"],
      ) as PropertyDescriptor | undefined;
    }
  } catch {
    invalid(`${label} cannot be inspected.`);
  }
  if (
    !isArray ||
    prototype !== OWNED_ARRAY_PROTOTYPE ||
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0 ||
    lengthDescriptor.value > MAX_EXTENSION_ITEMS
  ) {
    invalid(`${label} must be a bounded ordinary array.`);
  }

  const length = lengthDescriptor.value as number;
  const copy = new OWNED_ARRAY<unknown>(length);
  for (let index = 0; index < length; index += 1) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = INTRINSIC_REFLECT_APPLY(
        INTRINSIC_GET_OWN_PROPERTY_DESCRIPTOR,
        Reflect,
        [value, String(index)],
      ) as PropertyDescriptor | undefined;
    } catch {
      invalid(`${label} cannot be inspected.`);
    }
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      invalid(`${label} must be dense and contain only data elements.`);
    }
    copy[index] = descriptor.value;
  }
  return INTRINSIC_OBJECT_FREEZE(copy);
}

function copyCodecRecord(value: unknown): Readonly<Record<string, unknown>> {
  let prototype: object | null = null;
  let keys: readonly PropertyKey[] = [];
  try {
    if (typeof value === "object" && value !== null) {
      prototype = INTRINSIC_REFLECT_APPLY(INTRINSIC_GET_PROTOTYPE_OF, Reflect, [
        value,
      ]) as object | null;
      keys = INTRINSIC_REFLECT_APPLY(INTRINSIC_OWN_KEYS, Reflect, [
        value,
      ]) as readonly PropertyKey[];
    }
  } catch {
    invalid("An extension codec descriptor cannot be inspected.");
  }
  if (
    typeof value !== "object" ||
    value === null ||
    (prototype !== OWNED_OBJECT_PROTOTYPE && prototype !== null) ||
    keys.length !== CODEC_FIELDS.length
  ) {
    invalid("An extension codec descriptor must be a plain data object.");
  }
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== "string" || !isCodecField(key)) {
      invalid("An extension codec descriptor contains an unknown field.");
    }
  }

  const copy = INTRINSIC_OBJECT_CREATE(null) as Record<string, unknown>;
  for (let index = 0; index < CODEC_FIELDS.length; index += 1) {
    const key = CODEC_FIELDS[index]!;
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = INTRINSIC_REFLECT_APPLY(
        INTRINSIC_GET_OWN_PROPERTY_DESCRIPTOR,
        Reflect,
        [value, key],
      ) as PropertyDescriptor | undefined;
    } catch {
      invalid("An extension codec descriptor cannot be inspected.");
    }
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      invalid("An extension codec descriptor must use enumerable data fields.");
    }
    copy[key] = descriptor.value;
  }
  return INTRINSIC_OBJECT_FREEZE(copy);
}

function copyStrings(
  value: unknown,
  label: string,
  validate: (item: string) => boolean,
): readonly string[] {
  const values = copyDenseArray(value, label);
  const seen = new OWNED_SET<string>();
  const copy = new OWNED_ARRAY<string>(values.length);
  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];
    if (
      typeof item !== "string" ||
      !validate(item) ||
      INTRINSIC_REFLECT_APPLY(INTRINSIC_SET_HAS, seen, [item])
    ) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        `${label} contains an invalid or duplicate value.`,
      );
    }
    INTRINSIC_REFLECT_APPLY(INTRINSIC_SET_ADD, seen, [item]);
    copy[index] = item;
  }
  return INTRINSIC_OBJECT_FREEZE(copy);
}

function copyCodec(value: unknown): DwgExtensionCodec {
  const record = copyCodecRecord(value);
  const id = record.id;
  const schemaVersion = record.schemaVersion;
  const origin = record.origin;
  const supportedVersions = record.supportedVersions;
  const objectTypes = record.objectTypes;
  if (
    typeof id !== "string" ||
    !INTRINSIC_REFLECT_APPLY(INTRINSIC_REGEXP_TEST, CODEC_ID_PATTERN, [id]) ||
    !Number.isSafeInteger(schemaVersion) ||
    (schemaVersion as number) < 1 ||
    origin !== "valle-first-party"
  ) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "An extension codec descriptor is invalid or is not first-party.",
    );
  }
  const versions = copyStrings(
    supportedVersions,
    "Extension versions",
    (version) => lookupDwgVersion(version) !== null,
  ) as readonly DwgVersionCode[];
  const types = copyStrings(objectTypes, "Extension object types", (type) =>
    INTRINSIC_REFLECT_APPLY(INTRINSIC_REGEXP_TEST, OBJECT_TYPE_PATTERN, [type]),
  );
  return INTRINSIC_OBJECT_FREEZE({
    id,
    schemaVersion: schemaVersion as number,
    origin,
    supportedVersions: versions,
    objectTypes: types,
  });
}

export function createDwgExtensionRegistry(
  codecs: readonly DwgExtensionCodec[],
): DwgExtensionRegistry {
  const values = copyDenseArray(codecs, "Extension codecs");
  const byId = new OWNED_MAP<string, DwgExtensionCodec>();
  const copies = new OWNED_ARRAY<DwgExtensionCodec>(values.length);
  for (let index = 0; index < values.length; index += 1) {
    const copy = copyCodec(values[index]);
    if (INTRINSIC_REFLECT_APPLY(INTRINSIC_MAP_HAS, byId, [copy.id])) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "The extension registry contains a duplicate codec id.",
      );
    }
    INTRINSIC_REFLECT_APPLY(INTRINSIC_MAP_SET, byId, [copy.id, copy]);
    copies[index] = copy;
  }
  const frozen = INTRINSIC_OBJECT_FREEZE(copies);
  return INTRINSIC_OBJECT_FREEZE({
    schemaVersion: 1 as const,
    codecs: frozen,
    get(codecId: string): DwgExtensionCodec | null {
      return (
        (INTRINSIC_REFLECT_APPLY(INTRINSIC_MAP_GET, byId, [codecId]) as
          DwgExtensionCodec | undefined) ?? null
      );
    },
  });
}
