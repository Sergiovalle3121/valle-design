/**
 * La capa comercial de la galería no puede desincronizarse del catálogo:
 * cada plantilla tiene giro, cada destacada existe y no hay dos del mismo
 * giro en la portada. Si el catálogo crece y una plantilla cae en «planos
 * técnicos» sin ser técnica, este spec lo enseña en el conteo por giro.
 */
import { strict as assert } from "node:assert";
import { CAD_LAYOUT_TEMPLATES } from "../cad/templates";
import {
  FEATURED_TEMPLATE_IDS,
  TEMPLATE_GIROS,
  galleryTemplate,
  galleryTemplates,
  templateSeoDescription,
  templateSeoTitle,
} from "./template-gallery";

const all = galleryTemplates();
assert.equal(all.length, CAD_LAYOUT_TEMPLATES.length, "la galería cubre el catálogo entero");

const validGiros = new Set(TEMPLATE_GIROS.map((giro) => giro.id));
const byGiro = new Map<string, number>();
for (const template of all) {
  assert.ok(validGiros.has(template.giro), `${template.id}: giro inválido ${template.giro}`);
  byGiro.set(template.giro, (byGiro.get(template.giro) ?? 0) + 1);
  const title = templateSeoTitle(template);
  assert.ok(title.length <= 90, `${template.id}: título SEO de ${title.length} chars`);
  assert.ok(
    templateSeoDescription(template).includes("editables"),
    `${template.id}: la descripción perdió los datos duros`,
  );
}

// Todos los giros anunciados en los filtros tienen al menos una plantilla:
// un filtro que devuelve cero resultados es un anaquel vacío en el escaparate.
for (const giro of TEMPLATE_GIROS) {
  assert.ok(
    (byGiro.get(giro.id) ?? 0) > 0,
    `el giro «${giro.label}» no tiene ninguna plantilla — filtro vacío`,
  );
}

const featuredGiros = new Set<string>();
for (const id of FEATURED_TEMPLATE_IDS) {
  const template = galleryTemplate(id);
  assert.ok(template, `destacada «${id}» no existe en el catálogo`);
  assert.ok(
    !featuredGiros.has(template.giro),
    `dos destacadas del mismo giro (${template.giro}): la portada debe enseñar variedad`,
  );
  featuredGiros.add(template.giro);
}

const counts = [...byGiro.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([giro, count]) => `${giro}:${count}`)
  .join(" ");
console.log(`template-gallery OK: ${all.length} plantillas clasificadas · ${counts}`);
