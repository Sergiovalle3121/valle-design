#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const failures = [];

function read(path) {
  if (!existsSync(path)) {
    failures.push(`Falta el archivo requerido: ${path}`);
    return "";
  }
  return readFileSync(path, "utf8");
}

function parseJson(path) {
  const text = read(path);
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch (error) {
    failures.push(`${path} no es JSON válido: ${error.message}`);
    return undefined;
  }
}

function requireText(path, needle, description) {
  const text = read(path);
  if (text && !text.includes(needle)) {
    failures.push(`${path}: falta ${description}`);
  }
}

const rootManifest = parseJson("package.json");
const manifests = ["package.json"];

for (const pattern of rootManifest?.workspaces ?? []) {
  if (!pattern.endsWith("/*")) {
    failures.push(`Workspace no soportado por el gate: ${pattern}`);
    continue;
  }
  const directory = pattern.slice(0, -2);
  if (!existsSync(directory)) continue;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifest = join(directory, entry.name, "package.json");
    if (existsSync(manifest)) manifests.push(manifest.replaceAll("\\", "/"));
  }
}

for (const path of manifests) {
  const manifest = parseJson(path);
  if (!manifest) continue;
  if (manifest.private !== true)
    failures.push(`${path}: private debe ser true`);
  if (manifest.license !== "UNLICENSED") {
    failures.push(`${path}: license debe ser UNLICENSED`);
  }
}

const sbomFull = rootManifest?.scripts?.["sbom:full"];
if (typeof sbomFull !== "string" || sbomFull.includes("--omit")) {
  failures.push(
    "package.json: debe existir sbom:full sin omitir dependencias de desarrollo",
  );
}

requireText("LICENSE", "Sergio Valle Zárate", "el titular exacto");
requireText("LICENSE", "All Rights Reserved", "la reserva de derechos");
requireText(
  "LICENSE",
  "THIS IS NOT AN OPEN-SOURCE LICENSE",
  "la ausencia de licencia open source",
);
requireText(
  "NOTICE",
  "propietario y confidencial",
  "el aviso confidencial vigente",
);
requireText(
  "NOTICE",
  "Todos los derechos reservados",
  "la reserva de derechos visible",
);
requireText(
  "NOTICE",
  "ningún otro repositorio está autorizado",
  "la topología cerrada de repositorios",
);
requireText(
  "CONTRIBUTING.md",
  "acuerdo de cesión o CLA",
  "el gate contractual de contribuciones",
);
requireText(
  "docs/governance/CONTRIBUTOR_IP_ASSIGNMENT_TEMPLATE.md",
  "pendiente de adaptación y aprobación por asesor jurídico",
  "la cautela jurídica del borrador de cesión",
);
requireText(
  "CONTRIBUTING.md",
  "no sustituye el acuerdo",
  "la prohibición de cesión implícita por PR",
);
requireText(
  "CONTRIBUTING.md",
  "único titular y contribuidor humano actual",
  "el modelo de propietario único",
);
requireText(
  "CONTRIBUTING.md",
  "checks requeridos verdes sobre el SHA exacto",
  "el control sustituto de checks sobre SHA exacto",
);
requireText(
  "docs/governance/PROPRIETARY_CONTRIBUTIONS.md",
  "La regla de esta sección se aplica a toda persona distinta de Sergio Valle",
  "el gate inequívoco para contribuidores externos",
);
requireText(
  "docs/governance/ASSISTED_DEVELOPMENT.md",
  "él revisa y adopta personalmente los cambios asistidos first-party",
  "la adopción personal del titular",
);
requireText(".github/CODEOWNERS", "* @Sergiovalle3121", "el CODEOWNER titular");
requireText(
  ".github/PULL_REQUEST_TEMPLATE.md",
  "Titularidad y procedencia",
  "la declaración de procedencia",
);
requireText(
  ".github/PULL_REQUEST_TEMPLATE.md",
  "No añadí una IA como autora",
  "la declaración de no coautoría de IA",
);
requireText(
  ".github/PULL_REQUEST_TEMPLATE.md",
  "sin derechos y procedencia verificados",
  "el bloqueo de secretos y corpus no autorizado",
);
requireText(
  ".github/PULL_REQUEST_TEMPLATE.md",
  "SHA exacto revisado y candidato a merge",
  "la evidencia del SHA exacto candidato",
);

const assistedLog = parseJson("docs/governance/assisted-development-log.json");
let assistedEntriesCount = 0;
if (assistedLog) {
  if (assistedLog.schemaVersion !== "1.0.0") {
    failures.push(
      "assisted-development-log.json: schemaVersion debe ser 1.0.0",
    );
  }
  if (assistedLog.owner !== "Sergio Valle Zárate") {
    failures.push("assisted-development-log.json: owner inesperado");
  }
  const ids = new Set();
  assistedEntriesCount = Array.isArray(assistedLog.entries)
    ? assistedLog.entries.length
    : 0;
  if (!Array.isArray(assistedLog.entries) || assistedLog.entries.length === 0) {
    failures.push("assisted-development-log.json: falta al menos una entrada");
  }
  for (const [index, entry] of (assistedLog.entries ?? []).entries()) {
    const prefix = `assisted-development-log.json entries[${index}]`;
    if (typeof entry.id !== "string" || !entry.id)
      failures.push(`${prefix}: id requerido`);
    if (ids.has(entry.id)) failures.push(`${prefix}: id duplicado ${entry.id}`);
    ids.add(entry.id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date ?? "")) {
      failures.push(`${prefix}: date debe ser YYYY-MM-DD`);
    }
    if (!Array.isArray(entry.assistants) || entry.assistants.length === 0) {
      failures.push(`${prefix}: assistants requerido`);
    }
    if (!Array.isArray(entry.externalSources)) {
      failures.push(`${prefix}: externalSources debe ser un arreglo explícito`);
    }
    if (entry.adoption?.required !== true) {
      failures.push(`${prefix}: la adopción humana debe ser obligatoria`);
    }
    if (
      !new Set(["proposed", "adopted", "rejected"]).has(entry.adoption?.status)
    ) {
      failures.push(`${prefix}: estado de adopción humana no permitido`);
    }
    if (
      entry.adoption?.adopter !== "Sergio Valle Zárate" ||
      typeof entry.adoption?.evidence !== "string" ||
      entry.adoption.evidence.trim().length === 0
    ) {
      failures.push(
        `${prefix}: Sergio debe figurar como adoptante humano con evidencia no vacía`,
      );
    }
    if (typeof entry.aiCoAuthorTrailers !== "boolean") {
      failures.push(
        `${prefix}: aiCoAuthorTrailers debe registrar el hecho (true/false)`,
      );
    }
    if (entry.aiClaimsAuthorship !== false) {
      failures.push(
        `${prefix}: ninguna IA puede reclamar autoría (aiClaimsAuthorship debe ser false)`,
      );
    }
  }
}

const workflow = read(".github/workflows/ci.yml");
for (const jobName of [
  "Contrato · Build · Test · Lint · Smoke",
  "E2E Playwright (PostgreSQL · Chromium + Firefox)",
  "Gitleaks (historial completo)",
  "Despliegue · Imagen reproducible + arranque productivo",
]) {
  requireText(
    ".github/workflows/ci.yml",
    `name: ${jobName}`,
    `el nombre estable del check ${jobName}`,
  );
}
// El disparador de `push` cubre TODAS las ramas, y las dos listas `paths`
// son idénticas. Medido el 2026-09-02: GitHub no ejecuta `pull_request`
// mientras el PR tiene conflicto de fusión, y en este repositorio todo PR lo
// tiene en cuanto se fusiona otro (todos añaden al mismo array de
// assisted-development-log.json). Sin `push` en la rama, un PR conflictivo
// no tiene NINGÚN veredicto y se fusiona a ciegas (#157, #166, #170). Las
// listas van copiadas y no ancladas porque GitHub Actions no garantiza anclas
// YAML; este gate es lo que impide que se desvíen.
{
  const pathLists = [...workflow.matchAll(/^    paths:\n((?:      - .*\n)+)/gm)].map(
    (match) => match[1],
  );
  if (pathLists.length !== 2) {
    failures.push(
      `ci.yml: se esperaban exactamente 2 listas \`paths\` (pull_request y push), hay ${pathLists.length}`,
    );
  } else if (pathLists[0] !== pathLists[1]) {
    failures.push(
      "ci.yml: las listas `paths` de pull_request y push difieren; un PR con conflicto sólo tiene la corrida de push, así que deben filtrar lo mismo",
    );
  }
  if (!/^  push:\n(?:    #.*\n)*    branches: \["\*\*"\]/m.test(workflow)) {
    failures.push(
      'ci.yml: `push` debe disparar en todas las ramas (`branches: ["**"]`): un PR con conflicto de fusión no dispara pull_request y se quedaría sin veredicto',
    );
  }
}

const pinnedActions = new Map([
  ["actions/checkout", "11d5960a326750d5838078e36cf38b85af677262"],
  ["actions/setup-node", "49933ea5288caeca8642d1e84afbd3f7d6820020"],
  ["actions/upload-artifact", "ea165f8d65b6e75b540449e92b4886f43607fa02"],
  ["actions/cache", "0057852bfaa89a56745cba8c7296529d2fc39830"],
]);
for (const match of workflow.matchAll(
  /uses:\s*(actions\/(?:checkout|setup-node|upload-artifact|cache))@([^\s#]+)/g,
)) {
  if (match[2] !== pinnedActions.get(match[1])) {
    failures.push(`ci.yml: ${match[1]} usa un SHA no revisado: ${match[2]}`);
  }
}
if (
  !workflow.includes(
    "9991e0b2903da4c8f6122b5c3186448b927a5da4deef1fe45271c3793f4ee29c",
  )
) {
  failures.push(
    "ci.yml: falta verificar el SHA-256 del archivo de gitleaks 8.24.3",
  );
}

const protectionBaseline = parseJson(
  "docs/governance/repository-protection-baseline.json",
);
if (protectionBaseline) {
  const expectedChecks = [
    "Contrato · Build · Test · Lint · Smoke",
    "E2E Playwright (PostgreSQL · Chromium + Firefox)",
    "Gitleaks (historial completo)",
  ];
  if (protectionBaseline.schemaVersion !== "1.2.0") {
    failures.push(
      "repository-protection-baseline.json: schemaVersion debe ser 1.2.0",
    );
  }
  if (protectionBaseline.visibility === "public") {
    const decision = protectionBaseline.visibilityDecision;
    if (
      protectionBaseline.visibilityContradictsNotice !== true ||
      !new Set(["pending-owner-decision", "accepted-public"]).has(
        decision?.status,
      ) ||
      typeof decision?.finding !== "string" ||
      decision.finding.length === 0 ||
      typeof decision?.requiredRemediation !== "string" ||
      decision.requiredRemediation.length === 0
    ) {
      failures.push(
        "repository-protection-baseline.json: la visibilidad pública exige registrar la contradicción, el hallazgo y la remediación pendiente",
      );
    }
  } else if (protectionBaseline.visibility !== "private") {
    failures.push(
      "repository-protection-baseline.json: visibility debe ser private o public (verificada, no deseada)",
    );
  }
  const topology = protectionBaseline.repositoryTopology;
  const expectedRepositories = [
    "Sergiovalle3121/valle-design",
    "Sergiovalle3121/valle-design-dwg-conformance",
  ];
  if (
    topology?.kind !== "two-repositories-single-owner" ||
    JSON.stringify(topology?.repositories) !==
      JSON.stringify(expectedRepositories) ||
    topology?.companionRepository !== expectedRepositories[1]
  ) {
    failures.push(
      "repository-protection-baseline.json: la topología de dos repositorios del titular no coincide con la autorizada",
    );
  }
  if (
    protectionBaseline.governanceModel?.kind !== "sole-human-owner" ||
    protectionBaseline.governanceModel?.owner !== "Sergio Valle Zárate" ||
    protectionBaseline.governanceModel?.githubLogin !== "Sergiovalle3121" ||
    protectionBaseline.governanceModel?.humanContributors !== 1 ||
    protectionBaseline.governanceModel
      ?.independentApprovalRequiredForOwnerChanges !== false ||
    protectionBaseline.governanceModel?.ownerClaOrAssignmentRequired !== false
  ) {
    failures.push(
      "repository-protection-baseline.json: el modelo debe identificar a Sergio como único titular y contribuidor humano",
    );
  }
  const observed = protectionBaseline.remoteProtectionObserved;
  if (
    JSON.stringify(observed?.requiredStatusChecks) !==
      JSON.stringify(expectedChecks) ||
    observed?.allowForcePushes !== false ||
    observed?.allowDeletions !== false ||
    typeof observed?.capturedAt !== "string"
  ) {
    failures.push(
      "repository-protection-baseline.json: los checks requeridos observados no coinciden con el contrato",
    );
  }
  const protocol = protectionBaseline.ownerMergeProtocol;
  const expectedLocalGates = [
    "check:cad",
    "check:dwg",
    "typecheck",
    "test",
    "lint",
    "build",
  ];
  if (
    JSON.stringify(protocol?.localGatesRequiredBeforePush) !==
      JSON.stringify(expectedLocalGates) ||
    protocol?.pullRequestsRequireExactShaChecks !== true
  ) {
    failures.push(
      "repository-protection-baseline.json: falta el protocolo local de seis gates con SHA exacto en PRs",
    );
  }
  const expectedSubstituteControls = [
    "pull-request-record",
    "exact-sha-required-status-checks",
    "local-six-gate-protocol",
    "owner-adoption-record",
    "assisted-development-log",
  ];
  if (
    JSON.stringify(protectionBaseline.soleOwnerSubstituteControls) !==
    JSON.stringify(expectedSubstituteControls)
  ) {
    failures.push(
      "repository-protection-baseline.json: faltan controles sustitutos del modelo de propietario único",
    );
  }
  const externalGate = protectionBaseline.futureExternalContributorGate;
  if (
    externalGate?.assignmentOrClaRequired !== true ||
    externalGate?.independentApprovalRequired !== true ||
    externalGate?.lastPushApprovalRequired !== true ||
    externalGate?.codeOwnerReviewRequiredForSensitivePaths !== true ||
    externalGate?.mustBeEnabledBeforeFirstExternalPullRequest !== true
  ) {
    failures.push(
      "repository-protection-baseline.json: una contribución externa futura debe seguir bloqueada por cesión y revisión independiente",
    );
  }
  const mergeSettings = protectionBaseline.repositoryMergeSettings;
  if (
    mergeSettings?.allowSquashMerge !== true ||
    mergeSettings?.allowMergeCommit !== false ||
    mergeSettings?.allowRebaseMerge !== false ||
    mergeSettings?.allowAutoMerge !== true ||
    mergeSettings?.allowUpdateBranch !== true ||
    mergeSettings?.deleteBranchOnMerge !== true
  ) {
    failures.push(
      "repository-protection-baseline.json: los ajustes de merge no cumplen el contrato propietario",
    );
  }
}

if (failures.length) {
  console.error("Gate de gobernanza propietaria: FALLÓ");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Gate de gobernanza propietaria: OK (${manifests.length} manifests UNLICENSED; ` +
    `${assistedEntriesCount} registro(s) asistido(s))`,
);
