#!/usr/bin/env node
/**
 * Gate de INTEGRIDAD del registro de comandos.
 *
 * Corre la sonda (`apps/web/scripts/command-integrity-probe.mts`) sobre los
 * ~192 comandos del registro real y falla si alguno queda en ROJO: terminó
 * afirmando o insinuando éxito sin ningún efecto verificable en el documento,
 * las variables, la selección o una petición a un anfitrión — o terminó en
 * silencio absoluto ante una entrada sustantiva. Un «Hecho» vacío rompe la
 * confianza en todo lo demás; este gate existe para que no vuelva a entrar.
 *
 * Los `no-concluyentes` — comandos que el auto-respondedor no sabe llevar a
 * término — se toleran SOLO si están declarados con razón en
 * `command-integrity-exemptions.json`. Un comando nuevo que la sonda no sepa
 * terminar obliga a declararlo, con lo que la lista de exentos es visible y
 * revisable en cada PR en vez de crecer en silencio.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const web = path.join(root, "apps/web");
const probe = path.join(web, "scripts/command-integrity-probe.mts");
const exemptionsPath = path.join(here, "command-integrity-exemptions.json");

function runProbe() {
  const require = createRequire(import.meta.url);
  const tsx = require.resolve("tsx/cli");
  const stdout = execFileSync(process.execPath, [tsx, probe], {
    cwd: web,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 64 * 1024 * 1024,
    timeout: 600_000,
    env: { ...process.env },
  });
  return JSON.parse(stdout);
}

const exemptions = JSON.parse(readFileSync(exemptionsPath, "utf8"));
const declared = new Set(Object.keys(exemptions.noConcluyentes ?? {}));

const report = runProbe();
const failures = [];

const rojos = report.outcomes.filter((outcome) => outcome.verdict === "ROJO");
for (const outcome of rojos) {
  failures.push(
    `${outcome.command}: ROJO — ${outcome.note ?? "sin nota"} · últimos mensajes: ${outcome.lastMessages.join(" § ") || "(ninguno)"}`,
  );
}

const inconclusive = report.outcomes.filter(
  (outcome) => outcome.verdict === "no-concluyente",
);
for (const outcome of inconclusive) {
  if (!declared.has(outcome.command)) {
    failures.push(
      `${outcome.command}: no-concluyente sin declarar en command-integrity-exemptions.json — ` +
        `o se enseña a la sonda a completarlo, o se declara con razón escrita`,
    );
  }
}

// Una exención que ya no hace falta es deuda saldada: se exige retirarla para
// que la lista refleje la verdad de hoy, no la de cuando se escribió.
const inconclusiveNames = new Set(inconclusive.map((outcome) => outcome.command));
for (const name of declared) {
  if (!inconclusiveNames.has(name)) {
    failures.push(
      `${name}: está exento pero la sonda ya lo lleva a término — retire la exención`,
    );
  }
}

if (failures.length > 0) {
  console.error("Gate de integridad de comandos: FALLÓ");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

// Con --write, además deja el ARTEFACTO de evidencia que consume la rúbrica
// (fila de integridad). Sin el flag no escribe nada: el gate de CI compara
// contra el árbol quieto y no debe ensuciarlo.
if (process.argv.includes("--write")) {
  const artifact = path.join(root, "docs/cad/evidence/command-integrity.json");
  const payload = {
    generatedBy: "scripts/cad/check-command-integrity.mjs --write",
    total: report.total,
    verdicts: report.verdicts,
    exemptions: Object.keys(exemptions.noConcluyentes ?? {}).sort(),
  };
  const { writeFileSync } = await import("node:fs");
  writeFileSync(artifact, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Artefacto escrito: ${path.relative(root, artifact)}`);
}

const verdicts = report.verdicts;
console.log(
  `Integridad de comandos OK: ${report.total} comandos · ` +
    `${verdicts.muta} mutan verificado · ${verdicts.delegado} delegan · ` +
    `${verdicts.informa} informan · ${verdicts["honesto-limitado"]} declaran su límite · ` +
    `${verdicts["no-concluyente"]} exentos declarados · 0 éxitos falsos.`,
);
