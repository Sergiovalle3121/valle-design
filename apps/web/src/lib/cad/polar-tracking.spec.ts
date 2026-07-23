/** Rastreo polar y ortogonal POLAR/ORTHO (AXOS-CAD-DEPTH-B7). */
import { strict as assert } from "node:assert";
import type { CadVec2 } from "./primitives";
import {
  orthoSnap,
  polarSnap,
  polarSnapWithStep,
  snapDistance,
} from "./polar-tracking";

function near(a: number, b: number, tol = 1e-6): boolean {
  return Math.abs(a - b) <= tol;
}
function pointNear(a: CadVec2, b: CadVec2, tol = 1e-6): boolean {
  return near(a.x, b.x, tol) && near(a.y, b.y, tol);
}
const O = { x: 0, y: 0 };

// --- polar engancha a 0° ---------------------------------------------------
const p0 = polarSnap(O, { x: 10, y: 0.1 }, 45);
assert.ok(p0.snapped && near(p0.angle, 0), "casi horizontal → engancha a 0°");
assert.ok(pointNear(p0.point, { x: 10, y: 0 }), "proyecta sobre el eje X");

// --- polar engancha a 45° --------------------------------------------------
const p45 = polarSnap(O, { x: 10, y: 10 }, 45);
assert.ok(p45.snapped && near(p45.angle, 45), "diagonal → 45°");
assert.ok(pointNear(p45.point, { x: 10, y: 10 }), "el punto exacto ya está sobre el rayo");

// --- ORTHO -----------------------------------------------------------------
const oX = orthoSnap(O, { x: 10, y: 3 });
assert.ok(oX.snapped && near(oX.angle, 0) && pointNear(oX.point, { x: 10, y: 0 }), "ORTHO fuerza a horizontal");
const oY = orthoSnap(O, { x: 3, y: 10 });
assert.ok(oY.snapped && near(oY.angle, 90) && pointNear(oY.point, { x: 0, y: 10 }), "ORTHO fuerza a vertical");

// --- polar con tolerancia estrecha: fuera → libre --------------------------
const free = polarSnap(O, { x: 10, y: 10 }, 90, 5);
assert.ok(!free.snapped && near(free.angle, 45), "45° lejos de 0/90 con tol 5 → libre");
assert.ok(pointNear(free.point, { x: 10, y: 10 }), "el punto libre es el cursor tal cual");

// --- snap de distancia -----------------------------------------------------
assert.equal(snapDistance(23, 10), 20, "23 → 20");
assert.equal(snapDistance(27, 10), 30, "27 → 30");
assert.equal(snapDistance(5, 0), 5, "step 0 no cuantiza");

// --- polar + step ----------------------------------------------------------
const stepped = polarSnapWithStep(O, { x: 10, y: 10 }, 45, 5);
assert.ok(near(stepped.angle, 45) && near(stepped.distance, 15), "distancia 14.14 → 15");
assert.ok(pointNear(stepped.point, { x: 15 * Math.SQRT1_2, y: 15 * Math.SQRT1_2 }), "punto a 45° y distancia 15");

// --- degenerado ------------------------------------------------------------
const same = polarSnap(O, O, 45);
assert.ok(!same.snapped && near(same.distance, 0), "cursor sobre la base → sin enganche");

console.log("cad polar-tracking specs passed");
