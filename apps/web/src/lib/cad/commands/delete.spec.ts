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

// Proximidad (AXOS-CAD-ZONE-002): 'borra lo que está cerca de la mesa'
// borra los vecinos (separación ≤ 1000 mm), nunca al ancla ni lo lejano.
{
  const vecindadCtx = {
    unit: "mm",
    footprintW: 12000,
    footprintH: 8000,
    objects: [
      { id: "mesa", type: "asset", kind: "dining-table-4", label: "Mesa", x: 2000, y: 2000, w: 1000, h: 1000 },
      { id: "silla", type: "asset", kind: "office-chair", label: "Silla", x: 3100, y: 2000, w: 500, h: 500 },
      { id: "sofa", type: "asset", kind: "sofa-3", label: "Sofá", x: 6000, y: 2000, w: 2100, h: 900 },
    ],
    selectedIds: [],
  } as unknown as CadCommandContext;
  const out = deleteSelectionPreview(
    { id: "delete_selection", target: "lo que está cerca de la mesa" },
    vecindadCtx,
  );
  assert.deepEqual(
    out.operations
      .filter((op) => op.type === "delete")
      .map((op) => (op.type === "delete" ? op.objectId : "?")),
    ["silla"],
    "borra la silla vecina, no el ancla ni el sofá lejano",
  );
  const junto = deleteSelectionPreview(
    { id: "delete_selection", target: "junto a la mesa" },
    vecindadCtx,
  );
  assert.equal(
    junto.operations.filter((op) => op.type === "delete").length,
    1,
    "'junto a la mesa' también resuelve vecinos",
  );
  const lejos = deleteSelectionPreview(
    { id: "delete_selection", target: "cerca del piano" },
    vecindadCtx,
  );
  assert.ok(
    lejos.issues.length > 0,
    "ancla inexistente reporta error de objetivo",
  );
}

// Entre dos anclas (AXOS-CAD-ZONE-005): 'lo que está entre la mesa y la
// puerta' borra lo del sobre, nunca las anclas ni lo de afuera.
{
  const entreCtx = {
    unit: "mm",
    footprintW: 12000,
    footprintH: 8000,
    objects: [
      { id: "mesa", type: "asset", kind: "dining-table-4", label: "Mesa", x: 1000, y: 1000, w: 1000, h: 1000 },
      { id: "puerta", type: "asset", kind: "door-90", label: "Puerta", x: 8000, y: 1000, w: 900, h: 150 },
      { id: "silla-mid", type: "asset", kind: "office-chair", label: "Silla en medio", x: 4500, y: 1200, w: 500, h: 500 },
      { id: "sofa-out", type: "asset", kind: "sofa-3", label: "Sofá lejano", x: 4000, y: 6000, w: 2100, h: 900 },
    ],
    selectedIds: [],
  } as unknown as CadCommandContext;
  const out = deleteSelectionPreview(
    { id: "delete_selection", target: "lo que está entre la mesa y la puerta" },
    entreCtx,
  );
  assert.deepEqual(
    out.operations
      .filter((op) => op.type === "delete")
      .map((op) => (op.type === "delete" ? op.objectId : "?")),
    ["silla-mid"],
    "borra solo lo del sobre entre las anclas",
  );
  const missing = deleteSelectionPreview(
    { id: "delete_selection", target: "entre el piano y la tuba" },
    entreCtx,
  );
  assert.ok(
    missing.issues.length > 0,
    "anclas inexistentes reportan error de objetivo",
  );
}
