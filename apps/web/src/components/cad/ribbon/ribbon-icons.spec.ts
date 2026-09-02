/**
 * Cada panel de la cinta tiene icono, y cada icono nombra un panel que existe.
 *
 * Antes un panel sin entrada caía en silencio a `Command` (el icono genérico):
 * renombrar un panel en `ribbon.ts` sin tocar este mapa no avisaba a nadie. Y
 * al revés, una clave de un panel que ya no existe («Capas y propiedades»,
 * «Herramientas» con 31 comandos) era un cadáver que nadie recogía.
 */
import { strict as assert } from "node:assert";
import { CAD_RIBBON_DATA, CAD_RIBBON_FALLBACK_PANEL } from "../../../lib/cad/ribbon";
import { CAD_RIBBON_PANEL_ICONS } from "./ribbon-icons";

const labels = new Set<string>();
for (const tab of CAD_RIBBON_DATA) for (const panel of tab.panels) labels.add(panel.label);
// Los paneles de reposo pueden no estar montados hoy (Herramientas está vacío)
// y aun así necesitan icono para el día en que un comando nuevo caiga ahí.
const admitted = new Set([...labels, ...Object.values(CAD_RIBBON_FALLBACK_PANEL)]);

for (const label of labels) {
  assert.ok(label in CAD_RIBBON_PANEL_ICONS, `el panel «${label}» no tiene icono declarado`);
}
for (const key of Object.keys(CAD_RIBBON_PANEL_ICONS)) {
  assert.ok(admitted.has(key), `el icono «${key}» nombra un panel que ya no existe en la cinta`);
}

console.log(`ribbon-icons: ${labels.size} paneles con icono, ${Object.keys(CAD_RIBBON_PANEL_ICONS).length} claves sin cadáveres`);
