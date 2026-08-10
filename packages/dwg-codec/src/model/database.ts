import type {
  DwgDiagnostic,
  DwgLossEntry,
  DwgLossSubject,
} from "../api/diagnostics.js";
import type { DwgLimits } from "../api/limits.js";
import { checkedAdd, checkedMultiply } from "../binary/checked-arithmetic.js";
import { throwDwgError } from "../security/parse-error.js";
import type { ResourceBudget } from "../security/resource-budget.js";
import { dwgHandleKey, dwgHandleKeyReservationBytes } from "./handle.js";
import {
  assertOpaqueDwgObject,
  type OpaqueDwgObject,
} from "./opaque-object.js";
import { assertDwgSymbolTable, type DwgSymbolTable } from "./symbol-table.js";

const ARRAY_OVERHEAD_BYTES = 128;
const ARRAY_SLOT_BYTES = 16;
const COLLECTION_OVERHEAD_BYTES = 256;
const COLLECTION_ENTRY_BYTES = 128;
const RECORD_OVERHEAD_BYTES = 256;
const LOSS_SUBJECT_OVERHEAD_BYTES = 128;
const HANDLE_RETAINED_BYTES = 256;
const OPAQUE_OBJECT_OVERHEAD_BYTES = 256;
const REFERENCE_OBJECT_OVERHEAD_BYTES = 256;
const SYMBOL_ENTRY_OVERHEAD_BYTES = 256;
const SYMBOL_NAME_OVERHEAD_BYTES = 128;
const SYMBOL_TABLE_OVERHEAD_BYTES = 256;
const REFERENCE_KEY_OVERHEAD_BYTES = 64;
const UTF16_CODE_UNIT_BYTES = 2;
const EMPTY_ARRAY: readonly never[] = Object.freeze([]);

function allocationBytes(
  count: number,
  bytesPerItem: number,
  overhead = 0,
): number {
  return checkedAdd(overhead, checkedMultiply(count, bytesPerItem));
}

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
  budget?: ResourceBudget,
): readonly T[] {
  if (value === undefined) return EMPTY_ARRAY;
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
  budget?.assertWorkAvailable(length, 0);
  const retainedBytes = allocationBytes(
    length,
    ARRAY_SLOT_BYTES,
    ARRAY_OVERHEAD_BYTES,
  );
  budget?.reserveMemory(retainedBytes, 0);
  let succeeded = false;
  try {
    const copy = new Array<T>(length);
    for (let index = 0; index < length; index += 1) {
      budget?.consume(1, index);
      try {
        copy[index] = value[index]!;
      } catch {
        throwDwgError(
          "DWG_INPUT_INVALID",
          "input",
          0,
          `${label} changed during its bounded copy.`,
        );
      }
    }
    try {
      if (value.length !== length) throw new TypeError("length changed");
    } catch {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        `${label} changed during its bounded copy.`,
      );
    }
    succeeded = true;
    return Object.freeze(copy);
  } finally {
    if (!succeeded) budget?.releaseMemory(retainedBytes, 0);
  }
}

function boundedUtf8Length(
  value: unknown,
  maximum: number,
  label: string,
  budget?: ResourceBudget,
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
    budget?.consume(1, index);
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
  retainRecord: (bytes: number, overheadBytes: number) => void,
  budget?: ResourceBudget,
): DwgDiagnostic {
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
    (severity !== "info" && severity !== "warning" && severity !== "error") ||
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
    boundedUtf8Length(code, limits.maxStringBytes, "A diagnostic code", budget),
    boundedUtf8Length(
      message,
      limits.maxStringBytes,
      "A diagnostic message",
      budget,
    ),
  );
  retainRecord(bytes, RECORD_OVERHEAD_BYTES);
  return Object.freeze({
    code: code as string,
    severity: severity as DwgDiagnostic["severity"],
    offset: offset as number,
    message: message as string,
  });
}

function copyLossEntry(
  entry: DwgLossEntry,
  limits: DwgLimits,
  retainRecord: (bytes: number, overheadBytes: number) => void,
  budget?: ResourceBudget,
): DwgLossEntry {
  if (typeof entry !== "object" || entry === null) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A loss-manifest entry is invalid.",
    );
  }
  let code: unknown;
  let severity: unknown;
  let scope: unknown;
  let subject: unknown;
  let message: unknown;
  try {
    code = entry.code;
    severity = entry.severity;
    scope = entry.scope;
    subject = entry.subject;
    message = entry.message;
  } catch {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A loss-manifest entry cannot be inspected.",
    );
  }
  if (
    (severity !== "info" && severity !== "warning" && severity !== "error") ||
    (scope !== "container" && scope !== "database" && scope !== "entity")
  ) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A loss-manifest entry is invalid.",
    );
  }
  if (typeof subject !== "object" || subject === null) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A loss-manifest subject is invalid.",
    );
  }
  let kind: unknown;
  let stableId: unknown;
  try {
    const candidate = subject as Partial<DwgLossSubject>;
    kind = candidate.kind;
    stableId = candidate.stableId;
  } catch {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A loss-manifest subject cannot be inspected.",
    );
  }
  if (
    (kind !== "source" && kind !== "object") ||
    typeof stableId !== "string" ||
    stableId.length === 0
  ) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A loss-manifest subject is invalid.",
    );
  }
  const subjectBytes = boundedUtf8Length(
    stableId,
    limits.maxStringBytes,
    "A loss subject identifier",
    budget,
  );
  const bytes = checkedAdd(
    checkedAdd(
      boundedUtf8Length(code, limits.maxStringBytes, "A loss code", budget),
      boundedUtf8Length(
        message,
        limits.maxStringBytes,
        "A loss message",
        budget,
      ),
    ),
    subjectBytes,
  );
  retainRecord(
    bytes,
    checkedAdd(RECORD_OVERHEAD_BYTES, LOSS_SUBJECT_OVERHEAD_BYTES),
  );
  const copiedSubject: DwgLossSubject = Object.freeze({
    kind,
    stableId,
  });
  return Object.freeze({
    code: code as string,
    severity: severity as DwgLossEntry["severity"],
    scope: scope as DwgLossEntry["scope"],
    subject: copiedSubject,
    message: message as string,
  });
}

export function createDwgDatabaseFoundation(
  input: DwgDatabaseFoundationInput,
  limits: DwgLimits,
  budget?: ResourceBudget,
): DwgDatabaseFoundation {
  const memoryCheckpoint = budget?.memoryBytes ?? 0;
  let temporaryBytes = 0;
  let succeeded = false;
  try {
    const trackTemporary = (bytes: number): void => {
      temporaryBytes = checkedAdd(temporaryBytes, bytes);
    };
    const reserveTemporary = (bytes: number): void => {
      const next = checkedAdd(temporaryBytes, bytes);
      budget?.reserveMemory(bytes, 0);
      temporaryBytes = next;
    };
    const temporaryHandleKey = (
      handle: Parameters<typeof dwgHandleKey>[0],
    ): string => {
      const bytes = dwgHandleKeyReservationBytes(handle);
      const next = checkedAdd(temporaryBytes, bytes);
      const key = dwgHandleKey(handle, budget);
      temporaryBytes = next;
      return key;
    };

    let objectInput: DwgDatabaseFoundationInput["objects"];
    let symbolTableInput: DwgDatabaseFoundationInput["symbolTables"];
    let diagnosticInput: DwgDatabaseFoundationInput["diagnostics"];
    let lossInput: DwgDatabaseFoundationInput["lossManifest"];
    try {
      objectInput = input.objects;
      symbolTableInput = input.symbolTables;
      diagnosticInput = input.diagnostics;
      lossInput = input.lossManifest;
    } catch {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "The database foundation input cannot be inspected.",
      );
    }

    const objects = copyBoundedArray(
      objectInput,
      limits.maxObjects,
      "The neutral object collection",
      budget,
    );
    const symbolTables = copyBoundedArray(
      symbolTableInput,
      limits.maxArrayLength,
      "The neutral symbol-table collection",
      budget,
    );
    const diagnostics = copyBoundedArray(
      diagnosticInput,
      limits.maxArrayLength,
      "The diagnostic collection",
      budget,
    );
    if (diagnosticInput !== undefined) {
      trackTemporary(
        allocationBytes(
          diagnostics.length,
          ARRAY_SLOT_BYTES,
          ARRAY_OVERHEAD_BYTES,
        ),
      );
    }
    const lossManifest = copyBoundedArray(
      lossInput,
      limits.maxArrayLength,
      "The loss manifest",
      budget,
    );
    if (lossInput !== undefined) {
      trackTemporary(
        allocationBytes(
          lossManifest.length,
          ARRAY_SLOT_BYTES,
          ARRAY_OVERHEAD_BYTES,
        ),
      );
    }

    reserveTemporary(checkedMultiply(5, COLLECTION_OVERHEAD_BYTES));
    const definedHandles = new Set<string>();
    const observedHandles = new Set<string>();
    const objectOwners = new Map<string, string | null>();
    let referenceCount = 0;
    let expandedBytes = 0;
    const observeHandle = (key: string): void => {
      if (!observedHandles.has(key)) {
        reserveTemporary(HANDLE_RETAINED_BYTES);
        reserveTemporary(COLLECTION_ENTRY_BYTES);
        observedHandles.add(key);
      }
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
      assertOpaqueDwgObject(object);
      budget?.consume(1, 0);
      budget?.reserveMemory(OPAQUE_OBJECT_OVERHEAD_BYTES, 0);
      const key = temporaryHandleKey(object.handle);
      if (definedHandles.has(key)) {
        throwDwgError(
          "DWG_STRUCTURE_CORRUPT",
          "input",
          0,
          "The neutral model contains a duplicate object handle.",
        );
      }
      reserveTemporary(COLLECTION_ENTRY_BYTES);
      definedHandles.add(key);
      observeHandle(key);
      const ownerKey =
        object.owner === null ? null : temporaryHandleKey(object.owner);
      if (ownerKey !== null) {
        observeHandle(ownerKey);
        referenceCount = checkedAdd(referenceCount, 1);
      }
      reserveTemporary(COLLECTION_ENTRY_BYTES);
      objectOwners.set(key, ownerKey);
      budget?.reserveMemory(object.rawPayload.length, 0);
      budget?.consumeExpanded(object.rawPayload.length, 0);
      expandedBytes = checkedAdd(expandedBytes, object.rawPayload.length);
      if (expandedBytes > limits.maxExpandedBytes) {
        throwDwgError(
          "DWG_STRUCTURE_CORRUPT",
          "resource",
          0,
          "The neutral model exceeds the aggregate expanded-byte limit.",
        );
      }
      reserveTemporary(COLLECTION_OVERHEAD_BYTES);
      const objectReferences = new Set<string>();
      for (const reference of object.references) {
        budget?.consume(1, 0);
        budget?.reserveMemory(REFERENCE_OBJECT_OVERHEAD_BYTES, 0);
        const sourceKey = temporaryHandleKey(reference.source);
        const targetKey = temporaryHandleKey(reference.target);
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
        const referenceCodeUnits = checkedAdd(
          checkedAdd(reference.role.length, 1),
          targetKey.length,
        );
        reserveTemporary(
          allocationBytes(
            referenceCodeUnits,
            UTF16_CODE_UNIT_BYTES,
            REFERENCE_KEY_OVERHEAD_BYTES,
          ),
        );
        const referenceKey = `${reference.role}:${targetKey}`;
        if (objectReferences.has(referenceKey)) {
          throwDwgError(
            "DWG_STRUCTURE_CORRUPT",
            "input",
            0,
            "The neutral model contains a duplicate reference.",
          );
        }
        reserveTemporary(COLLECTION_ENTRY_BYTES);
        objectReferences.add(referenceKey);
        referenceCount = checkedAdd(referenceCount, 1);
        if (referenceCount > limits.maxReferences) {
          throwDwgError(
            "DWG_STRUCTURE_CORRUPT",
            "resource",
            0,
            "The neutral model exceeds the reference limit.",
          );
        }
      }
    }

    let symbolEntryCount = 0;
    for (const table of symbolTables) {
      assertDwgSymbolTable(table);
      budget?.consume(1, 0);
      budget?.reserveMemory(SYMBOL_TABLE_OVERHEAD_BYTES, 0);
      const tableKey = temporaryHandleKey(table.handle);
      if (definedHandles.has(tableKey)) {
        throwDwgError(
          "DWG_STRUCTURE_CORRUPT",
          "input",
          0,
          "The neutral model contains a duplicate defined handle.",
        );
      }
      reserveTemporary(COLLECTION_ENTRY_BYTES);
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
        budget?.consume(1, 0);
        budget?.reserveMemory(
          checkedAdd(
            checkedAdd(SYMBOL_ENTRY_OVERHEAD_BYTES, SYMBOL_NAME_OVERHEAD_BYTES),
            entry.name.bytes.length,
          ),
          0,
        );
        observeHandle(temporaryHandleKey(entry.objectHandle));
      }
    }

    const ownerVisitState = new Map<string, "visiting" | "complete">();
    const ownerDepth = new Map<string, number>();
    const visitOwner = (key: string, traversalDepth: number): number => {
      budget?.consume(1, 0);
      if (traversalDepth > limits.maxDepth) {
        throwDwgError(
          "DWG_STRUCTURE_CORRUPT",
          "resource",
          0,
          "The neutral owner graph exceeds the depth limit.",
        );
      }
      const state = ownerVisitState.get(key);
      if (state === "visiting") {
        throwDwgError(
          "DWG_STRUCTURE_CORRUPT",
          "input",
          0,
          "The neutral owner graph contains a cycle.",
        );
      }
      if (state === "complete") return ownerDepth.get(key) ?? 0;

      if (!ownerVisitState.has(key)) reserveTemporary(COLLECTION_ENTRY_BYTES);
      ownerVisitState.set(key, "visiting");
      const owner = objectOwners.get(key) ?? null;
      let depth = 0;
      if (owner !== null) {
        depth = objectOwners.has(owner)
          ? checkedAdd(1, visitOwner(owner, traversalDepth + 1))
          : 1;
        if (depth > limits.maxDepth) {
          throwDwgError(
            "DWG_STRUCTURE_CORRUPT",
            "resource",
            0,
            "The neutral owner graph exceeds the depth limit.",
          );
        }
      }
      if (!ownerDepth.has(key)) reserveTemporary(COLLECTION_ENTRY_BYTES);
      ownerDepth.set(key, depth);
      ownerVisitState.set(key, "complete");
      return depth;
    };
    for (const start of objectOwners.keys()) visitOwner(start, 0);

    const retainRecord = (bytes: number, overheadBytes: number): void => {
      budget?.reserveMemory(checkedAdd(overheadBytes, bytes), 0);
      budget?.consumeExpanded(bytes, 0);
      expandedBytes = checkedAdd(expandedBytes, bytes);
      if (expandedBytes > limits.maxExpandedBytes) {
        throwDwgError(
          "DWG_STRUCTURE_CORRUPT",
          "resource",
          0,
          "The neutral model exceeds the aggregate expanded-byte limit.",
        );
      }
    };

    budget?.reserveMemory(
      allocationBytes(
        diagnostics.length,
        ARRAY_SLOT_BYTES,
        ARRAY_OVERHEAD_BYTES,
      ),
      0,
    );
    const diagnosticCopies = new Array<DwgDiagnostic>(diagnostics.length);
    for (let index = 0; index < diagnostics.length; index += 1) {
      diagnosticCopies[index] = copyDiagnostic(
        diagnostics[index]!,
        limits,
        retainRecord,
        budget,
      );
    }
    budget?.reserveMemory(
      allocationBytes(
        lossManifest.length,
        ARRAY_SLOT_BYTES,
        ARRAY_OVERHEAD_BYTES,
      ),
      0,
    );
    const lossCopies = new Array<DwgLossEntry>(lossManifest.length);
    for (let index = 0; index < lossManifest.length; index += 1) {
      lossCopies[index] = copyLossEntry(
        lossManifest[index]!,
        limits,
        retainRecord,
        budget,
      );
    }

    budget?.reserveMemory(RECORD_OVERHEAD_BYTES, 0);
    const database = Object.freeze({
      status: "foundation-only" as const,
      objectDatabaseComplete: false as const,
      objects,
      symbolTables,
      diagnostics: Object.freeze(diagnosticCopies),
      lossManifest: Object.freeze(lossCopies),
    });
    budget?.releaseMemory(temporaryBytes, 0);
    temporaryBytes = 0;
    succeeded = true;
    return database;
  } finally {
    if (!succeeded && budget !== undefined) {
      const reserved = budget.memoryBytes - memoryCheckpoint;
      if (reserved > 0) budget.releaseMemory(reserved, 0);
    }
  }
}
