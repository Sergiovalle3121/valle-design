/**
 * T-73(f): el panel de la cinta no tenía `role` ni `aria-label` — un lector
 * de pantalla anunciaba "grupo" (o nada) sin decir "Dibujo" o "Modificar" al
 * entrar. `aria-labelledby` enlaza el `role="group"` con el rótulo visible
 * que ya se pintaba, sin duplicar texto.
 *
 * Usa un panel REAL de `CAD_RIBBON_DATA`, no uno inventado: los iconos de la
 * cinta están indexados por nombre de comando (`command-icons.spec.ts` exige
 * cobertura total) y un comando inventado rendería `undefined` como
 * componente y reventaría el render.
 *
 * Correr: npx tsx src/components/cad/ribbon/CadRibbonPanel.spec.ts
 */
import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CAD_RIBBON_DATA } from "@/lib/cad/ribbon";
import { cadRibbonPanelNaturalColumns, cadRibbonPanelSplit } from "@/lib/cad/ribbon-layout";
import { CadRibbonPanel } from "./CadRibbonPanel";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const panel = CAD_RIBBON_DATA[0]?.panels[0];
assert.ok(panel, "hace falta al menos un panel real en CAD_RIBBON_DATA para probar esto");

const html = renderToStaticMarkup(
  createElement(CadRibbonPanel, { panel, onRun: () => undefined }),
);

ok(html.includes('role="group"'), "el panel se anuncia como grupo con nombre");
const labelId = `cad-ribbon-panel-label-${panel.label}`;
ok(html.includes(`aria-labelledby="${labelId}"`), "el grupo enlaza al rótulo por aria-labelledby");
ok(html.includes(`id="${labelId}"`), "el rótulo visible lleva el id que el aria-labelledby referencia");
ok(html.includes(panel.label), "el nombre del panel sigue pintándose (sin cambio visual)");

// ── La forma de AutoCAD: grandes primero, pequeños en tres filas, el resto
// en el desplegable (cerrado en reposo), y los tres estados del plan.
{
  const dibujo = CAD_RIBBON_DATA.find((tab) => tab.id === "inicio")!.panels[0];
  const order = (markup: string) =>
    [...markup.matchAll(/data-testid="cad-ribbon-command-([A-Z-]+)"/g)].map((match) => match[1]);
  const expanded = renderToStaticMarkup(
    createElement(CadRibbonPanel, { panel: dibujo, onRun: () => undefined, layout: { state: "expanded", columns: 2 } }),
  );
  ok(expanded.includes('data-layout="expanded"') && expanded.includes('data-columns="2"'), "el panel declara su estado");
  ok(expanded.includes("grid-rows-3"), "los pequeños van en columnas de tres filas");
  ok(expanded.includes("h-[3.75rem]"), "el cuerpo mide 3,75 rem fijos (tres filas de 20 px)");
  const visible = order(expanded);
  ok(visible.slice(0, 2).join(" ") === "LINE PLINE", `los grandes van primero: ${visible.slice(0, 2).join(" ")}`);
  ok(visible.length === 2 + 6, `dos grandes y seis pequeños a la vista con dos columnas (hay ${visible.length})`);
  ok(
    visible.join(" ") === dibujo.commands.slice(0, 8).map((command) => command.name).join(" "),
    "los visibles siguen el orden declarado de CAD_RIBBON_COMMAND_ORDER",
  );
  ok(expanded.includes('data-testid="cad-ribbon-panel-toggle-Dibujo"'), "hay un ▾ para lo que no cabe");
  ok(!expanded.includes("cad-ribbon-panel-flyout-"), "el desplegable no está montado hasta abrirlo");
  ok(!expanded.includes('data-testid="cad-ribbon-command-XLINE"'), "XLINE (noveno) espera en el desplegable");

  const reduced = renderToStaticMarkup(
    createElement(CadRibbonPanel, { panel: dibujo, onRun: () => undefined, layout: { state: "reduced", columns: 0 } }),
  );
  ok(order(reduced).join(" ") === "LINE PLINE", "reducido: sólo los botones grandes");

  const collapsed = renderToStaticMarkup(
    createElement(CadRibbonPanel, { panel: dibujo, onRun: () => undefined, layout: { state: "collapsed", columns: 0 } }),
  );
  ok(order(collapsed).length === 0, "plegado: ningún botón de comando en el DOM");
  ok(collapsed.includes('data-testid="cad-ribbon-panel-toggle-Dibujo"') && collapsed.includes('aria-expanded="false"'), "plegado: un botón con aria-expanded que abre el panel entero");
  ok(collapsed.includes(`id="${labelId}"`) && collapsed.includes('aria-labelledby="cad-ribbon-panel-label-Dibujo"'), "plegado: el grupo sigue nombrado por su rótulo");
  ok(collapsed.includes("w-[4.5rem]"), "plegado: el botón mide 4,5 rem (CAD_RIBBON_METRICS.collapsed)");
}

// ── El rótulo ABRE el panel, no lo pliega. Antes, pulsar «Dibujo» plegaba
// el panel a un botón y la cinta lo guardaba para siempre; en AutoCAD, la
// barra del rótulo abre el panel deslizante. Se renderiza con
// `onToggleCollapsed`, como lo monta `CadRibbon`.
{
  const dibujo = CAD_RIBBON_DATA.find((tab) => tab.id === "inicio")!.panels[0];
  const html = renderToStaticMarkup(
    createElement(CadRibbonPanel, {
      panel: dibujo,
      onRun: () => undefined,
      layout: { state: "expanded", columns: 1 },
      onToggleCollapsed: () => undefined,
    }),
  );
  const toggle = /<button[^>]*data-testid="cad-ribbon-panel-toggle-Dibujo"[^>]*>(.*?)<\/button>/.exec(html);
  ok(toggle !== null, "la barra del rótulo es el botón que abre el desplegable");
  ok(toggle![1].includes('id="cad-ribbon-panel-label-Dibujo"') && toggle![1].includes(">Dibujo<"), "el rótulo «Dibujo» está DENTRO del botón que abre: pulsarlo abre el panel");
  ok(/<button[^>]*data-testid="cad-ribbon-panel-toggle-Dibujo"[^>]*title="Mostrar todo el panel Dibujo"/.test(html), "y lo anuncia: «Mostrar todo el panel Dibujo»");
  ok(/data-testid="cad-ribbon-panel-toggle-Dibujo"[^>]*aria-expanded="false"|aria-expanded="false"[^>]*data-testid="cad-ribbon-panel-toggle-Dibujo"/.test(html), "cerrado en reposo, con aria-expanded");
  ok(!html.includes("cad-ribbon-panel-collapse-"), "en la cinta no hay nada que pliegue el panel de un clic: plegar se pide desde el desplegable");
  ok(!/Plegar el panel/.test(html), "ningún rótulo promete «Plegar el panel»");
  ok(/data-testid="cad-ribbon-panel-Dibujo"[^>]*data-layout="expanded"/.test(html), "el panel sigue desplegado según su plan de ancho");

  // Un panel que lo enseña todo no tiene desplegable: su rótulo es texto.
  const entero = CAD_RIBBON_DATA.flatMap((tab) => tab.panels).find(
    (candidate) =>
      cadRibbonPanelSplit(candidate, { state: "expanded", columns: cadRibbonPanelNaturalColumns(candidate) }).flyout.length === 0,
  );
  assert.ok(entero, "hace falta un panel real que quepa entero para probar esto");
  const htmlEntero = renderToStaticMarkup(
    createElement(CadRibbonPanel, { panel: entero, onRun: () => undefined, onToggleCollapsed: () => undefined }),
  );
  ok(
    !htmlEntero.includes("cad-ribbon-panel-toggle-") && !htmlEntero.includes("cad-ribbon-panel-collapse-") &&
      new RegExp(`<span id="cad-ribbon-panel-label-${entero.label}"`).test(htmlEntero),
    `«${entero.label}» cabe entero: su rótulo es texto, ni abre ni pliega`,
  );
}

console.log(`CadRibbonPanel: ${checks}/${checks} comprobaciones verdes`);
