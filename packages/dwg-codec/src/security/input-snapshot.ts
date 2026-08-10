import type { DwgLimits } from "../api/limits.js";
import type { ResourceBudget } from "./resource-budget.js";
import { copyInspectedByteView, inspectOrdinaryByteView } from "./byte-view.js";
import { throwDwgError } from "./parse-error.js";

declare const INPUT_SNAPSHOT_BRAND: unique symbol;

export type DwgInputSnapshot = Uint8Array<ArrayBuffer> & {
  readonly [INPUT_SNAPSHOT_BRAND]: true;
};

const INPUT_SNAPSHOTS = new WeakSet<object>();

export function isInputSnapshot(value: unknown): value is DwgInputSnapshot {
  return (
    typeof value === "object" && value !== null && INPUT_SNAPSHOTS.has(value)
  );
}

export function createInputSnapshot(
  input: Uint8Array,
  limits: DwgLimits,
  budget: ResourceBudget,
): DwgInputSnapshot {
  const inspected = inspectOrdinaryByteView(input);
  const { byteLength } = inspected;
  if (byteLength > limits.maxFileBytes) {
    throwDwgError(
      "DWG_FILE_LIMIT_EXCEEDED",
      "resource",
      0,
      "The input exceeds the configured file-size limit.",
    );
  }
  budget.reserveMemory(byteLength, 0);
  budget.consume(byteLength, 0);
  const snapshot = copyInspectedByteView(inspected);
  budget.checkpoint(byteLength, true);
  INPUT_SNAPSHOTS.add(snapshot);
  return snapshot as DwgInputSnapshot;
}
