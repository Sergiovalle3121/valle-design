/**
 * Espejo de selección (AXOS-CAD-MIRROR-001): reflejo de centros y de la
 * orientación (vertical θ→180−θ, horizontal θ→−θ); copy default crea
 * "(espejo)" y copy:false mueve en sitio; sin selección → error.
 * Run: ts-node --compiler-options '{"module":"commonjs"}' este archivo.
 */
import { strict as assert } from "node:assert";
import { mirrorSelectionPreview } from "./mirror";
import { parseCadCommand } from "./parser";
import type { CadBox, CadCommandContext } from "./types";

const box = (over: Partial<CadBox>): CadBox =>
  ({
    id: "a",
    type: "asset",
    kind: "machine",
    label: "Prensa",
    x: 0,
    y: 0,
    w: 100,
    h: 50,
    rotation: 0,
    ...over,
  }) as CadBox;

const ctx = (objects: CadBox[], selectedIds: string[]): CadCommandContext =>
  ({ objects, selectedIds }) as unknown as CadCommandContext;

// Espejo vertical con copia: bounding box x ∈ [0, 400] → eje en x=200.
{
  const a = box({ id: "a", x: 0, y: 0, rotation: 30 });
  const b = box({ id: "b", x: 300, y: 100 });
  const out = mirrorSelectionPreview(
    { id: "mirror_selection" },
    ctx([a, b], ["a", "b"]),
  );
  assert.equal(out.issues.length, 0, "sin issues con selección válida");
  const creates = out.operations.filter((o) => o.type === "create") as Array<{
    object: { x: number; y: number; rotation?: number; label: string };
  }>;
  assert.equal(creates.length, 2, "una copia por objeto");
  // Centro de a: (50, 25) → reflejado (350, 25) → x = 300.
  assert.equal(creates[0].object.x, 300, "centro de a reflejado");
  assert.equal(creates[0].object.y, 0, "y intacta en espejo vertical");
  assert.equal(creates[0].object.rotation, 150, "rotación 180−30");
  assert.equal(creates[0].object.label, "Prensa (espejo)", "label espejo");
  // Centro de b: (350, 125) → reflejado (50, 125) → x = 0.
  assert.equal(creates[1].object.x, 0, "centro de b reflejado");
  assert.ok(out.summary.includes("vertical"), "summary menciona el eje");
}

// Espejo horizontal en sitio (copy:false): mueve y refleja rotación −θ.
{
  const a = box({ id: "a", x: 0, y: 0, rotation: 45 });
  const out = mirrorSelectionPreview(
    { id: "mirror_selection", axis: "horizontal", at: 100, copy: false },
    ctx([a], ["a"]),
  );
  const mv = out.operations[0] as {
    type: string;
    after: { y: number; rotation?: number };
  };
  assert.equal(mv.type, "move", "sin copia → move en sitio");
  // Centro (50, 25) → reflejado sobre y=100 → (50, 175) → y = 150.
  assert.equal(mv.after.y, 150, "centro reflejado sobre y=at");
  assert.equal(mv.after.rotation, 315, "rotación normalizada de −45");
  assert.ok(out.summary.includes("en sitio"), "summary indica en sitio");
}

// Sin selección: error accionable, cero operaciones.
{
  const out = mirrorSelectionPreview({ id: "mirror_selection" }, ctx([], []));
  assert.ok(out.issues.length > 0, "error sin selección");
  assert.equal(out.operations.length, 0, "sin operaciones");
}

// Objetivo por nombre (AXOS-CAD-NAME-002): 'espejo de la prensa' sin selección.
{
  const c = ctx([box({ id: "p1" })], []);
  const out = mirrorSelectionPreview(
    { id: "mirror_selection", target: "prensa" },
    c,
  );
  assert.equal(out.issues.length, 0, "resuelve por nombre");
  assert.deepEqual(out.affectedObjectIds, ["p1"], "espeja la prensa");
  const parsed = parseCadCommand("espejo horizontal de la puerta");
  if (parsed.input?.id === "mirror_selection") {
    assert.equal(parsed.input.target, "puerta", "target del parser");
    assert.equal(parsed.input.axis, "horizontal", "eje intacto");
  }
  const plain = parseCadCommand("espejo vertical de la selección");
  if (plain.input?.id === "mirror_selection") {
    assert.equal(plain.input.target, undefined, "'la selección' no es target");
  }
}

console.log("cad mirror specs passed");
