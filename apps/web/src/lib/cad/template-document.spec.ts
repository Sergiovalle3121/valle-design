/**
 * Las 149 plantillas del catálogo → documento CAD válido → render con trazos.
 *
 * Este spec es el gate de la galería pública: si una plantilla nueva entra al
 * catálogo con una capa que el documento de arranque no declara, o si un
 * cambio del motor deja un render vacío, falla AQUÍ con el id de la plantilla
 * en la mano — no en producción con una tarjeta en blanco.
 */
import { strict as assert } from "node:assert";
import { CAD_LAYOUT_TEMPLATES } from "./templates";
import { buildCadTemplateDocument } from "./template-document";
import { renderCadTemplateSvg } from "./template-render";

let built = 0;
let strokesMin = Number.POSITIVE_INFINITY;
const conAvisos: string[] = [];

for (const template of CAD_LAYOUT_TEMPLATES) {
  const result = buildCadTemplateDocument(template.id);
  const { document } = result;

  // Documento coherente: toda entidad en capa declarada, estilo declarado.
  const layers = new Set(document.layers.map((layer) => layer.id));
  for (const entity of document.entities) {
    const layer = "layer" in entity ? entity.layer : undefined;
    assert.ok(
      layer && layers.has(layer),
      `${template.id}: la entidad ${entity.id} usa la capa «${layer}» que el documento no declara`,
    );
    if (entity.type === "text" && entity.style) {
      assert.ok(
        document.styles.text?.[entity.style],
        `${template.id}: el texto ${entity.id} usa el estilo «${entity.style}» no declarado`,
      );
    }
  }
  assert.ok(
    document.entities.length >= 3,
    `${template.id}: una plantilla con ${document.entities.length} entidades no es un arranque`,
  );
  assert.equal(
    document.modelSpace.entityIds.length,
    document.entities.length,
    `${template.id}: el orden de dibujo no cubre todas las entidades`,
  );

  // Determinismo: el manifiesto de la galería depende de que el hash sea
  // estable entre dos corridas con el mismo motor.
  const again = buildCadTemplateDocument(template.id);
  assert.equal(
    JSON.stringify(again.document),
    JSON.stringify(document),
    `${template.id}: dos construcciones dan documentos distintos (hay azar o reloj)`,
  );

  // El render de la galería: trazos reales en ambos temas.
  for (const theme of ["dark", "light"] as const) {
    const render = renderCadTemplateSvg(result, { theme });
    assert.ok(
      render.strokes >= 3,
      `${template.id} (${theme}): el render salió con ${render.strokes} trazos — tarjeta vacía`,
    );
    assert.ok(
      render.svg.includes("ESC 1:"),
      `${template.id} (${theme}): el cajetín perdió la escala`,
    );
    strokesMin = Math.min(strokesMin, render.strokes);
  }

  if (result.warnings.length > 0) {
    conAvisos.push(`${template.id}: ${result.warnings.join(" · ")}`);
  }
  built += 1;
}

// La instanciación a tamaño base no debe reescalar ni avisar: si avisa, la
// plantilla del catálogo está mal medida y hay que arreglarla ALLÍ.
assert.deepEqual(
  conAvisos,
  [],
  `Plantillas con avisos de instanciación:\n${conAvisos.join("\n")}`,
);

console.log(
  `template-document OK: ${built} plantillas → documento válido y render con trazos (mínimo ${strokesMin} trazos por render, 2 temas).`,
);
