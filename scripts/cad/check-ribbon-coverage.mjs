#!/usr/bin/env node
/**
 * Gate de COBERTURA registro ↔ cinta.
 *
 * La cinta (`apps/web/src/lib/cad/ribbon.ts`) se genera de
 * `CAD_COMMAND_DESCRIPTORS`, el mismo registro que la paleta Ctrl+K y la
 * línea de comandos. Este gate vuelve a comprobar la totalidad —todo comando
 * cae en alguna pestaña o está declarado "no expuesto" con razón en
 * `CAD_RIBBON_UNEXPOSED`— como invariante de CI, no sólo como spec de Node:
 * si un cambio futuro rompe la función total (`ribbonTabForCommand`) o
 * alguien añade una excepción sin motivo, éste es el sitio donde se ve antes
 * de fusionar.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const web = path.join(root, "apps/web");

const probeSource = `
import { cadRibbonCoverageGaps, cadRibbonExposedNames, CAD_RIBBON_UNEXPOSED } from "./src/lib/cad/ribbon";
import { CAD_COMMAND_DESCRIPTORS } from "./src/lib/cad/engine";
const gaps = cadRibbonCoverageGaps();
// Nombres únicos: los espejos de Inicio son botones repetidos, no comandos nuevos.
const total = cadRibbonExposedNames().size;
process.stdout.write(JSON.stringify({
  gaps,
  exposedCount: total,
  unexposedCount: Object.keys(CAD_RIBBON_UNEXPOSED).length,
  registryCount: CAD_COMMAND_DESCRIPTORS.length,
}));
`;

function runProbe() {
  const require = createRequire(import.meta.url);
  const tsx = require.resolve("tsx/cli");
  const probePath = path.join(web, ".ribbon-coverage-probe.mts");
  const { writeFileSync, rmSync } = require("node:fs");
  writeFileSync(probePath, probeSource, "utf8");
  try {
    const stdout = execFileSync(process.execPath, [tsx, probePath], {
      cwd: web,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      maxBuffer: 16 * 1024 * 1024,
      timeout: 120_000,
    });
    return JSON.parse(stdout);
  } finally {
    rmSync(probePath, { force: true });
  }
}

const result = runProbe();

if (result.gaps.length > 0) {
  console.error(
    `check:ribbon-coverage — ${result.gaps.length} comando(s) del registro sin pestaña ni exención: ${result.gaps.join(", ")}`,
  );
  console.error(
    "Añade el comando a un patrón de `ribbon.ts` (CAD_TAB_NAME_PATTERNS / CAD_KIND_TAB) " +
      "o decláralo en CAD_RIBBON_UNEXPOSED con la razón.",
  );
  process.exit(1);
}

if (result.exposedCount + result.unexposedCount !== result.registryCount) {
  console.error(
    `check:ribbon-coverage — el conteo no cuadra: ${result.exposedCount} expuestos + ` +
      `${result.unexposedCount} no-expuestos ≠ ${result.registryCount} en el registro.`,
  );
  process.exit(1);
}

console.log(
  `check:ribbon-coverage OK — ${result.exposedCount} comandos en la cinta, ` +
    `${result.unexposedCount} declarados no-expuestos, ${result.registryCount} en el registro.`,
);
