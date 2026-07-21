/**
 * Duplicar selección (AXOS-CAD-DUP-001): creates con sourceId y
 * desplazamiento default +500,+500; parser con 'duplica/copia ... a dx,dy'.
 */
import { strict as assert } from "node:assert";
import { duplicateSelectionPreview } from "./duplicate";
import { parseCadCommand } from "./parser";
import type { CadCommandContext } from "./types";

const ctx = {
  unit: "mm",
  footprintW: 10000,
  footprintH: 6000,
  objects: [
    { id: "a1", type: "asset", kind: "desk", label: "Escritorio", x: 1000, y: 1000, w: 1400, h: 700, rotation: 90 },
  ],
  selectedIds: ["a1"],
} as unknown as CadCommandContext;

// Default: copia a +500,+500 con sourceId, etiqueta '(copia)' y rotación.
{
  const out = duplicateSelectionPreview({ id: "duplicate_selection" }, ctx);
  assert.equal(out.issues.length, 0, "sin issues");
  const op = out.operations[0];
  assert.equal(op.type, "create", "emite create");
  if (op.type === "create") {
    assert.equal(op.object.sourceId, "a1", "sourceId del original");
    assert.equal(op.object.x, 1500, "x desplazada +500");
    assert.equal(op.object.y, 1500, "y desplazada +500");
    assert.equal(op.object.label, "Escritorio (copia)", "etiqueta (copia)");
    assert.equal(op.object.rotation, 90, "conserva rotación");
  }
}

// Desplazamiento explícito, incluso con dy 0 o negativo.
{
  const out = duplicateSelectionPreview(
    { id: "duplicate_selection", dx: 800, dy: 0 },
    ctx,
  );
  const op = out.operations[0];
  if (op.type === "create") {
    assert.equal(op.object.x, 1800, "dx explícito");
    assert.equal(op.object.y, 1000, "dy 0 respetado");
  }
}

// Errores: desplazamiento 0,0 y selección vacía.
{
  const zero = duplicateSelectionPreview(
    { id: "duplicate_selection", dx: 0, dy: 0 },
    ctx,
  );
  assert.ok(zero.issues.length > 0, "0,0 → error");
  const empty = duplicateSelectionPreview(
    { id: "duplicate_selection" },
    { ...ctx, selectedIds: [] } as unknown as CadCommandContext,
  );
  assert.ok(empty.issues.length > 0, "sin selección → error");
}

// Parser: verbos y desplazamiento; los arreglos NxM no se ven afectados.
{
  const plain = parseCadCommand("duplica la selección");
  assert.equal(plain.input?.id, "duplicate_selection", "duplica → duplicate");
  const offset = parseCadCommand("copia esto a 800,-200");
  if (offset.input?.id === "duplicate_selection") {
    assert.equal(offset.input.dx, 800, "dx del parser");
    assert.equal(offset.input.dy, -200, "dy negativo del parser");
    assert.equal(offset.input.target, undefined, "'esto' no es objetivo");
  }
  const named = parseCadCommand("duplica el escritorio");
  if (named.input?.id === "duplicate_selection") {
    assert.equal(named.input.target, "escritorio", "objetivo por nombre");
  }
  const byName = duplicateSelectionPreview(
    { id: "duplicate_selection", target: "escritorio", dx: 300, dy: 0 },
    { ...ctx, selectedIds: [] } as unknown as CadCommandContext,
  );
  const nop = byName.operations[0];
  if (nop.type === "create") {
    assert.equal(nop.object.sourceId, "a1", "resuelve por nombre sin selección");
    assert.equal(nop.object.x, 1300, "offset aplicado al match");
  }
  const grid = parseCadCommand("copia en arreglo 3x2");
  assert.equal(grid.input?.id, "array_rectangular", "NxM sigue siendo array");
}

console.log("cad duplicate specs passed");

// Copia a una zona (AXOS-CAD-DUP-002): 'duplica la mesa en la bodega' —
// la copia aterriza centrada dentro del contenedor.
{
  const casaCtx = {
    unit: "mm",
    footprintW: 12000,
    footprintH: 8000,
    objects: [
      { id: "mesa", type: "asset", kind: "dining-table-4", label: "Mesa", x: 1000, y: 1000, w: 1000, h: 1000 },
      { id: "bod", type: "asset", kind: "room", label: "Bodega", x: 6000, y: 4000, w: 4000, h: 3000 },
    ],
    selectedIds: [],
  } as unknown as CadCommandContext;
  const parsed = parseCadCommand("duplica la mesa en la bodega");
  assert.equal(parsed.input?.id, "duplicate_selection", "duplica en zona parsea");
  if (parsed.input?.id === "duplicate_selection") {
    assert.equal(parsed.input.target, "mesa", "target del parser");
    assert.equal(parsed.input.into, "bodega", "into del parser");
    assert.equal(parsed.input.dx, undefined, "sin offset explícito");
  }
  const out = duplicateSelectionPreview(
    { id: "duplicate_selection", target: "mesa", into: "bodega" },
    casaCtx,
  );
  assert.equal(out.issues.length, 0, "copia a zona sin issues");
  const op = out.operations[0];
  if (op.type === "create") {
    assert.equal(op.object.x, 7500, "copia centrada en x de la bodega");
    assert.equal(op.object.y, 5000, "copia centrada en y de la bodega");
    assert.equal(op.object.sourceId, "mesa", "hereda del original");
  }
  assert.ok(out.summary.includes("dentro de"), "resumen de zona");
  const coords = parseCadCommand("copia la mesa a 800,0");
  if (coords.input?.id === "duplicate_selection") {
    assert.equal(coords.input.into, undefined, "offset explícito no es zona");
    assert.equal(coords.input.dx, 800, "dx explícito intacto");
  }
  const missing = duplicateSelectionPreview(
    { id: "duplicate_selection", target: "mesa", into: "terraza" },
    casaCtx,
  );
  assert.ok(
    missing.issues.some((i) => i.code === "duplicate_into_not_found"),
    "zona inexistente → error específico",
  );
}
