#!/usr/bin/env node
/**
 * Genera `docs/cad/evidence/pdf-import-corpus-matrix.json`.
 *
 * La matriz NO se escribe a mano: se mide ejecutando el importador de PDF real
 * sobre el corpus sintético. Este script es sólo la cañería —arrancar `tsx`,
 * recoger el JSON por stdout y volcarlo—, porque la medición vive en
 * `apps/web/src/lib/cad/pdf/pdf-corpus-matrix.ts`, donde una spec la puede
 * volver a calcular y comparar contra este archivo. Si el importador cambia y
 * nadie regenera, esa spec falla: es lo que impide que la matriz envejezca en
 * silencio, que es como envejecen todas las tablas de compatibilidad.
 *
 * Uso:
 *   node scripts/cad/build-pdf-import-corpus.mjs          escribe el artefacto
 *   node scripts/cad/build-pdf-import-corpus.mjs --check  falla si está desfasado
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const probe = path.join(here, "pdf-import-corpus-probe.mts");
const target = path.join(root, "docs/cad/evidence/pdf-import-corpus-matrix.json");

const require = createRequire(import.meta.url);
let tsx;
try {
  tsx = require.resolve("tsx/cli", { paths: [root] });
} catch {
  console.error(
    "No se encontró `tsx`. Corre `npm ci` en la raíz: la matriz se MIDE ejecutando el importador real, " +
      "así que sin dependencias no se puede generar (y no se inventa una).",
  );
  process.exit(1);
}

const stdout = execFileSync(process.execPath, [tsx, probe], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
// Dos espacios y salto final: el formato que deja `prettier` y el que hace que
// un diff del artefacto se lea línea a línea en la revisión.
const generated = `${JSON.stringify(JSON.parse(stdout), null, 2)}\n`;

/**
 * El bloque de rendimiento se IGNORA al comparar.
 *
 * Es el único que cambia entre dos ejecuciones sin que haya cambiado el
 * comportamiento: son milisegundos medidos en una máquina compartida. Un
 * `--check` que fallara porque una importación tardó 2,1 ms en vez de 2,0 se
 * convertiría en ruido, y un comprobador que da falsos positivos deja de leerse
 * — que es exactamente cómo se cuela una regresión de verdad.
 *
 * Lo que SÍ se compara es todo lo demás: veredictos, recuentos, avisos, error
 * de las curvas y la declaración de que el corpus es sintético.
 */
function comparable(text) {
  const value = JSON.parse(text);
  delete value.rendimiento;
  return `${JSON.stringify(value, null, 2)}\n`;
}

if (process.argv.includes("--check")) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  if (!current) {
    console.error(`Falta ${path.relative(root, target)}. Genérala con: node scripts/cad/build-pdf-import-corpus.mjs`);
    process.exit(1);
  }
  if (comparable(current.replaceAll("\r\n", "\n")) === comparable(generated)) {
    console.log("pdf-import-corpus-matrix.json al día (el rendimiento no se compara).");
    process.exit(0);
  }
  console.error(
    "La matriz del corpus de PDF está desfasada respecto del comportamiento real.\n" +
      "Regenera con: node scripts/cad/build-pdf-import-corpus.mjs",
  );
  process.exit(1);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, generated, "utf8");
const matrix = JSON.parse(generated);
console.log(
  `pdf-import-corpus-matrix.json: ${matrix.resumen.archivos} archivos, ` +
    `${matrix.resumen.tiposEvaluados} tipos evaluados — ` +
    `${matrix.resumen.intactos} intactos, ${matrix.resumen.degradados} degradados, ` +
    `${matrix.resumen.perdidosDeclarados} perdidos declarados, ` +
    `${matrix.resumen.perdidosEnSilencio} perdidos EN SILENCIO.`,
);
