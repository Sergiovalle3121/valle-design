import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { readCanonicalJson } from "./json-document.js";
import {
  assertPortableRelativePath,
  assertUniqueCaseFolded,
  caseFold,
  compareCodeUnits,
  resolveSafeExistingPath,
} from "./safe-path.js";
import {
  assertSchemaCompiles,
  assertSchemaValid,
} from "./schema-validation.js";

const TARGET_VERSIONS = [
  "AC1009",
  "AC1012",
  "AC1014",
  "AC1015",
  "AC1018",
  "AC1021",
  "AC1024",
  "AC1027",
  "AC1032",
] as const;
const TARGET_DIRECTIONS = ["read", "write"] as const;
const MAX_EVIDENCE_BYTES = 64 * 1024 * 1024;
const EVIDENCE_KINDS_BY_DIRECTION = {
  read: new Set(["fixture", "independent-writer", "fuzz", "benchmark", "e2e"]),
  write: new Set([
    "round-trip",
    "independent-reader",
    "fuzz",
    "benchmark",
    "e2e",
  ]),
} as const;

interface SourceRegister {
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
  readonly snapshot?: {
    readonly path: string;
    readonly sha256: string;
    readonly byteLength: number;
  };
  readonly terms: {
    readonly license: string;
  };
  readonly status: "allowed" | "quarantined" | "prohibited";
}

interface FactRegister {
  readonly updatedAt: string;
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
  readonly statement: string;
  readonly status: "allowed" | "quarantined" | "prohibited";
  readonly sourceIds: readonly string[];
  readonly sourceEvidence: readonly {
    readonly sourceId: string;
    readonly locator: string;
    readonly sha256: string;
    readonly byteLength: number;
  }[];
  readonly terms: {
    readonly license: string;
  };
  readonly humanReview: {
    readonly reviewedAt: string;
    readonly decision: "approved" | "pending" | "rejected";
  };
  readonly derivedFiles: readonly string[];
}

interface CompatibilityMatrix {
  readonly updatedAt: string;
  readonly classRegistryComplete: false;
  readonly versions: readonly string[];
  readonly directions: readonly string[];
  readonly families: readonly MatrixFamily[];
  readonly evidenceRecords: readonly EvidenceRecord[];
  readonly coverage: readonly CoverageRow[];
}

interface MatrixFamily {
  readonly id: string;
  readonly properties: readonly string[];
}

interface FamilyPropertySelector {
  readonly familyId: string;
  readonly propertyIds: readonly string[];
}

export interface EvidenceRecord {
  readonly id: string;
  readonly kind:
    | "fixture"
    | "round-trip"
    | "independent-reader"
    | "independent-writer"
    | "fuzz"
    | "benchmark"
    | "e2e";
  readonly versionCodes: readonly string[];
  readonly directions: readonly string[];
  readonly familyProperties: readonly FamilyPropertySelector[];
  readonly sourceIds: readonly string[];
  readonly artifactPath: string;
  readonly artifactSha256: string;
  readonly artifactByteLength: number;
  readonly producer: string;
  readonly tool: {
    readonly name: string;
    readonly version: string;
  };
  readonly independent: boolean;
  readonly reviewer: string;
  readonly reviewedAt: string;
}

interface CoverageRow {
  readonly versionCodes: readonly string[];
  readonly directions: readonly string[];
  readonly familyProperties: readonly FamilyPropertySelector[];
  readonly status:
    | "not-started"
    | "research-ready"
    | "implemented"
    | "verified"
    | "not-applicable";
  readonly factIds: readonly string[];
  readonly evidenceIds: readonly string[];
}

export interface ResearchValidationReport {
  readonly allowedFactCount: number;
  readonly familyCount: number;
  readonly propertyCount: number;
  readonly matrixCellCount: number;
  readonly evidenceCount: number;
  readonly classRegistryComplete: false;
}

async function assertRepositorySourceIntegrity(
  repositoryRoot: string,
  sources: readonly SourceEntry[],
): Promise<void> {
  for (const source of sources) {
    const location = new URL(source.origin.location);
    if (location.protocol !== "repo:") continue;
    if (location.hostname !== "valle-design") {
      throw new Error(`${source.id}: unknown repository source authority`);
    }
    if (
      source.origin.sha256 === undefined ||
      source.origin.byteLength === undefined
    ) {
      throw new Error(`${source.id}: repository source requires hash and size`);
    }
    const relativePath = decodeURIComponent(location.pathname.slice(1));
    const sourcePath = await resolveSafeExistingPath(
      repositoryRoot,
      relativePath,
      "file",
      `${source.id} repository source`,
    );
    const stats = await lstat(sourcePath);
    if (
      stats.size !== source.origin.byteLength ||
      stats.size > 4 * 1024 * 1024
    ) {
      throw new Error(`${source.id}: repository source size mismatch`);
    }
    const bytes = await readFile(sourcePath);
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (hash !== source.origin.sha256) {
      throw new Error(`${source.id}: repository source SHA-256 mismatch`);
    }
  }
}

async function assertPhysicalArtifactIntegrity(
  root: string,
  relativePath: string,
  expectedSha256: string,
  expectedByteLength: number,
  maximumByteLength: number,
  label: string,
): Promise<void> {
  assertPortableRelativePath(relativePath, `${label} path`);
  const artifactPath = await resolveSafeExistingPath(
    root,
    relativePath,
    "file",
    label,
  );
  const stats = await lstat(artifactPath);
  if (
    !Number.isSafeInteger(expectedByteLength) ||
    expectedByteLength < 1 ||
    expectedByteLength > maximumByteLength ||
    stats.size !== expectedByteLength
  ) {
    throw new Error(`${label}: physical size mismatch`);
  }
  const bytes = await readFile(artifactPath);
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (actualHash !== expectedSha256) {
    throw new Error(`${label}: physical SHA-256 mismatch`);
  }
}

async function assertTechnicalSourceIntegrity(
  repositoryRoot: string,
  source: SourceEntry,
  label: string,
): Promise<void> {
  if (source.origin.type === "owner-directive") {
    throw new Error(`${label}: owner directive is not a technical source`);
  }
  const location = new URL(source.origin.location);
  if (location.protocol === "repo:") return;
  const snapshot = source.snapshot;
  if (
    snapshot === undefined ||
    source.origin.sha256 === undefined ||
    source.origin.byteLength === undefined ||
    snapshot.sha256 !== source.origin.sha256 ||
    snapshot.byteLength !== source.origin.byteLength ||
    !snapshot.path.startsWith(
      `packages/dwg-codec/research/snapshots/sha256/${snapshot.sha256}.`,
    )
  ) {
    throw new Error(
      `${label}: technical source requires a content-addressed repository snapshot, hash and size`,
    );
  }
  await assertPhysicalArtifactIntegrity(
    repositoryRoot,
    snapshot.path,
    snapshot.sha256,
    snapshot.byteLength,
    MAX_EVIDENCE_BYTES,
    `${label} source snapshot`,
  );
}

async function assertEvidenceArtifactIntegrity(
  packageRoot: string,
  evidence: EvidenceRecord,
): Promise<void> {
  if (
    !evidence.artifactPath.startsWith(
      `evidence/sha256/${evidence.artifactSha256}.`,
    )
  ) {
    throw new Error(
      `${evidence.id}: evidence artifact path does not match its hash`,
    );
  }
  await assertPhysicalArtifactIntegrity(
    packageRoot,
    evidence.artifactPath,
    evidence.artifactSha256,
    evidence.artifactByteLength,
    MAX_EVIDENCE_BYTES,
    `${evidence.id} evidence artifact`,
  );
}

function assertExactValues(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  const actualSorted = [...actual].sort(compareCodeUnits);
  const expectedSorted = [...expected].sort(compareCodeUnits);
  if (
    actualSorted.length !== expectedSorted.length ||
    actualSorted.some((value, index) => value !== expectedSorted[index])
  ) {
    throw new Error(`${label}: expected exactly ${expectedSorted.join(", ")}`);
  }
}

function requiredById<T extends { readonly id: string }>(
  entries: readonly T[],
  id: string,
  label: string,
): T {
  const entry = entries.find(
    (candidate) => caseFold(candidate.id) === caseFold(id),
  );
  if (entry === undefined) {
    throw new Error(`${label}: ${id} does not resolve`);
  }
  return entry;
}

async function validateFacts(
  repositoryRoot: string,
  sources: readonly SourceEntry[],
  register: FactRegister,
): Promise<readonly FactEntry[]> {
  assertUniqueCaseFolded(
    register.facts.map((fact) => fact.id),
    "fact IDs",
  );
  assertUniqueCaseFolded(
    register.facts.map((fact) => fact.statement),
    "fact statements",
  );

  for (const fact of register.facts) {
    assertUniqueCaseFolded(fact.sourceIds, `${fact.id} sourceIds`);
    assertUniqueCaseFolded(
      fact.sourceEvidence.map((evidence) => evidence.sourceId),
      `${fact.id} source evidence IDs`,
    );
    assertExactValues(
      fact.sourceEvidence.map((evidence) => evidence.sourceId),
      fact.sourceIds,
      `${fact.id} source evidence coverage`,
    );

    const linkedSources = fact.sourceIds.map((sourceId) =>
      requiredById(sources, sourceId, `${fact.id} source`),
    );
    if (
      fact.status === "allowed" &&
      linkedSources.some((source) => source.status !== "allowed")
    ) {
      throw new Error(
        `${fact.id}: allowed fact references a non-allowed source`,
      );
    }
    if (
      fact.status === "allowed" &&
      !linkedSources.some(
        (source) => source.terms.license === fact.terms.license,
      )
    ) {
      throw new Error(`${fact.id}: fact terms do not match a linked source`);
    }
    if (fact.status === "allowed" && fact.kind !== "governance") {
      for (const source of linkedSources) {
        await assertTechnicalSourceIntegrity(
          repositoryRoot,
          source,
          `${fact.id} source ${source.id}`,
        );
      }
    }

    for (const evidence of fact.sourceEvidence) {
      const source = requiredById(
        linkedSources,
        evidence.sourceId,
        `${fact.id} evidence source`,
      );
      if (
        evidence.locator !== source.origin.location ||
        (source.origin.sha256 !== undefined &&
          source.origin.sha256 !== evidence.sha256) ||
        (source.origin.byteLength !== undefined &&
          source.origin.byteLength !== evidence.byteLength)
      ) {
        throw new Error(
          `${fact.id}: evidence locator, hash or size disagrees with source ${source.id}`,
        );
      }
    }

    if (
      fact.humanReview.reviewedAt > register.updatedAt ||
      linkedSources.some(
        (source) => fact.humanReview.reviewedAt < source.origin.accessedAt,
      )
    ) {
      throw new Error(`${fact.id}: fact review chronology is inconsistent`);
    }

    assertUniqueCaseFolded(fact.derivedFiles, `${fact.id} derivedFiles`);
    for (const derivedFile of fact.derivedFiles) {
      assertPortableRelativePath(derivedFile, `${fact.id} derived file`);
      await resolveSafeExistingPath(
        repositoryRoot,
        derivedFile,
        "file",
        `${fact.id} derived file ${derivedFile}`,
      );
    }
  }

  return register.facts.filter((fact) => fact.status === "allowed");
}

function assertSelectorsResolve(
  row: Pick<CoverageRow, "versionCodes" | "directions" | "familyProperties">,
  versions: ReadonlySet<string>,
  directions: ReadonlySet<string>,
  families: readonly MatrixFamily[],
  label: string,
): void {
  for (const version of row.versionCodes) {
    if (!versions.has(version))
      throw new Error(`${label}: unknown version ${version}`);
  }
  for (const direction of row.directions) {
    if (!directions.has(direction)) {
      throw new Error(`${label}: unknown direction ${direction}`);
    }
  }
  assertUniqueCaseFolded(
    row.familyProperties.map((selector) => selector.familyId),
    `${label} family selectors`,
  );
  for (const selector of row.familyProperties) {
    const family = requiredById(families, selector.familyId, `${label} family`);
    assertUniqueCaseFolded(
      selector.propertyIds,
      `${label} ${family.id} property selectors`,
    );
    for (const property of selector.propertyIds) {
      if (
        !family.properties.some(
          (candidate) => caseFold(candidate) === caseFold(property),
        )
      ) {
        throw new Error(`${label}: unknown property ${family.id}/${property}`);
      }
    }
  }
}

function evidenceCoversProperty(
  evidence: EvidenceRecord,
  familyId: string,
  propertyId: string,
): boolean {
  return evidence.familyProperties.some(
    (selector) =>
      caseFold(selector.familyId) === caseFold(familyId) &&
      selector.propertyIds.some(
        (candidate) => caseFold(candidate) === caseFold(propertyId),
      ),
  );
}

function sourceSetsAreDisjoint(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const leftIds = new Set(left.map(caseFold));
  return right.every((sourceId) => !leftIds.has(caseFold(sourceId)));
}

function hasFullyIndependentEvidencePair(
  evidence: readonly EvidenceRecord[],
): boolean {
  for (const [index, left] of evidence.entries()) {
    if (!left.independent) continue;
    for (const right of evidence.slice(index + 1)) {
      if (
        right.independent &&
        left.artifactSha256 !== right.artifactSha256 &&
        caseFold(left.producer) !== caseFold(right.producer) &&
        caseFold(left.tool.name) !== caseFold(right.tool.name) &&
        caseFold(left.tool.version) !== caseFold(right.tool.version) &&
        caseFold(left.reviewer) !== caseFold(right.reviewer) &&
        sourceSetsAreDisjoint(left.sourceIds, right.sourceIds)
      ) {
        return true;
      }
    }
  }
  return false;
}

export function assertFullyIndependentEvidence(
  evidence: readonly EvidenceRecord[],
  label: string,
): void {
  if (!hasFullyIndependentEvidencePair(evidence)) {
    throw new Error(
      `${label}: verified status requires evidence with distinct producer, tool, version, reviewer and sources`,
    );
  }
}

async function validateMatrix(
  repositoryRoot: string,
  packageRoot: string,
  sources: readonly SourceEntry[],
  allowedFacts: readonly FactEntry[],
  matrix: CompatibilityMatrix,
): Promise<ResearchValidationReport> {
  assertExactValues(matrix.versions, TARGET_VERSIONS, "matrix versions");
  assertExactValues(matrix.directions, TARGET_DIRECTIONS, "matrix directions");
  assertUniqueCaseFolded(
    matrix.families.map((family) => family.id),
    "matrix family IDs",
  );
  for (const family of matrix.families) {
    assertUniqueCaseFolded(family.properties, `${family.id} properties`);
  }

  const versionSet = new Set(matrix.versions);
  const directionSet = new Set(matrix.directions);
  assertUniqueCaseFolded(
    matrix.evidenceRecords.map((evidence) => evidence.id),
    "matrix evidence IDs",
  );
  assertUniqueCaseFolded(
    matrix.evidenceRecords.map((evidence) => evidence.artifactPath),
    "matrix evidence artifact paths",
  );
  assertUniqueCaseFolded(
    matrix.evidenceRecords.map((evidence) => evidence.artifactSha256),
    "matrix evidence artifact hashes",
  );
  for (const evidence of matrix.evidenceRecords) {
    assertSelectorsResolve(
      evidence,
      versionSet,
      directionSet,
      matrix.families,
      `evidence ${evidence.id}`,
    );
    for (const direction of evidence.directions) {
      const allowedKinds =
        direction === "read"
          ? EVIDENCE_KINDS_BY_DIRECTION.read
          : EVIDENCE_KINDS_BY_DIRECTION.write;
      if (!allowedKinds.has(evidence.kind)) {
        throw new Error(
          `${evidence.id}: evidence kind ${evidence.kind} is invalid for ${direction}`,
        );
      }
    }
    assertUniqueCaseFolded(evidence.sourceIds, `${evidence.id} source IDs`);
    const linkedSources = evidence.sourceIds.map((sourceId) =>
      requiredById(sources, sourceId, `${evidence.id} source`),
    );
    for (const source of linkedSources) {
      if (source.status !== "allowed") {
        throw new Error(
          `${evidence.id}: evidence references non-allowed source`,
        );
      }
      if (source.origin.type === "owner-directive") {
        throw new Error(
          `${evidence.id}: governance owner directives cannot serve as technical evidence sources`,
        );
      }
      await assertTechnicalSourceIntegrity(
        repositoryRoot,
        source,
        `${evidence.id} source ${source.id}`,
      );
    }
    await assertEvidenceArtifactIntegrity(packageRoot, evidence);
    if (
      evidence.reviewedAt > matrix.updatedAt ||
      linkedSources.some(
        (source) => evidence.reviewedAt < source.origin.accessedAt,
      )
    ) {
      throw new Error(
        `${evidence.id}: evidence review chronology is inconsistent`,
      );
    }
  }

  const cells = new Set<string>();
  for (const [rowIndex, row] of matrix.coverage.entries()) {
    const label = `coverage row ${rowIndex}`;
    assertSelectorsResolve(
      row,
      versionSet,
      directionSet,
      matrix.families,
      label,
    );
    assertUniqueCaseFolded(row.factIds, `${label} fact IDs`);
    assertUniqueCaseFolded(row.evidenceIds, `${label} evidence IDs`);
    const facts = row.factIds.map((factId) =>
      requiredById(allowedFacts, factId, `${label} fact`),
    );
    const evidence = row.evidenceIds.map((evidenceId) =>
      requiredById(matrix.evidenceRecords, evidenceId, `${label} evidence`),
    );
    if (!matrix.classRegistryComplete && row.status !== "not-started") {
      throw new Error(
        `${label}: class registry is incomplete; every scope cell must remain not-started`,
      );
    }
    if (
      row.status !== "not-started" &&
      !facts.some((fact) => fact.kind !== "governance")
    ) {
      throw new Error(
        `${label}: promoted status requires a non-governance fact`,
      );
    }
    if (row.status === "verified") {
      const independentHashes = new Set(
        evidence
          .filter((record) => record.independent)
          .map((record) => record.artifactSha256),
      );
      if (independentHashes.size < 2) {
        throw new Error(
          `${label}: verified status requires two independent evidence hashes`,
        );
      }
      assertFullyIndependentEvidence(evidence, label);
      for (const direction of row.directions) {
        const requiredKind =
          direction === "read" ? "independent-writer" : "independent-reader";
        if (
          !evidence.some(
            (record) => record.independent && record.kind === requiredKind,
          )
        ) {
          throw new Error(
            `${label}: verified ${direction} status requires ${requiredKind} evidence`,
          );
        }
      }
    }
    for (const version of row.versionCodes) {
      for (const direction of row.directions) {
        for (const selector of row.familyProperties) {
          for (const property of selector.propertyIds) {
            const cell = `${version}/${direction}/${selector.familyId}/${property}`;
            const key = `${version}\u0000${direction}\u0000${selector.familyId}\u0000${property}`;
            if (cells.has(key)) {
              throw new Error(`${label}: overlapping coverage for ${cell}`);
            }
            for (const record of evidence) {
              if (
                !record.versionCodes.includes(version) ||
                !record.directions.includes(direction) ||
                !evidenceCoversProperty(record, selector.familyId, property)
              ) {
                throw new Error(
                  `${label}: evidence ${record.id} does not cover ${cell}`,
                );
              }
            }
            cells.add(key);
          }
        }
      }
    }
  }

  const propertyCount = matrix.families.reduce(
    (count, family) => count + family.properties.length,
    0,
  );
  const expectedCellCount =
    matrix.versions.length * matrix.directions.length * propertyCount;
  if (cells.size !== expectedCellCount) {
    throw new Error(
      `compatibility matrix has ${cells.size}/${expectedCellCount} required cells`,
    );
  }

  return {
    allowedFactCount: allowedFacts.length,
    familyCount: matrix.families.length,
    propertyCount,
    matrixCellCount: cells.size,
    evidenceCount: matrix.evidenceRecords.length,
    classRegistryComplete: matrix.classRegistryComplete,
  };
}

export async function validateResearchGovernance(
  repositoryRoot: string,
  packageRoot: string,
): Promise<ResearchValidationReport> {
  const sourceSchema = await readCanonicalJson<unknown>(
    resolve(packageRoot, "source-register.schema.json"),
    { requireCanonicalLayout: false },
  );
  const sourceRegister = await readCanonicalJson<SourceRegister>(
    resolve(packageRoot, "SOURCE_REGISTER.json"),
    { requireCanonicalLayout: false },
  );
  assertSchemaValid<SourceRegister>(
    sourceSchema.value,
    sourceRegister.value,
    "SOURCE_REGISTER.json",
  );
  await assertRepositorySourceIntegrity(
    repositoryRoot,
    sourceRegister.value.entries,
  );

  const factSchema = await readCanonicalJson<unknown>(
    resolve(packageRoot, "fact-register.schema.json"),
    { requireCanonicalLayout: false },
  );
  const factRegister = await readCanonicalJson<FactRegister>(
    resolve(packageRoot, "FACT_REGISTER.json"),
    { requireLf: true },
  );
  assertSchemaValid<FactRegister>(
    factSchema.value,
    factRegister.value,
    "FACT_REGISTER.json",
  );

  const matrixSchema = await readCanonicalJson<unknown>(
    resolve(packageRoot, "compatibility-matrix.schema.json"),
    { requireCanonicalLayout: false },
  );
  const matrix = await readCanonicalJson<CompatibilityMatrix>(
    resolve(packageRoot, "COMPATIBILITY_MATRIX.v1.json"),
    { requireLf: true },
  );
  assertSchemaValid<CompatibilityMatrix>(
    matrixSchema.value,
    matrix.value,
    "COMPATIBILITY_MATRIX.v1.json",
  );

  for (const schemaName of [
    "corpus-intake.schema.json",
    "private-bundle.schema.json",
  ]) {
    const schema = await readCanonicalJson<unknown>(
      resolve(packageRoot, schemaName),
      { requireCanonicalLayout: false },
    );
    assertSchemaCompiles(schema.value, schemaName);
  }

  const allowedFacts = await validateFacts(
    repositoryRoot,
    sourceRegister.value.entries,
    factRegister.value,
  );
  return validateMatrix(
    repositoryRoot,
    packageRoot,
    sourceRegister.value.entries,
    allowedFacts,
    matrix.value,
  );
}
