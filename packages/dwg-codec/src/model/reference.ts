import type { DwgHandle } from "./handle.js";
import { throwDwgError } from "../security/parse-error.js";

export type DwgReferenceRole = "owner" | "reference";

export interface DwgReference {
  readonly role: DwgReferenceRole;
  readonly source: DwgHandle;
  readonly target: DwgHandle;
}

export function createDwgReference(
  role: DwgReferenceRole,
  source: DwgHandle,
  target: DwgHandle,
): DwgReference {
  if (role !== "owner" && role !== "reference") {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A neutral reference role is invalid.",
    );
  }
  return Object.freeze({ role, source, target });
}
