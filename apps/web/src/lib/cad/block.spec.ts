/** Bloques (BLOCK / INSERT) (AXOS-CAD-DEPTH-B1). */
import { strict as assert } from "node:assert";
import type { CadPrimitive, CadVec2 } from "./primitives";
import {
  countBlockUsage,
  instantiateBlock,
  instantiateInsert,
  isInsertResolvable,
  type BlockDefinition,
} from "./block";

function near(a: number, b: number, tol = 1e-6): boolean {
  return Math.abs(a - b) <= tol;
}
function pointNear(a: CadVec2, b: CadVec2): boolean {
  return near(a.x, b.x) && near(a.y, b.y);
}
function line(prims: CadPrimitive[]): Extract<CadPrimitive, { kind: "line" }> {
  const l = prims.find((p) => p.kind === "line");
  assert.ok(l && l.kind === "line", "hay una línea");
  return l as Extract<CadPrimitive, { kind: "line" }>;
}
function circle(prims: CadPrimitive[]): Extract<CadPrimitive, { kind: "circle" }> {
  const c = prims.find((p) => p.kind === "circle");
  assert.ok(c && c.kind === "circle", "hay un círculo");
  return c as Extract<CadPrimitive, { kind: "circle" }>;
}

const def: BlockDefinition = {
  name: "marca",
  basePoint: { x: 0, y: 0 },
  primitives: [
    { kind: "line", a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
    { kind: "circle", center: { x: 5, y: 0 }, radius: 2 },
  ],
};

// --- inserción simple (traslación) -----------------------------------------
const t = instantiateBlock(def, { block: "marca", position: { x: 100, y: 50 } });
assert.ok(pointNear(line(t).a, { x: 100, y: 50 }) && pointNear(line(t).b, { x: 110, y: 50 }), "línea trasladada");
assert.ok(pointNear(circle(t).center, { x: 105, y: 50 }) && near(circle(t).radius, 2), "círculo trasladado, radio intacto");

// --- escala uniforme -------------------------------------------------------
const s = instantiateBlock(def, { block: "marca", position: { x: 0, y: 0 }, scale: 2 });
assert.ok(pointNear(line(s).b, { x: 20, y: 0 }), "línea escalada ×2");
assert.ok(pointNear(circle(s).center, { x: 10, y: 0 }) && near(circle(s).radius, 4), "círculo escalado ×2");

// --- rotación --------------------------------------------------------------
const r = instantiateBlock(def, { block: "marca", position: { x: 0, y: 0 }, rotation: 90 });
assert.ok(pointNear(line(r).b, { x: 0, y: 10 }), "línea rotada 90° (horizontal→vertical)");
assert.ok(pointNear(circle(r).center, { x: 0, y: 5 }), "centro del círculo rotado 90°");

// --- punto base distinto de origen -----------------------------------------
const def2: BlockDefinition = { ...def, basePoint: { x: 5, y: 0 } };
const b = instantiateBlock(def2, { block: "marca", position: { x: 0, y: 0 } });
assert.ok(pointNear(circle(b).center, { x: 0, y: 0 }), "el punto base (el centro) cae en el punto de inserción");

// --- registro por nombre ----------------------------------------------------
const registryMap = new Map<string, BlockDefinition>([["marca", def]]);
assert.equal(instantiateInsert(registryMap, { block: "marca", position: { x: 1, y: 1 } }).length, 2, "Map: instancia el bloque");
const registryObj: Record<string, BlockDefinition> = { marca: def };
assert.equal(instantiateInsert(registryObj, { block: "marca", position: { x: 1, y: 1 } }).length, 2, "objeto: instancia el bloque");
assert.equal(instantiateInsert(registryMap, { block: "fantasma", position: { x: 0, y: 0 } }).length, 0, "referencia colgante → sin geometría");
assert.ok(isInsertResolvable(registryMap, { block: "marca", position: { x: 0, y: 0 } }), "resoluble");
assert.ok(!isInsertResolvable(registryMap, { block: "fantasma", position: { x: 0, y: 0 } }), "no resoluble");

// --- conteo de uso ----------------------------------------------------------
const usage = countBlockUsage([
  { block: "marca", position: { x: 0, y: 0 } },
  { block: "marca", position: { x: 1, y: 0 } },
  { block: "puerta", position: { x: 2, y: 0 } },
]);
assert.equal(usage.marca, 2, "cuenta 2 inserciones de marca");
assert.equal(usage.puerta, 1, "cuenta 1 inserción de puerta");

console.log("cad block specs passed");
