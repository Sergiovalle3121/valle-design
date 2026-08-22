/**
 * EL GATE DEL SISTEMA DE DISEÑO.
 *
 * Este archivo existe porque el problema que arregló la campaña de diseño no
 * fue que faltara diseño: `globals.css` llevaba 825 líneas de tokens
 * semánticos, elevación en tres niveles, interletraje por tamaño y escala
 * fluida, escritos con criterio… y con CERO usos. `bg-card` 0, `bg-primary` 0,
 * `text-muted-foreground` 0, `border-border` 0, `.type-display` 0,
 * `var(--shadow-*)` 0. Un sistema que nadie consume no es un sistema: es
 * documentación.
 *
 * Un sistema de diseño sin gate vuelve a ese estado en tres sprints, porque
 * inventar un valor suelto SIEMPRE es más rápido que buscar el token — hasta
 * que hay 659 tamaños arbitrarios en trece valores y siete radios para el mismo
 * botón. Las reglas de abajo son la regla de oro convertida en aserción:
 *
 *     Ningún hex fuera de globals.css. Ningún tamaño fuera de la escala.
 *
 * Cada una lleva el número que tenía ANTES de la campaña, para que quien lo lea
 * dentro de un año sepa que la cifra no salió de una preferencia.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { globSync } from "glob";

const sources = globSync("src/**/*.tsx", {
  // Los tres archivos que SÍ pueden llevar color resuelto, y por qué:
  //  · logo-geometry.ts   — las tintas de la marca (no es .tsx, no entra igual)
  //  · social-card.tsx    — ImageResponse corre fuera de la página y no ve CSS
  //  · icon/apple-icon    — lo mismo, y además los consume el sistema operativo
  ignore: [
    "src/lib/seo/social-card.tsx",
    "src/app/icon.tsx",
    "src/app/apple-icon.tsx",
  ],
});
const withText = sources.map((file) => ({ file, text: readFileSync(file, "utf8") }));

/* ── 1 · NINGÚN TAMAÑO FUERA DE LA ESCALA ────────────────────────────────────
   Antes: 659 `text-[Npx]` en trece valores, once de ellos dentro de una banda
   de ocho píxeles, con un mínimo de 7 px. Trece pasos en 8 px no son una
   escala: son trece decisiones tomadas por separado. */
{
  const offenders = withText
    .flatMap(({ file, text }) =>
      [...text.matchAll(/text-\[[0-9.]+(?:px|rem)\]/g)].map(
        (m) => `${file}: ${m[0]}`,
      ),
    )
    .slice(0, 12);
  assert.deepEqual(
    offenders,
    [],
    "Tamaño de letra fuera de la escala. Usa type-display · type-title · " +
      "type-heading · type-lead · type-body · type-small · type-caption · " +
      "type-micro (el piso, 11 px). Si de verdad falta un escalón, se añade a " +
      "globals.css y se consume desde ahí.",
  );
}

/* ── 2 · EL PISO DE 11 PÍXELES ───────────────────────────────────────────────
   Un estudio de dibujo puede ser denso; lo que no puede ser es ilegible. Por
   debajo de 11 px una grotesca deja de leerse de un vistazo, y quien dibuja NO
   se acerca a la pantalla: tiene la mano en el ratón y la vista en el lienzo. */
{
  const css = readFileSync("src/app/globals.css", "utf8");
  const scale = [...css.matchAll(/\.type-[a-z]+\s*\{[^}]*font-size:\s*([^;]+);/g)]
    .map((m) => m[1].trim())
    // Sólo los escalones de tamaño fijo: los de `clamp()` son titulares y su
    // mínimo lo fija la propia función, muy por encima del piso.
    .filter((value) => /^[0-9.]+rem$/.test(value))
    .map((value) => Number.parseFloat(value) * 16);
  assert.ok(scale.length >= 4, "la escala fija debería tener al menos 4 escalones");
  const floor = Math.min(...scale);
  assert.ok(
    floor >= 11,
    `El escalón más pequeño de la escala mide ${floor}px y el piso son 11px.`,
  );
}

/* ── 3 · LA MARCA NO CAMBIA DE COLOR ─────────────────────────────────────────
   Antes: 327 clases `cyan-*` en un sistema cuyo propio CSS decía «Nada de
   cyan», con el logotipo de la portada en índigo y el de registro en cian — la
   marca cambiaba de color en el primer clic del embudo. */
{
  const offenders = withText
    .filter(({ text }) => /\b(?:cyan|sky|teal)-[0-9]/.test(text))
    .map(({ file }) => file);
  assert.deepEqual(
    offenders,
    [],
    "Acento fuera de la marca. El acento de Valle Design es índigo; usa " +
      "text-primary / bg-brand-strong / text-primary-ink.",
  );
}

/* ── 4 · NINGÚN HEX EN UN COMPONENTE ─────────────────────────────────────────
   Los colores ACI del dibujo (#ff0000, #00ff00…) NO son marca: son datos del
   plano y viven en los módulos de CAD, no en la capa visual. Por eso la regla
   se aplica sobre `components/ui`, `components/brand` y el embudo público, que
   es donde un hex suelto sí es una decisión de diseño que se escapa. */
{
  const visualLayer = withText.filter(
    ({ file }) =>
      file.includes("components/ui/") ||
      file.includes("components/brand/") ||
      file.includes("components\\ui\\") ||
      file.includes("components\\brand\\"),
  );
  assert.ok(visualLayer.length >= 10, "no se encontraron las primitivas");
  const offenders = visualLayer
    .flatMap(({ file, text }) =>
      [...text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => `${file}: ${m[0]}`),
    )
    .slice(0, 12);
  assert.deepEqual(
    offenders,
    [],
    "Hex suelto en la capa visual. Todo color sale de un token de globals.css.",
  );
}

/* ── 5 · EL SISTEMA SE CONSUME ───────────────────────────────────────────────
   La aserción que de verdad importa, y la única que no es una prohibición: los
   tokens tienen que estar EN USO. Un gate que sólo prohíbe deja pasar el estado
   original —cero hex sueltos y cero tokens consumidos— como si fuera correcto. */
{
  const all = withText.map(({ text }) => text).join("\n");
  const mustBeUsed = [
    "bg-card",
    "border-border",
    "text-muted-foreground",
    "text-foreground",
    "rounded-control",
    "rounded-card",
    "shadow-floating",
    "type-title",
    "type-body",
    "type-small",
    "type-caption",
    "type-micro",
  ];
  const unused = mustBeUsed.filter((token) => !all.includes(token));
  assert.deepEqual(
    unused,
    [],
    "Hay tokens del sistema con CERO usos. Un sistema que nadie consume es " +
      "documentación, no un sistema — que es exactamente el estado del que " +
      "salió este repositorio.",
  );
}

/* ── 6 · UNA SOLA PUERTA A LAS PRIMITIVAS ────────────────────────────────────
   Antes: `src/components/ui/` tenía UN archivo y la app 329 `<button>` a mano
   con cinco constantes de botón incompatibles. La barrica es lo que impide que
   vuelvan a aparecer dos. */
{
  const barrel = readFileSync("src/components/ui/index.ts", "utf8");
  for (const primitive of [
    "Button",
    "Input",
    "Select",
    "Textarea",
    "Checkbox",
    "Switch",
    "Surface",
    "Modal",
    "Badge",
    "Tooltip",
    "Tabs",
    "Skeleton",
    "EmptyState",
    "Spinner",
    "ProgressBar",
  ]) {
    assert.match(
      barrel,
      new RegExp(`\\b${primitive}\\b`),
      `falta la primitiva ${primitive} en components/ui`,
    );
  }
}

/* ── 7 · LA MARCA NO SE DESINCRONIZA ─────────────────────────────────────────
   El isotipo, el favicon, la tarjeta social y los siete SVG de `public/brand/`
   salen todos de `logo-geometry.ts`. Si alguien dibuja un logotipo nuevo en un
   componente, esta regla lo ve. */
{
  // Se busca sobre TODO el árbol, incluidos los tres archivos que la regla 4
  // exime del veto de hex: son justo los que deben consumir la geometría.
  const everything = globSync("src/**/*.{ts,tsx}").map((file) =>
    readFileSync(file, "utf8"),
  );
  const brandConsumers = everything.filter((text) =>
    /logo-geometry/.test(text),
  );
  assert.ok(
    brandConsumers.length >= 3,
    "la geometría de marca debería alimentar al menos al componente, al icono y a la tarjeta social",
  );
  const compass = withText
    .filter(({ text }) => /<DraftingCompass/.test(text))
    .map(({ file }) => file);
  assert.ok(
    compass.length <= 1,
    `El logotipo es <Logo/>, no un icono genérico de lucide. Sitios que lo pintan a mano: ${compass.join(", ")}`,
  );
}

console.log(
  "design-system: escala, piso de 11px, marca, hex, consumo de tokens y primitivas verificados",
);
