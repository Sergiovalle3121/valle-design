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

if (rootManifest?.scripts?.sbom?.includes("--omit dev")) {
  failures.push(
    "package.json: el SBOM no puede omitir dependencias de desarrollo",
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
  "repositorio es privado y confidencial",
  "el aviso confidencial vigente",
);
requireText(
  "NOTICE",
  "Todos los derechos reservados",
  "la reserva de derechos visible",
);
requireText(
  "NOTICE",
  "único repositorio del proyecto",
  "la topología de repositorio único",
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
    if (entry.aiCoAuthorTrailers !== false) {
      failures.push(`${prefix}: aiCoAuthorTrailers debe ser false`);
    }
  }
}

const workflow = read(".github/workflows/ci.yml");
for (const jobName of [
  "Contrato · Build · Test · Lint · Smoke",
  "E2E Playwright (PostgreSQL · Chromium + Firefox)",
  "Gitleaks (historial completo)",
  "SBOM CycloneDX (evidencia)",
]) {
  requireText(
    ".github/workflows/ci.yml",
    `name: ${jobName}`,
    `el nombre estable del check ${jobName}`,
  );
}
const pinnedActions = new Map([
  ["actions/checkout", "11d5960a326750d5838078e36cf38b85af677262"],
  ["actions/setup-node", "49933ea5288caeca8642d1e84afbd3f7d6820020"],
  ["actions/upload-artifact", "ea165f8d65b6e75b540449e92b4886f43607fa02"],
]);
for (const match of workflow.matchAll(
  /uses:\s*(actions\/(?:checkout|setup-node|upload-artifact))@([^\s#]+)/g,
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
  const protection = protectionBaseline.requiredProtection;
  const expectedChecks = [
    "Contrato · Build · Test · Lint · Smoke",
    "E2E Playwright (PostgreSQL · Chromium + Firefox)",
    "Gitleaks (historial completo)",
    "SBOM CycloneDX (evidencia)",
  ];
  if (protectionBaseline.schemaVersion !== "1.1.0") {
    failures.push(
      "repository-protection-baseline.json: schemaVersion debe ser 1.1.0",
    );
  }
  if (
    protectionBaseline.visibility !== "private" ||
    protectionBaseline.repositoryTopology?.kind !== "single-repository" ||
    protectionBaseline.repositoryTopology?.repository !==
      "Sergiovalle3121/valle-design" ||
    protectionBaseline.repositoryTopology?.companionRepositoryRequired !== false
  ) {
    failures.push(
      "repository-protection-baseline.json: debe describir el único repositorio privado sin companion obligatorio",
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
  if (
    protection?.requirePullRequest !== true ||
    protection?.requiredApprovals !== 0 ||
    protection?.dismissStaleReviews !== true ||
    protection?.requireLastPushApproval !== false ||
    protection?.requireCodeOwnerReview !== false ||
    protection?.requireBranchUpToDate !== true ||
    protection?.requireConversationResolution !== true ||
    protection?.requireLinearHistory !== true ||
    protection?.enforceAdmins !== true ||
    protection?.allowForcePushes !== false ||
    protection?.allowDeletions !== false ||
    protection?.allowStatusCheckBypass !== false ||
    JSON.stringify(protection?.requiredStatusChecks) !==
      JSON.stringify(expectedChecks)
  ) {
    failures.push(
      "repository-protection-baseline.json: la baseline de propietario único no cumple el contrato técnico mínimo",
    );
  }
  const expectedSubstituteControls = [
    "pull-request-record",
    "exact-sha-required-status-checks",
    "strict-up-to-date-branch",
    "resolved-conversations",
    "linear-history",
    "owner-adoption-record",
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
  const remote = protectionBaseline.remoteEnforcement;
  if (
    remote?.status !== "unavailable-current-plan" ||
    typeof remote?.verifiedAt !== "string" ||
    !remote.branchProtectionApi?.startsWith("403 ") ||
    !remote.rulesetsApi?.startsWith("403 ") ||
    remote?.machineEnforced !== false ||
    remote?.protectionClaimAllowed !== false ||
    typeof remote?.requiredRemediation !== "string" ||
    remote.requiredRemediation.length === 0
  ) {
    failures.push(
      "repository-protection-baseline.json: debe registrar honestamente que la protección remota no está disponible",
    );
  }
  const interim = protectionBaseline.interimOwnerMergeProtocol;
  if (
    interim?.requirePullRequest !== true ||
    interim?.requireExactHeadSha !== true ||
    interim?.requireAllFourChecksSuccessful !== true ||
    interim?.requireHeadBasedOnCurrentMain !== true ||
    interim?.requireExpectedHeadShaAtMerge !== true ||
    interim?.directPushProhibitedByPolicy !== true ||
    interim?.machineEnforced !== false
  ) {
    failures.push(
      "repository-protection-baseline.json: falta el protocolo temporal exact-SHA del propietario",
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
