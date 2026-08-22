#!/usr/bin/env node
/**
 * GENERADOR DE LOS ARCHIVOS DE MARCA — `apps/web/public/brand/*.svg`.
 *
 * POR QUÉ EXISTE. `public/` no tenía ni un archivo de imagen: cero svg, cero
 * png. Pero el remedio obvio —dibujar seis SVG a mano— es peor que la
 * enfermedad: seis archivos con la misma geometría copiada divergen a la
 * tercera exportación, y nadie se entera hasta que el logo del correo tiene el
 * trazo de otro grosor que el de la web.
 *
 * Aquí los seis salen de UNA geometría
 * (`apps/web/src/components/brand/logo-geometry.ts`), que es la misma que
 * consume el componente `<Logo/>`. Con `--check`, el gate falla si un archivo
 * no coincide: el logotipo deja de poder desincronizarse en silencio, igual que
 * el kernel wasm y la consola de API.
 *
 *   node scripts/brand/build-brand-assets.mjs           # escribe
 *   node scripts/brand/build-brand-assets.mjs --check   # verifica
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const geometrySource = path.join(
  repoRoot,
  "apps/web/src/components/brand/logo-geometry.ts",
);
const outDir = path.join(repoRoot, "apps/web/public/brand");

/**
 * Se lee el módulo TypeScript como TEXTO y se extraen los literales.
 *
 * Sin `tsx` de por medio a propósito: este script tiene que poder correr en el
 * gate más barato posible, y un `import` de TypeScript arrastraría un
 * transpilador entero para leer nueve constantes. Si la extracción falla, falla
 * RUIDOSAMENTE — un generador que se inventa un valor por defecto produce un
 * logotipo equivocado y lo da por bueno.
 */
function readGeometry() {
  const src = readFileSync(geometrySource, "utf8");
  const pick = (name, pattern) => {
    const found = src.match(pattern);
    if (!found) throw new Error(`no se pudo leer ${name} de logo-geometry.ts`);
    return found[1];
  };
  const num = (name) =>
    Number(pick(name, new RegExp(`${name}:\\s*([0-9.]+)`)));

  return {
    viewBox: pick("LOGO_VIEWBOX", /LOGO_VIEWBOX = "([^"]+)"/),
    dimensionLine: pick("DIMENSION_LINE", /DIMENSION_LINE = "([^"]+)"/),
    ticks: [
      ...pick("DIMENSION_TICKS", /DIMENSION_TICKS = \[([^\]]+)\]/).matchAll(
        /"([^"]+)"/g,
      ),
    ].map((m) => m[1]),
    valley: pick("VALLEY", /VALLEY = "([^"]+)"/),
    node: { x: num("x"), y: num("y"), size: num("size") },
    stroke: { dimension: num("dimension"), valley: num("valley") },
    ink: {
      light: pick("light", /light: "(#[0-9a-f]{6})"/i),
      dark: pick("dark", /dark: "(#[0-9a-f]{6})"/i),
      accent: pick("accent", /accent: "(#[0-9a-f]{6})"/i),
    },
    wordmark: pick("WORDMARK", /WORDMARK = "([^"]+)"/),
  };
}

/** El isotipo, con las tintas ya resueltas (un `.svg` no ve las variables CSS). */
function isotipo(g, ink, nodeInk) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${g.viewBox}" width="32" height="32" role="img" aria-label="${g.wordmark}">
  <title>${g.wordmark}</title>
  <g fill="none" stroke="${ink}" stroke-width="${g.stroke.dimension}" stroke-linecap="square">
    <path d="${g.dimensionLine}"/>
    ${g.ticks.map((d) => `<path d="${d}"/>`).join("\n    ")}
  </g>
  <path d="${g.valley}" fill="none" stroke="${ink}" stroke-width="${g.stroke.valley}" stroke-linecap="square" stroke-linejoin="round"/>
  <rect x="${g.node.x}" y="${g.node.y}" width="${g.node.size}" height="${g.node.size}" fill="${nodeInk}"/>
</svg>
`;
}

/**
 * Lockup horizontal. El nombre va como `<text>` con el stack de la marca: si
 * Inter no está instalada, degrada a la grotesca del sistema en vez de no
 * pintar nada. La versión CANÓNICA del lockup es el componente `<Logo/>`, que
 * sí compone con la tipografía real; estos archivos existen para los sitios
 * donde sólo cabe una imagen (correo, README, tarjeta de un tercero).
 */
function lockup(g, ink, nodeInk) {
  const scale = 0.75; // isotipo de 24 px dentro de una caja de 32 de alto
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 168 32" width="168" height="32" role="img" aria-label="${g.wordmark}">
  <title>${g.wordmark}</title>
  <g transform="translate(0 4) scale(${scale})">
    <g fill="none" stroke="${ink}" stroke-width="${g.stroke.dimension}" stroke-linecap="square">
      <path d="${g.dimensionLine}"/>
      ${g.ticks.map((d) => `<path d="${d}"/>`).join("\n      ")}
    </g>
    <path d="${g.valley}" fill="none" stroke="${ink}" stroke-width="${g.stroke.valley}" stroke-linecap="square" stroke-linejoin="round"/>
    <rect x="${g.node.x}" y="${g.node.y}" width="${g.node.size}" height="${g.node.size}" fill="${nodeInk}"/>
  </g>
  <text x="34" y="22" fill="${ink}" font-family="Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="17" font-weight="600" letter-spacing="-0.4">${g.wordmark}</text>
</svg>
`;
}

function wordmark(g, ink) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 134 24" width="134" height="24" role="img" aria-label="${g.wordmark}">
  <title>${g.wordmark}</title>
  <text x="0" y="18" fill="${ink}" font-family="Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="19" font-weight="600" letter-spacing="-0.45">${g.wordmark}</text>
</svg>
`;
}

function buildAll() {
  const g = readGeometry();
  return {
    "isotipo-claro.svg": isotipo(g, g.ink.light, g.ink.accent),
    "isotipo-oscuro.svg": isotipo(g, g.ink.dark, g.ink.accent),
    "isotipo-mono.svg": isotipo(g, "currentColor", "currentColor"),
    "lockup-claro.svg": lockup(g, g.ink.light, g.ink.accent),
    "lockup-oscuro.svg": lockup(g, g.ink.dark, g.ink.accent),
    "wordmark-claro.svg": wordmark(g, g.ink.light),
    "wordmark-oscuro.svg": wordmark(g, g.ink.dark),
  };
}

/**
 * EL `favicon.ico` — el único archivo binario de la marca.
 *
 * Next inyecta `<link rel="icon">` desde `app/icon.tsx`, así que el `.ico` de
 * raíz sólo lo pide un navegador viejo o una araña que ignora el `<link>`. Aun
 * así se emite: cuesta un archivo y evita un 404 en el registro de acceso.
 *
 * Se rasteriza con `sharp`, que llega con Next. Si no estuviera, el generador
 * lo DICE y sigue — un icono ausente no debe tumbar la construcción de los seis
 * SVG, que son lo que de verdad usa el producto. Por eso `--check` verifica que
 * el archivo EXISTA y no que sus bytes coincidan: dos versiones de sharp
 * comprimen el mismo PNG distinto, y eso no es una diferencia de diseño.
 */
async function writeFavicon(svg, target) {
  const require = createRequire(import.meta.url);
  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    console.warn("· sharp no disponible: se omite favicon.ico");
    return false;
  }

  const sizes = [16, 32, 48];
  const pngs = [];
  for (const size of sizes) {
    pngs.push(
      await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer(),
    );
  }

  // ICO = cabecera (6) + una entrada de directorio por tamaño (16) + los PNG
  // pegados detrás. Un PNG embebido es legal en ICO desde Vista y evita tener
  // que escribir un BMP con su máscara AND invertida.
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reservado
  header.writeUInt16LE(1, 2); // tipo 1 = icono
  header.writeUInt16LE(sizes.length, 4);

  let offset = 6 + 16 * sizes.length;
  const entries = sizes.map((size, index) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // paleta
    entry.writeUInt8(0, 3); // reservado
    entry.writeUInt16LE(1, 4); // planos
    entry.writeUInt16LE(32, 6); // bits por píxel
    entry.writeUInt32LE(pngs[index].length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += pngs[index].length;
    return entry;
  });

  writeFileSync(target, Buffer.concat([header, ...entries, ...pngs]));
  return true;
}

const check = process.argv.includes("--check");
const assets = buildAll();
let drift = 0;

for (const [name, content] of Object.entries(assets)) {
  const target = path.join(outDir, name);
  if (check) {
    // Se compara con los saltos de línea normalizados: en Windows el archivo
    // puede llegar con CRLF desde git y eso no es una diferencia de diseño.
    const actual = existsSync(target)
      ? readFileSync(target, "utf8").replace(/\r\n/g, "\n")
      : null;
    if (actual !== content) {
      console.error(
        `✗ ${name} no coincide con logo-geometry.ts` +
          (actual === null ? " (no existe)" : ""),
      );
      drift += 1;
    }
  } else {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(target, content, "utf8");
  }
}

// El icono del navegador sale del isotipo OSCURO: la pestaña del navegador es
// clara en la mayoría de los sistemas, pero el icono se ve también sobre fondos
// oscuros (barra de tareas, marcador). El de tinta clara desaparecería en uno de
// los dos; el oscuro sobre claro siempre se ve.
const faviconTarget = path.join(repoRoot, "apps/web/src/app/favicon.ico");
if (check) {
  if (!existsSync(faviconTarget)) {
    console.error("✗ falta apps/web/src/app/favicon.ico");
    drift += 1;
  }
} else {
  await writeFavicon(assets["isotipo-claro.svg"], faviconTarget);
}

if (check) {
  if (drift > 0) {
    console.error(
      `\n${drift} archivo(s) de marca fuera de sincronía.\n` +
        "Ejecuta: node scripts/brand/build-brand-assets.mjs",
    );
    process.exit(1);
  }
  console.log(
    `Marca OK: ${Object.keys(assets).length} archivos coinciden con la geometría única.`,
  );
} else {
  console.log(
    `Marca generada: ${Object.keys(assets).length} archivos en apps/web/public/brand/.`,
  );
}
