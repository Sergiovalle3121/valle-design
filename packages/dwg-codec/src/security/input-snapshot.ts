import type { DwgLimits } from "../api/limits.js";
import type { ResourceBudget } from "./resource-budget.js";
import { copyInspectedByteView, inspectOrdinaryByteView } from "./byte-view.js";
import { throwDwgError } from "./parse-error.js";

export function createInputSnapshot(
  input: Uint8Array,
  limits: DwgLimits,
  budget: ResourceBudget,
): Uint8Array<ArrayBuffer> {
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
  budget.consume(byteLength, 0);
  const snapshot = copyInspectedByteView(inspected);
  budget.checkpoint(byteLength, true);
  return snapshot;
}
