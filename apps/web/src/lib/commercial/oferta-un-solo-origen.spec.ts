/**
 * LA DURACIÓN DE LA OFERTA VIVE EN UN SOLO SITIO.
 *
 * El backend concede los días que dice `TRIAL_DAYS`; el catálogo público los
 * publica; `freeOfferHeadline()` los traduce a lo que lee una persona («90 días»
 * → «3 meses gratis»). Esa cadena ya está montada y funciona.
 *
 * Lo que faltaba es lo que impide que se rompa: nada obligaba a que siguiera
 * siendo así. Escribir «3 meses gratis» en un JSX es una línea, se lee bien, y
 * pasa todos los gates del repo — hasta el día en que el operador arranca con
 * `TRIAL_DAYS=30` y el producto anuncia una promesa que no cumple. Ese fallo no
 * es un error de programa: es publicidad engañosa, y no lo detecta ningún test
 * de comportamiento porque el comportamiento es correcto y el TEXTO miente.
 *
 * Este spec busca literales de duración en la superficie que un cliente lee, y
 * los prohíbe fuera del único módulo que tiene derecho a nombrarlos:
 * `config/launch.ts`, donde vive el traductor `freeOfferHeadline`.
 *
 * Correr:  npx tsx src/lib/commercial/oferta-un-solo-origen.spec.ts
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { globSync } from "glob";
import { freeOfferHeadline, freePeriodLabel } from "@/config/launch";

/* ── El traductor sigue siendo el traductor ───────────────────────────────── */
assert.equal(freePeriodLabel(90), "3 meses", "90 días son «3 meses» para una persona");
assert.equal(freeOfferHeadline(90), "3 meses gratis");
assert.equal(freeOfferHeadline(30), "1 mes gratis", "TRIAL_DAYS=30 cambia el anuncio solo");

/**
 * Los únicos ficheros que pueden escribir una duración: el traductor
 * (`config/launch.ts`) y el módulo de fases de prueba, que razona sobre plazos.
 * Cualquier otro sitio que la escriba está creando una segunda fuente de verdad.
 */
const AUTORIZADOS = [
  "src/config/launch.ts",
  "src/lib/commercial/trial-phase.ts",
];

/**
 * Literales de duración de oferta. Deliberadamente NO incluye «14 días» ni
 * variantes de aviso de vencimiento: ésas salen de `EXPIRY_NOTICE_DAYS`, que es
 * una constante de producto y no una promesa comercial.
 */
const DURACIONES =
  /\b(?:un|dos|tres|seis|doce)\s+meses?\b|\b\d+\s*(?:meses|mes)\s+(?:gratis|de\s+prueba)\b|\b(?:noventa|treinta|sesenta)\s+d[ií]as\b|\b\d{2,3}\s*d[ií]as\s+(?:gratis|de\s+prueba)\b/giu;

/** Sólo lo que un cliente puede leer: páginas y componentes, no lógica interna. */
const SUPERFICIE = globSync(
  ["src/app/**/*.tsx", "src/components/**/*.tsx", "src/config/*.ts", "src/lib/commercial/*.ts"],
  { ignore: ["src/components/cad/**", "**/*.spec.*"] },
);

const infractores = [];
for (const fichero of SUPERFICIE) {
  if (AUTORIZADOS.includes(fichero)) continue;
  const texto = readFileSync(fichero, "utf8");
  // Los comentarios de bloque explican POR QUÉ existe la regla y citan ejemplos;
  // citar no es prometer. Se miden sólo las líneas de código.
  const codigo = texto
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((linea) => !linea.trim().startsWith("//"))
    .join("\n");
  for (const encontrado of codigo.matchAll(DURACIONES)) {
    infractores.push(`${fichero}: «${encontrado[0].trim()}»`);
  }
}

assert.deepEqual(
  infractores,
  [],
  "La duración de la oferta sólo puede salir de `freeOfferHeadline(trialDays)`, que lee " +
    "`TRIAL_DAYS` por el catálogo público. Un literal en la superficie es una segunda fuente " +
    "de verdad, y el día que discrepen el producto anuncia algo que no cumple.",
);

console.log(
  `oferta: un solo origen — ${SUPERFICIE.length} ficheros de superficie revisados, 0 literales de duración`,
);
