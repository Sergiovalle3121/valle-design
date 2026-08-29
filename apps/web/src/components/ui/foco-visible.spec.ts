/**
 * `outline-none` SIN sustituto es un control que se puede enfocar y no se ve.
 *
 * ## El problema, y por qué no lo cazaba nada
 *
 * `globals.css` define el anillo de foco en `@layer base` con `:focus-visible`.
 * Tailwind v4 emite `outline-none` en la capa `utilities`, que gana a `base`.
 * Así que cualquier clase que lleve `outline-none` **apaga el anillo del
 * sistema** y, si no pone otro en su lugar, deja un control que recibe el foco
 * sin ninguna señal de tenerlo. Para quien navega con teclado, eso es no saber
 * dónde está.
 *
 * Ni el gate de tokens ni el de contraste lo veían: no es un color mal elegido,
 * es una utilidad que anula una regla base. Y axe tampoco, porque axe mira el
 * DOM de una página concreta y estos controles viven casi todos dentro del
 * estudio, detrás de paletas que hay que abrir.
 *
 * ## Trinquete, no prohibición
 *
 * Hay 44 casos hoy, casi todos campos de texto de las paletas del editor. Poner
 * el gate en cero rompería el repo de golpe y la reacción sería añadir una lista
 * de excepciones, que es como se muere un gate. Así que se cuenta y **el número
 * sólo baja** — el mismo patrón del presupuesto del monolito y del de lint.
 *
 * Se acepta como sustituto CUALQUIER señal visible que la clase declare junto al
 * `outline-none`: un anillo (`ring-*`), un borde que cambia al enfocar
 * (`focus:border-*`), o una sombra. Lo que no se acepta es nada.
 *
 * Correr:  npx tsx src/components/ui/foco-visible.spec.ts
 */
import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "glob";

const PRESUPUESTO = "src/components/ui/foco-visible-budget.json";

/** Señales que valen como sustituto del anillo del sistema. */
const SUSTITUTOS =
  /\bring-|\bfocus:border-|\bfocus-visible:border-|\bfocus:shadow|\bfocus-visible:shadow|\bfocusRing\b|\bshadow-focus\b/;

const fuentes = globSync("src/**/*.{ts,tsx}", { ignore: ["**/*.spec.*"] });

const infractores: string[] = [];
for (const fichero of fuentes) {
  const texto = readFileSync(fichero, "utf8");
  // Se mira la CADENA DE CLASES completa donde aparece `outline-none`: el
  // sustituto casi siempre está en la misma, unas palabras más allá.
  for (const cadena of texto.matchAll(/"([^"\n]*\boutline-none\b[^"\n]*)"/g)) {
    if (!SUSTITUTOS.test(cadena[1])) {
      infractores.push(`${fichero}: ${cadena[1].slice(0, 90)}`);
    }
  }
  for (const cadena of texto.matchAll(/`([^`\n]*\boutline-none\b[^`\n]*)`/g)) {
    if (!SUSTITUTOS.test(cadena[1])) {
      infractores.push(`${fichero}: ${cadena[1].slice(0, 90)}`);
    }
  }
}

const presupuesto = JSON.parse(readFileSync(PRESUPUESTO, "utf8")) as {
  maximo: number;
};

if (process.argv.includes("--update")) {
  if (infractores.length > presupuesto.maximo) {
    console.error(
      `--update no SUBE el techo. Hay ${infractores.length} y el presupuesto es ${presupuesto.maximo}.`,
    );
    process.exit(1);
  }
  writeFileSync(
    PRESUPUESTO,
    `${JSON.stringify({ ...presupuesto, maximo: infractores.length }, null, 2)}\n`,
  );
  console.log(`Presupuesto de foco visible bajado a ${infractores.length}.`);
  process.exit(0);
}

assert.ok(
  infractores.length <= presupuesto.maximo,
  `Hay ${infractores.length} clases con \`outline-none\` y ningún sustituto visible del anillo de ` +
    `foco, y el presupuesto es ${presupuesto.maximo}. Los nuevos:\n  ` +
    infractores.slice(0, 10).join("\n  ") +
    "\n\nUn control que recibe el foco sin enseñarlo deja a quien navega con teclado sin saber " +
    "dónde está. Añade `focus-visible:ring-2 ring-ring` (o el borde de foco de la paleta) junto " +
    "al `outline-none`.",
);

console.log(
  `foco visible: ${infractores.length} clases con outline-none sin sustituto ` +
    `(techo ${presupuesto.maximo}; el trinquete sólo baja)`,
);
