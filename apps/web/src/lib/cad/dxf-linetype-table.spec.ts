/**
 * La tabla LTYPE del DXF lleva el patrón de FÁBRICA de los tipos que el
 * documento referencia sin definir.
 *
 * Medido el 2026-09-02: un dibujo nuevo con la capa EJES=CENTER (norma
 * mexicana) no lleva `styles.linetype` —sólo lo puebla la importación de un
 * DXF con tabla LTYPE—, así que el escritor emitía CENTER con `73 = 0`
 * («referenciado pero no definido», `dxf-write-tables.ts`) y AutoCAD abría el
 * eje continuo. El catálogo del documento sigue mandando cuando existe.
 */
import { strict as assert } from "node:assert";
import type { CadDocument } from "./cad-document";
import { exportCadDocumentDxf } from "./dxf-document-export";

function document(catalog?: Record<string, { pattern: number[] }>): CadDocument {
  return {
    meta: { version: 1, schema: 9, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "EJES", name: "EJES", color: "#f97316", visible: true, locked: false, linetype: "CENTER" },
      { id: "AUX", name: "AUX", color: "#94a3b8", visible: true, locked: false, linetype: "Dashed" },
    ],
    entities: [
      { id: "eje", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 }, layer: "EJES" },
      {
        id: "oculta",
        type: "line",
        start: { x: 0, y: 10, z: 0 },
        end: { x: 100, y: 10, z: 0 },
        layer: "0",
        context: { presentation: { linetype: { source: "explicit", value: "HIDDEN" } } },
      },
    ],
    history: [],
    modelSpace: { entityIds: ["eje", "oculta"] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, table: {}, plot: {}, ...(catalog ? { linetype: catalog } : {}) },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as never as CadDocument;
}

/** Entradas LTYPE del fichero: nombre → [73, 40, 49…]. */
function linetypeTable(content: string): Map<string, { count: number; total: number; pattern: number[] }> {
  const lines = content.split(/\r?\n/);
  const table = new Map<string, { count: number; total: number; pattern: number[] }>();
  let current: { count: number; total: number; pattern: number[] } | null = null;
  for (let index = 0; index + 1 < lines.length; index += 2) {
    const code = lines[index].trim();
    const value = lines[index + 1].trim();
    if (code === "0" && value === "LTYPE") {
      current = { count: 0, total: 0, pattern: [] };
      continue;
    }
    if (code === "0") current = null;
    if (!current) continue;
    if (code === "2") table.set(value.toUpperCase(), current);
    if (code === "73") current.count = Number(value);
    if (code === "40") current.total = Number(value);
    if (code === "49") current.pattern.push(Number(value));
  }
  return table;
}

// 1. Sin catálogo: los referenciados salen con su patrón de fábrica.
const fresh = linetypeTable(exportCadDocumentDxf(document()).content);
assert.ok(fresh.has("CONTINUOUS"), "CONTINUOUS siempre está");
const center = fresh.get("CENTER");
assert.ok(center, "CENTER (capa EJES) entra en la tabla");
assert.equal(center.count, 4, "y ya no está «referenciado pero no definido»: 73 = 4");
assert.deepEqual(center.pattern, [1.25, -0.25, 0.25, -0.25], "con los cuatro tramos de fábrica");
assert.ok(Math.abs(center.total - 2) < 1e-9, "40 = longitud total del patrón");
const dashed = fresh.get("DASHED");
assert.ok(dashed && dashed.count === 2, "Dashed (capa AUX, en minúsculas) resuelve al de fábrica sin distinguir mayúsculas");
assert.deepEqual(dashed.pattern, [0.5, -0.25]);
const hidden = fresh.get("HIDDEN");
assert.ok(hidden && hidden.count === 2, "HIDDEN, explícito en una entidad, también entra definido");
assert.deepEqual(hidden.pattern, [0.25, -0.125]);
assert.ok(!fresh.has("PHANTOM"), "los de fábrica que nadie referencia NO se escriben: la tabla no engorda");

// 2. Con catálogo: el patrón del documento manda sobre el de fábrica.
const imported = linetypeTable(
  exportCadDocumentDxf(document({ CENTER: { pattern: [31.75, -6.35, 6.35, -6.35] } })).content,
);
assert.deepEqual(imported.get("CENTER")?.pattern, [31.75, -6.35, 6.35, -6.35], "el CENTER del catálogo (acadiso) se escribe tal cual");
assert.equal(imported.get("DASHED")?.count, 2, "y los no declarados siguen saliendo de fábrica");

console.log(
  "dxf-linetype-table: CENTER/DASHED/HIDDEN referenciados sin catálogo salen con su patrón de fábrica (73 = 4/2/2), el catálogo manda cuando existe y los de fábrica no referenciados no se escriben.",
);
