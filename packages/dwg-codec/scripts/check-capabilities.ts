import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DWG_CAPABILITY_FAMILIES,
  getDwgCapabilities,
} from "../src/api/capabilities.js";
import { readCanonicalJson } from "./json-document.js";

interface CompatibilityFamily {
  readonly id: string;
  readonly title: string;
  readonly properties: readonly string[];
}

interface CompatibilityCoverage {
  readonly versionCodes: readonly string[];
  readonly directions: readonly string[];
  readonly familyIds?: readonly string[];
  readonly familyProperties?: readonly Readonly<{
    familyId: string;
    propertyIds: readonly string[];
  }>[];
  readonly status: string;
}

interface CompatibilityMatrix {
  readonly schemaVersion: string;
  readonly matrixVersion: string;
  readonly productionAvailable: boolean;
  readonly versions: readonly string[];
  readonly directions: readonly string[];
  readonly families: readonly CompatibilityFamily[];
  readonly coverage: readonly CompatibilityCoverage[];
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: public capabilities diverge from matrix v1`);
  }
}

function capabilityCellKey(
  version: string,
  direction: string,
  family: string,
  property: string,
): string {
  return `${version}/${direction}/${family}/${property}`;
}

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

try {
  const document = await readCanonicalJson<CompatibilityMatrix>(
    resolve(packageRoot, "COMPATIBILITY_MATRIX.v1.json"),
    { requireCanonicalLayout: false },
  );
  const governed = document.value;
  const capabilities = getDwgCapabilities();

  assertEqual(capabilities.schemaVersion, governed.schemaVersion, "schema");
  assertEqual(capabilities.matrixVersion, governed.matrixVersion, "matrix");
  assertEqual(capabilities.productionAvailable, false, "production state");
  assertEqual(governed.productionAvailable, false, "governed production state");
  assertEqual(
    governed.coverage.map((row) => row.status),
    governed.coverage.map(() => "not-started"),
    "coverage state",
  );
  assertEqual(
    DWG_CAPABILITY_FAMILIES.map((family) => ({
      id: family.id,
      title: family.title,
      properties: family.properties,
    })),
    governed.families,
    "family/property targets",
  );
  assertEqual(
    capabilities.versions.map((version) => version.code),
    governed.versions,
    "versions",
  );

  const governedCells = governed.coverage
    .flatMap((row) => {
      const selectedProperties =
        row.familyProperties ??
        (row.familyIds ?? []).map((familyId) => {
          const family = governed.families.find(
            (candidate) => candidate.id === familyId,
          );
          if (family === undefined) {
            throw new Error(`${familyId}: missing governed family`);
          }
          return { familyId, propertyIds: family.properties };
        });
      return row.versionCodes.flatMap((version) =>
        row.directions.flatMap((direction) =>
          selectedProperties.flatMap((family) =>
            family.propertyIds.map((property) =>
              capabilityCellKey(version, direction, family.familyId, property),
            ),
          ),
        ),
      );
    })
    .sort();
  const publicCells = capabilities.versions
    .flatMap((version) =>
      version.directions.flatMap((direction) =>
        direction.families.flatMap((family) =>
          family.properties.map((property) =>
            capabilityCellKey(
              version.code,
              direction.direction,
              family.id,
              property.id,
            ),
          ),
        ),
      ),
    )
    .sort();
  assertEqual(publicCells, governedCells, "version/direction/property cells");

  for (const version of capabilities.versions) {
    if (version.probe !== "supported") {
      throw new Error(`${version.code}: probe state must remain separate`);
    }
    assertEqual(
      version.directions.map((direction) => direction.direction),
      governed.directions,
      `${version.code} directions`,
    );
    for (const direction of version.directions) {
      if (direction.state !== "unsupported") {
        throw new Error(
          `${version.code}/${direction.direction}: must be unsupported`,
        );
      }
      assertEqual(
        direction.families.map((family) => family.id),
        governed.families.map((family) => family.id),
        `${version.code}/${direction.direction} families`,
      );
      for (const family of direction.families) {
        const governedFamily = governed.families.find(
          (candidate) => candidate.id === family.id,
        );
        if (governedFamily === undefined) {
          throw new Error(`${family.id}: missing governed family`);
        }
        assertEqual(
          family.properties.map((property) => property.id),
          governedFamily.properties,
          `${version.code}/${direction.direction}/${family.id} properties`,
        );
        if (
          family.state !== "unsupported" ||
          family.properties.some((property) => property.state !== "unsupported")
        ) {
          throw new Error(
            `${version.code}/${direction.direction}/${family.id}: must be unsupported`,
          );
        }
      }
    }
  }

  console.log(
    `DWG capability parity OK: ${publicCells.length} governed version/direction/family/property cells, all unsupported.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
