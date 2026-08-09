import type { DwgDiagnostic, DwgLossEntry } from "../api/diagnostics.js";
import type { DwgCapabilityFamily } from "../api/capabilities.js";
import type { DwgVersionCode } from "../container/version-registry.js";

export const DWG_NEUTRAL_MODEL_VERSION = 1 as const;

export type DwgHandleKey = string;

export interface DwgSourceFingerprint {
  readonly sha256: string;
  readonly byteLength: number;
  readonly version: DwgVersionCode;
}

export interface DwgSourceSpan {
  readonly sourceSha256: string;
  readonly offset: number;
  readonly byteLength: number;
}

export type DwgPropertyScalar = string | number | boolean | null;
export interface DwgPropertyArray extends ReadonlyArray<DwgPropertyValue> {}
export interface DwgPropertyObject {
  readonly [key: string]: DwgPropertyValue;
}
export type DwgPropertyValue =
  DwgPropertyScalar | DwgPropertyArray | DwgPropertyObject;

interface DwgObjectBase {
  readonly handle: DwgHandleKey;
  readonly owner: DwgHandleKey | null;
  readonly dependencyHandles: readonly DwgHandleKey[];
  readonly objectType: string;
}

export interface DwgTypedObject extends DwgObjectBase {
  readonly representation: "typed";
  readonly family: DwgCapabilityFamily;
  readonly properties: DwgPropertyObject;
}

export interface DwgQuarantinedObject extends DwgObjectBase {
  readonly representation: "quarantined";
  readonly classId: string | null;
  readonly sourceSpan: DwgSourceSpan;
  readonly editableMetadata: Readonly<Record<string, DwgPropertyScalar>>;
}

export type DwgObject = DwgTypedObject | DwgQuarantinedObject;

/** A complete neutral document is only returned by a successful reader. */
export interface DwgDocument {
  readonly neutralModelVersion: typeof DWG_NEUTRAL_MODEL_VERSION;
  readonly objectDatabaseComplete: true;
  readonly source: DwgSourceFingerprint;
  readonly objects: readonly DwgObject[];
  readonly diagnostics: readonly DwgDiagnostic[];
  readonly lossManifest: readonly DwgLossEntry[];
}
