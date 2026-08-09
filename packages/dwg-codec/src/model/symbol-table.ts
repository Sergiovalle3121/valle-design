import type { DwgLimits } from "../api/limits.js";
import { checkedAdd, checkedMultiply } from "../binary/checked-arithmetic.js";
import { inspectOrdinaryByteView } from "../security/byte-view.js";
import {
  createOwnedDwgBytes,
  dwgHexResultReservationBytes,
  type DwgByteSequence,
} from "../security/owned-bytes.js";
import { throwDwgError } from "../security/parse-error.js";
import type { ResourceBudget } from "../security/resource-budget.js";
import {
  assertDwgHandle,
  dwgHandleKey,
  dwgHandleKeyReservationBytes,
  type DwgHandle,
} from "./handle.js";

const ARRAY_OVERHEAD_BYTES = 128;
const ARRAY_SLOT_BYTES = 16;
const COLLECTION_OVERHEAD_BYTES = 256;
const COLLECTION_ENTRY_BYTES = 128;
const SYMBOL_ENTRY_OVERHEAD_BYTES = 256;
const SYMBOL_NAME_OVERHEAD_BYTES = 128;
const SYMBOL_TABLE_OVERHEAD_BYTES = 256;
const OWNED_DWG_SYMBOL_NAMES = new WeakSet<object>();
const OWNED_DWG_SYMBOL_TABLES = new WeakSet<object>();

export interface DwgSymbolName {
  readonly encoding: "opaque-bytes";
  readonly bytes: DwgByteSequence;
}

export interface DwgSymbolTableEntry {
  readonly name: DwgSymbolName;
  readonly objectHandle: DwgHandle;
}

export interface DwgSymbolTable {
  readonly representation: "symbol-table-foundation";
  readonly handle: DwgHandle;
  readonly entries: readonly DwgSymbolTableEntry[];
}

function boundedEntryCount(
  entries: readonly DwgSymbolTableEntry[],
  maximum: number,
): number {
  let isArray = false;
  try {
    isArray = Array.isArray(entries);
  } catch {
    // The typed error below deliberately hides hostile proxy details.
  }
  if (!isArray) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "Symbol-table entries must be an array.",
    );
  }
  let length: number;
  try {
    length = entries.length;
  } catch {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "Symbol-table entries cannot be inspected.",
    );
  }
  if (!Number.isSafeInteger(length) || length < 0) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "Symbol-table entries have an invalid length.",
    );
  }
  if (length > maximum) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "resource",
      0,
      "A symbol table exceeds the configured array limit.",
    );
  }
  return length;
}

export function createDwgSymbolName(
  bytes: Uint8Array,
  limits: DwgLimits,
  budget?: ResourceBudget,
): DwgSymbolName {
  const memoryCheckpoint = budget?.memoryBytes ?? 0;
  let succeeded = false;
  try {
    const inspected = inspectOrdinaryByteView(bytes);
    if (inspected.byteLength > limits.maxStringBytes) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "resource",
        0,
        "A symbol name exceeds the configured byte limit.",
      );
    }
    budget?.reserveMemory(SYMBOL_NAME_OVERHEAD_BYTES, 0);
    const name = Object.freeze({
      encoding: "opaque-bytes" as const,
      bytes: createOwnedDwgBytes(inspected.view, budget),
    });
    OWNED_DWG_SYMBOL_NAMES.add(name);
    succeeded = true;
    return name;
  } finally {
    if (!succeeded && budget !== undefined) {
      const reserved = budget.memoryBytes - memoryCheckpoint;
      if (reserved > 0) budget.releaseMemory(reserved, 0);
    }
  }
}

function symbolNameKey(name: DwgSymbolName, budget?: ResourceBudget): string {
  assertDwgSymbolName(name);
  return name.bytes.toHex(budget);
}

function symbolNameKeyReservationBytes(name: DwgSymbolName): number {
  assertDwgSymbolName(name);
  return dwgHexResultReservationBytes(name.bytes);
}

export function createDwgSymbolTable(
  handle: DwgHandle,
  entries: readonly DwgSymbolTableEntry[],
  limits: DwgLimits,
  budget?: ResourceBudget,
): DwgSymbolTable {
  const memoryCheckpoint = budget?.memoryBytes ?? 0;
  let succeeded = false;
  let temporaryHexBytes = 0;
  try {
    assertDwgHandle(handle);
    const entryCount = boundedEntryCount(entries, limits.maxArrayLength);
    const arrayBytes = checkedAdd(
      ARRAY_OVERHEAD_BYTES,
      checkedMultiply(entryCount, ARRAY_SLOT_BYTES),
    );
    const temporaryCollectionBytes = checkedAdd(
      checkedMultiply(2, COLLECTION_OVERHEAD_BYTES),
      checkedMultiply(checkedMultiply(entryCount, 2), COLLECTION_ENTRY_BYTES),
    );
    const entryBytes = checkedMultiply(entryCount, SYMBOL_ENTRY_OVERHEAD_BYTES);
    const retainedOutputBytes = checkedAdd(
      SYMBOL_TABLE_OVERHEAD_BYTES,
      checkedAdd(arrayBytes, entryBytes),
    );
    budget?.assertWorkAvailable(entryCount, 0);
    budget?.reserveMemory(
      checkedAdd(retainedOutputBytes, temporaryCollectionBytes),
      0,
    );
    const names = new Set<string>();
    const handles = new Set<string>();
    const copies = new Array<DwgSymbolTableEntry>(entryCount);
    for (let index = 0; index < entryCount; index += 1) {
      budget?.consume(1, index);
      let entry: unknown;
      try {
        entry = entries[index];
      } catch {
        throwDwgError(
          "DWG_INPUT_INVALID",
          "input",
          0,
          "A symbol-table entry cannot be inspected.",
        );
      }
      let name: unknown;
      let objectHandle: unknown;
      try {
        const candidate = entry as Partial<DwgSymbolTableEntry>;
        name = candidate.name;
        objectHandle = candidate.objectHandle;
      } catch {
        throwDwgError(
          "DWG_INPUT_INVALID",
          "input",
          0,
          "A symbol-table entry cannot be inspected.",
        );
      }
      assertDwgSymbolName(name);
      assertDwgHandle(objectHandle);

      const nameKeyBytes = symbolNameKeyReservationBytes(name);
      const nextNameHexBytes = checkedAdd(temporaryHexBytes, nameKeyBytes);
      const nameKey = symbolNameKey(name, budget);
      temporaryHexBytes = nextNameHexBytes;
      const handleKeyBytes = dwgHandleKeyReservationBytes(objectHandle);
      const nextHandleHexBytes = checkedAdd(temporaryHexBytes, handleKeyBytes);
      const handleKey = dwgHandleKey(objectHandle, budget);
      temporaryHexBytes = nextHandleHexBytes;
      if (names.has(nameKey) || handles.has(handleKey)) {
        throwDwgError(
          "DWG_STRUCTURE_CORRUPT",
          "input",
          0,
          "A symbol table contains a duplicate entry.",
        );
      }
      names.add(nameKey);
      handles.add(handleKey);
      copies[index] = Object.freeze({
        name,
        objectHandle,
      });
    }
    try {
      if (entries.length !== entryCount) throw new TypeError("length changed");
    } catch {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "Symbol-table entries changed during their bounded copy.",
      );
    }
    const table = Object.freeze({
      representation: "symbol-table-foundation" as const,
      handle,
      entries: Object.freeze(copies),
    });
    OWNED_DWG_SYMBOL_TABLES.add(table);
    budget?.releaseMemory(
      checkedAdd(temporaryCollectionBytes, temporaryHexBytes),
      0,
    );
    temporaryHexBytes = 0;
    succeeded = true;
    return table;
  } finally {
    if (!succeeded && budget !== undefined) {
      const reserved = budget.memoryBytes - memoryCheckpoint;
      if (reserved > 0) budget.releaseMemory(reserved, 0);
    }
  }
}

export function assertDwgSymbolName(
  value: unknown,
): asserts value is DwgSymbolName {
  if (
    typeof value !== "object" ||
    value === null ||
    !OWNED_DWG_SYMBOL_NAMES.has(value)
  ) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A symbol name must be created by this codec instance.",
    );
  }
}

export function assertDwgSymbolTable(
  value: unknown,
): asserts value is DwgSymbolTable {
  if (
    typeof value !== "object" ||
    value === null ||
    !OWNED_DWG_SYMBOL_TABLES.has(value)
  ) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A symbol table must be created by this codec instance.",
    );
  }
}
