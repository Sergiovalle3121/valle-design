#!/usr/bin/env node
/**
 * Genera `docs/cad/evidence/dxf-external-corpus-matrix.json`.
 *
 * La matriz NO se escribe a mano: se mide ejecutando el lector y el escritor
 * DXF reales sobre el corpus de dialectos ajenos. Este script es sólo la
 * cañería —arrancar `tsx`, recoger el JSON por stdout y volcarlo—, porque la
 * medición vive en `apps/web/src/lib/cad/dxf-external-corpus-matrix.ts`, donde
 * una spec la puede volver a calcular y comparar contra este archivo. Si el
 * comportamiento del lector cambia y nadie regenera, esa spec falla: es lo que
 * impide que la matriz envejezca en silencio.
 *
 * Uso:
 *   node scripts/cad/build-dxf-external-corpus.mjs          escribe el artefacto
 *   node scripts/cad/build-dxf-external-corpus.mjs --check  falla si está desfasado
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const probe = path.join(here, "dxf-external-corpus-probe.mts");
const target = path.join(root, "docs/cad/evidence/dxf-external-corpus-matrix.json");

const require = createRequire(import.meta.url);
let tsx;
try {
  tsx = require.resolve("tsx/cli", { paths: [root] });
} catch {
  console.error(
    "No se encontró `tsx`. Corre `npm ci` en la raíz: la matriz se MIDE ejecutando el lector real, " +
      "así que sin dependencias no se puede generar (y no se inventa una).",
  );
  process.exit(1);
}

// La sonda importa el código FUENTE de apps/web, cuyo tsconfig mapea
// @valle-design/contracts a packages/contracts/src. Sin ese mapa, tsx cae al
// export map del paquete (dist/index.js) y el gate se pone rojo en cualquier
// árbol donde contracts no esté compilado — CI corre check:cad ANTES del
// build. Con el tsconfig de la web la resolución es una sola y determinista:
// siempre el fuente.
const stdout = execFileSync(process.execPath, [tsx, probe], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  env: { ...process.env, TSX_TSCONFIG_PATH: path.join(root, "apps/web/tsconfig.json") },
});
// Dos espacios y salto final: el formato que deja `prettier` y el que hace que
// un diff del artefacto se lea línea a línea en la revisión.
const generated = `${JSON.stringify(JSON.parse(stdout), null, 2)}\n`;

if (process.argv.includes("--check")) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  if (current.replaceAll("\r\n", "\n") === generated) {
    console.log("dxf-external-corpus-matrix.json al día.");
    process.exit(0);
  }
  console.error(
    "La matriz del corpus DXF está desfasada respecto del comportamiento real.\n" +
      "Regenera con: node scripts/cad/build-dxf-external-corpus.mjs",
  );
  process.exit(1);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, generated, "utf8");
const matrix = JSON.parse(generated);
console.log(
  `dxf-external-corpus-matrix.json: ${matrix.resumen.archivos} archivos, ` +
    `${matrix.resumen.tiposEvaluados} tipos evaluados — ` +
    `${matrix.resumen.intactos} intactos, ${matrix.resumen.degradados} degradados, ` +
    `${matrix.resumen.perdidosDeclarados} perdidos declarados, ` +
    `${matrix.resumen.perdidosEnSilencio} perdidos EN SILENCIO.`,
);
