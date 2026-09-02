#!/usr/bin/env node
/**
 * Regenera `src/lib/cad/templates-catalog.ts` — lo que la paleta necesita
 * saber de cada plantilla SIN cargar su cuerpo.
 *
 * Por qué existe. `lib/cad/templates.ts` son 4.900 líneas de datos (149
 * plantillas con sus activos, notas y conectores). La tarjeta «Plantillas CAD»
 * del panel de equipamiento sólo muestra etiqueta, grupo, descripción y número
 * de objetos, pero al importar el módulo entero se llevaba el cuerpo de las
 * 149 al primer chunk que abre el estudio: medido el 2026-09-02 con source
 * maps sobre el build de producción, 306 KB de los 4.313 KB que descargaba el
 * estudio al abrir un plano, con un techo de 3.980 KB en
 * `frontend-load-baseline.json`. El cuerpo se sigue cargando con `import()`
 * en el momento de APLICAR la plantilla, que es cuando hace falta.
 *
 * El catálogo NO se escribe a mano: se regenera con este script y
 * `templates-catalog.spec.ts` falla si se separa de `templates.ts`.
 *
 * Uso:
 *   npx tsx scripts/templates-catalog.mts            # imprime el archivo
 *   npx tsx scripts/templates-catalog.mts --write    # lo escribe
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { CAD_LAYOUT_TEMPLATES } from "../src/lib/cad/templates";
import { cadLayoutTemplateSummary } from "../src/lib/cad/templates-summary";

const catalogPath = path.resolve(import.meta.dirname, "../src/lib/cad/templates-catalog.ts");

const rows = CAD_LAYOUT_TEMPLATES.map((template) => `  ${JSON.stringify(cadLayoutTemplateSummary(template))},`);
const source = `/**
 * GENERADO por \`scripts/templates-catalog.mts\` — no se edita a mano.
 *
 * Lo que la paleta muestra de cada plantilla sin cargar su cuerpo: el cuerpo
 * (activos, notas y conectores de \`templates.ts\`, 306 KB en el bundle) se
 * carga con \`import()\` al aplicar la plantilla. \`templates-catalog.spec.ts\`
 * falla si este archivo se separa de \`templates.ts\`; se regenera con
 * \`npx tsx scripts/templates-catalog.mts --write\`.
 */
import type { CadLayoutTemplateSummary } from "./templates-summary";

export const CAD_LAYOUT_TEMPLATE_CATALOG: readonly CadLayoutTemplateSummary[] = [
${rows.join("\n")}
];
`;

if (process.argv.includes("--write")) {
  writeFileSync(catalogPath, source, "utf8");
  process.stderr.write(`\nEscrito ${catalogPath} (${CAD_LAYOUT_TEMPLATES.length} plantillas)\n`);
} else {
  process.stdout.write(source);
}
