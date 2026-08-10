export { probeDwg } from "./api/probe.js";
export { readDwg } from "./api/read.js";
export { writeDwg } from "./api/write.js";
export {
  DWG_CAPABILITY_FAMILIES,
  getDwgCapabilities,
} from "./api/capabilities.js";
export { createDwgExtensionRegistry } from "./extensions/registry.js";
export { DWG_NEUTRAL_MODEL_VERSION } from "./model/document.js";
export {
  API_DWG_HARD_TIMEOUT_MS,
  API_DWG_LIMITS,
  BROWSER_DWG_LIMITS,
  DEFAULT_DWG_LIMITS,
  DWG_LIMIT_PROFILES,
} from "./api/limits.js";
export { DWG_VERSION_REGISTRY } from "./container/version-registry.js";

export type { DwgProbeOptions } from "./api/probe.js";
export type {
  DwgLimits,
  DwgLimitOverrides,
  DwgLimitProfile,
} from "./api/limits.js";
export type {
  DwgReadFailure,
  DwgReadOptions,
  DwgReadResult,
  DwgReadSuccess,
} from "./api/read.js";
export type {
  DwgWriteFailure,
  DwgWriteOptions,
  DwgWriteResult,
  DwgWriteSuccess,
} from "./api/write.js";
export type {
  DwgCapabilityDirection,
  DwgCapabilityFamily,
  DwgCapabilityFamilyDefinition,
  DwgCapabilityMatrix,
  DwgCapabilityState,
  DwgDirectionCapabilities,
  DwgFamilyCapabilities,
  DwgPropertyCapabilities,
  DwgVersionCapabilities,
} from "./api/capabilities.js";
export type {
  DwgKnownProbeMetadata,
  DwgProbeMetadata,
  DwgProbeResult,
  DwgUnknownProbeMetadata,
} from "./api/results.js";
export type {
  DwgDiagnostic,
  DwgDiagnosticSeverity,
  DwgLossEntry,
  DwgLossScope,
  DwgLossSubject,
  DwgLossSubjectKind,
} from "./api/diagnostics.js";
export type { DwgSignatureCode } from "./container/signature.js";
export type {
  DwgExtensionCodec,
  DwgExtensionRegistry,
} from "./extensions/registry.js";
export type {
  DwgDocument,
  DwgHandleKey,
  DwgObject,
  DwgPropertyArray,
  DwgPropertyObject,
  DwgPropertyScalar,
  DwgPropertyValue,
  DwgQuarantinedObject,
  DwgSourceFingerprint,
  DwgSourceSpan,
  DwgTypedObject,
} from "./model/document.js";
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
