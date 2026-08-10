import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  truncate,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateFixtures } from "../../scripts/fixture-validation.js";
import {
  canonicalJson,
  MAX_CANONICAL_JSON_BYTES,
  readCanonicalJson,
} from "../../scripts/json-document.js";
import {
  assertPortableRelativePath,
  assertUniqueCaseFolded,
  resolveSafeExistingPath,
} from "../../scripts/safe-path.js";

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

async function withTemporaryRoot<T>(
  label: string,
  body: (root: string) => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), `valle-dwg0-${label}-`));
  try {
    return await body(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

async function cloneFixturePackage(root: string): Promise<string> {
  const clonedPackage = resolve(root, "dwg-codec");
  await mkdir(clonedPackage, { recursive: true });
  await cp(
    resolve(packageRoot, "fixtures"),
    resolve(clonedPackage, "fixtures"),
    { recursive: true },
  );
  await cp(
    resolve(packageRoot, "corpus-intake.schema.json"),
    resolve(clonedPackage, "corpus-intake.schema.json"),
  );
  return clonedPackage;
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

test("portable paths reject traversal, platform separators and drive-like segments", () => {
  const hostile = [
    "",
    "../escape",
    "a/../escape",
    "./file",
    "a//file",
    "a\\file",
    "C:/file",
  ];
  for (const path of hostile) {
    assert.throws(() => assertPortableRelativePath(path, "hostile path"));
  }
  assert.doesNotThrow(() =>
    assertPortableRelativePath("synthetic/recognized/ac1015.dwg", "fixture"),
  );
});

test("portable paths reject Win32 devices, controls and normalized suffixes", () => {
  const hostile = [
    "CON",
    "synthetic/con.dwg",
    "synthetic/AUX.txt",
    "synthetic/COM1.dwg",
    "synthetic/lpt9.fixture",
    "synthetic/CONIN$",
    "synthetic/trailing.",
    "synthetic/trailing ",
    "synthetic/control-\u0001.dwg",
    "synthetic/del-\u007f.dwg",
    "synthetic/question?.dwg",
    "synthetic/alternate:stream.dwg",
  ];
  for (const path of hostile) {
    assert.throws(
      () => assertPortableRelativePath(path, "Win32-hostile path"),
      /non-portable Win32 segment|normalized portable relative path/,
    );
  }
  assert.doesNotThrow(() =>
    assertPortableRelativePath("synthetic/com10/console.dwg", "portable path"),
  );
});

test("case-folded duplicate detection covers ASCII case and Unicode normalization", () => {
  assert.throws(() =>
    assertUniqueCaseFolded(["fixture/path", "Fixture/Path"], "paths"),
  );
  assert.throws(() =>
    assertUniqueCaseFolded(["caf\u00e9", "cafe\u0301"], "normalized IDs"),
  );
  assert.doesNotThrow(() =>
    assertUniqueCaseFolded(["first", "second"], "unique values"),
  );
});

test("safe path resolution rejects a junction before following it", async () => {
  await withTemporaryRoot("junction", async (root) => {
    const safeRoot = resolve(root, "safe");
    const outside = resolve(root, "outside");
    await mkdir(safeRoot);
    await mkdir(outside);
    await writeFile(resolve(outside, "payload.dwg"), new Uint8Array());
    await symlink(outside, resolve(safeRoot, "linked"), "junction");
    await assert.rejects(
      resolveSafeExistingPath(
        safeRoot,
        "linked/payload.dwg",
        "file",
        "junction fixture",
      ),
      /symbolic links and junctions are forbidden/,
    );
  });
});

test("fixture validation rejects a manifest hash that differs from versioned bytes", async () => {
  await withTemporaryRoot("fixture-hash", async (root) => {
    const clonedPackage = await cloneFixturePackage(root);
    const manifestPath = resolve(clonedPackage, "fixtures/manifest.json");
    await mutateJson(manifestPath, (manifest) => {
      const fixture = asRecord(
        asArray(manifest.fixtures, "fixtures")[0],
        "fixture",
      );
      fixture.sha256 = "0".repeat(64);
    });
    await assert.rejects(
      validateFixtures(clonedPackage),
      /SHA-256 does not match versioned bytes/,
    );
  });
});

test("fixture validation rejects declared and physical size disagreement", async () => {
  await withTemporaryRoot("fixture-size", async (root) => {
    const clonedPackage = await cloneFixturePackage(root);
    const manifestPath = resolve(clonedPackage, "fixtures/manifest.json");
    await mutateJson(manifestPath, (manifest) => {
      const fixture = asRecord(
        asArray(manifest.fixtures, "fixtures")[0],
        "fixture",
      );
      fixture.byteLength = 1;
    });
    await assert.rejects(
      validateFixtures(clonedPackage),
      /physical size 0 does not match bounded manifest size 1/,
    );
  });
});

test("fixture validation rejects case-folded duplicate manifest paths", async () => {
  await withTemporaryRoot("fixture-casefold", async (root) => {
    const clonedPackage = await cloneFixturePackage(root);
    const manifestPath = resolve(clonedPackage, "fixtures/manifest.json");
    await mutateJson(manifestPath, (manifest) => {
      const fixtures = asArray(manifest.fixtures, "fixtures");
      const first = asRecord(fixtures[0], "first fixture");
      const second = asRecord(fixtures[1], "second fixture");
      const firstPath = first.path;
      if (typeof firstPath !== "string")
        throw new Error("fixture path must be a string");
      const separator = firstPath.lastIndexOf("/");
      const filename = firstPath.slice(separator + 1);
      const extension = filename.lastIndexOf(".");
      second.path = `${firstPath.slice(0, separator + 1)}${filename.slice(0, extension).toUpperCase()}${filename.slice(extension)}`;
    });
    await assert.rejects(
      validateFixtures(clonedPackage),
      /fixture paths: duplicate values under case folding/,
    );
  });
});

test("fixture validation rejects an external corpus directory", async () => {
  await withTemporaryRoot("fixture-external", async (root) => {
    const clonedPackage = await cloneFixturePackage(root);
    await mkdir(resolve(clonedPackage, "fixtures/external"));
    await assert.rejects(
      validateFixtures(clonedPackage),
      /forbidden entry name/,
    );
  });
});

test("fixture validation rejects unmanifested authorized bytes", async () => {
  await withTemporaryRoot("fixture-authorized-unmanifested", async (root) => {
    const clonedPackage = await cloneFixturePackage(root);
    const fixturePath = resolve(
      clonedPackage,
      "fixtures/authorized/owner/unmanifested.dwg",
    );
    await mkdir(dirname(fixturePath), { recursive: true });
    await writeFile(fixturePath, Uint8Array.of(0x41));
    await assert.rejects(
      validateFixtures(clonedPackage),
      /exact file set mismatch/,
    );
  });
});

test("fixture validation rejects an unregistered synthetic generator", async () => {
  await withTemporaryRoot("fixture-generator", async (root) => {
    const clonedPackage = await cloneFixturePackage(root);
    await mutateJson(
      resolve(clonedPackage, "fixtures/manifest.json"),
      (manifest) => {
        const fixture = asRecord(
          asArray(manifest.fixtures, "fixtures")[0],
          "fixture",
        );
        fixture.generatedBy = "fixtures/generators/unregistered.ts";
      },
    );
    await assert.rejects(
      validateFixtures(clonedPackage),
      /require the registered deterministic generator/,
    );
  });
});

test("fixture validation accepts a rights-reviewed positive oracle without fixed corpus counts", async () => {
  await withTemporaryRoot("fixture-authorized-positive", async (root) => {
    const clonedPackage = await cloneFixturePackage(root);
    const fixturePath = resolve(
      clonedPackage,
      "fixtures/authorized/owner/positive.dwg",
    );
    const bytes = Uint8Array.of(0x41, 0x43, 0x31, 0x30, 0x31, 0x35, 0x42, 0x43);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    await mkdir(dirname(fixturePath), { recursive: true });
    await writeFile(fixturePath, bytes);

    const oracleGroundTruth = canonicalJson({
      schemaVersion: "1.0.0",
      oracleId: "DWG-ORACLE-OWNER0001",
      artifactSha256: sha256,
      expectedOutcome: "ok",
      expectedErrorCode: null,
      producer: "Independent test producer",
      tool: { name: "Test oracle tool", version: "1.0.0" },
      createdAt: "2026-08-09",
    });
    const oracleSha256 = createHash("sha256")
      .update(oracleGroundTruth)
      .digest("hex");
    const oracleRelativePath = `intake/oracles/sha256/${oracleSha256}.json`;
    const oraclePath = resolve(clonedPackage, "fixtures", oracleRelativePath);
    await mkdir(dirname(oraclePath), { recursive: true });
    await writeFile(oraclePath, oracleGroundTruth, "utf8");

    const intakeRecord = canonicalJson({
      schemaVersion: "1.0.0",
      intakeId: "DWG-INTAKE-OWNER0001",
      submittedAt: "2026-08-09T00:00:00Z",
      disposition: "public-fixture",
      asset: {
        opaqueName: "positive.dwg",
        sha256,
        byteLength: bytes.byteLength,
        declaredVersion: "AC1015",
      },
      origin: {
        type: "owner-created",
        creator: "Sergio Valle Zárate",
        createdAt: "2026-08-09",
        creationTool: "Owner-declared test tool",
        sourceIds: ["VALLE-OWNER-DWG1-2026-08-09"],
      },
      rightsReview: {
        decision: "approved",
        license: "Valle-Owner-Authorized",
        useAllowed: true,
        redistributionAllowed: true,
        evidenceSha256: "2".repeat(64),
        reviewer: "Rights test reviewer",
        reviewedAt: "2026-08-09",
      },
      privacyReview: {
        decision: "approved",
        containsCustomerData: false,
        containsPersonalData: false,
        containsSecrets: false,
        reviewer: "Privacy test reviewer",
        reviewedAt: "2026-08-09",
      },
      oracle: {
        id: "DWG-ORACLE-OWNER0001",
        kind: "owner-ground-truth",
        expectedOutcome: "ok",
        expectedErrorCode: null,
        groundTruthSha256: oracleSha256,
        groundTruthPath: oracleRelativePath,
        groundTruthByteLength: Buffer.byteLength(oracleGroundTruth),
        reviewer: "Oracle test reviewer",
        reviewedAt: "2026-08-09",
      },
      secondReview: {
        decision: "approved",
        reviewer: "Independent second test reviewer",
        reviewedAt: "2026-08-09",
      },
      routing: {
        repository: "valle-design",
        relativePath: "authorized/owner/positive.dwg",
      },
    });
    const intakeSha256 = createHash("sha256")
      .update(intakeRecord)
      .digest("hex");
    const intakeRelativePath = `intake/sha256/${intakeSha256}.json`;
    const intakePath = resolve(clonedPackage, "fixtures", intakeRelativePath);
    await mkdir(dirname(intakePath), { recursive: true });
    await writeFile(intakePath, intakeRecord, "utf8");

    await mutateJson(
      resolve(clonedPackage, "fixtures/manifest.json"),
      (manifest) => {
        asArray(manifest.fixtures, "fixtures").push({
          id: "authorized.owner.positive",
          path: "authorized/owner/positive.dwg",
          sha256,
          creator: "Sergio Valle Zárate",
          createdAt: "2026-08-09",
          origin: {
            type: "owner-authorized",
            reference: "DWG-INTAKE-OWNER0001",
          },
          sourceIds: ["VALLE-OWNER-DWG1-2026-08-09"],
          permission: {
            basis: "Owner-created adversarial test fixture",
            license: "Valle-Owner-Authorized",
            redistributionEvidence: "DWG-INTAKE-OWNER0001",
          },
          declaredVersion: "AC1015",
          byteLength: bytes.byteLength,
          purpose: ["Prove that governed positive intake is extensible"],
          expectations: {
            signature: "recognized",
            parseOutcome: "ok",
            errorCode: null,
            maxWorkUnits: 32,
          },
          synthetic: false,
          generatedBy: null,
          redistributable: true,
          intakeId: "DWG-INTAKE-OWNER0001",
          intakeRecord: {
            path: intakeRelativePath,
            sha256: intakeSha256,
            byteLength: Buffer.byteLength(intakeRecord),
          },
          oracle: {
            id: "DWG-ORACLE-OWNER0001",
            kind: "owner-ground-truth",
            artifactSha256: sha256,
            groundTruthSha256: oracleSha256,
            groundTruthPath: oracleRelativePath,
            groundTruthByteLength: Buffer.byteLength(oracleGroundTruth),
            reviewer: "Oracle test reviewer",
            reviewedAt: "2026-08-09",
          },
        });
      },
    );

    const report = await validateFixtures(clonedPackage);
    assert.equal(report.fixtureCount, 22);
    assert.equal(report.byteLength, 117);

    const nonIndependentRecord = JSON.parse(intakeRecord) as JsonRecord;
    asRecord(nonIndependentRecord.secondReview, "secondReview").reviewer =
      "Oracle test reviewer";
    const nonIndependentText = canonicalJson(nonIndependentRecord);
    const nonIndependentHash = createHash("sha256")
      .update(nonIndependentText)
      .digest("hex");
    const nonIndependentRelativePath = `intake/sha256/${nonIndependentHash}.json`;
    const nonIndependentPath = resolve(
      clonedPackage,
      "fixtures",
      nonIndependentRelativePath,
    );
    await rm(intakePath);
    await writeFile(nonIndependentPath, nonIndependentText, "utf8");
    await mutateJson(
      resolve(clonedPackage, "fixtures/manifest.json"),
      (manifest) => {
        const added = asRecord(
          asArray(manifest.fixtures, "fixtures").at(-1),
          "authorized fixture",
        );
        added.intakeRecord = {
          path: nonIndependentRelativePath,
          sha256: nonIndependentHash,
          byteLength: Buffer.byteLength(nonIndependentText),
        };
      },
    );
    await assert.rejects(
      validateFixtures(clonedPackage),
      /second reviewer must be independent/,
    );

    await rm(nonIndependentPath);
    await writeFile(intakePath, intakeRecord, "utf8");
    await mutateJson(
      resolve(clonedPackage, "fixtures/manifest.json"),
      (manifest) => {
        const added = asRecord(
          asArray(manifest.fixtures, "fixtures").at(-1),
          "authorized fixture",
        );
        added.intakeRecord = {
          path: intakeRelativePath,
          sha256: intakeSha256,
          byteLength: Buffer.byteLength(intakeRecord),
        };
      },
    );

    await mutateJson(
      resolve(clonedPackage, "fixtures/manifest.json"),
      (manifest) => {
        const added = asRecord(
          asArray(manifest.fixtures, "fixtures").at(-1),
          "authorized fixture",
        );
        asRecord(added.oracle, "oracle").artifactSha256 = "0".repeat(64);
      },
    );
    await assert.rejects(
      validateFixtures(clonedPackage),
      /oracle must match its exact bytes/,
    );
  });
});

test("physical size is checked before a giant fixture can be read into memory", async () => {
  await withTemporaryRoot("fixture-giant", async (root) => {
    const clonedPackage = await cloneFixturePackage(root);
    const fixturePath = resolve(
      clonedPackage,
      "fixtures/synthetic/truncated/empty.dwg",
    );
    await truncate(fixturePath, 64 * 1024 * 1024 + 1);
    await assert.rejects(
      validateFixtures(clonedPackage),
      /physical size 67108865 does not match/,
    );
  });
});

test("canonical JSON size is bounded before allocating or parsing", async () => {
  await withTemporaryRoot("json-giant", async (root) => {
    const documentPath = resolve(root, "oversized.json");
    await writeFile(documentPath, "{}\n", "utf8");
    await truncate(documentPath, MAX_CANONICAL_JSON_BYTES + 1);
    await assert.rejects(
      readCanonicalJson(documentPath),
      new RegExp(
        `initial size ${MAX_CANONICAL_JSON_BYTES + 1} exceeds the ${MAX_CANONICAL_JSON_BYTES}-byte limit`,
      ),
    );
  });
});
