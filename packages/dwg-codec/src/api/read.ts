import type { DwgDiagnostic, DwgLossEntry } from "./diagnostics.js";
import { probeDwg, type DwgProbeOptions } from "./probe.js";
import type { DwgProbeMetadata } from "./results.js";
import type { DwgDocument } from "../model/document.js";
import type { DwgError } from "../security/parse-error.js";

export type DwgReadOptions = DwgProbeOptions;

export interface DwgReadSuccess {
  readonly ok: true;
  readonly document: DwgDocument;
  readonly diagnostics: readonly DwgDiagnostic[];
  readonly lossManifest: readonly DwgLossEntry[];
  readonly probe: DwgProbeMetadata;
  readonly workUnits: number;
}

export interface DwgReadFailure {
  readonly ok: false;
  readonly error: DwgError;
  readonly diagnostics: readonly DwgDiagnostic[];
  readonly lossManifest: readonly DwgLossEntry[];
  readonly probe: DwgProbeMetadata | null;
  readonly workUnits: number;
}

export type DwgReadResult = DwgReadSuccess | DwgReadFailure;

export function readDwg(
  input: Uint8Array,
  options: DwgReadOptions = {},
): DwgReadResult {
  const result = probeDwg(input, options);
  return Object.freeze({
    ok: false,
    error: result.error,
    diagnostics: result.diagnostics,
    lossManifest: result.lossManifest,
    probe: result.probe,
    workUnits: result.workUnits,
  });
}
