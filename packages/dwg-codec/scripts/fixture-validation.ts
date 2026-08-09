import { createHash } from "node:crypto";
import { lstat, open } from "node:fs/promises";
import { resolve } from "node:path";

import { probeDwg } from "../src/index.js";
import { canonicalJson, readCanonicalJson } from "./json-document.js";
import {
  assertUniqueCaseFolded,
  caseFold,
  compareCodeUnits,
  resolveSafeExistingPath,
  walkRegularFiles,
} from "./safe-path.js";
import { assertSchemaValid } from "./schema-validation.js";
import {
  createSyntheticCorpus,
  GENERATOR_PATH,
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
const MAX_PUBLIC_CORPUS_BYTES = 512 * 1024 * 1024;
const ORACLE_GROUND_TRUTH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "oracleId",
    "artifactSha256",
    "expectedOutcome",
    "expectedErrorCode",
    "producer",
    "tool",
    "createdAt",
  ],
  properties: {
    schemaVersion: { const: "1.0.0" },
    oracleId: {
      type: "string",
      pattern: "^DWG-ORACLE-[A-Z0-9][A-Z0-9._-]{7,119}$",
    },
    artifactSha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
    expectedOutcome: { enum: ["ok", "unsupported", "error"] },
    expectedErrorCode: { type: ["string", "null"] },
    producer: { type: "string", minLength: 1 },
    tool: {
      type: "object",
      additionalProperties: false,
      required: ["name", "version"],
      properties: {
        name: { type: "string", minLength: 1 },
        version: { type: "string", minLength: 1 },
      },
    },
    createdAt: { type: "string", format: "date" },
  },
} as const;

export interface FixtureValidationReport {
  readonly fixtureCount: number;
  readonly byteLength: number;
  readonly uniqueHashCount: number;
}

interface ContentAddressedJson {
  readonly path: string;
  readonly sha256: string;
  readonly byteLength: number;
}

interface CorpusIntakeRecord {
  readonly intakeId: string;
  readonly submittedAt: string;
  readonly disposition: "public-fixture" | "private-companion" | "rejected";
  readonly asset: {
    readonly sha256: string;
    readonly byteLength: number;
    readonly declaredVersion: string;
  };
  readonly origin: {
    readonly type:
      | "valle-synthetic"
      | "owner-created"
      | "original-measurement"
      | "third-party-licensed";
    readonly creator: string;
    readonly createdAt: string;
    readonly creationTool: string;
    readonly sourceIds: readonly string[];
  };
  readonly rightsReview: {
    readonly decision: "approved" | "rejected";
    readonly license: string;
    readonly useAllowed: boolean;
    readonly redistributionAllowed: boolean;
    readonly reviewer: string;
    readonly reviewedAt: string;
  };
  readonly privacyReview: {
    readonly decision: "approved" | "rejected";
    readonly containsCustomerData: boolean;
    readonly containsPersonalData: boolean;
    readonly containsSecrets: boolean;
    readonly reviewer: string;
    readonly reviewedAt: string;
  };
  readonly oracle: {
    readonly id: string;
    readonly kind: string;
    readonly expectedOutcome: "ok" | "unsupported" | "error";
    readonly expectedErrorCode: string | null;
    readonly groundTruthSha256: string;
    readonly groundTruthPath: string;
    readonly groundTruthByteLength: number;
    readonly reviewer: string;
    readonly reviewedAt: string;
  };
  readonly secondReview: {
    readonly decision: "approved" | "rejected";
    readonly reviewer: string;
    readonly reviewedAt: string;
  };
  readonly routing: {
    readonly repository: string;
    readonly relativePath: string | null;
  };
}

interface OracleGroundTruth {
  readonly schemaVersion: "1.0.0";
  readonly oracleId: string;
  readonly artifactSha256: string;
  readonly expectedOutcome: "ok" | "unsupported" | "error";
  readonly expectedErrorCode: string | null;
  readonly producer: string;
  readonly tool: {
    readonly name: string;
    readonly version: string;
  };
  readonly createdAt: string;
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readContentAddressedJson<T>(
  fixtureRoot: string,
  descriptor: ContentAddressedJson,
  pathPrefix: string,
  label: string,
): Promise<T> {
  const expectedPath = `${pathPrefix}/${descriptor.sha256}.json`;
  if (descriptor.path !== expectedPath) {
    throw new Error(`${label}: path does not match its content hash`);
  }
  const documentPath = await resolveSafeExistingPath(
    fixtureRoot,
    descriptor.path,
    "file",
    label,
  );
  const document = await readCanonicalJson<T>(documentPath, {
    requireLf: true,
  });
  if (
    document.bytes.byteLength !== descriptor.byteLength ||
    hashBytes(document.bytes) !== descriptor.sha256
  ) {
    throw new Error(`${label}: physical hash or size mismatch`);
  }
  return document.value;
}

function assertExactCaseFoldedValues(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  const actualValues = actual.map(caseFold).sort(compareCodeUnits);
  const expectedValues = expected.map(caseFold).sort(compareCodeUnits);
  if (canonicalJson(actualValues) !== canonicalJson(expectedValues)) {
    throw new Error(`${label}: values do not match`);
  }
}

function assertReviewerIndependence(record: CorpusIntakeRecord): void {
  const secondReviewer = caseFold(record.secondReview.reviewer);
  const disallowed = [
    record.origin.creator,
    record.rightsReview.reviewer,
    record.privacyReview.reviewer,
    record.oracle.reviewer,
  ].map(caseFold);
  if (disallowed.includes(secondReviewer)) {
    throw new Error(
      `${record.intakeId}: second reviewer must be independent from creator and primary reviewers`,
    );
  }
}

function assertIntakeChronology(
  entry: FixtureManifestEntry,
  record: CorpusIntakeRecord,
  manifestGeneratedAt: string,
): void {
  const submittedDate = record.submittedAt.slice(0, 10);
  const manifestDate = manifestGeneratedAt.slice(0, 10);
  const reviewDates = [
    record.rightsReview.reviewedAt,
    record.privacyReview.reviewedAt,
    record.oracle.reviewedAt,
    record.secondReview.reviewedAt,
  ];
  if (
    record.submittedAt.length < 20 ||
    record.origin.createdAt > submittedDate ||
    entry.createdAt !== record.origin.createdAt ||
    reviewDates.some(
      (reviewedAt) => reviewedAt < submittedDate || reviewedAt > manifestDate,
    )
  ) {
    throw new Error(`${record.intakeId}: intake chronology is inconsistent`);
  }
}

async function validateAuthorizedFixtureIntake(
  fixtureRoot: string,
  intakeSchema: unknown,
  manifestGeneratedAt: string,
  entry: FixtureManifestEntry,
): Promise<void> {
  if (
    entry.intakeId === undefined ||
    entry.intakeId === null ||
    entry.intakeRecord === undefined ||
    entry.intakeRecord === null ||
    entry.oracle === undefined ||
    entry.oracle === null
  ) {
    throw new Error(`${entry.id}: authorized fixture requires physical intake`);
  }

  const intake = await readContentAddressedJson<CorpusIntakeRecord>(
    fixtureRoot,
    entry.intakeRecord,
    "intake/sha256",
    `${entry.id} intake record`,
  );
  assertSchemaValid(intakeSchema, intake, `${entry.id} intake record`);
  const groundTruth = await readContentAddressedJson<OracleGroundTruth>(
    fixtureRoot,
    {
      path: entry.oracle.groundTruthPath,
      sha256: entry.oracle.groundTruthSha256,
      byteLength: entry.oracle.groundTruthByteLength,
    },
    "intake/oracles/sha256",
    `${entry.id} oracle ground truth`,
  );
  assertSchemaValid(
    ORACLE_GROUND_TRUTH_SCHEMA,
    groundTruth,
    `${entry.id} oracle ground truth`,
  );

  const expectedOrigin =
    entry.origin.type === "owner-authorized"
      ? "owner-created"
      : entry.origin.type;
  if (
    intake.intakeId !== entry.intakeId ||
    intake.disposition !== "public-fixture" ||
    intake.asset.sha256 !== entry.sha256 ||
    intake.asset.byteLength !== entry.byteLength ||
    intake.asset.declaredVersion !== entry.declaredVersion ||
    intake.origin.type !== expectedOrigin ||
    intake.origin.creator !== entry.creator ||
    intake.rightsReview.license !== entry.permission.license ||
    intake.routing.repository !== "valle-design" ||
    intake.routing.relativePath !== entry.path ||
    intake.oracle.id !== entry.oracle.id ||
    intake.oracle.kind !== entry.oracle.kind ||
    intake.oracle.expectedOutcome !== entry.expectations.parseOutcome ||
    intake.oracle.expectedErrorCode !== entry.expectations.errorCode ||
    intake.oracle.groundTruthSha256 !== entry.oracle.groundTruthSha256 ||
    intake.oracle.groundTruthPath !== entry.oracle.groundTruthPath ||
    intake.oracle.groundTruthByteLength !==
      entry.oracle.groundTruthByteLength ||
    intake.oracle.reviewer !== entry.oracle.reviewer ||
    intake.oracle.reviewedAt !== entry.oracle.reviewedAt
  ) {
    throw new Error(
      `${entry.id}: physical intake record does not match manifest bytes, rights, routing or oracle`,
    );
  }
  assertExactCaseFoldedValues(
    intake.origin.sourceIds,
    entry.sourceIds,
    `${entry.id} intake source IDs`,
  );
  assertReviewerIndependence(intake);
  assertIntakeChronology(entry, intake, manifestGeneratedAt);
  if (
    groundTruth.schemaVersion !== "1.0.0" ||
    groundTruth.oracleId !== entry.oracle.id ||
    groundTruth.artifactSha256 !== entry.sha256 ||
    groundTruth.expectedOutcome !== entry.expectations.parseOutcome ||
    groundTruth.expectedErrorCode !== entry.expectations.errorCode ||
    groundTruth.producer.trim() === "" ||
    groundTruth.tool.name.trim() === "" ||
    groundTruth.tool.version.trim() === "" ||
    groundTruth.createdAt < entry.createdAt ||
    groundTruth.createdAt > entry.oracle.reviewedAt
  ) {
    throw new Error(`${entry.id}: oracle ground truth is not applicable`);
  }
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
  if (!entry.synthetic) {
    if (
      entry.intakeId === undefined ||
      entry.intakeId === null ||
      entry.intakeRecord === undefined ||
      entry.intakeRecord === null ||
      entry.oracle === undefined ||
      entry.oracle === null ||
      entry.origin.reference !== entry.intakeId ||
      entry.permission.redistributionEvidence !== entry.intakeId ||
      entry.oracle.artifactSha256 !== entry.sha256 ||
      entry.oracle.reviewedAt < entry.createdAt
    ) {
      throw new Error(
        `${entry.id}: authorized fixture intake, content-addressed record, redistribution evidence and oracle must match its exact bytes`,
      );
    }
  }
  if (
    outcome === "ok" &&
    (entry.synthetic || entry.oracle === undefined || entry.oracle === null)
  ) {
    throw new Error(
      `${entry.id}: parse success requires an authorized non-synthetic fixture and an immutable oracle`,
    );
  }
  if (
    (signature === "unknown-version" && outcome !== "unsupported") ||
    ((signature === "invalid" || signature === "truncated") &&
      outcome !== "error")
  ) {
    throw new Error(
      `${entry.id}: signature and expected parse outcome contradict the fixture policy`,
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
  if (result.workUnits > entry.expectations.maxWorkUnits) {
    throw new Error(
      `${entry.id}: probe used ${result.workUnits} work units above manifest maximum ${entry.expectations.maxWorkUnits}`,
    );
  }

  const signatureKind = entry.expectations.signature;
  if (signatureKind === "invalid" || signatureKind === "truncated") {
    if (
      result.probe !== null ||
      result.error.category !== "input" ||
      result.error.code !== entry.expectations.errorCode
    ) {
      throw new Error(
        `${entry.id}: invalid/truncated input must match its typed probe error without metadata`,
      );
    }
    return;
  }

  if (
    result.error.category !== "unsupported" ||
    result.probe === null ||
    result.probe.signature !== entry.declaredVersion ||
    result.probe.byteLength !== entry.byteLength
  ) {
    throw new Error(
      `${entry.id}: signature probe metadata contradicts the independent manifest`,
    );
  }
  if (signatureKind === "recognized") {
    if (
      result.probe.versionKind !== "known" ||
      result.probe.version.code !== entry.declaredVersion
    ) {
      throw new Error(`${entry.id}: recognized version metadata mismatch`);
    }
    if (
      entry.expectations.parseOutcome === "unsupported" &&
      result.error.code !== entry.expectations.errorCode
    ) {
      throw new Error(
        `${entry.id}: current unsupported probe error does not match the manifest`,
      );
    }
  } else if (
    result.probe.versionKind !== "unknown" ||
    result.probe.version !== null ||
    result.error.code !== entry.expectations.errorCode
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

export async function validateFixtures(
  packageRoot: string,
): Promise<FixtureValidationReport> {
  const fixtureRoot = resolve(packageRoot, "fixtures");
  const intakeSchemaDocument = await readCanonicalJson<unknown>(
    resolve(packageRoot, "corpus-intake.schema.json"),
    { requireCanonicalLayout: false },
  );
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
  const generatedById = new Map(corpus.map((fixture) => [fixture.id, fixture]));
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
    ...manifest.fixtures.flatMap((fixture) => {
      const paths = [fixture.path];
      if (
        !fixture.synthetic &&
        fixture.intakeRecord !== undefined &&
        fixture.intakeRecord !== null &&
        fixture.oracle !== undefined &&
        fixture.oracle !== null
      ) {
        paths.push(fixture.intakeRecord.path, fixture.oracle.groundTruthPath);
      }
      return paths;
    }),
  ].sort(compareCodeUnits);
  const actualFileSet = [
    ...(await walkRegularFiles(fixtureRoot, {
      forbiddenEntryNames: ["external"],
    })),
  ].sort(compareCodeUnits);
  if (canonicalJson(actualFileSet) !== canonicalJson(expectedFileSet)) {
    throw new Error(
      `fixtures: exact file set mismatch; expected ${expectedFileSet.length} files, found ${actualFileSet.length}`,
    );
  }

  let totalBytes = 0;
  const seenCanonicalGeneratorIds = new Set<string>();
  for (const entry of manifest.fixtures) {
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
    if (entry.synthetic) {
      if (entry.generatedBy !== GENERATOR_PATH) {
        throw new Error(
          `${entry.id}: synthetic fixtures require the registered deterministic generator`,
        );
      }
      const generated = generatedById.get(entry.id);
      if (
        generated === undefined ||
        generated.path !== entry.path ||
        !bytesEqual(bytes, generated.bytes)
      ) {
        throw new Error(
          `${entry.id}: canonical synthetic bytes or path do not match the deterministic generator`,
        );
      }
      seenCanonicalGeneratorIds.add(entry.id);
    } else {
      await validateAuthorizedFixtureIntake(
        fixtureRoot,
        intakeSchemaDocument.value,
        manifest.generatedAt,
        entry,
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
    if (
      !Number.isSafeInteger(totalBytes) ||
      totalBytes > MAX_PUBLIC_CORPUS_BYTES
    ) {
      throw new Error(
        `fixtures: public corpus exceeds the ${MAX_PUBLIC_CORPUS_BYTES}-byte budget`,
      );
    }
  }

  for (const generated of corpus) {
    if (!seenCanonicalGeneratorIds.has(generated.id)) {
      throw new Error(
        `${generated.id}: canonical deterministic fixture is missing from the manifest`,
      );
    }
  }

  return {
    fixtureCount: manifest.fixtures.length,
    byteLength: totalBytes,
    uniqueHashCount: new Set(manifest.fixtures.map((fixture) => fixture.sha256))
      .size,
  };
}
