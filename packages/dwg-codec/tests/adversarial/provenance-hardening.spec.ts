import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { DWG1_CONTENT_BOUND_ADMISSION } from "../../scripts/dwg1-safe-core-admission.js";
import { canonicalJson } from "../../scripts/json-document.js";
import { validateProvenance } from "../../scripts/provenance-validation.js";
import { caseFold } from "../../scripts/safe-path.js";

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
  const root = await mkdtemp(join(tmpdir(), `valle-dwg1-${label}-`));
  try {
    return await body(root);
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

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function withRepinnedCandidateFiles<T>(
  repositoryRoot: string,
  repositoryPaths: readonly string[],
  body: () => Promise<T>,
): Promise<T> {
  const mutableAdmission = DWG1_CONTENT_BOUND_ADMISSION as Map<
    string,
    Readonly<{ path: string; sha256: string; byteLength: number }>
  >;
  const previous: Array<
    readonly [
      string,
      Readonly<{ path: string; sha256: string; byteLength: number }>,
    ]
  > = [];
  try {
    for (const repositoryPath of repositoryPaths) {
      const key = caseFold(repositoryPath);
      const existing = mutableAdmission.get(key);
      assert.notEqual(existing, undefined);
      if (existing === undefined) throw new Error("missing admission fixture");
      const text = (
        await readFile(resolve(repositoryRoot, existing.path), "utf8")
      ).replaceAll("\r\n", "\n");
      assert.equal(text.includes("\r"), false);
      const bytes = Buffer.from(text, "utf8");
      previous.push([key, existing]);
      mutableAdmission.set(
        key,
        Object.freeze({
          path: existing.path,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          byteLength: bytes.byteLength,
        }),
      );
    }
    return await body();
  } finally {
    for (const [key, admission] of previous) {
      mutableAdmission.set(key, admission);
    }
  }
}

async function cloneMinimalProvenanceRepository(root: string): Promise<{
  readonly repositoryRoot: string;
  readonly packageRoot: string;
}> {
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

  const register = asRecord(
    JSON.parse(
      await readFile(resolve(clonedPackage, "SOURCE_REGISTER.json"), "utf8"),
    ) as unknown,
    "SOURCE_REGISTER.json",
  );
  for (const entryValue of asArray(register.entries, "source entries")) {
    const entry = asRecord(entryValue, "source entry");
    for (const derivedValue of asArray(entry.derivedFiles, "derivedFiles")) {
      if (typeof derivedValue !== "string")
        throw new Error("derived path must be a string");
      const target = resolve(repositoryRoot, derivedValue);
      if (!(await pathExists(target))) {
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, new Uint8Array());
      }
    }
  }
  return { packageRoot: clonedPackage, repositoryRoot };
}

test("provenance rejects a fixture sourceId that is quarantined", async () => {
  await withTemporaryRoot("provenance-source", async (root) => {
    const clone = await cloneMinimalProvenanceRepository(root);
    const sourcePath = resolve(clone.packageRoot, "SOURCE_REGISTER.json");
    await mutateJson(sourcePath, (register) => {
      const entries = asArray(register.entries, "entries");
      const template = structuredClone(asRecord(entries[1], "source template"));
      template.id = "VALLE-TEST-QUARANTINED-SOURCE";
      template.title = "Adversarial quarantined source metadata";
      template.status = "quarantined";
      template.factsConsulted = [];
      template.derivedFiles = [];
      template.origin = {
        accessedAt: "2026-08-09",
        location: "https://example.invalid/valle-dwg1-quarantined-source",
        type: "first-party-repository",
      };
      entries.push(template);
    });
    const manifestPath = resolve(clone.packageRoot, "fixtures/manifest.json");
    await mutateJson(manifestPath, (manifest) => {
      const fixture = asRecord(
        asArray(manifest.fixtures, "fixtures")[0],
        "fixture",
      );
      fixture.sourceIds = ["VALLE-TEST-QUARANTINED-SOURCE"];
    });
    await withRepinnedCandidateFiles(
      clone.repositoryRoot,
      [
        "packages/dwg-codec/SOURCE_REGISTER.json",
        "packages/dwg-codec/fixtures/manifest.json",
      ],
      async () =>
        assert.rejects(
          validateProvenance(clone.repositoryRoot, clone.packageRoot),
          /does not resolve to an allowed source/,
        ),
    );
  });
});

test("provenance rejects new technical files covered only by a source", async () => {
  await withTemporaryRoot("provenance-technical-fact", async (root) => {
    const clone = await cloneMinimalProvenanceRepository(root);
    const technicalPath = resolve(clone.packageRoot, "src/new-decoder.ts");
    await writeFile(technicalPath, "export {};\n", "utf8");
    await mutateJson(
      resolve(clone.packageRoot, "SOURCE_REGISTER.json"),
      (register) => {
        const ownerSource = asArray(register.entries, "entries")
          .map((entry) => asRecord(entry, "source"))
          .find((entry) => entry.id === "VALLE-OWNER-DWG1-2026-08-09");
        assert.ok(ownerSource);
        asArray(ownerSource.derivedFiles, "derivedFiles").push(
          "packages/dwg-codec/src/new-decoder.ts",
        );
      },
    );
    await withRepinnedCandidateFiles(
      clone.repositoryRoot,
      ["packages/dwg-codec/SOURCE_REGISTER.json"],
      async () =>
        assert.rejects(
          validateProvenance(clone.repositoryRoot, clone.packageRoot),
          /changed or new package file is not in the exact DWG-1 admission allowlist/,
        ),
    );
  });
});

test("provenance rejects mutation of a legacy technical file outside the exact admission allowlist", async () => {
  await withTemporaryRoot("provenance-legacy-content", async (root) => {
    const clone = await cloneMinimalProvenanceRepository(root);
    const technicalPath = resolve(
      clone.packageRoot,
      "src/container/signature.ts",
    );
    const original = await readFile(technicalPath, "utf8");
    await writeFile(
      technicalPath,
      `${original}\n// unreviewed format claim\n`,
      "utf8",
    );
    await assert.rejects(
      validateProvenance(clone.repositoryRoot, clone.packageRoot),
      /src\/container\/signature\.ts: changed or new package file is not in the exact DWG-1 admission allowlist/,
    );
  });
});

test("provenance rejects deletion of a frozen legacy file", async () => {
  await withTemporaryRoot("provenance-legacy-deletion", async (root) => {
    const clone = await cloneMinimalProvenanceRepository(root);
    await rm(resolve(clone.packageRoot, "src/container/signature.ts"));
    await assert.rejects(
      validateProvenance(clone.repositoryRoot, clone.packageRoot),
      /src\/container\/signature\.ts.*required path does not exist or is inaccessible/,
    );
  });
});

test("provenance rejects an arbitrary rewrite of the pinned DWG-0 baseline", async () => {
  await withTemporaryRoot("provenance-baseline-rewrite", async (root) => {
    const clone = await cloneMinimalProvenanceRepository(root);
    await mutateJson(
      resolve(clone.packageRoot, "DWG0_CONTENT_BASELINE.v1.json"),
      (baseline) => {
        const first = asRecord(
          asArray(baseline.files, "baseline files")[0],
          "baseline file",
        );
        first.sha256 = "0".repeat(64);
      },
    );
    await assert.rejects(
      validateProvenance(clone.repositoryRoot, clone.packageRoot),
      /baseline document differs from its verifier-pinned hash and size/,
    );
  });
});

test("content-bound DWG-1 admission rejects mutation of an admitted safe-core file", async () => {
  await withTemporaryRoot("provenance-safe-core-mutation", async (root) => {
    const clone = await cloneMinimalProvenanceRepository(root);
    const admittedPath = resolve(clone.packageRoot, "src/api/read.ts");
    const original = await readFile(admittedPath, "utf8");
    await writeFile(
      admittedPath,
      `${original}\n// unauthorized mutation\n`,
      "utf8",
    );
    await assert.rejects(
      validateProvenance(clone.repositoryRoot, clone.packageRoot),
      /src\/api\/read\.ts: content differs from its exact DWG-1 safe-core admission/,
    );
  });
});

test("content-bound admission retains canonical case for case-sensitive hosts", () => {
  const entry = DWG1_CONTENT_BOUND_ADMISSION.get(
    "packages/dwg-codec/capabilities.md",
  );
  assert.equal(entry?.path, "packages/dwg-codec/CAPABILITIES.md");
});

test("provenance rejects a case-folded duplicate in the physical package inventory", async (context) => {
  await withTemporaryRoot("provenance-case-collision", async (root) => {
    const clone = await cloneMinimalProvenanceRepository(root);
    const apiDirectory = resolve(clone.packageRoot, "src/api");
    await writeFile(
      resolve(apiDirectory, "READ.ts"),
      "export const unreviewedDuplicate = true;\n",
      "utf8",
    );
    const collidingNames = (await readdir(apiDirectory)).filter(
      (name) => caseFold(name) === "read.ts",
    );
    if (collidingNames.length < 2) {
      context.skip("the local filesystem is case-insensitive");
      return;
    }
    await assert.rejects(
      validateProvenance(clone.repositoryRoot, clone.packageRoot),
      /DWG package file inventory: duplicate values under case folding/,
    );
  });
});

test("content-bound DWG-1 admission also freezes the synthetic generator", async () => {
  await withTemporaryRoot("provenance-generator-mutation", async (root) => {
    const clone = await cloneMinimalProvenanceRepository(root);
    const generatorPath = resolve(
      clone.packageRoot,
      "fixtures/generators/generate-synthetic.ts",
    );
    const original = await readFile(generatorPath, "utf8");
    await writeFile(
      generatorPath,
      `${original}\n// unauthorized signature mutation\n`,
      "utf8",
    );
    await assert.rejects(
      validateProvenance(clone.repositoryRoot, clone.packageRoot),
      /fixtures\/generators\/generate-synthetic\.ts: content differs from its exact DWG-1 safe-core admission/,
    );
  });
});

test("exact DWG-1 admission requires source and governance-fact parity", async () => {
  await withTemporaryRoot("provenance-neutral-parity", async (root) => {
    const clone = await cloneMinimalProvenanceRepository(root);
    await mutateJson(
      resolve(clone.packageRoot, "FACT_REGISTER.json"),
      (register) => {
        const governanceFact = asArray(register.facts, "facts")
          .map((fact) => asRecord(fact, "fact"))
          .find((fact) => fact.id === "VALLE-DWG1-PROGRAM-SCOPE-2026-08-09");
        assert.ok(governanceFact);
        governanceFact.derivedFiles = asArray(
          governanceFact.derivedFiles,
          "derivedFiles",
        ).filter((path) => path !== "packages/dwg-codec/src/api/read.ts");
      },
    );
    await withRepinnedCandidateFiles(
      clone.repositoryRoot,
      ["packages/dwg-codec/FACT_REGISTER.json"],
      async () =>
        assert.rejects(
          validateProvenance(clone.repositoryRoot, clone.packageRoot),
          /exact DWG-1 admission must name an existing file covered by the DWG-1 source and governance fact/,
        ),
    );
  });
});

for (const [label, license] of [
  ["Autodesk proprietary SDK EULA", "Autodesk proprietary SDK EULA"],
  ["custom terms", "Custom"],
  ["Commons Clause", "Commons-Clause"],
] as const) {
  test(`provenance rejects allowed public metadata under ${label}`, async () => {
    await withTemporaryRoot("provenance-license", async (root) => {
      const clone = await cloneMinimalProvenanceRepository(root);
      const sourcePath = resolve(clone.packageRoot, "SOURCE_REGISTER.json");
      await mutateJson(sourcePath, (register) => {
        const entries = asArray(register.entries, "entries");
        const publicSource = entries
          .map((entry) => asRecord(entry, "source entry"))
          .find(
            (entry) =>
              asRecord(entry.origin, "source origin").type ===
              "public-documentation",
          );
        assert.ok(publicSource, "expected a public-documentation source");
        asRecord(publicSource.terms, "source terms").license = license;
      });
      await assert.rejects(
        validateProvenance(clone.repositoryRoot, clone.packageRoot),
        /is not explicitly allowed for origin type "public-documentation"/,
      );
    });
  });
}

test("provenance rejects authorized corpus metadata without intake and oracle", async () => {
  await withTemporaryRoot("provenance-authorized", async (root) => {
    const clone = await cloneMinimalProvenanceRepository(root);
    const manifestPath = resolve(clone.packageRoot, "fixtures/manifest.json");
    await mutateJson(manifestPath, (manifest) => {
      const fixture = asRecord(
        asArray(manifest.fixtures, "fixtures")[0],
        "fixture",
      );
      fixture.path = "authorized/owner/empty.dwg";
      fixture.origin = {
        reference: "owner-test-reference",
        type: "owner-authorized",
      };
      fixture.permission = {
        basis: "Adversarial test metadata only",
        license: "Valle-Owner-Authorized",
        redistributionEvidence: "Adversarial test metadata only",
      };
      fixture.synthetic = false;
      fixture.generatedBy = null;
    });
    await assert.rejects(
      validateProvenance(clone.repositoryRoot, clone.packageRoot),
      /must have required property '(?:intakeId|oracle)'/,
    );
  });
});
