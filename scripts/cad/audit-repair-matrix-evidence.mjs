#!/usr/bin/env node
/**
 * Publica `docs/cad/evidence/audit-repair-matrix.json`.
 *
 * Por cada defecto del corpus de geometría degenerada y de referencias
 * colgantes: ¿AUDIT lo detecta, lo repara, y qué declara? El archivo lo
 * escribe `audit-repair-matrix-probe.mts`, que corre los detectores y
 * reparadores REALES contra una entidad de cada defecto — no es una tabla
 * escrita a mano, es la medición.
 *
 *   node scripts/cad/audit-repair-matrix-evidence.mjs           # publica
 *   node scripts/cad/audit-repair-matrix-evidence.mjs --check   # sólo comprueba
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const web = path.join(root, "apps/web");
const probe = path.join(web, "scripts/audit-repair-matrix-probe.mts");
const output = path.join(root, "docs/cad/evidence/audit-repair-matrix.json");
const check = process.argv.includes("--check");

function runProbe() {
  const require = createRequire(import.meta.url);
  const tsx = require.resolve("tsx/cli");
  const stdout = execFileSync(process.execPath, [tsx, probe], {
    cwd: web,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 32 * 1024 * 1024,
    timeout: 300_000,
  });
  return JSON.parse(stdout);
}

const evidence = runProbe();
const undetected = evidence.filas.filter((row) => !row.detectado);
if (undetected.length > 0) {
  process.stderr.write(
    `\n❌ AUDIT no detecta un defecto que su propia matriz dice cubrir:\n` +
      undetected.map((row) => `   · ${row.kind}\n`).join(""),
  );
  process.exit(1);
}

const serialized = `${JSON.stringify(evidence, null, 2)}\n`;

if (check) {
  const current = fs.existsSync(output) ? fs.readFileSync(output, "utf8").replaceAll("\r\n", "\n") : "";
  if (current !== serialized) {
    process.stderr.write(
      `\n❌ ${path.relative(root, output)} ya no dice lo que dice el código.\n` +
        `   Regenéralo con:  node scripts/cad/audit-repair-matrix-evidence.mjs\n`,
    );
    process.exit(1);
  }
  process.stderr.write(
    `✅ ${path.relative(root, output)} coincide con AUDIT ` +
      `(${evidence.resumen.detectados}/${evidence.resumen.total} detectados, ` +
      `${evidence.resumen.reparados}/${evidence.resumen.total} reparados).\n`,
  );
  process.exit(0);
}

fs.writeFileSync(output, serialized);
process.stdout.write(`Artefacto escrito: ${path.relative(root, output)}\n`);
