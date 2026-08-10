export { probeDwg } from "./api/probe.js";
export { DEFAULT_DWG_LIMITS } from "./api/limits.js";
export { DWG_VERSION_REGISTRY } from "./container/version-registry.js";

export type { DwgProbeOptions } from "./api/probe.js";
export type { DwgLimits } from "./api/limits.js";
export type {
  DwgKnownProbeMetadata,
  DwgProbeMetadata,
  DwgProbeResult,
  DwgUnknownProbeMetadata,
} from "./api/results.js";
export type { DwgDiagnostic, DwgLossEntry } from "./api/diagnostics.js";
export type {
  DwgError,
  DwgErrorCategory,
  DwgErrorCode,
} from "./security/parse-error.js";
export type {
  DwgCancellationSignal,
  DwgClock,
} from "./security/resource-budget.js";
export type {
  DwgVersion,
  DwgVersionCode,
  DwgVersionLabel,
} from "./container/version-registry.js";
