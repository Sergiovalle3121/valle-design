#!/usr/bin/env node
/**
 * Auditoría de ramas remotas: cuenta, clasifica, avisa antes de que 4 se
 * vuelvan 74.
 *
 * La campaña de cierre de ramas del 2026-08-24
 * (docs/history/execution/CIERRE_RAMAS_20260824.md) no fue un accidente: fue el
 * efecto de muchas sesiones paralelas sin nadie vigilando el conteo. Este
 * script es la vigilancia — corre en el monitor semanal
 * (.github/workflows/branch-audit.yml), NO en el CI de cada commit, porque
 * es una señal de higiene de repositorio, no un gate de un cambio concreto.
 *
 * Clasificación por CONTENIDO real, no por nombre ni por intuición:
 *   - integrada:   0 commits por delante de origin/main (ahead=0). Ancestro
 *                  puro; su contenido ya vive en main sin importar cómo se
 *                  fusionó. Candidata a borrar.
 *   - con-trabajo: ahead>0. Puede tener valor real o puede estar ya absorbida
 *                  por otra vía (squash-merge en otra rama) — este script NO
 *                  intenta distinguir eso; esa es la parte que exige criterio
 *                  humano o de agente, documentada rama por rama en una
 *                  campaña como la del 24-08. Aquí sólo se cuenta y se avisa.
 *   - abandonada:  último commit hace más de ABANDONED_DAYS, sin importar la
 *                  categoría anterior — una rama "con-trabajo" también puede
 *                  estar abandonada.
 *
 * Umbrales configurables abajo (MAX_LIVE_BRANCHES, ABANDONED_DAYS). Subirlos
 * sin evidencia de que el número más bajo ya no alcanza es exactamente el
 * tipo de relajación que este script existe para prevenir — si hace falta,
 * que quede en el mensaje del commit que lo cambia.
 */
import { execFileSync } from "node:child_process";

const MAX_LIVE_BRANCHES = Number(process.env.BRANCH_AUDIT_MAX_LIVE ?? 15);
const ABANDONED_DAYS = Number(process.env.BRANCH_AUDIT_ABANDONED_DAYS ?? 14);
const REMOTE = process.env.BRANCH_AUDIT_REMOTE ?? "origin";
const DEFAULT_BRANCH = process.env.BRANCH_AUDIT_DEFAULT_BRANCH ?? "main";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim();
}

function listRemoteBranches() {
  const raw = git(["ls-remote", "--heads", REMOTE]);
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => line.split("\t")[1]?.replace("refs/heads/", ""))
    .filter((name) => name && name !== DEFAULT_BRANCH);
}

function branchInfo(branch) {
  const ref = `${REMOTE}/${branch}`;
  const ahead = Number(git(["rev-list", "--count", `${REMOTE}/${DEFAULT_BRANCH}..${ref}`]));
  const lastCommitEpoch = Number(git(["log", "-1", "--format=%ct", ref]));
  const ageDays = (Date.now() / 1000 - lastCommitEpoch) / 86_400;
  return { branch, ahead, ageDays: Math.round(ageDays * 10) / 10 };
}

git(["fetch", REMOTE, "--prune"]);
const branches = listRemoteBranches();
const info = branches.map(branchInfo);

const integrada = info.filter((b) => b.ahead === 0);
const conTrabajo = info.filter((b) => b.ahead > 0);
const abandonadas = info.filter((b) => b.ageDays > ABANDONED_DAYS);

console.log(`Ramas remotas vivas (excluyendo ${DEFAULT_BRANCH}): ${info.length}`);
console.log(`  integrada (ahead=0, candidata a borrar):        ${integrada.length}`);
console.log(`  con trabajo propio (ahead>0, revisar contenido): ${conTrabajo.length}`);
console.log(`  abandonadas (>${ABANDONED_DAYS} días sin tocar):            ${abandonadas.length}`);

const problems = [];
if (info.length > MAX_LIVE_BRANCHES) {
  problems.push(
    `${info.length} ramas vivas supera el máximo declarado (${MAX_LIVE_BRANCHES}). ` +
      `Cada rama con dueño la cierra — fusionada o borrada — antes de abrir la siguiente.`,
  );
}
if (abandonadas.length > 0) {
  problems.push(
    `${abandonadas.length} rama(s) sin un commit en más de ${ABANDONED_DAYS} días:`,
  );
  for (const b of abandonadas.sort((a, z) => z.ageDays - a.ageDays)) {
    problems.push(`  - ${b.branch}: ${b.ageDays}d sin tocar, ${b.ahead} commit(s) por delante de ${DEFAULT_BRANCH}`);
  }
}

if (problems.length > 0) {
  console.error("");
  console.error("branch-audit: AVISO");
  for (const p of problems) console.error(p);
  console.error("");
  console.error(
    "Esto no bloquea el CI de ningún commit -- es la señal del monitor semanal. " +
      "Revisar docs/execution/ por una campaña de cierre de ramas si el número sigue creciendo.",
  );
  process.exitCode = 1;
} else {
  console.log("branch-audit OK: dentro de los umbrales declarados.");
}
