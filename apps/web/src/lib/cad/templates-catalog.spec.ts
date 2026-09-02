/**
 * El catálogo generado no se separa de las plantillas. npx tsx src/lib/cad/templates-catalog.spec.ts
 *
 *   - `templates-catalog.ts` es exactamente la ficha de cada plantilla de
 *     `templates.ts`, en el mismo orden: si alguien añade, renombra o quita
 *     una plantilla sin regenerar, esto falla y dice cuál.
 *   - El módulo del catálogo NO importa `templates.ts` en tiempo de ejecución
 *     (sólo tipos): es la razón de que exista, medida en 306 KB del primer
 *     chunk del estudio el 2026-09-02.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CAD_LAYOUT_TEMPLATE_CATALOG } from "./templates-catalog";
import { CAD_LAYOUT_TEMPLATES } from "./templates";
import { cadLayoutTemplateSummary } from "./templates-summary";

let checks = 0;

const esperado = CAD_LAYOUT_TEMPLATES.map(cadLayoutTemplateSummary);
assert.equal(CAD_LAYOUT_TEMPLATE_CATALOG.length, esperado.length, "el catálogo tiene una ficha por plantilla");
checks += 1;
for (let index = 0; index < esperado.length; index += 1) {
  assert.deepEqual(
    CAD_LAYOUT_TEMPLATE_CATALOG[index],
    esperado[index],
    `la ficha ${index} («${esperado[index].id}») difiere de templates.ts: regenera con npx tsx scripts/templates-catalog.mts --write`,
  );
  checks += 1;
}

const fuente = readFileSync(path.resolve(import.meta.dirname, "templates-catalog.ts"), "utf8");
const importsDeValor = fuente
  .split("\n")
  .filter((line) => /^import\s/u.test(line) && !/^import type\s/u.test(line));
assert.deepEqual(importsDeValor, [], "el catálogo sólo importa tipos: un import de valor devolvería el cuerpo de las plantillas al primer chunk");
checks += 1;
assert.equal(new Set(CAD_LAYOUT_TEMPLATE_CATALOG.map((row) => row.id)).size, CAD_LAYOUT_TEMPLATE_CATALOG.length, "sin ids repetidos");
checks += 1;

console.log(`✅ templates-catalog.spec: ${checks} comprobaciones (${CAD_LAYOUT_TEMPLATE_CATALOG.length} plantillas)`);
