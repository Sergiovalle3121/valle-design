/**
 * El botón de la cinta, renderizado: rótulo en español en el botón; nombre,
 * alias y descripción en el tooltip (que se abre en un portal, fuera de la
 * tira que lo recortaba); dos tamaños según `command.primary`.
 *
 * Se renderiza con `renderToStaticMarkup` sobre comandos REALES de
 * `CAD_RIBBON_DATA` (los iconos están indexados por nombre y un comando
 * inventado reventaría el render), y se afirma sobre el marcado, no sobre el
 * texto fuente.
 *
 * Correr: npx tsx src/components/cad/ribbon/CadRibbonButton.spec.ts
 */
import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { findCadRibbonCommand } from "@/lib/cad/ribbon";
import {
  CAD_RIBBON_DENSE_METRICS,
  CAD_RIBBON_METRICS,
  cadRibbonLabelWidth,
  cadRibbonSmallWidth,
} from "@/lib/cad/ribbon-layout";
import { CadActiveCommandContext } from "./active-command";
import { CadRibbonButton, cadRibbonButtonTitle, cadRibbonButtonTooltip } from "./CadRibbonButton";
import { CadRibbonTooltipCard } from "./CadRibbonTooltip";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const line = findCadRibbonCommand("LINE")!;
const xline = findCadRibbonCommand("XLINE")!;
assert.ok(line.primary && !xline.primary, "LINE es grande y XLINE pequeño: el par que distingue los tamaños");

const html = renderToStaticMarkup(createElement(CadRibbonButton, { command: line, onRun: () => undefined }));

ok(html.includes('data-testid="cad-ribbon-command-LINE"'), "el testid sigue siendo cad-ribbon-command-<NOMBRE>");
ok(html.includes('data-primary="true"'), "un primario lleva data-primary");
ok(html.includes('data-size="large"'), "un primario se pinta grande por defecto");
ok(html.includes("h-6 w-6"), "el icono grande mide 24 px");
ok(html.includes(">Línea<"), "el botón pinta el rótulo en español, no LINE");
// El tooltip ya NO cuelga del botón: dentro de la tira de paneles
// (`overflow-x-auto`, que fuerza `overflow-y`) quedaba recortado y no se veía
// nunca. Se monta al pasar el ratón, en un portal a <body> (`CadRibbonTooltip`).
ok(!html.includes('role="tooltip"'), "el tooltip no se pinta dentro de la cinta, donde la tira lo recortaba");
ok(html.includes("data-cad-ribbon-tooltip"), "el botón va envuelto en el disparador de su tooltip");
// La tarjeta que se monta trae las tres líneas: rótulo · NOMBRE (alias) · descripción.
const tip = renderToStaticMarkup(createElement(CadRibbonTooltipCard, cadRibbonButtonTooltip(line)));
ok(tip.includes('role="tooltip"'), "hay tooltip");
ok(tip.includes(">Línea<"), "el tooltip dice el rótulo en español");
ok(tip.includes("LINE (L)"), "el tooltip dice el nombre canónico con su alias");
ok(tip.includes(line.summary), "el tooltip dice la descripción");
ok(
  /\bfixed\b/.test(tip) && tip.includes("pointer-events-none") && tip.includes("z-[90]") && tip.includes("invisible"),
  "la tarjeta es fixed (la coloca ribbon-floating al montarla), no roba clics y queda sobre los desplegables",
);
ok(html.includes(`title="${cadRibbonButtonTitle(line)}"`), "el title nativo trae rótulo · NOMBRE (alias) — descripción");
ok(cadRibbonButtonTitle(line) === `Línea · LINE (L) — ${line.summary}`, "formato del title nativo");
ok(!/bg-primary|bg-brand/.test(html), "sin relleno --primary/brand en el botón: relleno y tinta son tokens distintos");
ok(html.includes("focus-visible:ring-ring"), "anillo de foco del sistema");

const small = renderToStaticMarkup(createElement(CadRibbonButton, { command: xline, onRun: () => undefined }));
ok(small.includes('data-size="small"'), "un no primario se pinta pequeño por defecto");
ok(!small.includes("data-primary"), "un no primario no lleva data-primary");
ok(small.includes("h-4 w-4"), "el icono pequeño mide 16 px");
// El ancho del botón pequeño ya no es una clase fija (`w-28`): lo calcula
// `cadRibbonSmallWidth` —el MISMO número que usa el plan de columnas— y se
// declara por `style`, para que el rótulo completo mande sobre el mínimo y
// nunca haya elipsis (golden 214 lo mide en un navegador real).
const smallWidth = cadRibbonSmallWidth(xline, false);
ok(small.includes("h-5"), "el botón pequeño mide 20 px de alto");
ok(
  small.includes(`style="width:${smallWidth}px"`),
  `el botón pequeño declara por style el ancho que calcula el plan de columnas (${smallWidth} px)`,
);
ok(smallWidth >= CAD_RIBBON_METRICS.small, `ese ancho nunca baja del mínimo disperso (${CAD_RIBBON_METRICS.small} px)`);
ok(
  smallWidth >= cadRibbonLabelWidth(xline.label) + 34,
  "y nunca baja de lo que mide el rótulo completo más icono y relleno: sin elipsis en disperso",
);
ok(!/w-(20|28)/.test(small), "sin ancho fijo w-20/w-28: el ancho lo decide el rótulo, no una clase");
ok(small.includes("px-1"), "disperso: relleno horizontal de 4 px");
ok(small.includes('aria-label="XLINE"'.replace("XLINE", xline.label)), "el nombre accesible es el rótulo en español, con o sin escalón denso");

// ── Ola 6 «cinta legible»: el botón pequeño DENSO recupera el rótulo —
// más angosto (5 rem) que el disperso (7 rem), con el texto recortado por
// `truncate` si no cabe, pero SIEMPRE pintado junto al icono. El nombre
// accesible y el title no cambian con `dense`: `getByRole('button', { name:
// 'Línea' })` sigue resolviendo igual, con o sin recorte visual.
{
  const line2 = findCadRibbonCommand("LINE")!; // grande: dense no debe afectarle.
  const denseLarge = renderToStaticMarkup(createElement(CadRibbonButton, { command: line2, onRun: () => undefined, dense: true }));
  ok(denseLarge.includes(">Línea<"), "dense no afecta a un botón grande: conserva su rótulo visible");

  const denseSmall = renderToStaticMarkup(
    createElement(CadRibbonButton, { command: xline, onRun: () => undefined, dense: true }),
  );
  ok(denseSmall.includes('data-dense="true"'), "el botón pequeño denso se marca en el DOM");
  ok(
    denseSmall.includes(`>${xline.label}<`),
    "denso: el rótulo SIGUE pintado a la vista (Ola 6 «cinta legible»: antes, Ola 1, desaparecía)",
  );
  ok(denseSmall.includes("truncate"), "denso: el rótulo se recorta con puntos suspensivos si no cabe, no envuelve ni desborda");
  ok(denseSmall.includes(`aria-label="${xline.label}"`), "denso: el nombre accesible sigue siendo el rótulo en español");
  ok(
    denseSmall.includes(`title="${cadRibbonButtonTitle(xline)}"`),
    "denso: el title nativo sigue trayendo rótulo · NOMBRE (alias) — descripción, con el nombre COMPLETO aunque el rótulo se recorte",
  );
  const denseWidth = cadRibbonSmallWidth(xline, true);
  ok(
    denseSmall.includes(`style="width:${denseWidth}px"`),
    `denso: declara por style el ancho denso que calcula el plan de columnas (${denseWidth} px)`,
  );
  ok(denseWidth >= CAD_RIBBON_DENSE_METRICS.small, `denso: nunca baja de ${CAD_RIBBON_DENSE_METRICS.small} px`);
  ok(denseWidth <= smallWidth, "denso: nunca es más ancho que el disperso");
  ok(denseSmall.includes("px-0.5"), "denso: relleno horizontal de 2 px, frente a los 4 px del disperso");
  ok(!/w-(20|28)/.test(denseSmall), "denso: sin ancho fijo; ya no mide 5 rem ni 7 rem por clase");

  const notDense = renderToStaticMarkup(
    createElement(CadRibbonButton, { command: xline, onRun: () => undefined, dense: false }),
  );
  ok(notDense.includes(`>${xline.label}<`), "sin denso (por defecto): el rótulo pequeño sigue a la vista, como siempre");
}

const menu = renderToStaticMarkup(
  createElement(CadRibbonButton, { command: xline, onRun: () => undefined, size: "menu" }),
);
ok(menu.includes('data-size="menu"'), "el desplegable pide el tamaño de menú");

const disabled = renderToStaticMarkup(
  createElement(CadRibbonButton, { command: line, onRun: () => undefined, disabled: true }),
);
ok(/<button[^>]*\sdisabled/.test(disabled) && disabled.includes("disabled:opacity-40"), "deshabilitado: atributo y señal visual");

// ── ENCENDIDO mientras el comando corre ──────────────────────────────────────
//
// El defecto: el único realce del botón era `:hover`, y el ratón se va al
// lienzo en cuanto empiezas a dibujar. La cinta abría el comando y no lo
// decía en ninguna parte — de ahí «el ribbon sólo está de adorno».
{
  const encendido = renderToStaticMarkup(
    createElement(
      CadActiveCommandContext,
      { value: line.name },
      createElement(CadRibbonButton, { command: line, onRun: () => undefined }),
    ),
  );
  ok(encendido.includes('data-active="true"'), "el comando en curso se marca en el DOM");
  ok(encendido.includes('aria-pressed="true"'), "y se ANUNCIA como presionado");
  ok(
    encendido.includes("bg-brand-strong"),
    "y se VE encendido, con el mismo relleno de marca que el riel de paletas",
  );

  // Otro comando abierto no enciende a éste.
  const ajeno = renderToStaticMarkup(
    createElement(
      CadActiveCommandContext,
      { value: "CIRCLE" },
      createElement(CadRibbonButton, { command: line, onRun: () => undefined }),
    ),
  );
  ok(!ajeno.includes("data-active"), "con otro comando abierto, LINE no se enciende");
  ok(
    !ajeno.includes("aria-pressed"),
    "y sin encender NO lleva aria-pressed: un comando no es un conmutador, y anunciarlos todos como si lo fueran sería peor que callar",
  );

  // En reposo tampoco.
  const reposo = renderToStaticMarkup(
    createElement(CadRibbonButton, { command: line, onRun: () => undefined }),
  );
  ok(!reposo.includes("data-active"), "en reposo ningún botón está encendido");
}

console.log(`CadRibbonButton: ${checks}/${checks} comprobaciones verdes`);
