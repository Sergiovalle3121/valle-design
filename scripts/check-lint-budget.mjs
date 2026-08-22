#!/usr/bin/env node
/**
 * Trinquete de AVISOS de lint: la curva sólo baja.
 *
 * El lint del repositorio está verde en ERRORES pero arrastraba ~560 avisos, y
 * el ruido esconde defectos reales. Este gate congela el máximo por regla y
 * workspace en `lint-budget.json`: pasar de ese máximo FALLA. Bajar es
 * progreso, y cuando una regla llega a cero se exige actualizar el presupuesto
 * (a cero) para que no pueda volver a subir — el mismo principio que el
 * presupuesto del monolito.
 *
 * Actualizar el presupuesto a la baja: `node scripts/check-lint-budget.mjs
 * --update` con el árbol en el estado nuevo. El diff del JSON queda en el PR,
 * que es donde se revisa.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const budgetPath = path.join(here, "lint-budget.json");
const update = process.argv.includes("--update");

function countWorkspace(workspace) {
  const cwd = path.join(root, workspace);
  let raw;
  try {
    raw = execFileSync(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["eslint", "src", "--format", "json"],
      { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, shell: process.platform === "win32" },
    );
  } catch (error) {
    // eslint sale con 1 cuando hay ERRORES; los errores los bloquea el lint
    // normal, aquí sólo se cuentan avisos — pero el JSON sigue en stdout.
    raw = error.stdout ?? "";
    if (!raw) throw error;
  }
  const results = JSON.parse(raw);
  const counts = {};
  for (const file of results)
    for (const message of file.messages) {
      if (message.severity !== 1) continue;
      const rule = message.ruleId ?? "(sin regla)";
      counts[rule] = (counts[rule] ?? 0) + 1;
    }
  return counts;
}

const workspaces = ["apps/web", "apps/api"];
const actual = {};
for (const workspace of workspaces) actual[workspace] = countWorkspace(workspace);

if (update) {
  writeFileSync(budgetPath, `${JSON.stringify(actual, null, 2)}\n`);
  console.log(`Presupuesto de lint actualizado en ${path.relative(root, budgetPath)}.`);
  process.exit(0);
}

const budget = JSON.parse(readFileSync(budgetPath, "utf8"));
const failures = [];
let total = 0;
let allowed = 0;

for (const workspace of workspaces) {
  const rules = new Set([
    ...Object.keys(budget[workspace] ?? {}),
    ...Object.keys(actual[workspace] ?? {}),
  ]);
  for (const rule of rules) {
    const have = actual[workspace]?.[rule] ?? 0;
    const max = budget[workspace]?.[rule] ?? 0;
    total += have;
    allowed += max;
    if (have > max) {
      failures.push(
        `${workspace}: ${rule} tiene ${have} aviso(s) y el presupuesto es ${max}. ` +
          `Arregle los nuevos o justifique subir el presupuesto en el PR.`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("Trinquete de lint: FALLÓ (la curva sólo baja)");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Trinquete de lint OK: ${total} aviso(s) dentro del presupuesto (${allowed}). ` +
    `Si bajó de forma estable, corra --update y committee el nuevo techo.`,
);
