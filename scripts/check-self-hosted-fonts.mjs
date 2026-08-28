#!/usr/bin/env node
/**
 * Gate: el build NO depende de terceros para compilar.
 *
 * `next/font/google` descarga las fuentes DE GOOGLE en tiempo de build; sin
 * internet, el build muere. La campaña de cimientos autohospedó Inter y
 * JetBrains Mono en `apps/web/src/fonts/` con `next/font/local`, y este gate
 * impide la regresión: cualquier import de `next/font/google` en el código de
 * producto falla, y los archivos de fuente comprometidos deben existir.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const webSrc = path.join(root, "apps/web/src");
const failures = [];

const REQUIRED_FONTS = [
  "apps/web/src/fonts/InterVariable.woff2",
  "apps/web/src/fonts/InterVariable-Italic.woff2",
  "apps/web/src/fonts/JetBrainsMono-wght.ttf",
  "apps/web/src/fonts/JetBrainsMono-Italic-wght.ttf",
  // Display de la marca desde la campaña de firma propia (2026-08-28).
  "apps/web/src/fonts/SpaceGrotesk-wght.ttf",
  "apps/web/src/fonts/LICENSE.txt",
];

for (const relative of REQUIRED_FONTS) {
  const target = path.join(root, relative);
  if (!existsSync(target)) {
    failures.push(`falta el archivo de fuente autohospedado: ${relative}`);
    continue;
  }
  if (!relative.endsWith(".txt") && statSync(target).size < 10_000) {
    failures.push(`${relative} pesa sospechosamente poco: ¿descarga rota?`);
  }
}

function* walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      yield* walk(target);
    } else if (/\.(ts|tsx|mts|js|jsx|mjs)$/.test(entry.name)) {
      yield target;
    }
  }
}

// Sólo IMPORTS reales: un comentario que cuenta la historia no es una
// dependencia. La expresión cubre import estático, dinámico y require.
const GOOGLE_FONT_IMPORT =
  /(from\s+|import\s*\(\s*|require\s*\(\s*)["']next\/font\/google["']/;

for (const file of walk(webSrc)) {
  const text = readFileSync(file, "utf8");
  if (GOOGLE_FONT_IMPORT.test(text)) {
    failures.push(
      `${path.relative(root, file)} importa next/font/google: el build volvería a depender de Google`,
    );
  }
}

if (failures.length > 0) {
  console.error("Gate de fuentes autohospedadas: FALLÓ");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Fuentes autohospedadas OK: ${REQUIRED_FONTS.length - 1} archivos presentes y cero imports de next/font/google.`,
);
