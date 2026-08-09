import {
  EMPTY_DWG_DIAGNOSTICS,
  EMPTY_DWG_LOSS_MANIFEST,
} from "./diagnostics.js";
import { createDwgLimits, type DwgLimitOverrides } from "./limits.js";
import type { DwgProbeMetadata, DwgProbeResult } from "./results.js";
import { detectDwgSignature } from "../container/signature.js";
import { lookupDwgVersion } from "../container/version-registry.js";
import { createInputSnapshot } from "../security/input-snapshot.js";
import {
  createDwgError,
  normalizeDwgError,
  throwDwgError,
} from "../security/parse-error.js";
import {
  ResourceBudget,
  type DwgCancellationSignal,
  type DwgClock,
} from "../security/resource-budget.js";

export interface DwgProbeOptions {
  readonly limits?: DwgLimitOverrides;
  readonly clock?: DwgClock;
  readonly signal?: DwgCancellationSignal;
  readonly deadlineMs?: number;
}

function validateOptions(options: unknown): asserts options is DwgProbeOptions {
  if (
    typeof options !== "object" ||
    options === null ||
    Array.isArray(options)
  ) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "Probe options must be an object.",
    );
  }
  const record = options as Record<string, unknown>;
  const allowed = ["limits", "clock", "signal", "deadlineMs"] as const;
  for (const name of Object.keys(record)) {
    if (!allowed.includes(name as (typeof allowed)[number])) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "Probe options contain an unknown field.",
      );
    }
  }
  const clock = record.clock;
  if (
    clock !== undefined &&
    (typeof clock !== "object" ||
      clock === null ||
      !("now" in clock) ||
      typeof clock.now !== "function")
  ) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The probe clock must expose a now function.",
    );
  }
  const signal = record.signal;
  if (
    signal !== undefined &&
    (typeof signal !== "object" || signal === null || !("aborted" in signal))
  ) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The cancellation signal must expose an aborted value.",
    );
  }
}

function failure(
  error: DwgProbeResult["error"],
  workUnits: number,
  probe: DwgProbeMetadata | null = null,
): DwgProbeResult {
  return Object.freeze({
    ok: false,
    error,
    diagnostics: EMPTY_DWG_DIAGNOSTICS,
    lossManifest: EMPTY_DWG_LOSS_MANIFEST,
    probe,
    workUnits,
  });
}

export function probeDwg(
  input: Uint8Array,
  options: DwgProbeOptions = {},
): DwgProbeResult {
  let budget: ResourceBudget | undefined;
  try {
    validateOptions(options);
    const limits = createDwgLimits(options.limits);
    budget = new ResourceBudget(limits, {
      ...(options.clock === undefined ? {} : { clock: options.clock }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.deadlineMs === undefined
        ? {}
        : { deadlineMs: options.deadlineMs }),
    });
    const snapshot = createInputSnapshot(input, limits, budget);
    const signature = detectDwgSignature(snapshot, budget);
    budget.consume(1, 0);
    const version = lookupDwgVersion(signature.code);
    const probe: DwgProbeMetadata =
      version === null
        ? Object.freeze({
            versionKind: "unknown",
            signature: signature.code,
            byteLength: snapshot.byteLength,
            decoderStatus: "unsupported",
            version: null,
          })
        : Object.freeze({
            versionKind: "known",
            signature: signature.code,
            byteLength: snapshot.byteLength,
            decoderStatus: "unsupported",
            version,
          });
    budget.checkpoint(0, true);

    if (version === null) {
      return failure(
        createDwgError(
          "DWG_VERSION_UNKNOWN",
          "unsupported",
          0,
          "The AC10dd signature is valid but its version is not registered.",
        ),
        budget.workUnits,
        probe,
      );
    }
    return failure(
      createDwgError(
        "DWG_VERSION_DECODER_UNSUPPORTED",
        "unsupported",
        0,
        "The signature is recognized but no DWG decoder is implemented.",
      ),
      budget.workUnits,
      probe,
    );
  } catch (error: unknown) {
    return failure(normalizeDwgError(error), budget?.workUnits ?? 0);
  }
}
