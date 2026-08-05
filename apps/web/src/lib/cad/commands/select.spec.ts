/**
 * Seleccionar por nombre (VD-CAD-SELECT-001): focus con plural plegado,
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

// Cardinales (VD-CAD-NAME-010): 'dos sillas' trae las primeras dos en
// orden del plano; pedir más de las que hay cae a no-encontrado.
{
  const cardCtx = {
    unit: "mm",
    footprintW: 10000,
    footprintH: 6000,
    objects: [
      { id: "s1", type: "asset", kind: "office-chair", label: "Silla 1", x: 1000, y: 1000, w: 500, h: 500 },
      { id: "s2", type: "asset", kind: "office-chair", label: "Silla 2", x: 2000, y: 1000, w: 500, h: 500 },
      { id: "s3", type: "asset", kind: "office-chair", label: "Silla 3", x: 3000, y: 1000, w: 500, h: 500 },
    ],
    selectedIds: [],
  } as unknown as CadCommandContext;
  const dos = selectObjectsPreview(
    { id: "select_objects", query: "dos sillas" },
    cardCtx,
  );
  assert.deepEqual(
    dos.affectedObjectIds,
    ["s1", "s2"],
    "'dos sillas' trae las primeras dos",
  );
  const tres = selectObjectsPreview(
    { id: "select_objects", query: "3 sillas" },
    cardCtx,
  );
  assert.equal(tres.affectedObjectIds.length, 3, "'3 sillas' trae las tres");
  const cinco = selectObjectsPreview(
    { id: "select_objects", query: "cinco sillas" },
    cardCtx,
  );
  assert.ok(
    cinco.issues.length > 0,
    "pedir cinco con tres en el plano reporta error",
  );
  const plural = selectObjectsPreview(
    { id: "select_objects", query: "sillas" },
    cardCtx,
  );
  assert.equal(plural.affectedObjectIds.length, 3, "el plural sigue igual");
}
