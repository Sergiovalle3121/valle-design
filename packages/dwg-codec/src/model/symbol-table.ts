import type { DwgLimits } from "../api/limits.js";
import {
  frozenByteValues,
  inspectOrdinaryByteView,
} from "../security/byte-view.js";
import { throwDwgError } from "../security/parse-error.js";
import { dwgHandleKey, type DwgHandle } from "./handle.js";

export interface DwgSymbolName {
  readonly encoding: "opaque-bytes";
  readonly bytes: readonly number[];
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
): DwgSymbolName {
  const inspected = inspectOrdinaryByteView(bytes);
  if (inspected.byteLength > limits.maxStringBytes) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "resource",
      0,
      "A symbol name exceeds the configured byte limit.",
    );
  }
  return Object.freeze({
    encoding: "opaque-bytes",
    bytes: frozenByteValues(inspected),
  });
}

function symbolNameKey(name: DwgSymbolName): string {
  return name.bytes.join(",");
}

export function createDwgSymbolTable(
  handle: DwgHandle,
  entries: readonly DwgSymbolTableEntry[],
  limits: DwgLimits,
): DwgSymbolTable {
  const entryCount = boundedEntryCount(entries, limits.maxArrayLength);
  const names = new Set<string>();
  const handles = new Set<string>();
  const copies = new Array<DwgSymbolTableEntry>(entryCount);
  for (let index = 0; index < entryCount; index += 1) {
    let entry: DwgSymbolTableEntry;
    try {
      entry = entries[index]!;
    } catch {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "A symbol-table entry cannot be inspected.",
      );
    }
    const nameKey = symbolNameKey(entry.name);
    const handleKey = dwgHandleKey(entry.objectHandle);
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
      name: entry.name,
      objectHandle: entry.objectHandle,
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
  return Object.freeze({
    representation: "symbol-table-foundation",
    handle,
    entries: Object.freeze(copies),
  });
}
