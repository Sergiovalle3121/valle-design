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
import { composite, contrastRatio, extractBlock, formatRatio, resolveToken } from "./contrast.mjs";

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

/**
 * T-13: hasta esta ampliación, el gate declaraba por escrito en esta misma
 * cabecera que medía «las combinaciones que la app pinta» y sólo medía pares
 * TOKEN×TOKEN de `globals.css` — nunca la tinta del propio dibujo, que es
 * `.ts`, no CSS. Ese hueco escondió #ffffff (ACI 7, capa "0") sobre el preset
 * «Claro» del lienzo (#eaf0f8): 1,15:1, invisible.
 *
 * Estos tres ficheros son la fuente única de los valores que se cruzan más
 * abajo — nunca un número copiado a mano — y el gate falla ruidoso si alguno
 * cambia de forma y el patrón deja de encontrarlo.
 */
const THEME_TS_PATH =
  process.env.VALLE_CONTRAST_THEME_TS ||
  path.join(root, "apps/web/src/components/cad/studio/editor-presentation.ts");
/** Sólo la prueba de este gate mueve esto, igual que `VALLE_CONTRAST_CSS`. */
const RENDER_STYLE_TS_PATH =
  process.env.VALLE_CONTRAST_RENDER_STYLE_TS ||
  path.join(root, "apps/web/src/lib/cad/render/render-style.ts");
const ACI_PALETTE_TS_PATH = path.join(root, "apps/web/src/lib/cad/plot/aci-palette.ts");

/** Texto normal: el umbral AA de toda la vida. */
const TEXT = 4.5;
/** Elemento gráfico o borde de control: WCAG 1.4.11. */
const GRAPHIC = 3;
/** Relieve entre planos: criterio propio, ver cabecera. */
const RELIEF = 1.3;

/**
 * LOS PARES. `[tinta, fondo, mínimo, qué es en pantalla, alfa?]`.
 *
 * El cuarto campo no es documentación de cortesía: es lo que hace que un fallo
 * se pueda arreglar sin abrir el navegador. «--muted-foreground sobre --card
 * 4,1:1» no dice dónde mirar; «el pie de una tarjeta» sí.
 *
 * EL QUINTO CAMPO, `alfa`, existe porque axe-core encontró en 2026-08-29 tres
 * violaciones serias que este gate no podía ver: una tinta que pasa a plena
 * opacidad y falla con `opacity-60` encima. `contrast.mjs` sabía componer sobre
 * el fondo desde el primer día (`composite`), pero ningún par lo declaraba, así
 * que la atenuación viajaba sin medir. Una fila con alfa mide el color QUE SE
 * VE, no el que dice el token.
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

  // ── Tintas ATENUADAS: lo que se ve, no lo que dice el token ───────────────
  // La numeración de lámina («00 · LO QUE VAS A ABRIR») va atenuada a propósito:
  // es un adorno de composición delante del eyebrow. A `opacity-60` medía 3,10:1
  // en claro y 3,09:1 en oscuro — ilegible para quien lo necesita, y una
  // violación seria de axe en cinco superficies. A 0,85 mide 5,31 en claro y 4,88 sobre tarjeta
  // en oscuro, que es el par más ajustado de los tres. 0,8 no bastaba: sobre
  // `--card` en oscuro se quedaba en 4,24 — lo encontró este gate, no axe.
  ["--primary-ink", "--background", TEXT, "la numeración de lámina atenuada sobre la página", 0.9],
  ["--primary-ink", "--card", TEXT, "la numeración de lámina atenuada en una tarjeta", 0.9],
  ["--primary-foreground", "--brand-primary-strong", TEXT, "la numeración dentro del botón principal", 0.9],

  // ── Relieve: que los planos se separen ────────────────────────────────────
  ["--border", "--card", RELIEF, "el borde de una tarjeta contra su relleno"],
  ["--border", "--background", RELIEF, "el borde de una tarjeta contra la página"],
  ["--card", "--background", 1.05, "la tarjeta despegada de la página"],
  ["--input", "--card", RELIEF, "un campo dentro de una tarjeta"],

  // ── T-13: insignias con fondo TINTADO (bg-X/NN) medidas de verdad ─────────
  // El escéptico las midió a mano el 2026-09-05 porque este gate no las veía:
  // un fondo compuesto (tinta al 15-20% sobre la superficie real) es una
  // combinación que la app SÍ pinta y que el gate anterior no sabía componer.
  // El sexto campo (aquí, un objeto en vez de un string) dice CÓMO se compone
  // el fondo antes de medir la tinta contra él.
  [
    "--warning-ink",
    { over: "--warning", on: "--background", alpha: 0.15 },
    TEXT,
    "el aviso «Clic en dos puntos para medir» flotando sobre el lienzo (viewport-hints.tsx)",
  ],
  [
    "--success-ink",
    { over: "--success", on: "--card", alpha: 0.15 },
    TEXT,
    "el pin de un comentario resuelto en la revisión (ReviewPlanView.tsx / CollabThreadPanel.tsx)",
  ],
  [
    "--primary-ink",
    { over: "--accent", on: "--surface", alpha: 0.15 },
    TEXT,
    "el botón «Pick point en región» del panel de sombreados (CadHatchPalette.tsx)",
  ],
  [
    "--accent-foreground",
    "--accent",
    TEXT,
    "el botón de campo del estudio en su estado activo (field-controls.tsx, antes #0e7490 suelto)",
  ],
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

/**
 * `bgToken` es casi siempre un string (`--card`). Cuando el fondo REAL en
 * pantalla es una tinta compuesta —`bg-warning/15` sobre la superficie que
 * hay debajo, no `--warning` a plena opacidad— es un objeto
 * `{ over, on, alpha }` y aquí se compone antes de medir. Sin esto, el gate
 * seguiría midiendo `--warning` sólido, que nunca es el píxel que ve el ojo.
 */
function resolveBackground(tokens, bgToken) {
  if (typeof bgToken === "string") return resolveToken(tokens, bgToken);
  const base = resolveToken(tokens, bgToken.on);
  const overlay = resolveToken(tokens, bgToken.over);
  return composite(overlay, base, bgToken.alpha);
}

function describeBg(bgToken) {
  return typeof bgToken === "string"
    ? bgToken
    : `${bgToken.over} a ${bgToken.alpha} sobre ${bgToken.on}`;
}

const markdown = process.argv.includes("--markdown");
const failures = [];
const rows = [];

for (const [themeName, tokens] of themes) {
  for (const [inkToken, bgToken, minimum, what, alpha] of PAIRS) {
    let ratio;
    try {
      const fondo = resolveBackground(tokens, bgToken);
      const tinta = resolveToken(tokens, inkToken);
      // Con alfa se mide el color COMPUESTO sobre su fondo, que es el que
      // llega al ojo; sin alfa, la tinta tal cual.
      ratio = contrastRatio(
        alpha === undefined ? tinta : composite(tinta, fondo, alpha),
        fondo,
      );
    } catch (error) {
      failures.push(`[${themeName}] ${inkToken} sobre ${describeBg(bgToken)}: ${error.message}`);
      continue;
    }
    rows.push({ themeName, inkToken, bgToken: describeBg(bgToken), minimum, what, ratio, alpha });
    if (ratio + 1e-9 < minimum) {
      failures.push(
        `[${themeName}] ${what}: ${inkToken}${alpha === undefined ? "" : ` a opacidad ${alpha}`} sobre ${describeBg(bgToken)} mide ` +
          `${formatRatio(ratio)}:1 y el mínimo es ${formatRatio(minimum)}:1`,
      );
    }
  }
}

/**
 * T-13, LA MITAD QUE NO ES CSS: la tinta por defecto del DIBUJO —ACI 7
 * (blanco, capa "0"/BYLAYER) y el color de reserva del renderizador cuando la
 * entidad no declara nada— contra los CUATRO presets reales de `THEMES`
 * (`components/cad/studio/editor-presentation.ts`). Nada de esto vive en
 * `globals.css`: son literales `.ts`, y hasta esta ampliación este gate no
 * los leía. `legibleDefaultInk` (`lib/cad/render/render-style.ts`) es la
 * corrección; aquí se reimplementa la MISMA aritmética (no hay un runtime
 * TS disponible para este script en `node` puro) para comprobar, contra los
 * literales reales del código, que el arreglo cubre los cuatro presets.
 */
const themeTs = readFileSync(THEME_TS_PATH, "utf8");
const THEME_PATTERN = /(\w+):\s*\{\s*bg:\s*(0x[0-9a-fA-F]{6})[\s\S]*?label:\s*"([^"]+)"/g;
const presets = [...themeTs.matchAll(THEME_PATTERN)].map((m) => ({
  key: m[1],
  bg: Number.parseInt(m[2], 16),
  label: m[3],
}));
if (presets.length < 4) {
  failures.push(
    `Sólo se leyeron ${presets.length} preset(s) de THEMES en ${THEME_TS_PATH} (se esperaban 4: ` +
      "dark/light/night/studio). El patrón de este gate no reconoce el formato del fichero.",
  );
}

const aciTs = readFileSync(ACI_PALETTE_TS_PATH, "utf8");
const aci7Match = /\b7:\s*\[(\d+),\s*(\d+),\s*(\d+)\]/.exec(aciTs);
if (!aci7Match) failures.push(`No se pudo leer el RGB de ACI 7 en ${ACI_PALETTE_TS_PATH}.`);
const [aci7R, aci7G, aci7B] = aci7Match ? aci7Match.slice(1, 4).map(Number) : [255, 255, 255];
const aci7Packed = (aci7R << 16) | (aci7G << 8) | aci7B;

const renderStyleTs = readFileSync(RENDER_STYLE_TS_PATH, "utf8");
const defaultColorMatch = /CAD_RENDER_DEFAULT_COLOR\s*=\s*(0x[0-9a-fA-F]{6})/.exec(renderStyleTs);
if (!defaultColorMatch)
  failures.push(`No se pudo leer CAD_RENDER_DEFAULT_COLOR en ${RENDER_STYLE_TS_PATH}.`);
const defaultInkPacked = defaultColorMatch ? Number.parseInt(defaultColorMatch[1], 16) : 0x60a5fa;
if (!/function legibleDefaultInk(?![A-Za-z0-9_])/.test(renderStyleTs)) {
  failures.push(
    `${RENDER_STYLE_TS_PATH} ya no declara legibleDefaultInk: este bloque del gate reimplementa ` +
      "su aritmética y se quedaría midiendo una función que ya no existe.",
  );
}

function packedLuminance(rgb) {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((rgb >> 16) & 0xff) +
    0.7152 * channel((rgb >> 8) & 0xff) +
    0.0722 * channel(rgb & 0xff)
  );
}
function packedContrast(a, b) {
  const la = packedLuminance(a);
  const lb = packedLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
/** La misma regla que `legibleDefaultInk` en `render-style.ts`. */
function legibleDefaultInk(color, backgroundColor) {
  if (color !== aci7Packed && color !== defaultInkPacked) return color;
  if (packedContrast(color, backgroundColor) >= GRAPHIC) return color;
  const white = packedContrast(0xffffff, backgroundColor);
  const black = packedContrast(0x000000, backgroundColor);
  return white >= black ? 0xffffff : 0x000000;
}

for (const preset of presets) {
  for (const [label, ink] of [
    ['tinta por defecto (ACI 7, capa "0")', aci7Packed],
    ["color de reserva del renderizador", defaultInkPacked],
  ]) {
    const fixed = legibleDefaultInk(ink, preset.bg);
    const ratio = packedContrast(fixed, preset.bg);
    rows.push({
      themeName: `lienzo · ${preset.label}`,
      inkToken: label,
      bgToken: `THEMES.${preset.key}.bg`,
      minimum: GRAPHIC,
      what: `${label} sobre el preset «${preset.label}» del lienzo`,
      ratio,
    });
    if (ratio + 1e-9 < GRAPHIC) {
      failures.push(
        `[lienzo · ${preset.label}] ${label} mide ${formatRatio(ratio)}:1 tras aplicar ` +
          `legibleDefaultInk (render-style.ts), y el mínimo gráfico es ${formatRatio(GRAPHIC)}:1. ` +
          "La corrección se hace en legibleDefaultInk, nunca bajando este mínimo.",
      );
    }
  }
}

if (markdown) {
  console.log("| Tema | Qué es en pantalla | Tinta | Fondo | Medido | Mínimo |");
  console.log("| --- | --- | --- | --- | ---: | ---: |");
  for (const row of rows) {
    console.log(
      `| ${row.themeName} | ${row.what} | \`${row.inkToken}\`${row.alpha === undefined ? "" : ` @${row.alpha}`} | \`${row.bgToken}\` | ` +
        `${formatRatio(row.ratio)}:1 | ${formatRatio(row.minimum)}:1 |`,
    );
  }
  console.log("");
}

if (failures.length > 0) {
  console.error("Gate de contraste: FALLÓ");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error(
    "\nUn par de globals.css se corrige moviendo el TOKEN, nunca poniendo un color suelto en " +
      "el componente que falla. Un preset del lienzo o la tinta por defecto del dibujo se " +
      "corrige en legibleDefaultInk (lib/cad/render/render-style.ts), nunca bajando el mínimo.",
  );
  process.exit(1);
}

const worst = rows.reduce((a, b) => (a.ratio <= b.ratio ? a : b));
console.log(
  `Gate de contraste OK: ${rows.length} pares medidos (${PAIRS.length} por tema × ` +
    `${themes.length} temas, más ${presets.length * 2} de tinta del dibujo contra los ` +
    `presets del lienzo). El par más ajustado es «${worst.what}» en ` +
    `${worst.themeName}: ${formatRatio(worst.ratio)}:1 sobre un mínimo de ` +
    `${formatRatio(worst.minimum)}:1.`,
);
