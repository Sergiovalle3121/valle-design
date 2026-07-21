/**
 * Seleccionar por nombre (AXOS-CAD-SELECT-001): focus con plural plegado,
 * 'todo' selecciona el plano completo y errores accionables.
 */
import { strict as assert } from "node:assert";
import { parseCadCommand } from "./parser";
import { selectObjectsPreview } from "./select";
import type { CadCommandContext } from "./types";

const ctx = {
  unit: "mm",
  footprintW: 12000,
  footprintH: 8000,
  objects: [
    { id: "m1", type: "asset", kind: "restaurant-table-4", label: "Mesa 4 personas", x: 0, y: 0, w: 900, h: 900 },
    { id: "m2", type: "asset", kind: "restaurant-table-4", label: "Mesa 4 personas", x: 1600, y: 0, w: 900, h: 900 },
    { id: "b1", type: "asset", kind: "bar-counter", label: "Barra con caja", x: 0, y: 2000, w: 2500, h: 650 },
  ],
  selectedIds: [],
} as unknown as CadCommandContext;

// Plural plegado → focus con las dos mesas.
{
  const out = selectObjectsPreview(
    { id: "select_objects", query: "mesas" },
    ctx,
  );
  assert.equal(out.issues.length, 0, "sin issues");
  const op = out.operations[0];
  assert.equal(op.type, "focus", "emite focus");
  if (op.type === "focus") {
    assert.deepEqual(op.objectIds, ["m1", "m2"], "las dos mesas");
  }
  assert.ok(out.summary.includes("2"), "resumen con conteo");
}

// 'todo' selecciona el plano completo; errores accionables.
{
  const all = selectObjectsPreview({ id: "select_objects", query: "todo" }, ctx);
  const op = all.operations[0];
  if (op.type === "focus") assert.equal(op.objectIds.length, 3, "todo el plano");
  const empty = selectObjectsPreview({ id: "select_objects", query: " " }, ctx);
  assert.ok(empty.issues.length > 0, "sin query → error");
  const missing = selectObjectsPreview(
    { id: "select_objects", query: "camas" },
    ctx,
  );
  assert.ok(
    missing.issues.some((i) => i.code === "select_not_found"),
    "sin coincidencias → error (seleccionar 0 no tiene sentido)",
  );
}

// Parser: verbo + limpieza de artículos y 'todas las'.
{
  const parsed = parseCadCommand("selecciona todas las mesas");
  assert.equal(parsed.ok, true, "acepta seleccionar");
  assert.equal(parsed.input?.id, "select_objects", "id correcto");
  if (parsed.input?.id === "select_objects") {
    assert.equal(parsed.input.query, "mesas", "query limpia");
  }
  const bar = parseCadCommand("resalta la barra");
  if (bar.input?.id === "select_objects") {
    assert.equal(bar.input.query, "barra", "resalta funciona");
  }
  const vague = parseCadCommand("selecciona");
  assert.equal(vague.ok, false, "sin query pide clarificación");
}

console.log("cad select specs passed");
