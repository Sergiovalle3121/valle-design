#!/usr/bin/env node
/**
 * EL GATE DE CONTRASTE.
 *
 * La campaña de firma propia (2026-08-28) llegó con la instrucción de medir el
 * contraste «con el gate que ya existe». No existía. Lo que había eran números
 * escritos a mano en los comentarios de `globals.css` —4,46:1 · 5,38:1 · 3,02:1—
 * medidos una vez, con criterio, y sin nada que los volviera a comprobar. Un
 * número correcto sin gate es un número que caduca en el siguiente commit: la
 * paleta v2 cambió los 40 tokens de color de golpe y todos esos comentarios
 * habrían quedado mintiendo en silencio.
 *
 * Este archivo declara QUÉ pares tienen que pasar y con cuánto. `contrast.mjs`
 * pone la aritmética; aquí está el criterio, que es la parte que hay que poder
 * discutir.
 *
 * ── POR QUÉ ESTOS PARES ─────────────────────────────────────────────────────
 * No se mide «la paleta»: se miden las COMBINACIONES QUE LA APP PINTA. Un token
 * no tiene contraste, lo tiene un texto sobre un fondo. Cada fila de abajo
 * corresponde a algo que de verdad existe en pantalla —`text-muted-foreground`
 * dentro de una `bg-card`, letra blanca sobre `bg-brand-strong`, un badge
 * `bg-success text-success-foreground`— y la lista crece cuando la app pinta
 * una combinación nueva, no cuando se añade un token.
 *
 * ── LOS DOS UMBRALES ────────────────────────────────────────────────────────
 *  · 4,5:1  TEXTO normal (WCAG 2.1 AA, 1.4.3). El estándar permite 3:1 para
 *           texto grande (≥24 px, o ≥18,66 px en negrita) y este gate NO usa
 *           esa excepción: un titular que sólo pasa por ser grande deja de
 *           pasar en cuanto alguien reutiliza el color en un pie de ficha, y
 *           esa reutilización es exactamente lo que pasa siempre.
 *  · 3:1    GRÁFICO y borde de control (WCAG 2.1 AA, 1.4.11). El anillo de
 *           foco, el punto de estado, la barra de progreso: no llevan letra
 *           pero comunican, y si no se ven no comunican.
 *  · 1,3:1  RELIEVE. No es un requisito de WCAG y está aquí a propósito: la
 *           queja que abrió la campaña fue «le falta contraste», y en un tema
 *           oscuro eso casi nunca significa que el texto no se lea (estaba en
 *           17:1) sino que los PLANOS no se separan. Un borde que no despega la
 *           tarjeta del fondo es la diferencia entre una interfaz con materia y
 *           una mancha uniforme.
 *
 * Uso: `node scripts/design/check-contrast.mjs` (o `npm run check:contrast`).
 * Con `--markdown` imprime la tabla que consume el informe de campaña.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { contrastRatio, extractBlock, formatRatio, resolveToken } from "./contrast.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
/**
 * La hoja que se mide. `VALLE_CONTRAST_CSS` sólo lo usa la propia prueba del
 * gate, y existe por una razón concreta: sin él, comprobar que el gate FALLA
 * ante una paleta ilegible obligaba a mutar `globals.css` en el árbol de
 * trabajo —una prueba que puede dejar la hoja rota si el proceso muere a la
 * mitad— o a no ejercer el gate en absoluto. Se hacía lo segundo: la prueba
 * recalculaba el cociente con el módulo de aritmética, así que demostraba que
 * la ARITMÉTICA detecta el fallo, no que el GATE salga con código 1. Un gate
 * que hubiera perdido su `process.exit(1)` habría seguido pareciendo sano.
 */
const CSS_PATH =
  process.env.VALLE_CONTRAST_CSS ||
  path.join(root, "apps/web/src/app/globals.css");

/** Texto normal: el umbral AA de toda la vida. */
const TEXT = 4.5;
/** Elemento gráfico o borde de control: WCAG 1.4.11. */
const GRAPHIC = 3;
/** Relieve entre planos: criterio propio, ver cabecera. */
const RELIEF = 1.3;

/**
 * LOS PARES. `[tinta, fondo, mínimo, qué es en pantalla]`.
 *
 * El cuarto campo no es documentación de cortesía: es lo que hace que un fallo
 * se pueda arreglar sin abrir el navegador. «--muted-foreground sobre --card
 * 4,1:1» no dice dónde mirar; «el pie de una tarjeta» sí.
 */
const PAIRS = [
  // ── Texto sobre las tres superficies ──────────────────────────────────────
  ["--foreground", "--background", TEXT, "texto principal sobre la página"],
  ["--foreground", "--card", TEXT, "texto principal dentro de una tarjeta"],
  ["--card-foreground", "--card", TEXT, "texto propio de la tarjeta"],
  ["--popover-foreground", "--popover", TEXT, "texto de un menú o popover"],
  ["--muted-foreground", "--background", TEXT, "texto secundario sobre la página"],
  ["--muted-foreground", "--card", TEXT, "el pie de una tarjeta"],
  ["--muted-foreground", "--muted", TEXT, "etiqueta dentro de un relleno tenue"],
  ["--secondary-foreground", "--secondary", TEXT, "texto de un control secundario"],

  // ── Tintas de estado sobre superficie normal ──────────────────────────────
  ["--primary-ink", "--card", TEXT, "un enlace de marca dentro de una tarjeta"],
  ["--primary-ink", "--background", TEXT, "un enlace de marca en la página"],
  ["--primary-ink", "--muted", TEXT, "un enlace dentro de un bloque tenue"],
  ["--success-ink", "--card", TEXT, "«guardado» escrito en verde"],
  ["--success-ink", "--background", TEXT, "confirmación sobre la página"],
  ["--warning-ink", "--card", TEXT, "un aviso escrito en ámbar"],
  ["--warning-ink", "--background", TEXT, "aviso sobre la página"],
  ["--danger-ink", "--card", TEXT, "un error escrito en rojo"],
  ["--danger-ink", "--background", TEXT, "error sobre la página"],

  // ── Rellenos que LLEVAN texto encima ──────────────────────────────────────
  ["--primary-foreground", "--brand-primary-strong", TEXT, "el botón principal en reposo"],
  ["--primary-foreground", "--brand-primary-hover", TEXT, "el botón principal bajo el puntero"],
  ["--success-foreground", "--success", TEXT, "un badge verde con su letra"],
  ["--warning-foreground", "--warning", TEXT, "un badge ámbar con su letra"],
  ["--danger-foreground", "--danger", TEXT, "un badge rojo con su letra"],
  ["--destructive-foreground", "--destructive", TEXT, "el botón destructivo"],
  ["--accent-foreground", "--accent", TEXT, "un chip de acento"],

  // ── Gráficos: se ven o no comunican ───────────────────────────────────────
  ["--ring", "--background", GRAPHIC, "el anillo de foco sobre la página"],
  ["--ring", "--card", GRAPHIC, "el anillo de foco dentro de una tarjeta"],
  ["--success", "--card", GRAPHIC, "el punto verde de un estado"],
  ["--warning", "--card", GRAPHIC, "la barra ámbar de un aviso"],
  ["--danger", "--card", GRAPHIC, "el punto rojo de un error"],
  ["--primary", "--card", GRAPHIC, "la herramienta activa marcada con el acento"],
  ["--primary", "--background", GRAPHIC, "un trazo de acento sobre la página"],

  // ── Relieve: que los planos se separen ────────────────────────────────────
  ["--border", "--card", RELIEF, "el borde de una tarjeta contra su relleno"],
  ["--border", "--background", RELIEF, "el borde de una tarjeta contra la página"],
  ["--card", "--background", 1.05, "la tarjeta despegada de la página"],
  ["--input", "--card", RELIEF, "un campo dentro de una tarjeta"],
];

const css = readFileSync(CSS_PATH, "utf8");

/**
 * Los tokens de `:root` son la base y `.dark` sólo redefine lo que cambia, así
 * que el mapa oscuro es la MEZCLA de los dos. Medir `.dark` en solitario daría
 * «token inexistente» en la mitad de las filas — y peor: podría dar por bueno
 * un par que en oscuro hereda un valor pensado para claro.
 */
const light = extractBlock(css, ":root {");
const dark = { ...light, ...extractBlock(css, "  .dark {") };

const themes = [
  ["claro", light],
  ["oscuro (por defecto)", dark],
];

const markdown = process.argv.includes("--markdown");
const failures = [];
const rows = [];

for (const [themeName, tokens] of themes) {
  for (const [inkToken, bgToken, minimum, what] of PAIRS) {
    let ratio;
    try {
      ratio = contrastRatio(
        resolveToken(tokens, inkToken),
        resolveToken(tokens, bgToken),
      );
    } catch (error) {
      failures.push(`[${themeName}] ${inkToken} sobre ${bgToken}: ${error.message}`);
      continue;
    }
    rows.push({ themeName, inkToken, bgToken, minimum, what, ratio });
    if (ratio + 1e-9 < minimum) {
      failures.push(
        `[${themeName}] ${what}: ${inkToken} sobre ${bgToken} mide ` +
          `${formatRatio(ratio)}:1 y el mínimo es ${formatRatio(minimum)}:1`,
      );
    }
  }
}

if (markdown) {
  console.log("| Tema | Qué es en pantalla | Tinta | Fondo | Medido | Mínimo |");
  console.log("| --- | --- | --- | --- | ---: | ---: |");
  for (const row of rows) {
    console.log(
      `| ${row.themeName} | ${row.what} | \`${row.inkToken}\` | \`${row.bgToken}\` | ` +
        `${formatRatio(row.ratio)}:1 | ${formatRatio(row.minimum)}:1 |`,
    );
  }
  console.log("");
}

if (failures.length > 0) {
  console.error("Gate de contraste: FALLÓ");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error(
    "\nLa corrección se hace en globals.css moviendo el TOKEN, nunca poniendo " +
      "un color suelto en el componente que falla.",
  );
  process.exit(1);
}

const worst = rows.reduce((a, b) => (a.ratio <= b.ratio ? a : b));
console.log(
  `Gate de contraste OK: ${rows.length} pares medidos en ${themes.length} temas ` +
    `(${PAIRS.length} por tema). El par más ajustado es «${worst.what}» en ` +
    `${worst.themeName}: ${formatRatio(worst.ratio)}:1 sobre un mínimo de ` +
    `${formatRatio(worst.minimum)}:1.`,
);
