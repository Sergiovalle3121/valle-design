import {
  EMPTY_DWG_DIAGNOSTICS,
  EMPTY_DWG_LOSS_MANIFEST,
  type DwgDiagnostic,
  type DwgLossEntry,
} from "./diagnostics.js";
import {
  createDwgLimits,
  type DwgLimitOverrides,
  type DwgLimitProfile,
} from "./limits.js";
import {
  lookupDwgVersion,
  type DwgVersionCode,
} from "../container/version-registry.js";
import {
  DWG_NEUTRAL_MODEL_VERSION,
  type DwgDocument,
} from "../model/document.js";
import {
  createDwgError,
  normalizeDwgError,
  throwDwgError,
  type DwgError,
} from "../security/parse-error.js";
import {
  ResourceBudget,
  type DwgCancellationSignal,
  type DwgClock,
} from "../security/resource-budget.js";

export interface DwgWriteOptions {
  readonly targetVersion: DwgVersionCode;
  readonly profile?: DwgLimitProfile;
  readonly lossPolicy?: "error" | "accept-explicit";
  readonly limits?: DwgLimitOverrides;
  readonly clock?: DwgClock;
  readonly signal?: DwgCancellationSignal;
  readonly deadlineMs?: number;
}

export interface DwgWriteSuccess {
  readonly ok: true;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly targetVersion: DwgVersionCode;
  readonly diagnostics: readonly DwgDiagnostic[];
  readonly lossManifest: readonly DwgLossEntry[];
  readonly workUnits: number;
}

export interface DwgWriteFailure {
  readonly ok: false;
  readonly error: DwgError;
  readonly targetVersion: DwgVersionCode | null;
  readonly diagnostics: readonly DwgDiagnostic[];
  readonly lossManifest: readonly DwgLossEntry[];
  readonly workUnits: number;
}

export type DwgWriteResult = DwgWriteSuccess | DwgWriteFailure;

function invalid(message: string): never {
  throwDwgError("DWG_INPUT_INVALID", "input", 0, message);
}

function validateOptions(value: unknown): DwgWriteOptions {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalid("Writer options must be an object.");
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set([
    "targetVersion",
    "profile",
    "lossPolicy",
    "limits",
    "clock",
    "signal",
    "deadlineMs",
  ]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) invalid("Writer options contain an unknown field.");
  }
  let targetVersion: unknown;
  let profile: unknown;
  let lossPolicy: unknown;
  try {
    targetVersion = record.targetVersion;
    profile = record.profile;
    lossPolicy = record.lossPolicy;
  } catch {
    invalid("Writer options cannot be inspected.");
  }
  if (
    typeof targetVersion !== "string" ||
    lookupDwgVersion(targetVersion) === null
  ) {
    invalid("The writer target version is not registered.");
  }
  if (
    lossPolicy !== undefined &&
    lossPolicy !== "error" &&
    lossPolicy !== "accept-explicit"
  ) {
    invalid("The writer loss policy is invalid.");
  }
  if (profile !== undefined && profile !== "browser" && profile !== "api") {
    invalid("The writer resource profile is invalid.");
  }
  return value as DwgWriteOptions;
}

function validateDocument(value: unknown): asserts value is DwgDocument {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalid("The writer requires a complete neutral DWG document.");
  }
  const record = value as Record<string, unknown>;
  try {
    if (
      record.neutralModelVersion !== DWG_NEUTRAL_MODEL_VERSION ||
      record.objectDatabaseComplete !== true ||
      !Array.isArray(record.objects)
    ) {
      invalid("The writer requires a complete neutral DWG document.");
    }
  } catch {
    invalid("The neutral DWG document cannot be inspected.");
  }
}

export function writeDwg(
  document: DwgDocument,
  options: DwgWriteOptions,
): DwgWriteResult {
  let budget: ResourceBudget | undefined;
  let targetVersion: DwgVersionCode | null = null;
  try {
    const validated = validateOptions(options);
    targetVersion = validated.targetVersion;
    validateDocument(document);
    const limits = createDwgLimits(validated.limits, validated.profile);
    budget = new ResourceBudget(limits, {
      ...(validated.clock === undefined ? {} : { clock: validated.clock }),
      ...(validated.signal === undefined ? {} : { signal: validated.signal }),
      ...(validated.deadlineMs === undefined
        ? {}
        : { deadlineMs: validated.deadlineMs }),
    });
    budget.consume(1, 0);
    return Object.freeze({
      ok: false,
      error: createDwgError(
        "DWG_VERSION_WRITER_UNSUPPORTED",
        "unsupported",
        0,
        "The target version is registered but no DWG writer is implemented.",
      ),
      targetVersion,
      diagnostics: EMPTY_DWG_DIAGNOSTICS,
      lossManifest: EMPTY_DWG_LOSS_MANIFEST,
      workUnits: budget.workUnits,
    });
  } catch (error: unknown) {
    return Object.freeze({
      ok: false,
      error: normalizeDwgError(error),
      targetVersion,
      diagnostics: EMPTY_DWG_DIAGNOSTICS,
      lossManifest: EMPTY_DWG_LOSS_MANIFEST,
      workUnits: budget?.workUnits ?? 0,
    });
  }
}
