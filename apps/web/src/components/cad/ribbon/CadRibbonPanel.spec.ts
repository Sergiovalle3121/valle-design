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

console.log(`CadRibbonPanel: ${checks}/${checks} comprobaciones verdes`);
