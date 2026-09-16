/**
 * El botón de la cinta, renderizado: rótulo en español en el botón; nombre,
 * alias y descripción en el tooltip; dos tamaños según `command.primary`.
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
import { CadRibbonButton, cadRibbonButtonTitle } from "./CadRibbonButton";

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
// El tooltip trae las tres líneas: rótulo · NOMBRE (alias) · descripción.
ok(html.includes('role="tooltip"'), "hay tooltip");
ok(html.includes("LINE (L)"), "el tooltip dice el nombre canónico con su alias");
ok(html.includes(line.summary), "el tooltip dice la descripción");
ok(html.includes(`title="${cadRibbonButtonTitle(line)}"`), "el title nativo trae rótulo · NOMBRE (alias) — descripción");
ok(cadRibbonButtonTitle(line) === `Línea · LINE (L) — ${line.summary}`, "formato del title nativo");
ok(!/bg-primary|bg-brand/.test(html), "sin relleno --primary/brand en el botón: relleno y tinta son tokens distintos");
ok(html.includes("focus-visible:ring-ring"), "anillo de foco del sistema");

const small = renderToStaticMarkup(createElement(CadRibbonButton, { command: xline, onRun: () => undefined }));
ok(small.includes('data-size="small"'), "un no primario se pinta pequeño por defecto");
ok(!small.includes("data-primary"), "un no primario no lleva data-primary");
ok(small.includes("h-4 w-4"), "el icono pequeño mide 16 px");
ok(small.includes("h-5 w-28"), "el botón pequeño mide 7 rem × 20 px (CAD_RIBBON_METRICS.small)");

const menu = renderToStaticMarkup(
  createElement(CadRibbonButton, { command: xline, onRun: () => undefined, size: "menu" }),
);
ok(menu.includes('data-size="menu"'), "el desplegable pide el tamaño de menú");

const disabled = renderToStaticMarkup(
  createElement(CadRibbonButton, { command: line, onRun: () => undefined, disabled: true }),
);
ok(/<button[^>]*\sdisabled/.test(disabled) && disabled.includes("disabled:opacity-40"), "deshabilitado: atributo y señal visual");

console.log(`CadRibbonButton: ${checks}/${checks} comprobaciones verdes`);
