/**
 * Mover selección (AXOS-CAD-MOVE-001): destino absoluto por esquina del
 * conjunto, desplazamiento relativo con dirección en español y objetivo
 * por nombre; el grupo viaja rígido con un solo delta.
 */
import { strict as assert } from "node:assert";
import { moveSelectionPreview } from "./move";
import { parseCadCommand } from "./parser";
import type { CadCommandContext } from "./types";

const ctx = {
  unit: "mm",
  footprintW: 10000,
  footprintH: 6000,
  objects: [
    { id: "a1", type: "asset", kind: "desk", label: "Escritorio", x: 1000, y: 1000, w: 1400, h: 700 },
    { id: "a2", type: "asset", kind: "chair", label: "Silla", x: 1200, y: 1800, w: 500, h: 500 },
  ],
  selectedIds: ["a1", "a2"],
} as unknown as CadCommandContext;

// Absoluto: la esquina sup-izq del conjunto (1000,1000) va a (3000,2000)
// → delta (+2000,+1000) aplicado rígido a ambos.
{
  const out = moveSelectionPreview(
    { id: "move_selection", x: 3000, y: 2000 },
    ctx,
  );
  assert.equal(out.issues.length, 0, "sin issues");
  assert.equal(out.operations.length, 2, "una move por objeto");
  const [m1, m2] = out.operations;
  if (m1.type === "move" && m2.type === "move") {
    assert.equal(m1.after.x, 3000, "a1 x");
    assert.equal(m1.after.y, 2000, "a1 y");
    assert.equal(m2.after.x, 3200, "a2 conserva el offset relativo en x");
    assert.equal(m2.after.y, 2800, "a2 conserva el offset relativo en y");
  }
}

// Relativo: dx/dy directos; y errores accionables.
{
  const rel = moveSelectionPreview(
    { id: "move_selection", dx: -500, dy: 0 },
    ctx,
  );
  const m = rel.operations[0];
  if (m.type === "move") assert.equal(m.after.x, 500, "dx negativo aplicado");
  const nowhere = moveSelectionPreview({ id: "move_selection" }, ctx);
  assert.ok(
    nowhere.issues.some((i) => i.code === "move_missing_destination"),
    "sin destino → error",
  );
  const missing = moveSelectionPreview(
    { id: "move_selection", target: "torno", dx: 100 },
    { ...ctx, selectedIds: [] } as unknown as CadCommandContext,
  );
  assert.ok(
    missing.issues.some((i) => i.code === "move_target_not_found"),
    "objetivo inexistente → error específico",
  );
}

// Objetivo por nombre + parser: absoluto, relativo con dirección y metros.
{
  const abs = parseCadCommand("mueve la puerta a 2000,650");
  assert.equal(abs.input?.id, "move_selection", "mueve → move_selection");
  if (abs.input?.id === "move_selection") {
    assert.equal(abs.input.target, "puerta", "target del parser");
    assert.equal(abs.input.x, 2000, "x absoluta");
    assert.equal(abs.input.y, 650, "y absoluta");
  }
  const rel = parseCadCommand("mueve la selección 500 a la derecha");
  if (rel.input?.id === "move_selection") {
    assert.equal(rel.input.target, undefined, "'la selección' no es target");
    assert.equal(rel.input.dx, 500, "derecha → +dx");
    assert.equal(rel.input.dy, undefined, "sin dy");
  }
  const up = parseCadCommand("desplaza el escritorio 1 m arriba");
  if (up.input?.id === "move_selection") {
    assert.equal(up.input.target, "escritorio", "target con dirección");
    assert.equal(up.input.dy, -1000, "1 m arriba → dy −1000");
  }
  const vague = parseCadCommand("mueve la mesa");
  assert.equal(vague.ok, false, "sin destino pide clarificación");
}

// Centrar (AXOS-CAD-MOVE-002): bbox (1000,1000)-(2400,2300) de 1400×1300 al
// centro del footprint 10000×6000 → delta (+3300, +1350), rígido.
{
  const out = moveSelectionPreview({ id: "move_selection", center: true }, ctx);
  assert.equal(out.issues.length, 0, "centrar sin issues");
  const m = out.operations[0];
  if (m.type === "move") {
    assert.equal(m.after.x, 4300, "a1 centrado en x");
    assert.equal(m.after.y, 2350, "a1 centrado en y");
  }
  assert.ok(out.summary.includes("Centrar"), "resumen de centrado");
  const parsed = parseCadCommand("centra la mesa");
  assert.equal(parsed.input?.id, "move_selection", "centra → move");
  if (parsed.input?.id === "move_selection") {
    assert.equal(parsed.input.center, true, "center del parser");
    assert.equal(parsed.input.target, "mesa", "target del parser");
  }
  const plain = parseCadCommand("céntrala");
  if (plain.input?.id === "move_selection") {
    assert.equal(plain.input.target, undefined, "'céntrala' usa la selección");
  }
}

console.log("cad move specs passed");
