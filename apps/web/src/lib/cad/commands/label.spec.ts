/**
 * Texto en el plano (AXOS-CAD-TEXT-001): anotación kind:text con centrado
 * por default, clamp al footprint y parser con comillas o texto libre.
 */
import { strict as assert } from "node:assert";
import { addLabelPreview } from "./label";
import { parseCadCommand } from "./parser";
import type { CadCommandContext } from "./types";

const ctx = {
  unit: "mm",
  footprintW: 10000,
  footprintH: 6000,
  objects: [],
  selectedIds: [],
} as unknown as CadCommandContext;

// Coordenadas explícitas → anotación text en su sitio.
{
  const out = addLabelPreview(
    { id: "add_label", text: "Recepción", x: 2000, y: 1000 },
    ctx,
  );
  assert.equal(out.issues.length, 0, "sin issues");
  const op = out.operations[0];
  assert.equal(op.type, "annotate", "emite annotate");
  if (op.type === "annotate") {
    assert.equal(op.annotation.kind, "text", "kind text");
    assert.equal(op.annotation.x, 2000, "x explícita");
    assert.equal(op.annotation.text, "Recepción", "texto intacto");
  }
}

// Sin coordenadas: centro del footprint; fuera de rango: clamp.
{
  const centered = addLabelPreview({ id: "add_label", text: "Nota" }, ctx);
  const op = centered.operations[0];
  if (op.type === "annotate") {
    assert.equal(op.annotation.x, 5000, "centrada en x");
    assert.equal(op.annotation.y, 3000, "centrada en y");
  }
  const clamped = addLabelPreview(
    { id: "add_label", text: "Lejos", x: 99999, y: -50 },
    ctx,
  );
  const cop = clamped.operations[0];
  if (cop.type === "annotate") {
    assert.equal(cop.annotation.x, 10000, "clamp a W");
    assert.equal(cop.annotation.y, 0, "clamp a 0");
  }
}

// Texto vacío → error accionable.
{
  const empty = addLabelPreview({ id: "add_label", text: "   " }, ctx);
  assert.ok(empty.issues.length > 0, "sin texto → error");
}

// Parser: comillas conservan mayúsculas; texto libre y variantes de verbo.
{
  const quoted = parseCadCommand("escribe 'Zona de Carga' en 2000,650");
  assert.equal(quoted.ok, true, "parser acepta escribe");
  assert.equal(quoted.input?.id, "add_label", "id correcto");
  if (quoted.input?.id === "add_label") {
    assert.equal(quoted.input.text, "Zona de Carga", "texto con mayúsculas");
    assert.equal(quoted.input.x, 2000, "x del parser");
    assert.equal(quoted.input.y, 650, "y del parser");
  }
  const free = parseCadCommand("anota Recepción en 4000,500");
  if (free.input?.id === "add_label") {
    assert.equal(free.input.text, "Recepción", "texto libre sin coords");
  }
  const noText = parseCadCommand("escribe");
  assert.equal(noText.ok, false, "sin texto pide clarificación");
}

console.log("cad label specs passed");
