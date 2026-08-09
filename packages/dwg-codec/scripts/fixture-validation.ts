import { createHash } from "node:crypto";
import { lstat, open } from "node:fs/promises";
import { resolve } from "node:path";

import { probeDwg } from "../src/index.js";
import { canonicalJson, readCanonicalJson } from "./json-document.js";
import {
  assertUniqueCaseFolded,
  compareCodeUnits,
  resolveSafeExistingPath,
  walkRegularFiles,
} from "./safe-path.js";
import { assertSchemaValid } from "./schema-validation.js";
import {
  createSyntheticCorpus,
  createSyntheticManifest,
  type FixtureManifest,
  type FixtureManifestEntry,
} from "../fixtures/generators/generate-synthetic.js";

const FIXTURE_INFRASTRUCTURE_FILES = [
  ".gitattributes",
  "generators/generate-synthetic.ts",
  "manifest.json",
  "manifest.schema.json",
] as const;
const MAX_FIXTURE_BYTES = 64 * 1024 * 1024;

export interface FixtureValidationReport {
  readonly fixtureCount: number;
  readonly byteLength: number;
  readonly uniqueHashCount: number;
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function assertExpectedOutcome(entry: FixtureManifestEntry): void {
  const signature = entry.expectations.signature;
  const outcome = entry.expectations.parseOutcome;
  if (outcome === "ok") {
    throw new Error(
      `${entry.id}: no DWG-0 synthetic fixture may claim parse success`,
    );
  }
  if (
    ((signature === "recognized" || signature === "unknown-version") &&
      outcome !== "unsupported") ||
    ((signature === "invalid" || signature === "truncated") &&
      outcome !== "error")
  ) {
    throw new Error(
      `${entry.id}: signature and parse outcome contradict DWG-0 scope`,
    );
  }
}

function assertProbeMatchesManifest(
  entry: FixtureManifestEntry,
  bytes: Uint8Array,
): void {
  const result = probeDwg(bytes);
  if (result.error.code === "DWG_INTERNAL_ERROR") {
    throw new Error(`${entry.id}: probe escaped as DWG_INTERNAL_ERROR`);
  }
  if (result.error.code !== entry.expectations.errorCode) {
    throw new Error(
      `${entry.id}: probe error ${result.error.code} does not match manifest ${entry.expectations.errorCode}`,
    );
  }
  if (result.workUnits > entry.expectations.maxWorkUnits) {
    throw new Error(
      `${entry.id}: probe used ${result.workUnits} work units above manifest maximum ${entry.expectations.maxWorkUnits}`,
    );
  }

  const signatureKind = entry.expectations.signature;
  if (signatureKind === "invalid" || signatureKind === "truncated") {
    if (result.probe !== null || result.error.category !== "input") {
      throw new Error(
        `${entry.id}: invalid/truncated input must fail as input without probe metadata`,
      );
    }
    return;
  }

  if (
    entry.expectations.parseOutcome !== "unsupported" ||
    result.error.category !== "unsupported" ||
    result.probe === null ||
    result.probe.signature !== entry.declaredVersion ||
    result.probe.byteLength !== entry.byteLength
  ) {
    throw new Error(
      `${entry.id}: unsupported probe metadata contradicts the independent manifest`,
    );
  }
  if (signatureKind === "recognized") {
    if (
      result.probe.versionKind !== "known" ||
      result.probe.version.code !== entry.declaredVersion
    ) {
      throw new Error(`${entry.id}: recognized version metadata mismatch`);
    }
  } else if (
    result.probe.versionKind !== "unknown" ||
    result.probe.version !== null
  ) {
    throw new Error(`${entry.id}: unknown version metadata mismatch`);
  }
}

async function readBoundedFixture(
  fixturePath: string,
  expectedByteLength: number,
  fixtureId: string,
): Promise<Uint8Array> {
  if (
    !Number.isSafeInteger(expectedByteLength) ||
    expectedByteLength < 0 ||
    expectedByteLength > MAX_FIXTURE_BYTES
  ) {
    throw new Error(
      `${fixtureId}: manifest byteLength exceeds the fixture limit`,
    );
  }

  const pathStats = await lstat(fixturePath);
  if (
    pathStats.size > MAX_FIXTURE_BYTES ||
    pathStats.size !== expectedByteLength
  ) {
    throw new Error(
      `${fixtureId}: physical size ${pathStats.size} does not match bounded manifest size ${expectedByteLength}`,
    );
  }

  const handle = await open(fixturePath, "r");
  try {
    const beforeRead = await handle.stat();
    if (
      !beforeRead.isFile() ||
      beforeRead.size > MAX_FIXTURE_BYTES ||
      beforeRead.size !== expectedByteLength
    ) {
      throw new Error(`${fixtureId}: file changed before its bounded read`);
    }

    const bytes = Buffer.alloc(expectedByteLength);
    let offset = 0;
    while (offset < expectedByteLength) {
      const { bytesRead } = await handle.read(
        bytes,
        offset,
        expectedByteLength - offset,
        offset,
      );
      if (bytesRead === 0) {
        throw new Error(
          `${fixtureId}: file was truncated during its bounded read`,
        );
      }
      offset += bytesRead;
    }

    const sentinel = Buffer.alloc(1);
    const { bytesRead: extraBytes } = await handle.read(
      sentinel,
      0,
      1,
      expectedByteLength,
    );
    const afterRead = await handle.stat();
    if (extraBytes !== 0 || afterRead.size !== expectedByteLength) {
      throw new Error(`${fixtureId}: file grew during its bounded read`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

function assertManifestMatchesGenerator(
  manifest: FixtureManifest,
  expectedManifest: FixtureManifest,
): void {
  if (canonicalJson(manifest) !== canonicalJson(expectedManifest)) {
    throw new Error(
      "fixtures/manifest.json: content does not exactly match the deterministic first-party generator",
    );
  }
}

export async function validateFixtures(
  packageRoot: string,
): Promise<FixtureValidationReport> {
  const fixtureRoot = resolve(packageRoot, "fixtures");
  const schemaDocument = await readCanonicalJson<unknown>(
    resolve(fixtureRoot, "manifest.schema.json"),
    { requireCanonicalLayout: false },
  );
  const manifestDocument = await readCanonicalJson<FixtureManifest>(
    resolve(fixtureRoot, "manifest.json"),
    { requireLf: true },
  );
  assertSchemaValid<FixtureManifest>(
    schemaDocument.value,
    manifestDocument.value,
    "fixtures/manifest.json",
  );

  const manifest = manifestDocument.value;
  const corpus = createSyntheticCorpus();
  const expectedManifest = createSyntheticManifest(corpus);

  if (manifest.fixtures.length !== 21) {
    throw new Error(
      `fixtures/manifest.json: expected 21 entries, found ${manifest.fixtures.length}`,
    );
  }
  assertUniqueCaseFolded(
    manifest.fixtures.map((fixture) => fixture.id),
    "fixture IDs",
  );
  assertUniqueCaseFolded(
    manifest.fixtures.map((fixture) => fixture.path),
    "fixture paths",
  );
  assertUniqueCaseFolded(
    manifest.fixtures.map((fixture) => fixture.sha256),
    "fixture SHA-256 values",
  );

  const expectedFileSet = [
    ...FIXTURE_INFRASTRUCTURE_FILES,
    ...manifest.fixtures.map((fixture) => fixture.path),
  ].sort(compareCodeUnits);
  const actualFileSet = [
    ...(await walkRegularFiles(fixtureRoot, {
      forbiddenEntryNames: ["authorized", "external"],
    })),
  ].sort(compareCodeUnits);
  if (canonicalJson(actualFileSet) !== canonicalJson(expectedFileSet)) {
    throw new Error(
      `fixtures: exact file set mismatch; expected ${expectedFileSet.length} files, found ${actualFileSet.length}`,
    );
  }

  let totalBytes = 0;
  for (const [index, entry] of manifest.fixtures.entries()) {
    assertExpectedOutcome(entry);
    const fixturePath = await resolveSafeExistingPath(
      fixtureRoot,
      entry.path,
      "file",
      `fixture ${entry.id}`,
    );
    const bytes = await readBoundedFixture(
      fixturePath,
      entry.byteLength,
      entry.id,
    );
    const expectedBytes = corpus[index]?.bytes;
    if (expectedBytes === undefined || !bytesEqual(bytes, expectedBytes)) {
      throw new Error(
        `${entry.id}: bytes do not match the deterministic generator`,
      );
    }
    if (bytes.byteLength !== entry.byteLength) {
      throw new Error(
        `${entry.id}: byteLength ${entry.byteLength} does not match ${bytes.byteLength} versioned bytes`,
      );
    }
    const actualHash = hashBytes(bytes);
    if (actualHash !== entry.sha256) {
      throw new Error(`${entry.id}: SHA-256 does not match versioned bytes`);
    }
    assertProbeMatchesManifest(entry, bytes);
    totalBytes += bytes.byteLength;
  }

  if (totalBytes !== 109) {
    throw new Error(`fixtures: expected 109 corpus bytes, found ${totalBytes}`);
  }
  assertManifestMatchesGenerator(manifest, expectedManifest);

  return {
    fixtureCount: manifest.fixtures.length,
    byteLength: totalBytes,
    uniqueHashCount: new Set(manifest.fixtures.map((fixture) => fixture.sha256))
      .size,
  };
}
