import type { DwgDiagnostic, DwgLossEntry } from "./diagnostics.js";
import type { DwgSignatureCode } from "../container/signature.js";
import type { DwgVersion } from "../container/version-registry.js";
import type { DwgError } from "../security/parse-error.js";

interface DwgProbeMetadataBase {
  readonly signature: DwgSignatureCode;
  readonly byteLength: number;
  readonly decoderStatus: "unsupported";
}

export interface DwgKnownProbeMetadata extends DwgProbeMetadataBase {
  readonly versionKind: "known";
  readonly version: DwgVersion;
}

export interface DwgUnknownProbeMetadata extends DwgProbeMetadataBase {
  readonly versionKind: "unknown";
  readonly version: null;
}

export type DwgProbeMetadata = DwgKnownProbeMetadata | DwgUnknownProbeMetadata;

export interface DwgProbeResult {
  readonly ok: false;
  readonly error: DwgError;
  readonly diagnostics: readonly DwgDiagnostic[];
  readonly lossManifest: readonly DwgLossEntry[];
  readonly probe: DwgProbeMetadata | null;
  readonly workUnits: number;
}
