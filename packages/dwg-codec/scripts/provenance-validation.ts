import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import { resolve } from "node:path";

import {
  GENERATOR_PATH,
  type FixtureManifest,
  type FixtureManifestEntry,
} from "../fixtures/generators/generate-synthetic.js";
import { canonicalJson, readCanonicalJson } from "./json-document.js";
import {
  assertPortableRelativePath,
  assertUniqueCaseFolded,
  caseFold,
  resolveSafeExistingPath,
  walkRegularFiles,
} from "./safe-path.js";
import { assertSchemaValid } from "./schema-validation.js";

interface SourceRegister {
  readonly schemaVersion: string;
  readonly updatedAt: string;
  readonly entries: readonly SourceEntry[];
}

interface SourceEntry {
  readonly id: string;
  readonly origin: {
    readonly type: string;
    readonly location: string;
    readonly accessedAt: string;
    readonly sha256?: string;
    readonly byteLength?: number;
  };
  readonly terms: {
    readonly license: string;
  };
  readonly status: "allowed" | "quarantined" | "prohibited";
  readonly factsConsulted: readonly string[];
  readonly derivedFiles: readonly string[];
  readonly reviewedAt: string;
}

interface FactRegister {
  readonly facts: readonly FactEntry[];
}

interface FactEntry {
  readonly id: string;
  readonly kind:
    | "governance"
    | "format"
    | "algorithm"
    | "original-measurement"
    | "conformance";
  readonly status: "allowed" | "quarantined" | "prohibited";
  readonly derivedFiles: readonly string[];
}

interface Dwg0ContentBaseline {
  readonly schemaVersion: string;
  readonly repository: string;
  readonly commit: string;
  readonly treePath: string;
  readonly files: readonly Dwg0ContentBaselineFile[];
}

interface Dwg0ContentBaselineFile {
  readonly path: string;
  readonly sha256: string;
  readonly byteLength: number;
}

export interface ProvenanceValidationReport {
  readonly sourceCount: number;
  readonly allowedSourceCount: number;
  readonly governedFileCount: number;
  readonly linkedFixtureCount: number;
}

const ALLOWED_LICENSES_BY_ORIGIN = new Map<string, ReadonlySet<string>>([
  ["owner-directive", new Set(["Valle proprietary owner authorization"])],
  [
    "first-party-repository",
    new Set(["Valle proprietary software; UNLICENSED"]),
  ],
  ["public-documentation", new Set(["MIT"])],
  ["original-measurement", new Set(["Valle proprietary original measurement"])],
  [
    "third-party-fixture",
    new Set([
      "0BSD",
      "Apache-2.0",
      "BSD-2-Clause",
      "BSD-3-Clause",
      "CC-BY-4.0",
      "CC0-1.0",
      "ISC",
      "MIT",
      "Unlicense",
    ]),
  ],
]);
const LEGACY_TECHNICAL_SOURCE_ID = "VALLE-OWNER-DWG0-2026-08-09";
const LEGACY_PACKAGE_PATHS_SHA256 =
  "fcfdd6c61f08e1f68d564635607257d2a083f3b4d2661501241f8ee20bbad7a0";
const DWG0_CONTENT_BASELINE_PATH = "DWG0_CONTENT_BASELINE.v1.json";
const DWG0_CONTENT_BASELINE_SHA256 =
  "91b83a607f12337f2dcb1bfac3de9a6b30b51c6c631bf2b20adc544aa494e2a2";
const DWG0_CONTENT_BASELINE_BYTE_LENGTH = 15_204;
const DWG0_CONTENT_BASELINE_COMMIT = "98a5b185587107dc2b32da02ae209b8b99e08c6e";
const DWG0_CONTENT_BASELINE_FILE_COUNT = 80;
const DWG0_TEXT_BASELINE_SUFFIXES = [".json", ".md", ".ts"] as const;
const DWG1_PROGRAM_FACT_ID = "VALLE-DWG1-PROGRAM-SCOPE-2026-08-09";
const DWG1_FILE_ADMISSION_COUNT = 31;
const DWG1_FILE_ADMISSION = new Map(
  [
    "packages/dwg-codec/.gitattributes",
    "packages/dwg-codec/AGENTS.md",
    "packages/dwg-codec/CAPABILITIES.md",
    "packages/dwg-codec/CLEAN_ROOM_POLICY.md",
    "packages/dwg-codec/COMPATIBILITY_MATRIX.v1.json",
    "packages/dwg-codec/compatibility-matrix.schema.json",
    "packages/dwg-codec/CORPUS_INTAKE.md",
    "packages/dwg-codec/corpus-intake.schema.json",
    "packages/dwg-codec/DWG0_CONTENT_BASELINE.v1.json",
    "packages/dwg-codec/dwg0-content-baseline.schema.json",
    "packages/dwg-codec/FACT_REGISTER.json",
    "packages/dwg-codec/fact-register.schema.json",
    "packages/dwg-codec/fixtures/generators/generate-synthetic.ts",
    "packages/dwg-codec/fixtures/manifest.json",
    "packages/dwg-codec/fixtures/manifest.schema.json",
    "packages/dwg-codec/OWNER_DIRECTIVE_DWG1.md",
    "packages/dwg-codec/package.json",
    "packages/dwg-codec/private-bundle.schema.json",
    "packages/dwg-codec/README.md",
    "packages/dwg-codec/SOURCE_REGISTER.json",
    "packages/dwg-codec/scripts/check-fixtures.ts",
    "packages/dwg-codec/scripts/check-research.ts",
    "packages/dwg-codec/scripts/fixture-validation.ts",
    "packages/dwg-codec/scripts/private-bundle-validation.ts",
    "packages/dwg-codec/scripts/provenance-validation.ts",
    "packages/dwg-codec/scripts/research-validation.ts",
    "packages/dwg-codec/scripts/schema-validation.ts",
    "packages/dwg-codec/source-register.schema.json",
    "packages/dwg-codec/tests/adversarial.spec.ts",
    "packages/dwg-codec/tests/adversarial/checker-hardening.spec.ts",
    "packages/dwg-codec/tests/adversarial/research-governance.spec.ts",
  ].map(
    (path) =>
      [
        caseFold(path),
        { factId: DWG1_PROGRAM_FACT_ID, kind: "governance" },
      ] as const,
  ),
);
const DWG1_REPOSITORY_SOURCE_FILES = new Set(
  ["packages/dwg-codec/OWNER_DIRECTIVE_DWG1.md"].map(caseFold),
);

function packagePathsFromSource(source: SourceEntry): readonly string[] {
  const prefix = "packages/dwg-codec/";
  return source.derivedFiles
    .map((path) => path.replaceAll("\\", "/"))
    .filter((path) => path.startsWith(prefix))
    .map(caseFold)
    .sort();
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertPinnedDwg0ContentBaseline(document: {
  readonly bytes: Uint8Array;
  readonly value: Dwg0ContentBaseline;
}): ReadonlyMap<string, Dwg0ContentBaselineFile> {
  if (
    document.bytes.byteLength !== DWG0_CONTENT_BASELINE_BYTE_LENGTH ||
    hashBytes(document.bytes) !== DWG0_CONTENT_BASELINE_SHA256
  ) {
    throw new Error(
      "DWG-0 content baseline document differs from its verifier-pinned hash and size",
    );
  }
  const baseline = document.value;
  if (
    baseline.schemaVersion !== "1.0.0" ||
    baseline.repository !== "Sergiovalle3121/valle-design" ||
    baseline.commit !== DWG0_CONTENT_BASELINE_COMMIT ||
    baseline.treePath !== "packages/dwg-codec" ||
    baseline.files.length !== DWG0_CONTENT_BASELINE_FILE_COUNT
  ) {
    throw new Error("DWG-0 content baseline identity or cardinality changed");
  }
  const paths = baseline.files.map((entry) => entry.path);
  assertUniqueCaseFolded(paths, "DWG-0 content baseline paths");
  const byPath = new Map<string, Dwg0ContentBaselineFile>();
  for (const [index, entry] of baseline.files.entries()) {
    assertPortableRelativePath(entry.path, `DWG-0 baseline path ${index}`);
    if (
      !entry.path.startsWith("packages/dwg-codec/") ||
      !/^[a-f0-9]{64}$/u.test(entry.sha256) ||
      !Number.isSafeInteger(entry.byteLength) ||
      entry.byteLength < 0 ||
      entry.byteLength > 4 * 1024 * 1024 ||
      (index > 0 && paths[index - 1]! >= entry.path)
    ) {
      throw new Error(`DWG-0 baseline entry ${entry.path} is not canonical`);
    }
    byPath.set(caseFold(entry.path), entry);
  }
  return byPath;
}

async function hashBaselineCandidateFile(
  repositoryRoot: string,
  entry: Dwg0ContentBaselineFile,
): Promise<{ readonly byteLength: number; readonly sha256: string }> {
  const path = await resolveSafeExistingPath(
    repositoryRoot,
    entry.path,
    "file",
    `DWG-0 baseline file ${entry.path}`,
  );
  const handle = await open(path, "r");
  try {
    const before = await handle.stat();
    if (
      !before.isFile() ||
      !Number.isSafeInteger(before.size) ||
      before.size < 0 ||
      before.size > 4 * 1024 * 1024
    ) {
      throw new Error(
        `${entry.path}: legacy DWG-0 candidate is not a bounded regular file`,
      );
    }
    const byteLength = before.size;
    const bytes = Buffer.alloc(byteLength);
    let offset = 0;
    while (offset < byteLength) {
      const { bytesRead } = await handle.read(
        bytes,
        offset,
        byteLength - offset,
        offset,
      );
      if (bytesRead === 0) {
        throw new Error(
          `${entry.path}: legacy DWG-0 file changed during hashing`,
        );
      }
      offset += bytesRead;
    }
    const sentinel = Buffer.alloc(1);
    const extra = await handle.read(sentinel, 0, 1, byteLength);
    const after = await handle.stat();
    if (extra.bytesRead !== 0 || after.size !== byteLength) {
      throw new Error(
        `${entry.path}: legacy DWG-0 file changed during hashing`,
      );
    }
    const isText =
      entry.path.endsWith("/.gitattributes") ||
      DWG0_TEXT_BASELINE_SUFFIXES.some((suffix) => entry.path.endsWith(suffix));
    if (!isText && !entry.path.endsWith(".dwg")) {
      throw new Error(
        `${entry.path}: DWG-0 baseline file type is not classified`,
      );
    }
    if (!isText) return { byteLength, sha256: hashBytes(bytes) };

    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (error) {
      throw new Error(`${entry.path}: legacy text is not valid UTF-8`, {
        cause: error,
      });
    }
    const normalized = text.replaceAll("\r\n", "\n");
    if (normalized.includes("\r")) {
      throw new Error(
        `${entry.path}: legacy text contains a bare carriage return`,
      );
    }
    const canonicalBytes = Buffer.from(normalized, "utf8");
    return {
      byteLength: canonicalBytes.byteLength,
      sha256: hashBytes(canonicalBytes),
    };
  } finally {
    await handle.close();
  }
}

function assertExactDwg1AdmissionPaths(): void {
  if (DWG1_FILE_ADMISSION.size !== DWG1_FILE_ADMISSION_COUNT) {
    throw new Error("DWG-1 exact file admission cardinality changed");
  }
  for (const path of DWG1_FILE_ADMISSION.keys()) {
    assertPortableRelativePath(path, "DWG-1 exact file admission");
    if (/[*?[\]{}!]/u.test(path)) {
      throw new Error(`DWG-1 file admission must not contain globs: ${path}`);
    }
  }
}

function assertAllowedSourceTerms(source: SourceEntry): void {
  if (source.status !== "allowed") return;

  const allowedLicenses = ALLOWED_LICENSES_BY_ORIGIN.get(source.origin.type);
  if (
    allowedLicenses === undefined ||
    !allowedLicenses.has(source.terms.license)
  ) {
    throw new Error(
      `${source.id}: license ${JSON.stringify(source.terms.license)} is not explicitly allowed for origin type ${JSON.stringify(source.origin.type)}`,
    );
  }
}

function sourceCoversFixture(
  source: SourceEntry,
  fixture: FixtureManifestEntry,
): boolean {
  const fixturePath = caseFold(`packages/dwg-codec/fixtures/${fixture.path}`);
  const derived = new Set(source.derivedFiles.map(caseFold));
  if (derived.has(fixturePath)) return true;
  return (
    fixture.generatedBy !== null &&
    derived.has(caseFold(`packages/dwg-codec/${fixture.generatedBy}`))
  );
}

function assertFixtureOriginSources(
  fixture: FixtureManifestEntry,
  linkedSources: readonly SourceEntry[],
): void {
  if (fixture.origin.type === "valle-synthetic") return;

  if (fixture.origin.type === "third-party-licensed") {
    if (
      !linkedSources.some(
        (source) =>
          source.origin.type === "third-party-fixture" &&
          source.terms.license === fixture.permission.license,
      )
    ) {
      throw new Error(
        `${fixture.id}: third-party fixture requires an allowed third-party-fixture source with the same permissive license`,
      );
    }
    return;
  }

  const requiredOrigin =
    fixture.origin.type === "original-measurement"
      ? "original-measurement"
      : "owner-directive";
  if (!linkedSources.some((source) => source.origin.type === requiredOrigin)) {
    throw new Error(
      `${fixture.id}: ${fixture.origin.type} fixture requires an allowed ${requiredOrigin} source`,
    );
  }
}

function assertCanonicalOriginLocation(source: SourceEntry): void {
  const location = source.origin.location;
  if (
    location !== location.trim() ||
    location !== location.normalize("NFC") ||
    /[\u0000-\u001f\\]/u.test(location)
  ) {
    throw new Error(`${source.id}: origin location is not canonical`);
  }

  let parsed: URL;
  try {
    parsed = new URL(location);
  } catch (error) {
    throw new Error(`${source.id}: origin location must be an absolute URL`, {
      cause: error,
    });
  }
  if (
    parsed.toString() !== location ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new Error(
      `${source.id}: origin location must be canonical and contain no credentials, query, or fragment`,
    );
  }
}

export async function validateProvenance(
  repositoryRoot: string,
  packageRoot: string,
): Promise<ProvenanceValidationReport> {
  const sourceSchemaDocument = await readCanonicalJson<unknown>(
    resolve(packageRoot, "source-register.schema.json"),
    { requireCanonicalLayout: false },
  );
  const sourceRegisterDocument = await readCanonicalJson<SourceRegister>(
    resolve(packageRoot, "SOURCE_REGISTER.json"),
    { requireCanonicalLayout: false },
  );
  assertSchemaValid<SourceRegister>(
    sourceSchemaDocument.value,
    sourceRegisterDocument.value,
    "SOURCE_REGISTER.json",
  );

  const factSchemaDocument = await readCanonicalJson<unknown>(
    resolve(packageRoot, "fact-register.schema.json"),
    { requireCanonicalLayout: false },
  );
  const factRegisterDocument = await readCanonicalJson<FactRegister>(
    resolve(packageRoot, "FACT_REGISTER.json"),
    { requireLf: true },
  );
  assertSchemaValid<FactRegister>(
    factSchemaDocument.value,
    factRegisterDocument.value,
    "FACT_REGISTER.json",
  );

  const baselineSchemaDocument = await readCanonicalJson<unknown>(
    resolve(packageRoot, "dwg0-content-baseline.schema.json"),
    { requireCanonicalLayout: false },
  );
  const baselineDocument = await readCanonicalJson<Dwg0ContentBaseline>(
    resolve(packageRoot, DWG0_CONTENT_BASELINE_PATH),
    { requireLf: true },
  );
  assertSchemaValid<Dwg0ContentBaseline>(
    baselineSchemaDocument.value,
    baselineDocument.value,
    DWG0_CONTENT_BASELINE_PATH,
  );
  const legacyContentByPath = assertPinnedDwg0ContentBaseline(baselineDocument);
  assertExactDwg1AdmissionPaths();

  const fixtureSchemaDocument = await readCanonicalJson<unknown>(
    resolve(packageRoot, "fixtures", "manifest.schema.json"),
    { requireCanonicalLayout: false },
  );
  const fixtureManifestDocument = await readCanonicalJson<FixtureManifest>(
    resolve(packageRoot, "fixtures", "manifest.json"),
    { requireLf: true },
  );
  assertSchemaValid<FixtureManifest>(
    fixtureSchemaDocument.value,
    fixtureManifestDocument.value,
    "fixtures/manifest.json",
  );

  const register = sourceRegisterDocument.value;
  assertUniqueCaseFolded(
    register.entries.map((source) => source.id),
    "source IDs",
  );
  assertUniqueCaseFolded(
    register.entries.map((source) => source.origin.location),
    "source origin locations",
  );

  const allowedSources = register.entries.filter(
    (source) => source.status === "allowed",
  );
  const allowedById = new Map(
    allowedSources.map((source) => [caseFold(source.id), source]),
  );
  const allowedDerivedFiles = new Set<string>();
  assertUniqueCaseFolded(
    factRegisterDocument.value.facts.map((fact) => fact.id),
    "fact IDs",
  );
  const allowedFactsById = new Map(
    factRegisterDocument.value.facts
      .filter((fact) => fact.status === "allowed")
      .map((fact) => [caseFold(fact.id), fact]),
  );

  for (const source of register.entries) {
    assertAllowedSourceTerms(source);
    assertCanonicalOriginLocation(source);
    if (
      source.origin.accessedAt > register.updatedAt ||
      source.reviewedAt > register.updatedAt ||
      source.reviewedAt < source.origin.accessedAt
    ) {
      throw new Error(
        `${source.id}: updatedAt/reviewedAt/accessedAt chronology is inconsistent`,
      );
    }
    assertUniqueCaseFolded(
      source.factsConsulted,
      `${source.id} factsConsulted`,
    );
    assertUniqueCaseFolded(source.derivedFiles, `${source.id} derivedFiles`);
    for (const derivedFile of source.derivedFiles) {
      assertPortableRelativePath(derivedFile, `${source.id} derived file`);
      await resolveSafeExistingPath(
        repositoryRoot,
        derivedFile,
        "file",
        `${source.id} derived file ${derivedFile}`,
      );
      if (source.status !== "allowed") {
        throw new Error(
          `${source.id}: non-allowed sources may not derive files`,
        );
      }
      allowedDerivedFiles.add(caseFold(derivedFile));
    }
  }

  for (const source of allowedSources) {
    const location = new URL(source.origin.location);
    if (location.protocol !== "repo:") continue;
    if (location.hostname !== "valle-design") {
      throw new Error(`${source.id}: unknown repository source authority`);
    }
    const sourcePath = decodeURIComponent(location.pathname.slice(1));
    assertPortableRelativePath(sourcePath, `${source.id} repository source`);
    if (
      source.origin.type !== "owner-directive" ||
      !DWG1_REPOSITORY_SOURCE_FILES.has(caseFold(sourcePath))
    ) {
      throw new Error(`${source.id}: repository source path is not admitted`);
    }
  }

  const legacySource = allowedById.get(caseFold(LEGACY_TECHNICAL_SOURCE_ID));
  if (legacySource === undefined) {
    throw new Error("frozen DWG-0 technical baseline source is missing");
  }
  const legacyPackagePaths = packagePathsFromSource(legacySource);
  const legacyPackageHash = createHash("sha256")
    .update(canonicalJson(legacyPackagePaths))
    .digest("hex");
  if (legacyPackageHash !== LEGACY_PACKAGE_PATHS_SHA256) {
    throw new Error(
      `frozen DWG-0 package baseline path set changed (${legacyPackagePaths.length} paths, ${legacyPackageHash})`,
    );
  }
  const legacyPackageFiles = new Set(legacyPackagePaths);
  if (
    legacyContentByPath.size !== legacyPackageFiles.size ||
    [...legacyContentByPath.keys()].some(
      (path) => !legacyPackageFiles.has(path),
    )
  ) {
    throw new Error(
      "frozen DWG-0 source paths differ from the content-addressed baseline",
    );
  }

  const packageFiles = await walkRegularFiles(packageRoot, {
    ignoredDirectories: [".turbo", "coverage", "dist", "node_modules"],
  });
  for (const relativePath of packageFiles) {
    const repositoryPath = `packages/dwg-codec/${relativePath}`;
    const foldedRepositoryPath = caseFold(repositoryPath);
    if (!allowedDerivedFiles.has(foldedRepositoryPath)) {
      throw new Error(
        `${repositoryPath}: package file is not covered by any allowed source`,
      );
    }
    const baselineEntry = legacyContentByPath.get(foldedRepositoryPath);
    if (baselineEntry !== undefined) {
      const actual = await hashBaselineCandidateFile(
        repositoryRoot,
        baselineEntry,
      );
      if (
        actual.sha256 === baselineEntry.sha256 &&
        actual.byteLength === baselineEntry.byteLength
      ) {
        continue;
      }
    }

    const admission = DWG1_FILE_ADMISSION.get(foldedRepositoryPath);
    if (admission === undefined) {
      throw new Error(
        `${repositoryPath}: changed or new package file is not in the exact DWG-1 admission allowlist`,
      );
    }
    const fact = allowedFactsById.get(caseFold(admission.factId));
    if (
      fact === undefined ||
      fact.kind !== admission.kind ||
      !fact.derivedFiles.map(caseFold).includes(foldedRepositoryPath)
    ) {
      throw new Error(
        `${repositoryPath}: exact DWG-1 admission requires allowed ${admission.kind} fact ${admission.factId}`,
      );
    }
  }

  for (const baselineEntry of legacyContentByPath.values()) {
    const relativePath = baselineEntry.path.slice("packages/dwg-codec/".length);
    if (!packageFiles.includes(relativePath)) {
      throw new Error(`${baselineEntry.path}: frozen DWG-0 file was deleted`);
    }
  }

  for (const fixture of fixtureManifestDocument.value.fixtures) {
    if (fixture.synthetic) {
      if (
        fixture.origin.type !== "valle-synthetic" ||
        !fixture.path.startsWith("synthetic/") ||
        fixture.generatedBy !== GENERATOR_PATH
      ) {
        throw new Error(
          `${fixture.id}: synthetic fixtures require a versioned first-party generator`,
        );
      }
      assertPortableRelativePath(
        fixture.generatedBy,
        `${fixture.id} generator`,
      );
      await resolveSafeExistingPath(
        packageRoot,
        fixture.generatedBy,
        "file",
        `${fixture.id} generator`,
      );
    } else if (
      fixture.origin.type === "valle-synthetic" ||
      !fixture.path.startsWith("authorized/") ||
      fixture.generatedBy !== null ||
      fixture.intakeId === undefined ||
      fixture.oracle === undefined ||
      fixture.oracle === null
    ) {
      throw new Error(
        `${fixture.id}: authorized fixtures require intake, oracle and non-synthetic provenance`,
      );
    }
    assertUniqueCaseFolded(fixture.sourceIds, `${fixture.id} sourceIds`);
    const linkedSources: SourceEntry[] = [];
    for (const sourceId of fixture.sourceIds) {
      const source = allowedById.get(caseFold(sourceId));
      if (source === undefined) {
        throw new Error(
          `${fixture.id}: sourceId ${sourceId} does not resolve to an allowed source`,
        );
      }
      linkedSources.push(source);
      if (!sourceCoversFixture(source, fixture)) {
        throw new Error(
          `${fixture.id}: linked source ${source.id} does not name its fixture or generator as a derived file`,
        );
      }
    }
    assertFixtureOriginSources(fixture, linkedSources);
    const linkedDerived = new Set(
      linkedSources.flatMap((source) => source.derivedFiles.map(caseFold)),
    );
    const fixturePath = caseFold(`packages/dwg-codec/fixtures/${fixture.path}`);
    const generatorPath =
      fixture.generatedBy === null
        ? null
        : caseFold(`packages/dwg-codec/${fixture.generatedBy}`);
    if (
      !linkedDerived.has(fixturePath) ||
      (generatorPath !== null && !linkedDerived.has(generatorPath))
    ) {
      throw new Error(
        `${fixture.id}: linked allowed sources do not jointly cover its bytes and applicable generator`,
      );
    }
  }

  return {
    sourceCount: register.entries.length,
    allowedSourceCount: allowedSources.length,
    governedFileCount: packageFiles.length,
    linkedFixtureCount: fixtureManifestDocument.value.fixtures.length,
  };
}
