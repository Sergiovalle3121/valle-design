import { assertUniqueCaseFolded } from "./safe-path.js";

export interface PrivateBundleManifest {
  readonly entries: readonly {
    readonly id: string;
    readonly objectPath: string;
    readonly sha256: string;
    readonly intakeRecordPath: string;
    readonly intakeRecordSha256: string;
    readonly oraclePath: string;
    readonly oracleSha256: string;
  }[];
}

export function validatePrivateBundleManifestStructure(
  manifest: PrivateBundleManifest,
): void {
  const dimensions = [
    [manifest.entries.map((entry) => entry.id), "private bundle entry IDs"],
    [
      manifest.entries.map((entry) => entry.objectPath),
      "private bundle object paths",
    ],
    [
      manifest.entries.map((entry) => entry.sha256),
      "private bundle object hashes",
    ],
    [
      manifest.entries.map((entry) => entry.intakeRecordPath),
      "private bundle intake paths",
    ],
    [
      manifest.entries.map((entry) => entry.intakeRecordSha256),
      "private bundle intake hashes",
    ],
    [
      manifest.entries.map((entry) => entry.oraclePath),
      "private bundle oracle paths",
    ],
    [
      manifest.entries.map((entry) => entry.oracleSha256),
      "private bundle oracle hashes",
    ],
  ] as const;
  for (const [values, label] of dimensions) {
    assertUniqueCaseFolded(values, label);
  }
  for (const entry of manifest.entries) {
    if (
      entry.objectPath !== `objects/sha256/${entry.sha256}.dwg` ||
      entry.intakeRecordPath !==
        `intake/sha256/${entry.intakeRecordSha256}.json` ||
      entry.oraclePath !== `oracles/sha256/${entry.oracleSha256}.json`
    ) {
      throw new Error(`${entry.id}: private bundle path/hash mismatch`);
    }
  }
}
