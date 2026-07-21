/**
 * Contar objetos (AXOS-CAD-QUERY-001): plural plegado, desglose por
 * etiqueta, cero como respuesta válida y parser con signos de pregunta.
 */
import { strict as assert } from "node:assert";
import { countObjectsPreview } from "./count";
import { parseCadCommand } from "./parser";
import type { CadCommandContext } from "./types";

const ctx = {
  unit: "mm",
  footprintW: 12000,
  footprintH: 8000,
  objects: [
    { id: "m1", type: "asset", kind: "restaurant-table-4", label: "Mesa 4 personas", x: 0, y: 0, w: 900, h: 900 },
    { id: "m2", type: "asset", kind: "restaurant-table-4", label: "Mesa 4 personas", x: 1600, y: 0, w: 900, h: 900 },
    { id: "m3", type: "asset", kind: "restaurant-table-4", label: "Mesa 4 personas", x: 3200, y: 0, w: 900, h: 900 },
    { id: "s1", type: "asset", kind: "sofa-3", label: "Sofá 3 plazas", x: 0, y: 2000, w: 2100, h: 900 },
  ],
  selectedIds: [],
} as unknown as CadCommandContext;

// 'mesas' (plural) encuentra las 3 'Mesa 4 personas' y desglosa.
{
  const out = countObjectsPreview({ id: "count_objects", query: "mesas" }, ctx);
  assert.equal(out.issues.length, 0, "sin issues");
  assert.equal(out.affectedObjectIds.length, 3, "tres mesas");
  const op = out.operations[0];
  assert.equal(op.type, "report", "emite report");
  if (op.type === "report") {
    assert.equal(op.rows[0].label, "Mesa 4 personas", "desglose por etiqueta");
    assert.equal(op.rows[0].value, "3", "conteo correcto");
  }
  assert.ok(out.summary.includes("3"), "resumen con total");
}

// Acentos plegados y cero como respuesta válida (no error).
{
  const sofa = countObjectsPreview({ id: "count_objects", query: "sofa" }, ctx);
  assert.equal(sofa.affectedObjectIds.length, 1, "'sofa' encuentra 'Sofá'");
  const none = countObjectsPreview({ id: "count_objects", query: "camas" }, ctx);
  assert.equal(none.issues.length, 0, "cero no es error");
  assert.equal(none.affectedObjectIds.length, 0, "cero coincidencias");
  const op = none.operations[0];
  if (op.type === "report") {
    assert.equal(op.rows[0].value, "0", "fila explícita de cero");
  }
}

// Sin query: cuenta todo el plano.
{
  const all = countObjectsPreview({ id: "count_objects" }, ctx);
  assert.equal(all.affectedObjectIds.length, 4, "todo el plano");
}

// Parser: pregunta natural con signos y verbo 'cuenta'.
{
  const asked = parseCadCommand("¿cuántas mesas hay?");
  assert.equal(asked.ok, true, "acepta la pregunta");
  assert.equal(asked.input?.id, "count_objects", "id correcto");
  if (asked.input?.id === "count_objects") {
    assert.equal(asked.input.query, "mesas", "query limpia de la pregunta");
  }
  const plain = parseCadCommand("cuenta las sillas");
  if (plain.input?.id === "count_objects") {
    assert.equal(plain.input.query, "sillas", "query del verbo cuenta");
  }
}

// Conteo por cuarto (AXOS-CAD-QUERY-010): '¿cuántas mesas hay en cada
// cuarto?' desglosa por el cuarto que contiene cada coincidencia.
{
  const cuartosCtx = {
    unit: "mm",
    footprintW: 12000,
    footprintH: 8000,
    objects: [
      { id: "coc", type: "asset", kind: "room", label: "Cocina", x: 0, y: 0, w: 4000, h: 4000 },
      { id: "com", type: "asset", kind: "room", label: "Comedor", x: 5000, y: 0, w: 4000, h: 4000 },
      { id: "m1", type: "asset", kind: "dining-table-4", label: "Mesa 1", x: 1000, y: 1000, w: 900, h: 900 },
      { id: "m2", type: "asset", kind: "dining-table-4", label: "Mesa 2", x: 6000, y: 1000, w: 900, h: 900 },
      { id: "m3", type: "asset", kind: "dining-table-4", label: "Mesa 3", x: 10000, y: 6000, w: 900, h: 900 },
    ],
    selectedIds: [],
  } as unknown as CadCommandContext;
  const parsed = parseCadCommand("¿cuántas mesas hay en cada cuarto?");
  assert.equal(parsed.input?.id, "count_objects", "por cuarto parsea");
  if (parsed.input?.id === "count_objects") {
    assert.equal(parsed.input.query, "mesas", "query limpia");
    assert.equal(parsed.input.byRoom, true, "byRoom del parser");
    const p = countObjectsPreview(parsed.input, cuartosCtx);
    const op = p.operations[0];
    if (op.type === "report") {
      const byLabel = new Map(op.rows.map((r) => [r.label, r.value]));
      assert.equal(byLabel.get("Cocina"), "1", "una mesa en la cocina");
      assert.equal(byLabel.get("Comedor"), "1", "una mesa en el comedor");
      assert.equal(byLabel.get("Fuera de cuartos"), "1", "una mesa suelta");
    }
    assert.ok(p.summary.includes("3 espacio"), "resumen con espacios");
  }
  const normal = parseCadCommand("cuenta las mesas");
  if (normal.input?.id === "count_objects") {
    assert.equal(normal.input.byRoom, undefined, "conteo normal sin byRoom");
  }
}

console.log("cad count specs passed");
