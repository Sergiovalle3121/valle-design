#!/usr/bin/env node
/**
 * EVIDENCIA DEL MODO ESENCIAL — «esconde, no borra».
 *
 * Tanda 1 del encargo del 22-sep-2026: en Esencial la cinta no se monta y una
 * barra de doce herramientas es lo único a la vista; TODO lo demás sigue a un
 * paso (Ctrl+K, línea de comandos, «Más herramientas»). Este archivo deja
 * escrito, y `check:cad` comprueba byte a byte, que:
 *
 *   · la barra tiene exactamente 12 herramientas, con sus comandos canónicos;
 *   · cada comando de la barra existe en el registro del motor y tiene botón
 *     en la cinta de Pro (nada inventado, nada duplicado);
 *   · el registro completo sigue alcanzable por Ctrl+K: `searchCadPalette`
 *     encuentra cada comando por su nombre canónico, con la cinta o sin ella;
 *   · el alcance con ratón en PRO no cambia: `alcanzablesEnCinta` se LEE de
 *     `docs/cad/evidence/ui-command-reach.json` (la evidencia de la cinta), no
 *     se recalcula aquí, para que este gate no pueda maquillar aquél.
 *
 * Uso:  node scripts/cad/essential-mode-evidence.mjs --write   (regenera)
 *       node scripts/cad/essential-mode-evidence.mjs --check   (CI: byte a byte)
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const web = path.join(root, "apps/web");
const outPath = path.join(root, "docs/cad/evidence/essential-mode.json");
const reachPath = path.join(root, "docs/cad/evidence/ui-command-reach.json");

function runProbe() {
  const require = createRequire(import.meta.url);
  const tsx = require.resolve("tsx/cli");
  const probePath = path.join(web, ".essential-mode-probe.mts");
  writeFileSync(
    probePath,
    `
import { CAD_ESSENTIAL_TOOLS } from "./src/components/cad/essential/essential-tools";
import { cadRibbonExposedNames, CAD_RIBBON_UNEXPOSED } from "./src/lib/cad/ribbon";
import { CAD_COMMAND_DESCRIPTORS } from "./src/lib/cad/engine";
import { searchCadPalette } from "./src/lib/cad/command-palette";
const expuestos = cadRibbonExposedNames();
const registro = CAD_COMMAND_DESCRIPTORS.map((d) => d.name);
const barra = CAD_ESSENTIAL_TOOLS.map((t) => ({ id: t.id, rotulo: t.label, comando: "command" in t.run ? t.run.command : null }));
const comandosBarra = barra.map((t) => t.comando).filter((n): n is string => n !== null);
const fueraDelRegistro = comandosBarra.filter((n) => !registro.includes(n));
const sinBotonEnPro = comandosBarra.filter((n) => !expuestos.has(n));
const noDisponibles = comandosBarra.filter((n) => n in CAD_RIBBON_UNEXPOSED);
const noEncontradosPorCtrlK = registro.filter((n) => searchCadPalette(n)[0]?.id !== n);
process.stdout.write(JSON.stringify({
  barra,
  registroTotal: registro.length,
  alcanzablesPorCtrlK: registro.length - noEncontradosPorCtrlK.length,
  noEncontradosPorCtrlK,
  fueraDelRegistro,
  sinBotonEnPro,
  noDisponibles,
}));
`,
    "utf8",
  );
  try {
    const stdout = execFileSync(process.execPath, [tsx, probePath], {
      cwd: web,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      maxBuffer: 16 * 1024 * 1024,
      timeout: 180_000,
    });
    return JSON.parse(stdout);
  } finally {
    rmSync(probePath, { force: true });
  }
}

const sonda = runProbe();
const fallos = [];
if (sonda.barra.length !== 12) fallos.push(`la barra esencial tiene ${sonda.barra.length} herramientas y deben ser 12`);
if (sonda.fueraDelRegistro.length) fallos.push(`comandos de la barra fuera del registro: ${sonda.fueraDelRegistro.join(", ")}`);
if (sonda.sinBotonEnPro.length) fallos.push(`comandos de la barra sin botón en la cinta de Pro: ${sonda.sinBotonEnPro.join(", ")}`);
if (sonda.noDisponibles.length) fallos.push(`comandos de la barra declarados «aún no disponibles»: ${sonda.noDisponibles.join(", ")}`);
if (sonda.noEncontradosPorCtrlK.length) {
  fallos.push(
    `${sonda.noEncontradosPorCtrlK.length} comando(s) del registro no aparecen primero al buscarlos por nombre en Ctrl+K: ` +
      sonda.noEncontradosPorCtrlK.slice(0, 12).join(", "),
  );
}
if (fallos.length) {
  for (const f of fallos) console.error(`essential-mode: ${f}`);
  process.exit(1);
}

const reach = JSON.parse(readFileSync(reachPath, "utf8"));
const doc = {
  $schema: "urn:valle-design:schema:essential-mode:v1",
  schemaVersion: 1,
  generatedBy: "scripts/cad/essential-mode-evidence.mjs --write",
  barraEsencial: sonda.barra,
  registroTotal: sonda.registroTotal,
  alcanzablesPorCtrlK: sonda.alcanzablesPorCtrlK,
  alcanzablesEnCintaPro: reach.despues.alcanzablesConRaton,
  fuenteCintaPro: "docs/cad/evidence/ui-command-reach.json (leído, no recalculado)",
  regla:
    "Esencial esconde, no borra: la cinta de Pro conserva su alcance íntegro y cada comando del registro " +
    "aparece primero al buscarlo por su nombre en Ctrl+K, con la cinta montada o sin ella.",
};
const json = JSON.stringify(doc, null, 2) + "\n";

if (process.argv.includes("--write")) {
  writeFileSync(outPath, json, "utf8");
  console.log(
    `essential-mode: escrito ${path.relative(root, outPath)} — barra 12, registro ${doc.registroTotal}, ` +
      `Ctrl+K ${doc.alcanzablesPorCtrlK}, cinta Pro ${doc.alcanzablesEnCintaPro}`,
  );
} else {
  if (!existsSync(outPath)) {
    console.error(`essential-mode: falta ${path.relative(root, outPath)}; corre con --write y confirma el archivo.`);
    process.exit(1);
  }
  const actual = readFileSync(outPath, "utf8");
  if (actual !== json) {
    console.error(
      `essential-mode: ${path.relative(root, outPath)} no coincide con el código (barra, registro o alcance cambiaron). ` +
        "Corre `node scripts/cad/essential-mode-evidence.mjs --write` y revisa el diff en el PR.",
    );
    process.exit(1);
  }
  console.log(
    `essential-mode OK: barra 12 · registro ${doc.registroTotal} · Ctrl+K ${doc.alcanzablesPorCtrlK} · cinta Pro ${doc.alcanzablesEnCintaPro} (sin cambios)`,
  );
}
