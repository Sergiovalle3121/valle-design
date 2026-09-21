#!/usr/bin/env node
/**
 * GATE ANTI-RECAÍDA DE MARCA.
 *
 * Vigila que el nombre comercial NO se hardcodea en la superficie pública.
 * Sin este gate, las 122 ocurrencias que hubo en septiembre 2026 vuelven
 * en la siguiente campaña: quitar el texto una vez no sirve.
 *
 * Patrón: `valle\s*design` (case-insensitive). NO incluye «VALLECAD»: cero
 * ocurrencias en el repo, sería regla muerta.
 *
 * Alcance: los PUBLIC_GLOBS de check-public-surface.mjs (la superficie
 * pública) más email-templates.ts del API. NO incluye:
 *  - terms/page.tsx y privacy/page.tsx (SHA-256 custodiado por check:legal)
 *  - brand.ts y config/brand.ts (la fuente)
 *  - *.spec.* (las pruebas)
 *  - el resto del árbol (~90 ficheros: tarea de renombrado aparte)
 *
 * Uso: `node scripts/design/check-brand-literal.mjs`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { globSync } from "glob";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

/** Variable de entorno para tests: apunta a un directorio temporal. */
const webSrc = process.env.VALLE_BRAND_SRC || path.join(root, "apps/web/src");
const apiSrc = process.env.VALLE_BRAND_API_SRC || path.join(root, "apps/api/src");

/**
 * La superficie pública, enumerada a mano (misma lista que
 * check-public-surface.mjs).
 */
const PUBLIC_GLOBS = [
  "app/page.tsx",
  "app/precios/**/*.tsx",
  "app/novedades/**/*.tsx",
  "app/educacion/**/*.tsx",
  "app/register/**/*.tsx",
  "app/login/**/*.tsx",
  "app/contact/**/*.tsx",
  "app/support/**/*.tsx",
  "components/marketing/**/*.tsx",
  "config/commercial.ts",
  "lib/seo/**/*.{ts,tsx}",
  "lib/marketing/**/*.ts",
  "app/opengraph-image.tsx",
  "app/twitter-image.tsx",
];

const API_GLOBS = [
  "modules/outbox-receiver/email-templates.ts",
];

const FORBIDDEN = /valle\s*design/giu;

/**
 * Quita comentarios antes de mirar. El gate juzga lo que el usuario LEE.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const failures = [];

// --- Superficie pública (web) ---
for (const pattern of PUBLIC_GLOBS) {
  for (const relative of globSync(pattern, { cwd: webSrc })) {
    const normalized = relative.split(path.sep).join("/");
    const source = readFileSync(path.join(webSrc, relative), "utf8");
    const visible = stripComments(source);
    const hits = [...visible.matchAll(FORBIDDEN)].map((m) => m[0]);
    if (hits.length > 0) {
      failures.push(
        `apps/web/src/${normalized}: literal «${[...new Set(hits)].join(", ")}» en ` +
          "superficie pública. Lee el manifiesto de marca en vez de hardcodear.",
      );
    }
  }
}

// --- API ---
for (const pattern of API_GLOBS) {
  for (const relative of globSync(pattern, { cwd: apiSrc })) {
    const normalized = relative.split(path.sep).join("/");
    const source = readFileSync(path.join(apiSrc, relative), "utf8");
    const visible = stripComments(source);
    const hits = [...visible.matchAll(FORBIDDEN)].map((m) => m[0]);
    if (hits.length > 0) {
      failures.push(
        `apps/api/src/${normalized}: literal «${[...new Set(hits)].join(", ")}». ` +
          "Usa resolveBrandManifest(process.env) en vez de hardcodear.",
      );
    }
  }
}

// --- La otra mitad: que el manifiesto SIGA LEYÉNDOSE ---
// Sólo se verifica contra el árbol real, no contra directorios temporales de
// tests: un archivo temporal no importa nada y eso no es un fallo del gate.
if (!process.env.VALLE_BRAND_SRC) {
  const landingPath = path.join(webSrc, "app/page.tsx");
  try {
    const landing = readFileSync(landingPath, "utf8");
    if (!/productDisplayName|brandNameWithSymbol|PRODUCT_LABEL/.test(landing)) {
      failures.push(
        "app/page.tsx ya no importa del manifiesto de marca. " +
          "El gate se satisface borrando el nombre de la portada.",
      );
    }
  } catch {
    // Si no existe, no cuenta.
  }
}

if (failures.length > 0) {
  console.error("Gate de literal de marca: FALLÓ");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Gate de literal de marca OK: ${PUBLIC_GLOBS.length + API_GLOBS.length} zonas revisadas, ` +
    "cero literales «valle design» en superficie pública.",
);
