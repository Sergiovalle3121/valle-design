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

function runFixture(mutateBaseline = () => {}, mutateAssistedLog = () => {}) {
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

    const targetAssistedLog = join(
      fixtureRoot,
      "docs/governance/assisted-development-log.json",
    );
    const assistedLog = JSON.parse(readFileSync(targetAssistedLog, "utf8"));
    mutateAssistedLog(assistedLog);
    writeFileSync(
      targetAssistedLog,
      `${JSON.stringify(assistedLog, null, 2)}\n`,
    );

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

test("rechaza mutilar el protocolo local de seis gates", () => {
  const result = runFixture((baseline) => {
    baseline.ownerMergeProtocol.localGatesRequiredBeforePush.pop();
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /protocolo local de seis gates/);
});

test("rechaza quitar un check requerido observado", () => {
  const result = runFixture((baseline) => {
    baseline.remoteProtectionObserved.requiredStatusChecks.pop();
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /checks requeridos observados/);
});

test("rechaza relajar la cesión de una futura contribución externa", () => {
  const result = runFixture((baseline) => {
    baseline.futureExternalContributorGate.assignmentOrClaRequired = false;
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /cesión y revisión independiente/);
});

test("rechaza un repositorio fuera de la topología autorizada", () => {
  const result = runFixture((baseline) => {
    baseline.repositoryTopology.repositories.push("Sergiovalle3121/otro");
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /topología de dos repositorios/);
});

test("rechaza visibilidad pública sin contradicción registrada", () => {
  const result = runFixture((baseline) => {
    baseline.visibilityContradictsNotice = false;
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /visibilidad pública exige registrar/);
});

test("rechaza soltar el SHA exacto en PRs", () => {
  const result = runFixture((baseline) => {
    baseline.ownerMergeProtocol.pullRequestsRequireExactShaChecks = false;
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SHA exacto en PRs/);
});

test("rechaza que una IA reclame autoría", () => {
  const result = runFixture(
    () => {},
    (assistedLog) => {
      assistedLog.entries[0].aiClaimsAuthorship = true;
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ninguna IA puede reclamar autoría/);
});

test("rechaza declarar a una IA como adoptante humana", () => {
  const result = runFixture(
    () => {},
    (assistedLog) => {
      assistedLog.entries[0].adoption.adopter = "OpenAI Codex";
      assistedLog.entries[0].adoption.evidence = "";
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Sergio debe figurar como adoptante humano/);
});
