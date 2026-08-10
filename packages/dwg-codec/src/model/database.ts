import type { DwgDiagnostic, DwgLossEntry } from "../api/diagnostics.js";
import type { DwgLimits } from "../api/limits.js";
import { checkedAdd } from "../binary/checked-arithmetic.js";
import { throwDwgError } from "../security/parse-error.js";
import { dwgHandleKey } from "./handle.js";
import type { OpaqueDwgObject } from "./opaque-object.js";
import type { DwgSymbolTable } from "./symbol-table.js";

export interface DwgDatabaseFoundation {
  readonly status: "foundation-only";
  readonly objectDatabaseComplete: false;
  readonly objects: readonly OpaqueDwgObject[];
  readonly symbolTables: readonly DwgSymbolTable[];
  readonly diagnostics: readonly DwgDiagnostic[];
  readonly lossManifest: readonly DwgLossEntry[];
}

export interface DwgDatabaseFoundationInput {
  readonly objects?: readonly OpaqueDwgObject[];
  readonly symbolTables?: readonly DwgSymbolTable[];
  readonly diagnostics?: readonly DwgDiagnostic[];
  readonly lossManifest?: readonly DwgLossEntry[];
}

function copyBoundedArray<T>(
  value: readonly T[] | undefined,
  maximum: number,
  label: string,
): readonly T[] {
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
      `${label} must be an array.`,
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
      `${label} cannot be inspected.`,
    );
  }
  if (!Number.isSafeInteger(length) || length < 0) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      `${label} has an invalid length.`,
    );
  }
  if (length > maximum) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "resource",
      0,
      `${label} exceeds its configured count limit.`,
    );
  }
  const copy = new Array<T>(length);
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
      `${label} changed during its bounded copy.`,
    );
  }
  return Object.freeze(copy);
}

function boundedUtf8Length(
  value: unknown,
  maximum: number,
  label: string,
): number {
  if (typeof value !== "string") {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      `${label} must be a string.`,
    );
  }
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    let width: number;
    if (code <= 0x7f) width = 1;
    else if (code <= 0x7ff) width = 2;
    else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      index + 1 < value.length &&
      value.charCodeAt(index + 1) >= 0xdc00 &&
      value.charCodeAt(index + 1) <= 0xdfff
    ) {
      width = 4;
      index += 1;
    } else width = 3;
    if (width > maximum - bytes) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "resource",
        0,
        `${label} exceeds the configured string-byte limit.`,
      );
    }
    bytes += width;
  }
  return bytes;
}

function copyDiagnostic(
  diagnostic: DwgDiagnostic,
  limits: DwgLimits,
): Readonly<{ value: DwgDiagnostic; bytes: number }> {
  if (typeof diagnostic !== "object" || diagnostic === null) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A database diagnostic is invalid.",
    );
  }
  let code: unknown;
  let severity: unknown;
  let offset: unknown;
  let message: unknown;
  try {
    code = diagnostic.code;
    severity = diagnostic.severity;
    offset = diagnostic.offset;
    message = diagnostic.message;
  } catch {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A database diagnostic cannot be inspected.",
    );
  }
  if (
    !["info", "warning", "error"].includes(severity as string) ||
    !Number.isSafeInteger(offset) ||
    (offset as number) < 0
  ) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A database diagnostic is invalid.",
    );
  }
  const bytes = checkedAdd(
    boundedUtf8Length(code, limits.maxStringBytes, "A diagnostic code"),
    boundedUtf8Length(message, limits.maxStringBytes, "A diagnostic message"),
  );
  return Object.freeze({
    bytes,
    value: Object.freeze({
      code: code as string,
      severity: severity as DwgDiagnostic["severity"],
      offset: offset as number,
      message: message as string,
    }),
  });
}

function copyLossEntry(
  entry: DwgLossEntry,
  limits: DwgLimits,
): Readonly<{ value: DwgLossEntry; bytes: number }> {
  if (typeof entry !== "object" || entry === null) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A loss-manifest entry is invalid.",
    );
  }
  let code: unknown;
  let scope: unknown;
  let message: unknown;
  try {
    code = entry.code;
    scope = entry.scope;
    message = entry.message;
  } catch {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A loss-manifest entry cannot be inspected.",
    );
  }
  if (!["container", "database", "entity"].includes(scope as string)) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A loss-manifest entry is invalid.",
    );
  }
  const bytes = checkedAdd(
    boundedUtf8Length(code, limits.maxStringBytes, "A loss code"),
    boundedUtf8Length(message, limits.maxStringBytes, "A loss message"),
  );
  return Object.freeze({
    bytes,
    value: Object.freeze({
      code: code as string,
      scope: scope as DwgLossEntry["scope"],
      message: message as string,
    }),
  });
}

export function createDwgDatabaseFoundation(
  input: DwgDatabaseFoundationInput,
  limits: DwgLimits,
): DwgDatabaseFoundation {
  const objects = copyBoundedArray(
    input.objects,
    limits.maxObjects,
    "The neutral object collection",
  );
  const symbolTables = copyBoundedArray(
    input.symbolTables,
    limits.maxArrayLength,
    "The neutral symbol-table collection",
  );
  const diagnostics = copyBoundedArray(
    input.diagnostics,
    limits.maxArrayLength,
    "The diagnostic collection",
  );
  const lossManifest = copyBoundedArray(
    input.lossManifest,
    limits.maxArrayLength,
    "The loss manifest",
  );

  const definedHandles = new Set<string>();
  const observedHandles = new Set<string>();
  const objectOwners = new Map<string, string | null>();
  let referenceCount = 0;
  let expandedBytes = 0;
  const observeHandle = (key: string): void => {
    observedHandles.add(key);
    if (observedHandles.size > limits.maxHandles) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "resource",
        0,
        "The neutral model exceeds the handle limit.",
      );
    }
  };
  for (const object of objects) {
    const key = dwgHandleKey(object.handle);
    if (definedHandles.has(key)) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        0,
        "The neutral model contains a duplicate object handle.",
      );
    }
    definedHandles.add(key);
    observeHandle(key);
    const ownerKey = object.owner === null ? null : dwgHandleKey(object.owner);
    if (ownerKey !== null) {
      observeHandle(ownerKey);
      referenceCount += 1;
    }
    objectOwners.set(key, ownerKey);
    expandedBytes = checkedAdd(expandedBytes, object.rawPayload.length);
    if (expandedBytes > limits.maxExpandedBytes) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "resource",
        0,
        "The neutral model exceeds the aggregate expanded-byte limit.",
      );
    }
    const objectReferences = new Set<string>();
    for (const reference of object.references) {
      const sourceKey = dwgHandleKey(reference.source);
      const targetKey = dwgHandleKey(reference.target);
      observeHandle(sourceKey);
      observeHandle(targetKey);
      if (sourceKey !== key) {
        throwDwgError(
          "DWG_STRUCTURE_CORRUPT",
          "input",
          0,
          "A neutral reference source does not match its containing object.",
        );
      }
      const referenceKey = `${reference.role}:${targetKey}`;
      if (objectReferences.has(referenceKey)) {
        throwDwgError(
          "DWG_STRUCTURE_CORRUPT",
          "input",
          0,
          "The neutral model contains a duplicate reference.",
        );
      }
      objectReferences.add(referenceKey);
      referenceCount += 1;
      if (referenceCount > limits.maxReferences) {
        throwDwgError(
          "DWG_STRUCTURE_CORRUPT",
          "resource",
          0,
          "The neutral model exceeds the reference limit.",
        );
      }
    }
    if (referenceCount > limits.maxReferences) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "resource",
        0,
        "The neutral model exceeds the reference limit.",
      );
    }
  }

  let symbolEntryCount = 0;
  for (const table of symbolTables) {
    const tableKey = dwgHandleKey(table.handle);
    if (definedHandles.has(tableKey)) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        0,
        "The neutral model contains a duplicate defined handle.",
      );
    }
    definedHandles.add(tableKey);
    observeHandle(tableKey);
    symbolEntryCount = checkedAdd(symbolEntryCount, table.entries.length);
    if (symbolEntryCount > limits.maxArrayLength) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "resource",
        0,
        "The neutral model exceeds the aggregate symbol-entry limit.",
      );
    }
    for (const entry of table.entries) {
      observeHandle(dwgHandleKey(entry.objectHandle));
    }
  }

  for (const start of objectOwners.keys()) {
    const visited = new Set<string>();
    let current: string | undefined = start;
    let depth = 0;
    while (current !== undefined && objectOwners.has(current)) {
      if (visited.has(current)) {
        throwDwgError(
          "DWG_STRUCTURE_CORRUPT",
          "input",
          0,
          "The neutral owner graph contains a cycle.",
        );
      }
      visited.add(current);
      const owner: string | null = objectOwners.get(current) ?? null;
      if (owner === null) break;
      depth += 1;
      if (depth > limits.maxDepth) {
        throwDwgError(
          "DWG_STRUCTURE_CORRUPT",
          "resource",
          0,
          "The neutral owner graph exceeds the depth limit.",
        );
      }
      current = owner;
    }
  }

  const diagnosticCopies = new Array<DwgDiagnostic>(diagnostics.length);
  for (let index = 0; index < diagnostics.length; index += 1) {
    const copy = copyDiagnostic(diagnostics[index]!, limits);
    expandedBytes = checkedAdd(expandedBytes, copy.bytes);
    if (expandedBytes > limits.maxExpandedBytes) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "resource",
        0,
        "The neutral model exceeds the aggregate expanded-byte limit.",
      );
    }
    diagnosticCopies[index] = copy.value;
  }
  const lossCopies = new Array<DwgLossEntry>(lossManifest.length);
  for (let index = 0; index < lossManifest.length; index += 1) {
    const copy = copyLossEntry(lossManifest[index]!, limits);
    expandedBytes = checkedAdd(expandedBytes, copy.bytes);
    if (expandedBytes > limits.maxExpandedBytes) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "resource",
        0,
        "The neutral model exceeds the aggregate expanded-byte limit.",
      );
    }
    lossCopies[index] = copy.value;
  }

  return Object.freeze({
    status: "foundation-only",
    objectDatabaseComplete: false,
    objects,
    symbolTables,
    diagnostics: Object.freeze(diagnosticCopies),
    lossManifest: Object.freeze(lossCopies),
  });
}
