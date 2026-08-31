#!/usr/bin/env node
/**
 * Genera `docs/cad/evidence/sketchup-migration-matrix.json`.
 *
 * La matriz NO se escribe a mano: se mide ejecutando `stitchMeshToBody` y los
 * cuatro lectores de malla REALES sobre un corpus sintético de Valle (ver la
 * declaración de límite dentro del propio artefacto). Este script es sólo la
 * cañería; la medición vive en
 * `apps/web/src/lib/cad/interop/sketchup-migration-matrix.ts`.
 *
 * Uso:
 *   node scripts/cad/build-sketchup-migration-matrix.mjs          escribe el artefacto
 *   node scripts/cad/build-sketchup-migration-matrix.mjs --check  falla si está desfasado
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const probe = path.join(here, "sketchup-migration-matrix-probe.mts");
const target = path.join(root, "docs/cad/evidence/sketchup-migration-matrix.json");

const require = createRequire(import.meta.url);
let tsx;
try {
  tsx = require.resolve("tsx/cli", { paths: [root] });
} catch {
  console.error(
    "No se encontró `tsx`. Corre `npm ci` en la raíz: la matriz se MIDE ejecutando el cosedor real, " +
      "así que sin dependencias no se puede generar (y no se inventa una).",
  );
  process.exit(1);
}

const stdout = execFileSync(process.execPath, [tsx, probe], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  env: { ...process.env, TSX_TSCONFIG_PATH: path.join(root, "apps/web/tsconfig.json") },
});
const generated = `${JSON.stringify(JSON.parse(stdout), null, 2)}\n`;

if (process.argv.includes("--check")) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  if (current.replaceAll("\r\n", "\n") === generated) {
    console.log("sketchup-migration-matrix.json al día.");
    process.exit(0);
  }
  console.error(
    "La matriz de migración SketchUp está desfasada respecto del comportamiento real.\n" +
      "Regenera con: node scripts/cad/build-sketchup-migration-matrix.mjs",
  );
  process.exit(1);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, generated, "utf8");
const matrix = JSON.parse(generated);
console.log(
  `sketchup-migration-matrix.json: ${matrix.resumen.casos} casos — ` +
    `${matrix.resumen.carasCoincidieron} con caras correctas, ` +
    `${matrix.resumen.volumenesCoincidieron} con volumen correcto, ` +
    `${matrix.resumen.componentesPreservados} con componentes preservados, ` +
    `${matrix.resumen.cuerposCerrados} cerrados. CORPUS SINTÉTICO (ver "limitacion" en el artefacto).`,
);
