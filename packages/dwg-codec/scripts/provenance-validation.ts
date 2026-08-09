import { resolve } from "node:path";

import type {
  FixtureManifest,
  FixtureManifestEntry,
} from "../fixtures/generators/generate-synthetic.js";
import { readCanonicalJson } from "./json-document.js";
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
  };
  readonly terms: {
    readonly license: string;
  };
  readonly status: "allowed" | "quarantined" | "prohibited";
  readonly factsConsulted: readonly string[];
  readonly derivedFiles: readonly string[];
  readonly reviewedAt: string;
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
  ["original-measurement", new Set()],
  ["third-party-fixture", new Set()],
]);

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
  const generatorPath = caseFold(`packages/dwg-codec/${fixture.generatedBy}`);
  const derived = new Set(source.derivedFiles.map(caseFold));
  return derived.has(fixturePath) || derived.has(generatorPath);
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

  const packageFiles = await walkRegularFiles(packageRoot, {
    ignoredDirectories: [".turbo", "coverage", "dist", "node_modules"],
  });
  for (const relativePath of packageFiles) {
    const repositoryPath = `packages/dwg-codec/${relativePath}`;
    if (!allowedDerivedFiles.has(caseFold(repositoryPath))) {
      throw new Error(
        `${repositoryPath}: package file is not covered by any allowed source`,
      );
    }
  }

  for (const fixture of fixtureManifestDocument.value.fixtures) {
    if (
      fixture.synthetic !== true ||
      fixture.origin.type !== "valle-synthetic" ||
      !fixture.path.startsWith("synthetic/")
    ) {
      throw new Error(
        `${fixture.id}: external and authorized corpora are forbidden in DWG-0 phase 2`,
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
    const linkedDerived = new Set(
      linkedSources.flatMap((source) => source.derivedFiles.map(caseFold)),
    );
    const fixturePath = caseFold(`packages/dwg-codec/fixtures/${fixture.path}`);
    const generatorPath = caseFold(`packages/dwg-codec/${fixture.generatedBy}`);
    if (!linkedDerived.has(fixturePath) || !linkedDerived.has(generatorPath)) {
      throw new Error(
        `${fixture.id}: linked allowed sources do not jointly cover both its bytes and generator`,
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
