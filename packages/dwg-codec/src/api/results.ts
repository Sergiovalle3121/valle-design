import type { DwgDiagnostic, DwgLossEntry } from "./diagnostics.js";
import type { DwgSignatureCode } from "../container/signature.js";
import type {
  DwgDecoderStatus,
  DwgVersion,
} from "../container/version-registry.js";
import type { DwgError } from "../security/parse-error.js";

interface DwgProbeMetadataBase {
  readonly signature: DwgSignatureCode;
  readonly byteLength: number;
  readonly decoderStatus: DwgDecoderStatus;
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

/**
 * Éxito del probe: la firma es válida, la versión está registrada y el
 * laboratorio tiene un decodificador para ella (`decoderStatus` distinto de
 * "unsupported"). El probe sólo valida la firma; no afirma que el resto del
 * archivo sea un DWG bien formado — eso es trabajo de `readDwg`.
 */
export interface DwgProbeSuccess {
  readonly ok: true;
  readonly diagnostics: readonly DwgDiagnostic[];
  readonly lossManifest: readonly DwgLossEntry[];
  readonly probe: DwgKnownProbeMetadata;
  readonly workUnits: number;
}

export interface DwgProbeFailure {
  readonly ok: false;
  readonly error: DwgError;
  readonly diagnostics: readonly DwgDiagnostic[];
  readonly lossManifest: readonly DwgLossEntry[];
  readonly probe: DwgProbeMetadata | null;
  readonly workUnits: number;
}

export type DwgProbeResult = DwgProbeSuccess | DwgProbeFailure;
