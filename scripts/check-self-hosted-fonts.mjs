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

/**
 * Lo que el NAVEGADOR descarga son los subconjuntos (campaña de sitio,
 * 2026-08-29): los genera `scripts/design/subset-fonts.py` desde los
 * originales de arriba, que se quedan como fuente canónica de regeneración
 * (y el TTF de JetBrains además es fixture del oráculo de incrustación PDF).
 * Viven en `public/fonts/` con hash de contenido en el nombre, y el CSS y las
 * precargas que los referencian (`src/app/fonts.css`,
 * `src/config/fonts-generated.ts`) los emite el mismo script — este gate
 * comprueba que los tres cuentan la misma historia.
 *
 * El techo de bytes es un TRINQUETE: el peso servido solo puede bajar. Antes
 * de los subconjuntos la portada precargaba 1 486 KB de tipografía y el móvil
 * medía 73-75; subir un techo exige regenerar, medir y explicarlo en el
 * commit. Techos = tamaño generado + ~2 % de margen de regeneración.
 */
const SUBSET_CEILINGS = [
  [/^InterVariable\.subset\.[0-9a-f]{8}\.woff2$/, 138_000],
  [/^InterVariable-Italic\.subset\.[0-9a-f]{8}\.woff2$/, 153_000],
  [/^JetBrainsMono\.subset\.[0-9a-f]{8}\.woff2$/, 88_000],
  [/^JetBrainsMono-Italic\.subset\.[0-9a-f]{8}\.woff2$/, 92_000],
  [/^SpaceGrotesk\.subset\.[0-9a-f]{8}\.woff2$/, 87_000],
];
const MAX_PRELOADS = 2;

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

const publicFontsDir = path.join(root, "apps/web/public/fonts");
const publicFonts = existsSync(publicFontsDir)
  ? readdirSync(publicFontsDir).filter((f) => f.endsWith(".woff2"))
  : [];
for (const [pattern, techo] of SUBSET_CEILINGS) {
  const matches = publicFonts.filter((f) => pattern.test(f));
  if (matches.length !== 1) {
    failures.push(
      `apps/web/public/fonts debe contener EXACTAMENTE un ${pattern}: hay ${matches.length}. ` +
        "Regenera con scripts/design/subset-fonts.py.",
    );
    continue;
  }
  const size = statSync(path.join(publicFontsDir, matches[0])).size;
  if (size < 10_000) {
    failures.push(`${matches[0]} pesa sospechosamente poco: ¿generación rota?`);
  }
  if (size > techo) {
    failures.push(
      `${matches[0]} pesa ${size} bytes y su techo es ${techo}: el peso servido solo baja. ` +
        "Si el inventario de glifos creció de verdad, sube el techo A MANO con la medida delante.",
    );
  }
}
const huerfanas = publicFonts.filter(
  (f) => !SUBSET_CEILINGS.some(([pattern]) => pattern.test(f)),
);
for (const extra of huerfanas) {
  failures.push(
    `apps/web/public/fonts/${extra} no corresponde a ninguna cara conocida: ` +
      "una fuente servida que este gate no vigila es una regresión esperando.",
  );
}

/**
 * El CSS generado, las precargas y los archivos reales tienen que contar la
 * misma historia: cada URL /fonts/ referenciada existe, y las precargas son
 * como máximo DOS (Inter romana y Space Grotesk — el primer viewport). Una
 * tercera precarga es exactamente la regresión que costó el 73-75 móvil.
 */
const fontsCssPath = path.join(webSrc, "app/fonts.css");
if (!existsSync(fontsCssPath)) {
  failures.push("falta src/app/fonts.css: regenera con scripts/design/subset-fonts.py");
} else {
  const cssText = readFileSync(fontsCssPath, "utf8");
  for (const match of cssText.matchAll(/url\("\/fonts\/([^"]+)"\)/g)) {
    if (!publicFonts.includes(match[1])) {
      failures.push(
        `fonts.css referencia /fonts/${match[1]} pero el archivo no existe: CSS y disco discrepan`,
      );
    }
  }
}
const generatedTsPath = path.join(webSrc, "config/fonts-generated.ts");
if (!existsSync(generatedTsPath)) {
  failures.push(
    "falta src/config/fonts-generated.ts: regenera con scripts/design/subset-fonts.py",
  );
} else {
  const tsText = readFileSync(generatedTsPath, "utf8");
  const preloads = [...tsText.matchAll(/"\/fonts\/([^"]+)"/g)].map((m) => m[1]);
  if (preloads.length > MAX_PRELOADS) {
    failures.push(
      `fonts-generated.ts precarga ${preloads.length} caras y el máximo es ${MAX_PRELOADS}: ` +
        "cada precarga compite con el CSS y el JS en el primer pintado móvil.",
    );
  }
  for (const preload of preloads) {
    if (!publicFonts.includes(preload)) {
      failures.push(`fonts-generated.ts precarga /fonts/${preload} pero el archivo no existe`);
    }
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
  `Fuentes autohospedadas OK: ${REQUIRED_FONTS.length - 1} originales, ` +
    `${publicFonts.length} subconjuntos servidos bajo techo, máximo ${MAX_PRELOADS} precargas ` +
    "y cero imports de next/font/google.",
);
