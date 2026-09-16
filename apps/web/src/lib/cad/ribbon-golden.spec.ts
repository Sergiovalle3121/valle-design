/**
 * El golden 61 (cinta sólo con ratón) pulsa botones por pestaña, y sólo la
 * pestaña ACTIVA está en el DOM (`components/ui/Tabs.tsx` devuelve null para
 * las demás). Mover un comando de pestaña sin tocar el golden es un timeout de
 * Playwright que no se distingue de la fixture agotada; esta lectura estática
 * lo dice por su nombre, sin navegador: recorre el golden manteniendo la
 * pestaña activa y comprueba que cada `ribbonCommand(page, 'X')` vive ahí —
 * y que está A LA VISTA en el plan de 1280 px (el viewport del golden), no
 * dentro de un desplegable que el golden no abre.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CAD_RIBBON_DATA, type CadRibbonTabId } from "./ribbon";
import { cadRibbonVisibleNames, planCadRibbonLayout } from "./ribbon-layout";

const golden = readFileSync(
  resolve(process.cwd(), "e2e/golden/61-cad-ribbon-mouse-only.spec.ts"),
  "utf8",
);
let active: CadRibbonTabId = "inicio";
let vigilados = 0;
golden.split("\n").forEach((line, index) => {
  const tab = /selectRibbonTab\(page, '([a-z]+)'\)/.exec(line);
  if (tab) active = tab[1] as CadRibbonTabId;
  const click = /ribbonCommand\(page, '([A-Z-]+)'\)/.exec(line);
  if (!click) return;
  const mounted = CAD_RIBBON_DATA.find((entry) => entry.id === active)?.panels.some((panel) =>
    panel.commands.some((command) => command.name === click[1]),
  );
  const home = CAD_RIBBON_DATA.find((entry) => entry.panels.some((panel) => panel.commands.some((command) => command.name === click[1])))?.id;
  assert.ok(mounted, `golden 61 l.${index + 1}: ${click[1]} no está montado en la pestaña «${active}» (vive en ${home ?? "ninguna"})`);
  const tabData = CAD_RIBBON_DATA.find((entry) => entry.id === active)!;
  // La tira lleva `px-1`: a 1280 px de ventana quedan 1272 para los paneles.
  const visible = cadRibbonVisibleNames(tabData, planCadRibbonLayout(tabData, 1272));
  assert.ok(visible.has(click[1]), `golden 61 l.${index + 1}: ${click[1]} está en «${active}» pero a 1280 px sólo se llega abriendo un desplegable`);
  vigilados += 1;
});
assert.ok(vigilados >= 4, `el golden 61 pulsa al menos cuatro botones de la cinta (vigilados: ${vigilados})`);
console.log(`ribbon-golden: ${vigilados} clics del golden 61 caen en la pestaña que está montada`);
