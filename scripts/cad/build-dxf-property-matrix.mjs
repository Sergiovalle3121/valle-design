#!/usr/bin/env node
/**
 * Genera `docs/cad/evidence/dxf-property-loss-matrix.json`.
 *
 * El artefacto NO se escribe a mano: sale de MEDIR el corpus de propiedades con
 * el lector, el escritor y el estilo de trazo reales. Este script es sólo la
 * cañería —arrancar `tsx`, recoger el JSON y volcarlo—, porque la medición vive
 * en `apps/web/src/lib/cad/dxf-property-matrix.ts`, donde una spec la recalcula
 * y la compara contra este archivo. Si el comportamiento cambia y nadie
 * regenera, esa spec falla: es lo que impide que la tabla envejezca hacia el
 * optimismo, que es la única dirección en la que envejecen solas.
 *
 * Uso:
 *   node scripts/cad/build-dxf-property-matrix.mjs          escribe el artefacto
 *   node scripts/cad/build-dxf-property-matrix.mjs --check  falla si está desfasado
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const probe = path.join(here, "dxf-property-matrix-probe.mts");
const target = path.join(root, "docs/cad/evidence/dxf-property-loss-matrix.json");

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
const generated = `${JSON.stringify(JSON.parse(stdout), null, 2)}\n`;

if (process.argv.includes("--check")) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  if (current.replaceAll("\r\n", "\n") === generated) {
    console.log("dxf-property-loss-matrix.json al día.");
    process.exit(0);
  }
  console.error(
    "La matriz de propiedades DXF está desfasada respecto del comportamiento real.\n" +
      "Regenera con: node scripts/cad/build-dxf-property-matrix.mjs",
  );
  process.exit(1);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, generated, "utf8");
const matrix = JSON.parse(generated);
console.log(
  `dxf-property-loss-matrix.json: ${matrix.resumen.archivos} archivos, ` +
    `${matrix.resumen.sondas} sondas — ${matrix.resumen.intactas} intactas, ` +
    `${matrix.resumen.soloEntrada} sólo a la entrada, ` +
    `${matrix.resumen.perdidasDeclaradas} perdidas declaradas, ` +
    `${matrix.resumen.perdidasEnSilencio} perdidas EN SILENCIO.`,
);
