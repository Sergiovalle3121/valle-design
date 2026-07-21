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

// Objetivo por nombre (AXOS-CAD-NAME-001): 'borra el sofá' sin selección,
// substring sin acentos sobre label/kind; sin match → error accionable.
{
  const byName = deleteSelectionPreview(
    { id: "delete_selection", target: "sofa" },
    { ...ctx, selectedIds: [] } as unknown as CadCommandContext,
  );
  assert.equal(byName.operations.length, 1, "encuentra el sofá sin acento");
  assert.deepEqual(byName.affectedObjectIds, ["a2"], "match por label");
  const missing = deleteSelectionPreview(
    { id: "delete_selection", target: "nave espacial" },
    ctx,
  );
  assert.ok(
    missing.issues.some((i) => i.code === "delete_target_not_found"),
    "objetivo inexistente → error específico",
  );
  // Plural plegado unificado (AXOS-CAD-NAME-003): 'borra los escritorios'.
  const plural = deleteSelectionPreview(
    { id: "delete_selection", target: "escritorios" },
    { ...ctx, selectedIds: [] } as unknown as CadCommandContext,
  );
  assert.deepEqual(plural.affectedObjectIds, ["a1"], "plural encuentra singular");
  const everything = deleteSelectionPreview(
    { id: "delete_selection", target: "todo" },
    { ...ctx, selectedIds: [] } as unknown as CadCommandContext,
  );
  assert.equal(everything.operations.length, 2, "'todo' borra el plano completo");
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
  const named = parseCadCommand("borra la puerta");
  if (named.input?.id === "delete_selection") {
    assert.equal(named.input.target, "puerta", "captura el objetivo por nombre");
  }
  const plainSel = parseCadCommand("borra la selección");
  if (plainSel.input?.id === "delete_selection") {
    assert.equal(
      plainSel.input.target,
      undefined,
      "'la selección' no es objetivo",
    );
  }
}

console.log("cad delete specs passed");

// Objetivos compuestos (AXOS-CAD-NAME-006): 'borra el escritorio y el sofá'.
{
  const out = deleteSelectionPreview(
    { id: "delete_selection", target: "escritorio y el sofá" },
    ctx,
  );
  assert.equal(
    out.operations.filter((op) => op.type === "delete").length,
    2,
    "el objetivo compuesto borra ambos",
  );
  const single = deleteSelectionPreview(
    { id: "delete_selection", target: "escritorio" },
    ctx,
  );
  assert.equal(
    single.operations.filter((op) => op.type === "delete").length,
    1,
    "el objetivo simple sigue igual",
  );
  const missing = deleteSelectionPreview(
    { id: "delete_selection", target: "piano y tuba" },
    ctx,
  );
  assert.ok(
    missing.issues.length > 0,
    "compuesto sin coincidencias sigue reportando error",
  );
}
