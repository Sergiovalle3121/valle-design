import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checker = join(
  repositoryRoot,
  "scripts/check-proprietary-governance.mjs",
);
const baselinePath = "docs/governance/repository-protection-baseline.json";
const requiredFiles = [
  "package.json",
  "LICENSE",
  "NOTICE",
  "CONTRIBUTING.md",
  ".github/CODEOWNERS",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/workflows/ci.yml",
  "docs/governance/ASSISTED_DEVELOPMENT.md",
  "docs/governance/CONTRIBUTOR_IP_ASSIGNMENT_TEMPLATE.md",
  "docs/governance/PROPRIETARY_CONTRIBUTIONS.md",
  "docs/governance/assisted-development-log.json",
  baselinePath,
];

function runFixture(mutateBaseline = () => {}) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "valle-governance-"));
  try {
    for (const relativePath of requiredFiles) {
      const target = join(fixtureRoot, relativePath);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(repositoryRoot, relativePath), target);
    }

    const targetBaseline = join(fixtureRoot, baselinePath);
    const baseline = JSON.parse(readFileSync(targetBaseline, "utf8"));
    mutateBaseline(baseline);
    writeFileSync(targetBaseline, `${JSON.stringify(baseline, null, 2)}\n`);

    return spawnSync(process.execPath, [checker], {
      cwd: fixtureRoot,
      encoding: "utf8",
    });
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

test("acepta la baseline íntegra de propietario único", () => {
  const result = runFixture();
  assert.equal(result.status, 0, result.stderr);
});

test("rechaza reintroducir una aprobación imposible para el propietario único", () => {
  const result = runFixture((baseline) => {
    baseline.requiredProtection.requiredApprovals = 1;
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /contrato técnico mínimo/);
});

test("rechaza quitar un check requerido", () => {
  const result = runFixture((baseline) => {
    baseline.requiredProtection.requiredStatusChecks.pop();
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /contrato técnico mínimo/);
});

test("rechaza relajar la cesión de una futura contribución externa", () => {
  const result = runFixture((baseline) => {
    baseline.futureExternalContributorGate.assignmentOrClaRequired = false;
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /cesión y revisión independiente/);
});

test("rechaza exigir un repositorio compañero", () => {
  const result = runFixture((baseline) => {
    baseline.repositoryTopology.companionRepositoryRequired = true;
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /único repositorio privado/);
});

test("rechaza afirmar una protección remota que el plan privado no ofrece", () => {
  const result = runFixture((baseline) => {
    baseline.remoteEnforcement.machineEnforced = true;
    baseline.remoteEnforcement.protectionClaimAllowed = true;
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /protección remota no está disponible/);
});

test("rechaza omitir el SHA esperado del protocolo temporal", () => {
  const result = runFixture((baseline) => {
    baseline.interimOwnerMergeProtocol.requireExpectedHeadShaAtMerge = false;
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /protocolo temporal exact-SHA/);
});
