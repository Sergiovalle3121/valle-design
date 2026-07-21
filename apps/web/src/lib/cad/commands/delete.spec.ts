/**
 * Borrar selección (AXOS-CAD-DELETE-001): una operación delete por objeto,
 * error accionable sin selección y parser con los verbos naturales.
 */
import { strict as assert } from "node:assert";
import { deleteSelectionPreview } from "./delete";
import { parseCadCommand } from "./parser";
import type { CadCommandContext } from "./types";

const ctx = {
  unit: "mm",
  footprintW: 10000,
  footprintH: 6000,
  objects: [
    { id: "a1", type: "asset", kind: "desk", label: "Escritorio", x: 0, y: 0, w: 1400, h: 700 },
    { id: "a2", type: "asset", kind: "sofa-3", label: "Sofá", x: 3000, y: 2000, w: 2100, h: 900 },
  ],
  selectedIds: ["a1", "a2"],
} as unknown as CadCommandContext;

// Selección completa → una op delete por objeto, con resumen legible.
{
  const out = deleteSelectionPreview({ id: "delete_selection" }, ctx);
  assert.equal(out.issues.length, 0, "sin issues");
  assert.equal(out.operations.length, 2, "una delete por objeto");
  assert.deepEqual(
    out.operations.map((op) => (op.type === "delete" ? op.objectId : "?")),
    ["a1", "a2"],
    "borra exactamente la selección",
  );
  assert.ok(out.summary.includes("2 objeto"), "resumen con conteo");
}

// objectIds explícitos ganan a la selección; ids muertos no truenan.
{
  const out = deleteSelectionPreview(
    { id: "delete_selection", objectIds: ["a2", "fantasma"] },
    ctx,
  );
  assert.equal(out.operations.length, 1, "solo el objeto vivo");
  assert.deepEqual(out.affectedObjectIds, ["a2"], "afectado correcto");
}

// Sin selección → error accionable.
{
  const empty = deleteSelectionPreview(
    { id: "delete_selection" },
    { ...ctx, selectedIds: [] } as unknown as CadCommandContext,
  );
  assert.ok(empty.issues.length > 0, "sin selección → error");
  assert.equal(empty.operations.length, 0, "no emite operaciones");
}

// Parser: verbos naturales → delete_selection; 'borrador' no dispara.
{
  for (const phrase of [
    "borra la selección",
    "elimina lo seleccionado",
    "quita esos objetos",
  ]) {
    const parsed = parseCadCommand(phrase);
    assert.equal(parsed.ok, true, `parser acepta '${phrase}'`);
    assert.equal(parsed.input?.id, "delete_selection", `id de '${phrase}'`);
  }
  const noise = parseCadCommand("marca el plano como borrador");
  assert.notEqual(
    noise.input?.id,
    "delete_selection",
    "'borrador' no es borrar",
  );
}

console.log("cad delete specs passed");
