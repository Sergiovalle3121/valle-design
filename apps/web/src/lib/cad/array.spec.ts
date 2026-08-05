/** Matrices / arreglos ARRAY (VD-CAD-DEPTH-B3). */
import { strict as assert } from "node:assert";
import type { CadPrimitive, CadVec2 } from "./primitives";
import {
  flattenArray,
  pathArray,
  polarArray,
  rectangularArray,
} from "./array";

function near(a: number, b: number, tol = 1e-6): boolean {
  return Math.abs(a - b) <= tol;
}
function pointNear(a: CadVec2, b: CadVec2): boolean {
  return near(a.x, b.x) && near(a.y, b.y);
}
function ln(group: CadPrimitive[]): Extract<CadPrimitive, { kind: "line" }> {
  const l = group.find((p) => p.kind === "line");
  assert.ok(l && l.kind === "line", "hay una línea");
  return l as Extract<CadPrimitive, { kind: "line" }>;
}

const unit: CadPrimitive[] = [{ kind: "line", a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }];

// --- rectangular -----------------------------------------------------------
const rect = rectangularArray(unit, { rows: 2, cols: 3, rowSpacing: 10, colSpacing: 20 });
assert.equal(rect.length, 6, "2×3 → 6 copias");
assert.ok(pointNear(ln(rect[0]).a, { x: 0, y: 0 }), "la primera celda coincide con el original");
assert.ok(pointNear(ln(rect[5]).a, { x: 40, y: 10 }), "celda (fila 1, col 2) desplazada (40,10)");

// --- polar completo (gira con el radio) ------------------------------------
const around: CadPrimitive[] = [{ kind: "line", a: { x: 10, y: 0 }, b: { x: 11, y: 0 } }];
const polar = polarArray(around, { center: { x: 0, y: 0 }, count: 4 });
assert.equal(polar.length, 4, "4 copias alrededor");
assert.ok(pointNear(ln(polar[1]).a, { x: 0, y: 10 }), "la segunda copia gira 90°");

// --- polar sin girar los ítems ---------------------------------------------
const polarFixed = polarArray(around, {
  center: { x: 0, y: 0 },
  count: 4,
  rotateItems: false,
  itemBase: { x: 10, y: 0 },
});
const fixed1 = ln(polarFixed[1]);
assert.ok(pointNear(fixed1.a, { x: 0, y: 10 }), "el punto base viaja por el arco");
assert.ok(near(fixed1.b.x - fixed1.a.x, 1) && near(fixed1.b.y - fixed1.a.y, 0), "la orientación se conserva (horizontal)");

// --- polar parcial ---------------------------------------------------------
const half = polarArray(around, { center: { x: 0, y: 0 }, count: 3, totalAngle: 180 });
assert.equal(half.length, 3, "3 copias en 180° (paso 90°)");
assert.ok(pointNear(ln(half[2]).a, { x: -10, y: 0 }), "la última copia está a 180°");

// --- path array (recto) ----------------------------------------------------
const seg: CadPrimitive[] = [{ kind: "line", a: { x: 0, y: 0 }, b: { x: 2, y: 0 } }];
const straight = pathArray(seg, {
  path: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ],
  count: 3,
});
assert.equal(straight.length, 3, "3 copias sobre el camino");
assert.ok(pointNear(ln(straight[1]).a, { x: 50, y: 0 }), "la copia central a mitad del camino");
assert.ok(pointNear(ln(straight[2]).a, { x: 100, y: 0 }), "la última copia al final del camino");

// --- path array (alineado a un giro) ---------------------------------------
const aligned = pathArray(seg, {
  path: [
    { x: 0, y: 0 },
    { x: 0, y: 100 },
  ],
  count: 2,
});
assert.ok(pointNear(ln(aligned[0]).b, { x: 0, y: 2 }), "la copia se alinea con la tangente vertical del camino");

// --- flatten ---------------------------------------------------------------
assert.equal(flattenArray(rect).length, 6, "aplanar da una lista de 6 primitivas");

console.log("cad array specs passed");
