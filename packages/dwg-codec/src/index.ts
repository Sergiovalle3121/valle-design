export { probeDwg } from "./api/probe.js";
export { readDwg } from "./api/read.js";
// `writeDwg` es el writer VALIDADO POR ORÁCULO EXTERNO: emite el archivo
// AC1015 completo que ODA File Converter acepta (evidencia en
// dwg-oda-roundtrip.json). Hasta la campaña de cimientos este alias apuntaba
// al writer de CONTENEDOR con placeholders confesos — una superficie pública
// que mentía por omisión (auditoría externa, punto 9). El contenedor sigue
// exportado con su nombre honesto porque las pruebas de round-trip propio lo
// usan; lo que ya no existe es la confusión entre los dos.
export { writeAc1015MinimalFile as writeDwg } from "./writer/ac1015-minimal-file-writer.js";
export { writeAc1015Container } from "./writer/ac1015-container-writer.js";
export {
  canonicalDocumentToDwgEntities,
  dwgDatabaseToCanonicalDocument,
} from "./api/canonical.js";
export type {
  CanonicalCadDocumentJson,
  CanonicalLossEntry,
  CanonicalMappingResult,
  CanonicalOpaqueEntity,
  CanonicalToDwgEntity,
  CanonicalToDwgResult,
} from "./api/canonical.js";
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
