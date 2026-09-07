#!/usr/bin/env node
/**
 * Trinquete de AVISOS de lint: la curva sólo baja — y desde T-72(f), POR
 * ARCHIVO, no sólo por regla y workspace.
 *
 * El lint del repositorio está verde en ERRORES pero arrastraba ~560 avisos, y
 * el ruido esconde defectos reales. Congelar sólo por {workspace, regla} tenía
 * un hueco medido: el 87 % de los avisos de `apps/web` vive concentrado en
 * `Layout3DEditor.tsx` (17 300 líneas, T-72a), y ese presupuesto agregado deja
 * que la concentración MIGRE sin que el trinquete se entere — limpiar diez
 * avisos en un archivo pequeño y sumar diez nuevos al monolito cierra en el
 * mismo total, «Trinquete de lint OK», y el archivo que de verdad importa no
 * mejoró un byte.
 *
 * Por eso el presupuesto es ahora `{workspace: {regla: {archivo: máximo}}}`:
 * cada ARCHIVO tiene su propio techo por regla, y ninguno puede subir aunque
 * el total del workspace baje. Bajar sigue siendo progreso; cuando un archivo
 * llega a cero en una regla se exige `--update` para que el cero quede escrito
 * y no pueda volver a subir — el mismo principio que el presupuesto del
 * monolito, aplicado archivo a archivo.
 *
 * Actualizar el presupuesto a la baja: `node scripts/check-lint-budget.mjs
 * --update` con el árbol en el estado nuevo. El diff del JSON queda en el PR,
 * que es donde se revisa — y con el presupuesto por archivo, ese diff dice
 * EXACTAMENTE qué archivo mejoró, cosa que la cifra agregada nunca decía.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const budgetPath = path.join(here, "lint-budget.json");
const update = process.argv.includes("--update");

/** Ruta relativa al workspace, con `/` siempre — determinista entre SO. */
function relFile(cwd, filePath) {
  return path.relative(cwd, filePath).split(path.sep).join("/");
}

/** `{regla: {archivo: cuántos avisos}}` para un workspace. */
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
  for (const file of results) {
    const relative = relFile(cwd, file.filePath);
    for (const message of file.messages) {
      if (message.severity !== 1) continue;
      const rule = message.ruleId ?? "(sin regla)";
      counts[rule] ??= {};
      counts[rule][relative] = (counts[rule][relative] ?? 0) + 1;
    }
  }
  return counts;
}

const workspaces = ["apps/web", "apps/api"];
const actual = {};
for (const workspace of workspaces) actual[workspace] = countWorkspace(workspace);

if (update) {
  writeFileSync(budgetPath, `${JSON.stringify(actual, null, 2)}\n`);
  console.log(`Presupuesto de lint (por archivo) actualizado en ${path.relative(root, budgetPath)}.`);
  process.exit(0);
}

const budget = JSON.parse(readFileSync(budgetPath, "utf8"));
const failures = [];
let total = 0;
let allowed = 0;
let filesTracked = 0;

for (const workspace of workspaces) {
  const rules = new Set([
    ...Object.keys(budget[workspace] ?? {}),
    ...Object.keys(actual[workspace] ?? {}),
  ]);
  for (const rule of rules) {
    const actualByFile = actual[workspace]?.[rule] ?? {};
    const budgetByFile = budget[workspace]?.[rule] ?? {};
    const files = new Set([...Object.keys(actualByFile), ...Object.keys(budgetByFile)]);
    for (const file of files) {
      filesTracked += 1;
      const have = actualByFile[file] ?? 0;
      const max = budgetByFile[file] ?? 0;
      total += have;
      allowed += max;
      if (have > max) {
        failures.push(
          `${workspace}/${file}: ${rule} tiene ${have} aviso(s) y el presupuesto de ESE ARCHIVO es ${max}. ` +
            `Arregle los nuevos, o mueva el aviso a un archivo con margen no es una opción: el ` +
            `presupuesto es por archivo justo para que eso no cuele. Si el archivo de verdad bajó, ` +
            `corra --update.`,
        );
      }
    }
  }
}

if (failures.length > 0) {
  console.error("Trinquete de lint: FALLÓ (la curva sólo baja, archivo por archivo)");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Trinquete de lint OK: ${total} aviso(s) dentro del presupuesto (${allowed}) en ${filesTracked} ` +
    `combinaciones archivo×regla vigiladas. Si algún archivo bajó de forma estable, corra --update ` +
    `y committee el nuevo techo.`,
);
