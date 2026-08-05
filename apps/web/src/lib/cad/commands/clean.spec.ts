/**
 * Limpiar anotaciones (VD-CAD-CLEAN-001): kinds correctos desde el
 * parser (antes de la rama de borrar) y preview con la orden explícita.
 */
import { strict as assert } from "node:assert";
import { clearAnnotationsPreview } from "./clean";
import { parseCadCommand } from "./parser";

// Preview: emite la orden con el kind pedido; default dims.
{
  const dims = clearAnnotationsPreview({ id: "clear_annotations" });
  const op = dims.operations[0];
  assert.equal(op.type, "clear_annotations", "emite la orden");
  if (op.type === "clear_annotations") {
    assert.equal(op.kind, "dims", "default cotas");
  }
  const all = clearAnnotationsPreview({ id: "clear_annotations", kind: "all" });
  assert.ok(all.summary.includes("todas"), "resumen de todo");
}

// Parser: kinds correctos y la rama va ANTES de borrar.
{
  const dims = parseCadCommand("quita las cotas");
  assert.equal(dims.input?.id, "clear_annotations", "cotas → limpiar");
  if (dims.input?.id === "clear_annotations") {
    assert.equal(dims.input.kind, "dims", "kind cotas");
  }
  const notes = parseCadCommand("borra las notas");
  if (notes.input?.id === "clear_annotations") {
    assert.equal(notes.input.kind, "notes", "kind notas");
  }
  const all = parseCadCommand("limpia las anotaciones");
  if (all.input?.id === "clear_annotations") {
    assert.equal(all.input.kind, "all", "kind todo");
  }
  const door = parseCadCommand("borra la puerta");
  assert.equal(
    door.input?.id,
    "delete_selection",
    "'borra la puerta' sigue siendo borrar objetos",
  );
}

console.log("cad clean specs passed");
