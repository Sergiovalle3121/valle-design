/**
 * MANIFIESTO DE LA GALERÍA DE PLANTILLAS — el artefacto que delata la deriva.
 *
 * Los renders y las láminas de /plantillas se generan BAJO DEMANDA con el
 * motor desplegado, así que no pueden envejecer. Lo que sí puede pasar —y
 * debe quedar REGISTRADO, no silencioso— es que un cambio del motor altere lo
 * que se dibuja. Este script construye las plantillas del catálogo, hashea el
 * documento y el SVG de cada una y escribe el resultado en
 * `docs/cad/evidence/template-gallery.json`.
 *
 *   node --import tsx apps/web/scripts/template-gallery-evidence.mts           # regenera
 *   node --import tsx apps/web/scripts/template-gallery-evidence.mts --check   # gate de deriva
 *
 * `--check` falla si el manifiesto committeado no coincide con lo que el motor
 * produce HOY: quien cambie el trazado de un arco verá en rojo qué plantillas
 * cambian de dibujo, y regenerar el manifiesto es el acto de FIRMAR ese cambio
 * en el commit.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CAD_LAYOUT_TEMPLATES } from "../src/lib/cad/templates";
import { buildCadTemplateDocument } from "../src/lib/cad/template-document";
import { renderCadTemplateSvg } from "../src/lib/cad/template-render";
import { galleryTemplates } from "../src/lib/marketing/template-gallery";

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(here, "../../../docs/cad/evidence/template-gallery.json");

const sha = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 16);

function build() {
  const giroById = new Map(galleryTemplates().map((item) => [item.id, item.giro]));
  const rows = CAD_LAYOUT_TEMPLATES.map((template) => {
    const built = buildCadTemplateDocument(template.id);
    const dark = renderCadTemplateSvg(built, { theme: "dark" });
    const light = renderCadTemplateSvg(built, { theme: "light" });
    return {
      id: template.id,
      giro: giroById.get(template.id),
      escala: built.scaleDenominator,
      entidades: built.document.entities.length,
      trazos: dark.strokes,
      docHash: sha(JSON.stringify(built.document)),
      svgOscuro: sha(dark.svg),
      svgClaro: sha(light.svg),
    };
  });
  return {
    generado: "por apps/web/scripts/template-gallery-evidence.mts",
    plantillas: rows.length,
    totalEntidades: rows.reduce((sum, row) => sum + row.entidades, 0),
    filas: rows,
  };
}

const manifest = build();
const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

if (process.argv.includes("--check")) {
  let committed = "";
  try {
    committed = readFileSync(target, "utf8");
  } catch {
    console.error(`No existe ${target}: genera el manifiesto y committéalo.`);
    process.exit(1);
  }
  if (committed !== serialized) {
    const previous = JSON.parse(committed) as typeof manifest;
    const before = new Map(previous.filas.map((row) => [row.id, row]));
    const changed = manifest.filas.filter((row) => {
      const old = before.get(row.id);
      return !old || old.docHash !== row.docHash || old.svgOscuro !== row.svgOscuro;
    });
    console.error(
      `El manifiesto de la galería NO coincide con el motor actual: ` +
        `${changed.length} plantilla(s) cambiaron de dibujo` +
        (changed.length ? ` (${changed.slice(0, 5).map((row) => row.id).join(", ")}…)` : "") +
        `.\nSi el cambio es intencional, regenera y committea:` +
        `\n  node --import tsx apps/web/scripts/template-gallery-evidence.mts`,
    );
    process.exit(1);
  }
  console.log(
    `Manifiesto de galería OK: ${manifest.plantillas} plantillas, ` +
      `${manifest.totalEntidades} entidades, hashes al día.`,
  );
} else {
  writeFileSync(target, serialized, "utf8");
  console.log(
    `Manifiesto escrito: ${manifest.plantillas} plantillas, ` +
      `${manifest.totalEntidades} entidades → ${path.relative(process.cwd(), target)}`,
  );
}
