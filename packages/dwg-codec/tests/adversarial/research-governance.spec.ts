import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { canonicalJson } from "../../scripts/json-document.js";
import { validatePrivateBundleManifestStructure } from "../../scripts/private-bundle-validation.js";
import {
  assertFullyIndependentEvidence,
  type EvidenceRecord,
  validateResearchGovernance,
} from "../../scripts/research-validation.js";
import { assertSchemaValid } from "../../scripts/schema-validation.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown, label: string): JsonRecord {
  assert.ok(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`,
  );
  return value as JsonRecord;
}

function asArray(value: unknown, label: string): unknown[] {
  assert.ok(Array.isArray(value), `${label} must be an array`);
  return value;
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function withClone(
  label: string,
  body: (repositoryRoot: string, clonedPackage: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), `valle-dwg1-${label}-`));
  try {
    const repositoryRoot = resolve(root, "repository");
    const clonedPackage = resolve(repositoryRoot, "packages/dwg-codec");
    await mkdir(dirname(clonedPackage), { recursive: true });
    await cp(packageRoot, clonedPackage, {
      filter(source) {
        const normalized = source.replaceAll("\\", "/");
        return (
          !normalized.includes("/node_modules/") &&
          !normalized.includes("/dist/") &&
          !normalized.includes("/.turbo/")
        );
      },
      recursive: true,
    });

    const facts = asRecord(
      JSON.parse(
        await readFile(resolve(clonedPackage, "FACT_REGISTER.json"), "utf8"),
      ) as unknown,
      "FACT_REGISTER.json",
    );
    for (const factValue of asArray(facts.facts, "facts")) {
      const fact = asRecord(factValue, "fact");
      for (const pathValue of asArray(fact.derivedFiles, "derivedFiles")) {
        assert.equal(typeof pathValue, "string");
        const target = resolve(repositoryRoot, pathValue as string);
        if (!(await exists(target))) {
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, new Uint8Array());
        }
      }
    }
    await body(repositoryRoot, clonedPackage);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

async function mutateJson(
  path: string,
  mutation: (document: JsonRecord) => void,
): Promise<void> {
  const document = asRecord(
    JSON.parse(await readFile(path, "utf8")) as unknown,
    path,
  );
  mutation(document);
  await writeFile(path, canonicalJson(document), "utf8");
}

interface TestTechnicalSource {
  readonly id: string;
  readonly locator: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly license: string;
}

async function installTestTechnicalSource(
  clonedPackage: string,
  derivedFiles: readonly string[] = [],
): Promise<TestTechnicalSource> {
  const directivePath = resolve(clonedPackage, "OWNER_DIRECTIVE_DWG1.md");
  const bytes = await readFile(directivePath);
  const source: TestTechnicalSource = {
    id: "VALLE-TEST-TECHNICAL-SOURCE",
    locator: "repo://valle-design/packages/dwg-codec/OWNER_DIRECTIVE_DWG1.md",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    byteLength: bytes.byteLength,
    license: "Valle proprietary original measurement",
  };
  await mutateJson(
    resolve(clonedPackage, "SOURCE_REGISTER.json"),
    (register) => {
      const entries = asArray(register.entries, "entries");
      const template = structuredClone(
        asRecord(entries.at(-1), "source template"),
      );
      template.id = source.id;
      template.owner = "Adversarial test producer";
      template.origin = {
        type: "original-measurement",
        location: source.locator,
        accessedAt: "2026-08-09",
        sha256: source.sha256,
        byteLength: source.byteLength,
      };
      template.title = "Adversarial test-only technical source";
      template.terms = {
        license: source.license,
        access: "Local adversarial test",
        redistribution: "Test clone only",
        notes: "No DWG format fact",
      };
      template.factsConsulted = ["Adversarial gate behavior only"];
      template.derivedFiles = [...derivedFiles];
      entries.push(template);
    },
  );
  return source;
}

async function writeTestEvidenceArtifact(
  clonedPackage: string,
  id: string,
): Promise<{
  readonly path: string;
  readonly sha256: string;
  readonly byteLength: number;
}> {
  const text = canonicalJson({ id, purpose: "adversarial gate test only" });
  const sha256 = createHash("sha256").update(text).digest("hex");
  const path = `evidence/sha256/${sha256}.json`;
  const physicalPath = resolve(clonedPackage, path);
  await mkdir(dirname(physicalPath), { recursive: true });
  await writeFile(physicalPath, text, "utf8");
  return { path, sha256, byteLength: Buffer.byteLength(text) };
}

test("research governance expands every v1 family/property scope cell", async () => {
  const repositoryRoot = resolve(packageRoot, "..", "..");
  const report = await validateResearchGovernance(repositoryRoot, packageRoot);
  assert.equal(report.familyCount, 19);
  assert.equal(report.propertyCount, 63);
  assert.equal(report.matrixCellCount, 1_134);
  assert.equal(report.evidenceCount, 0);
  assert.equal(report.classRegistryComplete, false);
});

test("research governance rejects overlapping matrix selectors", async () => {
  await withClone("matrix-overlap", async (repositoryRoot, clonedPackage) => {
    await mutateJson(
      resolve(clonedPackage, "COMPATIBILITY_MATRIX.v1.json"),
      (matrix) => {
        const coverage = asArray(matrix.coverage, "coverage");
        const duplicate = structuredClone(
          asRecord(coverage[0], "coverage row"),
        );
        duplicate.familyProperties = [
          { familyId: "envelope", propertyIds: ["container"] },
        ];
        coverage.push(duplicate);
      },
    );
    await assert.rejects(
      validateResearchGovernance(repositoryRoot, clonedPackage),
      /overlapping coverage/,
    );
  });
});

test("research governance rejects a matrix with an uncovered property", async () => {
  await withClone("matrix-gap", async (repositoryRoot, clonedPackage) => {
    await mutateJson(
      resolve(clonedPackage, "COMPATIBILITY_MATRIX.v1.json"),
      (matrix) => {
        const row = asRecord(asArray(matrix.coverage, "coverage")[0], "row");
        const envelope = asArray(row.familyProperties, "familyProperties")
          .map((selector) => asRecord(selector, "family property selector"))
          .find((selector) => selector.familyId === "envelope");
        assert.ok(envelope);
        envelope.propertyIds = asArray(
          envelope.propertyIds,
          "propertyIds",
        ).filter((property) => property !== "compression");
      },
    );
    await assert.rejects(
      validateResearchGovernance(repositoryRoot, clonedPackage),
      /1116\/1134 required cells/,
    );
  });
});

test("research governance rejects an unknown family-scoped property", async () => {
  await withClone(
    "matrix-unknown-property",
    async (repositoryRoot, clonedPackage) => {
      await mutateJson(
        resolve(clonedPackage, "COMPATIBILITY_MATRIX.v1.json"),
        (matrix) => {
          const row = asRecord(asArray(matrix.coverage, "coverage")[0], "row");
          const selector = asRecord(
            asArray(row.familyProperties, "familyProperties")[0],
            "family property selector",
          );
          asArray(selector.propertyIds, "propertyIds").push(
            "invented-property",
          );
        },
      );
      await assert.rejects(
        validateResearchGovernance(repositoryRoot, clonedPackage),
        /unknown property envelope\/invented-property/,
      );
    },
  );
});

test("research governance rejects evidence that omits a covered property", async () => {
  await withClone(
    "matrix-evidence-property-gap",
    async (repositoryRoot, clonedPackage) => {
      const artifact = await writeTestEvidenceArtifact(
        clonedPackage,
        "property-gap",
      );
      const source = await installTestTechnicalSource(clonedPackage, [
        `packages/dwg-codec/${artifact.path}`,
      ]);
      await mutateJson(
        resolve(clonedPackage, "COMPATIBILITY_MATRIX.v1.json"),
        (matrix) => {
          const row = asRecord(asArray(matrix.coverage, "coverage")[0], "row");
          const familyProperties = structuredClone(
            asArray(row.familyProperties, "familyProperties"),
          );
          const envelope = asRecord(
            familyProperties[0],
            "evidence family property selector",
          );
          envelope.propertyIds = asArray(
            envelope.propertyIds,
            "propertyIds",
          ).filter((property) => property !== "compression");
          matrix.evidenceRecords = [
            {
              id: "VALLE-TEST-EVIDENCE-PROPERTY-GAP",
              kind: "e2e",
              versionCodes: asArray(row.versionCodes, "versionCodes"),
              directions: asArray(row.directions, "directions"),
              familyProperties,
              sourceIds: [source.id],
              artifactPath: artifact.path,
              artifactSha256: artifact.sha256,
              artifactByteLength: artifact.byteLength,
              producer: "Property-gap producer",
              tool: { name: "Property-gap tool", version: "1.0.0" },
              independent: false,
              reviewer: "Test reviewer",
              reviewedAt: "2026-08-09",
            },
          ];
          row.evidenceIds = ["VALLE-TEST-EVIDENCE-PROPERTY-GAP"];
        },
      );
      await assert.rejects(
        validateResearchGovernance(repositoryRoot, clonedPackage),
        /evidence VALLE-TEST-EVIDENCE-PROPERTY-GAP does not cover AC1009\/read\/envelope\/compression/,
      );
    },
  );
});

test("research governance rejects an allowed fact backed by quarantine", async () => {
  await withClone("fact-quarantine", async (repositoryRoot, clonedPackage) => {
    await mutateJson(
      resolve(clonedPackage, "SOURCE_REGISTER.json"),
      (register) => {
        const source = asArray(register.entries, "entries")
          .map((entry) => asRecord(entry, "source"))
          .find((entry) => entry.id === "VALLE-OWNER-DWG1-2026-08-09");
        assert.ok(source);
        source.status = "quarantined";
        source.factsConsulted = [];
        source.derivedFiles = [];
      },
    );
    await assert.rejects(
      validateResearchGovernance(repositoryRoot, clonedPackage),
      /allowed fact references a non-allowed source/,
    );
  });
});

test("research governance rejects a fact evidence hash mismatch", async () => {
  await withClone("fact-hash", async (repositoryRoot, clonedPackage) => {
    await mutateJson(
      resolve(clonedPackage, "FACT_REGISTER.json"),
      (register) => {
        const fact = asRecord(asArray(register.facts, "facts")[0], "fact");
        const evidence = asRecord(
          asArray(fact.sourceEvidence, "sourceEvidence")[0],
          "evidence",
        );
        evidence.sha256 = "0".repeat(64);
      },
    );
    await assert.rejects(
      validateResearchGovernance(repositoryRoot, clonedPackage),
      /evidence locator, hash or size disagrees/,
    );
  });
});

test("incomplete class registry blocks every matrix promotion", async () => {
  await withClone(
    "matrix-class-gate",
    async (repositoryRoot, clonedPackage) => {
      await mutateJson(
        resolve(clonedPackage, "COMPATIBILITY_MATRIX.v1.json"),
        (matrix) => {
          const row = asRecord(asArray(matrix.coverage, "coverage")[0], "row");
          row.status = "not-applicable";
        },
      );
      await assert.rejects(
        validateResearchGovernance(repositoryRoot, clonedPackage),
        /class registry is incomplete; every scope cell must remain not-started/,
      );
    },
  );
});

test("technical facts reject public source metadata without a physical snapshot", async () => {
  await withClone("fact-snapshot", async (repositoryRoot, clonedPackage) => {
    await mutateJson(
      resolve(clonedPackage, "FACT_REGISTER.json"),
      (register) => {
        const facts = asArray(register.facts, "facts");
        const technical = structuredClone(asRecord(facts[0], "fact"));
        technical.id = "VALLE-TEST-PUBLIC-SOURCE-FACT";
        technical.kind = "format";
        technical.statement = "Adversarial test-only public source fact.";
        technical.sourceIds = ["AJV-8.20.0-OFFICIAL"];
        technical.sourceEvidence = [
          {
            sourceId: "AJV-8.20.0-OFFICIAL",
            locator: "https://www.npmjs.com/package/ajv/v/8.20.0",
            sha256: "4".repeat(64),
            byteLength: 1,
          },
        ];
        technical.terms = {
          license: "MIT",
          permittedUse: "Adversarial test clone only",
          redistribution: "None",
        };
        technical.derivedFiles = [];
        facts.push(technical);
      },
    );
    await assert.rejects(
      validateResearchGovernance(repositoryRoot, clonedPackage),
      /technical source requires a content-addressed repository snapshot, hash and size/,
    );
  });
});

test("matrix evidence rejects metadata without a physical artifact", async () => {
  await withClone(
    "matrix-evidence-physical",
    async (repositoryRoot, clonedPackage) => {
      const source = await installTestTechnicalSource(clonedPackage);
      await mutateJson(
        resolve(clonedPackage, "COMPATIBILITY_MATRIX.v1.json"),
        (matrix) => {
          const row = asRecord(asArray(matrix.coverage, "coverage")[0], "row");
          matrix.evidenceRecords = [
            {
              id: "VALLE-TEST-MISSING-ARTIFACT",
              kind: "e2e",
              versionCodes: asArray(row.versionCodes, "versionCodes"),
              directions: asArray(row.directions, "directions"),
              familyProperties: asArray(
                row.familyProperties,
                "familyProperties",
              ),
              sourceIds: [source.id],
              artifactPath: `evidence/sha256/${"5".repeat(64)}.json`,
              artifactSha256: "5".repeat(64),
              artifactByteLength: 10,
              producer: "Missing artifact producer",
              tool: { name: "Missing artifact tool", version: "1.0.0" },
              independent: false,
              reviewer: "Missing artifact reviewer",
              reviewedAt: "2026-08-09",
            },
          ];
          row.evidenceIds = ["VALLE-TEST-MISSING-ARTIFACT"];
        },
      );
      await assert.rejects(
        validateResearchGovernance(repositoryRoot, clonedPackage),
        /does not exist/,
      );
    },
  );
});

test("evidence kind must be valid for every selected direction", async () => {
  await withClone(
    "matrix-evidence-kind",
    async (repositoryRoot, clonedPackage) => {
      await mutateJson(
        resolve(clonedPackage, "COMPATIBILITY_MATRIX.v1.json"),
        (matrix) => {
          const row = asRecord(asArray(matrix.coverage, "coverage")[0], "row");
          matrix.evidenceRecords = [
            {
              id: "VALLE-TEST-WRONG-DIRECTION-KIND",
              kind: "fixture",
              versionCodes: asArray(row.versionCodes, "versionCodes"),
              directions: asArray(row.directions, "directions"),
              familyProperties: asArray(
                row.familyProperties,
                "familyProperties",
              ),
              sourceIds: ["VALLE-OWNER-DWG1-2026-08-09"],
              artifactPath: `evidence/sha256/${"6".repeat(64)}.json`,
              artifactSha256: "6".repeat(64),
              artifactByteLength: 10,
              producer: "Wrong kind producer",
              tool: { name: "Wrong kind tool", version: "1.0.0" },
              independent: false,
              reviewer: "Wrong kind reviewer",
              reviewedAt: "2026-08-09",
            },
          ];
          row.evidenceIds = ["VALLE-TEST-WRONG-DIRECTION-KIND"];
        },
      );
      await assert.rejects(
        validateResearchGovernance(repositoryRoot, clonedPackage),
        /evidence kind fixture is invalid for write/,
      );
    },
  );
});

test("independent flags cannot replace independent producers and sources", () => {
  const evidenceFor = (id: string, hash: string): EvidenceRecord => ({
    id,
    kind: "e2e",
    versionCodes: ["AC1015"],
    directions: ["read"],
    familyProperties: [{ familyId: "envelope", propertyIds: ["container"] }],
    sourceIds: ["VALLE-TEST-SAME-SOURCE"],
    artifactPath: `evidence/sha256/${hash}.json`,
    artifactSha256: hash,
    artifactByteLength: 2,
    producer: "Same producer",
    tool: { name: "Same tool", version: "1.0.0" },
    independent: true,
    reviewer: "Same reviewer",
    reviewedAt: "2026-08-09",
  });
  assert.throws(
    () =>
      assertFullyIndependentEvidence(
        [
          evidenceFor("VALLE-TEST-EVIDENCE-A", "7".repeat(64)),
          evidenceFor("VALLE-TEST-EVIDENCE-B", "8".repeat(64)),
        ],
        "adversarial evidence",
      ),
    /distinct producer, tool, version, reviewer and sources/,
  );
});

test("private bundle checker rejects duplicate hashes and path/hash mismatch", async () => {
  const schema = JSON.parse(
    await readFile(resolve(packageRoot, "private-bundle.schema.json"), "utf8"),
  ) as unknown;
  const entry = {
    id: "private.entry-001",
    objectPath: `objects/sha256/${"1".repeat(64)}.dwg`,
    sha256: "1".repeat(64),
    byteLength: 6,
    declaredVersion: "AC1015",
    intakeRecordPath: `intake/sha256/${"2".repeat(64)}.json`,
    intakeRecordSha256: "2".repeat(64),
    intakeRecordByteLength: 2,
    oraclePath: `oracles/sha256/${"3".repeat(64)}.json`,
    oracleSha256: "3".repeat(64),
    oracleByteLength: 2,
    redistributable: false,
  };
  const manifest: JsonRecord = {
    schemaVersion: "1.0.0",
    bundleId: "DWG-BUNDLE-TEST0001",
    createdAt: "2026-08-09T00:00:00Z",
    repository: "valle-design-dwg-conformance",
    immutable: true,
    minimumTokenScope: "contents:read",
    checkerContract: "valle-dwg-private-bundle-structure@1",
    entries: [entry],
  };
  assert.doesNotThrow(() =>
    assertSchemaValid(schema, manifest, "valid private bundle"),
  );
  assert.doesNotThrow(() =>
    validatePrivateBundleManifestStructure(
      manifest as unknown as Parameters<
        typeof validatePrivateBundleManifestStructure
      >[0],
    ),
  );

  const duplicate = structuredClone(manifest);
  asArray(duplicate.entries, "entries").push({
    ...entry,
    id: "private.entry-002",
  });
  assert.doesNotThrow(() =>
    assertSchemaValid(schema, duplicate, "schema-level duplicate bundle"),
  );
  assert.throws(
    () =>
      validatePrivateBundleManifestStructure(
        duplicate as unknown as Parameters<
          typeof validatePrivateBundleManifestStructure
        >[0],
      ),
    /duplicate values under case folding/,
  );

  const mismatched = structuredClone(manifest);
  const mismatchedEntry = asRecord(
    asArray(mismatched.entries, "entries")[0],
    "entry",
  );
  mismatchedEntry.sha256 = "4".repeat(64);
  assert.throws(
    () =>
      validatePrivateBundleManifestStructure(
        mismatched as unknown as Parameters<
          typeof validatePrivateBundleManifestStructure
        >[0],
      ),
    /path\/hash mismatch/,
  );
});

test("public corpus intake fails closed on rights, privacy and positive oracle", async () => {
  const schema = JSON.parse(
    await readFile(resolve(packageRoot, "corpus-intake.schema.json"), "utf8"),
  ) as unknown;
  const record: JsonRecord = {
    schemaVersion: "1.0.0",
    intakeId: "DWG-INTAKE-OWNER0001",
    submittedAt: "2026-08-09T00:00:00Z",
    disposition: "public-fixture",
    asset: {
      opaqueName: "owner-positive.dwg",
      sha256: "4".repeat(64),
      byteLength: 8,
      declaredVersion: "AC1015",
    },
    origin: {
      type: "owner-created",
      creator: "Sergio Valle Zárate",
      createdAt: "2026-08-09",
      creationTool: "Owner-declared tool",
      sourceIds: ["VALLE-OWNER-DWG1-2026-08-09"],
    },
    rightsReview: {
      decision: "approved",
      license: "Valle-Owner-Authorized",
      useAllowed: true,
      redistributionAllowed: true,
      evidenceSha256: "5".repeat(64),
      reviewer: "Rights reviewer",
      reviewedAt: "2026-08-09",
    },
    privacyReview: {
      decision: "approved",
      containsCustomerData: false,
      containsPersonalData: false,
      containsSecrets: false,
      reviewer: "Privacy reviewer",
      reviewedAt: "2026-08-09",
    },
    oracle: {
      id: "DWG-ORACLE-OWNER0001",
      kind: "owner-ground-truth",
      expectedOutcome: "ok",
      expectedErrorCode: null,
      groundTruthSha256: "6".repeat(64),
      groundTruthPath: `intake/oracles/sha256/${"6".repeat(64)}.json`,
      groundTruthByteLength: 2,
      reviewer: "Oracle reviewer",
      reviewedAt: "2026-08-09",
    },
    secondReview: {
      decision: "approved",
      reviewer: "Second reviewer",
      reviewedAt: "2026-08-09",
    },
    routing: {
      repository: "valle-design",
      relativePath: "authorized/owner/owner-positive.dwg",
    },
  };

  assert.doesNotThrow(() =>
    assertSchemaValid(schema, record, "valid public intake"),
  );
  const noRights = structuredClone(record);
  asRecord(noRights.rightsReview, "rightsReview").redistributionAllowed = false;
  assert.throws(() => assertSchemaValid(schema, noRights, "rights intake"));
  const customerData = structuredClone(record);
  asRecord(customerData.privacyReview, "privacyReview").containsCustomerData =
    true;
  assert.throws(() =>
    assertSchemaValid(schema, customerData, "privacy intake"),
  );
  const weakOracle = structuredClone(record);
  asRecord(weakOracle.oracle, "oracle").kind = "adversarial-expectation";
  assert.throws(() => assertSchemaValid(schema, weakOracle, "oracle intake"));
});
