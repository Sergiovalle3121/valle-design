/**
 * ROTAR y ESCALAR selección (AXOS-CAD-XFORM-001): rotación de centros
 * alrededor del pivote con rotación por objeto acumulada, y escala de
 * tamaños + posiciones desde el centro; entradas inválidas → error.
 */
import { strict as assert } from "node:assert";
import { parseCadCommand } from "./parser";
import {
  rotateSelectionPreview,
  scaleSelectionPreview,
} from "./transform";
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
    h: 100,
    rotation: 0,
    ...over,
  }) as CadBox;

const ctx = (objects: CadBox[], selectedIds: string[]): CadCommandContext =>
  ({ objects, selectedIds }) as unknown as CadCommandContext;

// Rotar 90°: dos cajas de 100×100 en (0,0) y (200,0) → pivote (150,50).
// Centro de a (50,50): d=(−100,0) → 90° CCW → (0,−100) → nuevo centro
// (150,−50) → x=100, y=−100; rotación 0→90.
{
  const a = box({ id: "a" });
  const b = box({ id: "b", x: 200 });
  const out = rotateSelectionPreview(
    { id: "rotate_selection", angle: 90 },
    ctx([a, b], ["a", "b"]),
  );
  assert.equal(out.issues.length, 0, "sin issues");
  const mva = out.operations[0] as {
    after: { x: number; y: number; rotation?: number };
  };
  assert.equal(mva.after.x, 100, "centro de a rotado (x)");
  assert.equal(mva.after.y, -100, "centro de a rotado (y)");
  assert.equal(mva.after.rotation, 90, "rotación acumulada");
  const mvb = out.operations[1] as { after: { x: number; y: number } };
  assert.equal(mvb.after.x, 100, "centro de b rotado (x)");
  assert.equal(mvb.after.y, 100, "centro de b rotado (y)");
}

// Escalar ×2: caja de 100×100 en (0,0) junto a otra en (200,0):
// pivote (150,50); centro de a (50,50) → (−50,50) → x = −50 − 200/2 = −150.
{
  const a = box({ id: "a" });
  const b = box({ id: "b", x: 200 });
  const out = scaleSelectionPreview(
    { id: "scale_selection", factor: 2 },
    ctx([a, b], ["a", "b"]),
  );
  const mva = out.operations[0] as {
    after: { x: number; w: number; h: number };
  };
  assert.equal(mva.after.w, 200, "ancho duplicado");
  assert.equal(mva.after.h, 200, "alto duplicado");
  assert.equal(mva.after.x, -150, "posición escalada desde el pivote");
}

// Entradas inválidas: ángulo cero y factor 1 → error accionable.
{
  const a = box({ id: "a" });
  const r = rotateSelectionPreview(
    { id: "rotate_selection", angle: 0 },
    ctx([a], ["a"]),
  );
  assert.ok(r.issues.length > 0, "ángulo cero rechazado");
  const s = scaleSelectionPreview(
    { id: "scale_selection", factor: 1 },
    ctx([a], ["a"]),
  );
  assert.ok(s.issues.length > 0, "factor 1 rechazado");
  const empty = rotateSelectionPreview(
    { id: "rotate_selection", angle: 90 },
    ctx([], []),
  );
  assert.ok(empty.issues.length > 0, "selección vacía rechazada");
}

// Objetivo por nombre (AXOS-CAD-NAME-002): 'rota la prensa 90' sin selección.
{
  const c = ctx([box({ id: "p1" }), box({ id: "m1", label: "Mesa", x: 500 })], []);
  const out = rotateSelectionPreview(
    { id: "rotate_selection", angle: 90, target: "prensa" },
    c,
  );
  assert.equal(out.issues.length, 0, "resuelve por nombre sin selección");
  assert.deepEqual(out.affectedObjectIds, ["p1"], "solo la prensa");
  const missing = scaleSelectionPreview(
    { id: "scale_selection", factor: 2, target: "torno" },
    c,
  );
  assert.ok(
    missing.issues.some((i) => i.code === "transform_target_not_found"),
    "objetivo inexistente → error específico",
  );
}

// Parser: el objetivo viaja en rotate/scale ('rota la mesa 90').
{
  const rot = parseCadCommand("rota la mesa 90");
  if (rot.input?.id === "rotate_selection") {
    assert.equal(rot.input.target, "mesa", "target del parser en rotate");
    assert.equal(rot.input.angle, 90, "ángulo intacto");
  }
  const plain = parseCadCommand("rota 90");
  if (plain.input?.id === "rotate_selection") {
    assert.equal(plain.input.target, undefined, "sin residuo no hay target");
  }
  const sc = parseCadCommand("escala la mesa al 150%");
  if (sc.input?.id === "scale_selection") {
    assert.equal(sc.input.target, "mesa", "target del parser en scale");
    assert.equal(sc.input.factor, 1.5, "factor intacto");
  }
}

console.log("cad transform specs passed");
