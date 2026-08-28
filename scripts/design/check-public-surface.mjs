#!/usr/bin/env node
/**
 * EL GATE DE SUPERFICIE PÚBLICA.
 *
 * Lo que vigila, en una frase: **el producto se describe solo**.
 *
 * ── LA DECISIÓN ─────────────────────────────────────────────────────────────
 * Hasta 2026-08-28 la portada decía «una alternativa a AutoCAD en la nube» y la
 * comparación se repetía en secciones, en el FAQ y en los metadatos. Eso era
 * legal —la referencia nominativa con aviso de marcas lo es— y era un mal
 * negocio: un producto que se define contra otro le regala el marco al otro,
 * y el comprador se queda con el nombre grande. El dueño lo decidió con estas
 * palabras: «que la página diga lo que hace, no contra quién compite».
 *
 * Retirarlo del texto una vez no sirve de nada. Una comparación es la frase más
 * fácil de escribir cuando hay que explicar rápido qué es esto, y vuelve sola
 * en la siguiente página de marketing que alguien añada con prisa. Por eso hay
 * gate.
 *
 * ── LO QUE PROHÍBE Y DÓNDE ──────────────────────────────────────────────────
 * Las palabras «AutoCAD» y «Autodesk» en la SUPERFICIE PÚBLICA: portada,
 * precios, embudo de alta, navegación, componentes de marketing y la
 * configuración de marca. Una sola excepción, y por eso existe como archivo
 * aparte: `components/marketing/TrademarkNotice.tsx`, la línea discreta del pie
 * que declara de quién son esas marcas y que Valle Design no está afiliado.
 *
 * ── LO QUE NO PROHÍBE, Y ES DELIBERADO ──────────────────────────────────────
 *  · Las GUÍAS TÉCNICAS (`app/docs/**`) y `docs/guides/**`. Ahí el lector ya
 *    entró, ya sabe qué es el producto, y viene con una pregunta concreta —«¿me
 *    abre este archivo?»— que no se puede responder sin nombrar formatos ni
 *    programas. Callar ahí no es sobriedad de marca: es dejar sin respuesta a
 *    quien está a punto de pagar.
 *  · Los COMENTARIOS del código. Este archivo mismo explica la decisión y la
 *    explicación necesita nombrar lo que se retiró. El gate quita comentarios
 *    antes de mirar, así que documenta el porqué cuanto haga falta.
 *  · Las PRUEBAS que verifican esta misma regla.
 *  · El nombre del formato DWG, que es un hecho técnico y no un competidor.
 *
 * Uso: `node scripts/design/check-public-surface.mjs` (o `npm run check:surface`).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { globSync } from "glob";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const webSrc = path.join(root, "apps/web/src");

/**
 * LA SUPERFICIE PÚBLICA, enumerada a mano.
 *
 * Enumerada y no deducida: «todo lo que no sea docs» crecería solo y algún día
 * incluiría el estudio, donde la línea de comandos SÍ tiene que poder hablar de
 * compatibilidad de comandos con quien viene de otro programa. La lista se
 * amplía a conciencia cuando nace una página pública nueva.
 */
const PUBLIC_GLOBS = [
  "app/page.tsx",
  "app/precios/**/*.tsx",
  "app/novedades/**/*.tsx",
  "app/educacion/**/*.tsx",
  "app/register/**/*.tsx",
  "app/login/**/*.tsx",
  "app/verify-email/**/*.tsx",
  "app/resend-verification/**/*.tsx",
  "app/forgot-password/**/*.tsx",
  "app/reset-password/**/*.tsx",
  "app/contact/**/*.tsx",
  "app/support/**/*.tsx",
  "components/marketing/**/*.tsx",
  "components/PublicNav.tsx",
  "components/AuthShell.tsx",
  "components/AuthPage.tsx",
  "config/brand.ts",
  "config/commercial.ts",
  "lib/seo/**/*.ts",
];

/** El único archivo autorizado a nombrarlas, y por qué (ver su cabecera). */
const TRADEMARK_MODULE = "components/marketing/TrademarkNotice.tsx";

const FORBIDDEN = /\b(?:autocad|autodesk)\b/gi;

/**
 * Quita comentarios antes de mirar.
 *
 * El gate juzga lo que el usuario LEE, no lo que el equipo escribe para
 * entenderse. Se quitan bloques `/* … *\/` (incluidos los `{/* … *\/}` de JSX,
 * que son bloques con llaves alrededor) y las líneas `//`, con el cuidado de no
 * cortar un `https://`: sin esa guarda, media línea de cada URL desaparecería y
 * el gate dejaría de ver texto que sí es público.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const failures = [];
const seen = [];

for (const pattern of PUBLIC_GLOBS) {
  for (const relative of globSync(pattern, { cwd: webSrc })) {
    const normalized = relative.split(path.sep).join("/");
    const source = readFileSync(path.join(webSrc, relative), "utf8");
    const visible = stripComments(source);
    const hits = [...visible.matchAll(FORBIDDEN)].map((m) => m[0]);
    if (hits.length === 0) continue;
    if (normalized === TRADEMARK_MODULE) {
      seen.push(...hits);
      continue;
    }
    failures.push(
      `apps/web/src/${normalized}: nombra ${[...new Set(hits)].join(", ")} en ` +
        "superficie pública. El producto se describe solo; si hace falta hablar " +
        `de intercambio, se habla del FORMATO. La única línea permitida vive en ${TRADEMARK_MODULE}.`,
    );
  }
}

/**
 * La otra mitad del gate, y la que de verdad se olvida: que la línea de marcas
 * SIGA ESTANDO. Un gate que sólo prohíbe se satisface borrando el aviso legal,
 * que es peor que el problema que vino a resolver.
 */
const trademarkSource = readFileSync(path.join(webSrc, TRADEMARK_MODULE), "utf8");
// El texto viaja en JSX, así que la frase llega partida por saltos de línea y
// sangría. Se normaliza el espacio antes de buscarla o el gate leería una
// ausencia donde sólo hay un salto de renglón.
const trademarkText = trademarkSource.replace(/\s+/g, " ");
if (!/no est[áa] afiliad/iu.test(trademarkText)) {
  failures.push(
    `${TRADEMARK_MODULE} ya no declara la NO afiliación. Esa línea es la razón ` +
      "por la que este archivo puede nombrar marcas ajenas; sin ella, sobra.",
  );
}
const landing = readFileSync(path.join(webSrc, "app/page.tsx"), "utf8");
if (!/TrademarkNotice/.test(landing)) {
  failures.push(
    "app/page.tsx ya no monta <TrademarkNotice/>: el aviso de marcas dejaría " +
      "de renderizarse en la superficie donde más se necesita.",
  );
}

if (failures.length > 0) {
  console.error("Gate de superficie pública: FALLÓ");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Gate de superficie pública OK: ${PUBLIC_GLOBS.length} zonas revisadas, cero ` +
    `menciones de marcas ajenas fuera de ${TRADEMARK_MODULE} (${seen.length} ` +
    "en la línea de marcas, que es donde toca).",
);
