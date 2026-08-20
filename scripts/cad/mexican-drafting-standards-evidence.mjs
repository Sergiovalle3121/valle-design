#!/usr/bin/env node
/**
 * Publica `docs/cad/evidence/mexican-drafting-standards.json`.
 *
 * ## Por qué el artefacto lo escribe un guion y no una persona
 *
 * Porque una tabla de convenciones escrita a mano envejece el día siguiente, y
 * envejece EN SILENCIO: nadie vuelve a leerla. Este guion deriva el archivo de
 * los mismos módulos que usa el producto, así que si mañana una capa cambia de
 * grosor, una escala pierde su cita o alguien convierte una costumbre en una
 * norma inventada, el archivo cambia con ella. La spec compara el archivo con lo
 * que dice el código y falla si se separan.
 *
 * ## Por qué NO lleva fecha de generación
 *
 * Para que se pueda comprobar por igualdad exacta. Un `generatedAt` cambiaría el
 * archivo en cada corrida y el gate tendría que comparar «parecido», que es como
 * no comparar. Lo que fecha este artefacto es el commit que lo trae.
 *
 * ## Modo comprobación
 *
 *   node scripts/cad/mexican-drafting-standards-evidence.mjs           # publica
 *   node scripts/cad/mexican-drafting-standards-evidence.mjs --check   # sólo comprueba
 *
 * `--check` no escribe: dice si el archivo publicado sigue diciendo la verdad y
 * sale con código 1 si no. Es lo que hace que el artefacto sea un gate y no una
 * decoración de la carpeta de documentación.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const web = path.join(root, "apps/web");
const probe = path.join(here, "mexican-drafting-standards-probe.mts");
const output = path.join(root, "docs/cad/evidence/mexican-drafting-standards.json");
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
    env: { ...process.env, TMP: process.env.TMP, TEMP: process.env.TEMP },
  });
  return JSON.parse(stdout);
}

const evidence = runProbe();

// El artefacto no puede publicarse si el propio código dice que hay una
// convención sin fuente. Publicarlo con problemas dentro sería publicar el
// problema con formato bonito.
if (evidence.integridad.problemas.length > 0) {
  process.stderr.write(
    `\n❌ Hay convenciones sin fuente declarada:\n` +
      evidence.integridad.problemas.map((problem) => `   · ${problem}\n`).join(""),
  );
  process.exit(1);
}

const serialized = `${JSON.stringify(evidence, null, 2)}\n`;

if (check) {
  // Se comparan los saltos de línea NORMALIZADOS. Con `core.autocrlf=true` —que
  // es lo normal en Windows— git entrega el archivo con CRLF y una comparación
  // byte a byte fallaría por algo que no tiene nada que ver con las normas de
  // dibujo. Un gate que falla por el final de línea es un gate que se acaba
  // desactivando.
  const current = fs.existsSync(output)
    ? fs.readFileSync(output, "utf8").replaceAll("\r\n", "\n")
    : "";
  if (current !== serialized) {
    process.stderr.write(
      `\n❌ ${path.relative(root, output)} ya no dice lo que dice el código.\n` +
        `   Regenéralo con:  npm run evidence:normas-mx\n`,
    );
    process.exit(1);
  }
  process.stderr.write(
    `✅ ${path.relative(root, output)} coincide con las tablas del producto ` +
      `(${evidence.resumen.normasCitadas} normas citadas, ` +
      `${evidence.resumen.costumbresDeclaradas} costumbres declaradas).\n`,
  );
  process.exit(0);
}

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, serialized, "utf8");

process.stderr.write(
  `\n✅ ${path.relative(root, output)}\n` +
    `   ${evidence.resumen.normasCitadas} convenciones con norma citada, ` +
    `${evidence.resumen.costumbresDeclaradas} declaradas como costumbre sin norma escrita\n` +
    `   ${evidence.resumen.capas} capas, ${evidence.resumen.escalas} escalas ` +
    `(${evidence.resumen.escalasFueraDeIso5455} fuera de ISO 5455), ` +
    `${evidence.resumen.papeles} papeles, ${evidence.resumen.plantillas} plantillas\n` +
    `   ${evidence.resumen.porVerificar} fuentes esperan que una persona las confirme\n`,
);
