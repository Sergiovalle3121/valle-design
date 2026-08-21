export { probeDwg } from "./api/probe.js";
export { readDwg } from "./api/read.js";
export { writeAc1015Container as writeDwg } from "./writer/ac1015-container-writer.js";
export { DEFAULT_DWG_LIMITS } from "./api/limits.js";
export { DWG_VERSION_REGISTRY } from "./container/version-registry.js";

export type { DwgProbeOptions } from "./api/probe.js";
export type {
  DwgDatabase,
  DwgDatabaseBlock,
  DwgDatabaseEntityRecord,
  DwgDatabaseLayer,
  DwgUnsupportedDatabaseObject,
} from "./api/read.js";
export type {
  Ac1015ContainerWriteOptions,
  Ac1015ObjectSpec,
} from "./writer/ac1015-container-writer.js";
export type { DwgLimits } from "./api/limits.js";
export type {
  DwgKnownProbeMetadata,
  DwgProbeFailure,
  DwgProbeMetadata,
  DwgProbeResult,
  DwgProbeSuccess,
  DwgUnknownProbeMetadata,
} from "./api/results.js";
export type { DwgDiagnostic, DwgLossEntry } from "./api/diagnostics.js";
export type {
  DwgGeometryEntity,
  DwgGeometryEntityKind,
} from "./model/entity-geometry.js";
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
  DwgDecoderStatus,
  DwgVersion,
  DwgVersionCode,
  DwgVersionLabel,
} from "./container/version-registry.js";
