/** Cuartos poligonales (AXOS-CAD-DEPTH-A6). */
import { strict as assert } from "node:assert";
import type { CadVec2 } from "./primitives";
import {
  ensureOrientation,
  isClockwise,
  isConvex,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polygonPerimeter,
  polygonWalls,
  signedArea,
} from "./polygon-room";

function near(actual: number, expected: number, tol = 1e-6): boolean {
  return Math.abs(actual - expected) <= tol;
}
function pointNear(a: CadVec2 | null, b: CadVec2, tol = 1e-6): boolean {
  return a != null && near(a.x, b.x, tol) && near(a.y, b.y, tol);
}

const square: CadVec2[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

// --- cuadrado --------------------------------------------------------------
assert.ok(near(polygonArea(square), 100), "área del cuadrado 10×10");
assert.ok(near(polygonPerimeter(square), 40), "perímetro del cuadrado");
assert.ok(pointNear(polygonCentroid(square), { x: 5, y: 5 }), "centro del cuadrado");
assert.ok(isConvex(square), "el cuadrado es convexo");
assert.ok(!isClockwise(square), "el cuadrado dado va CCW");
assert.ok(signedArea(square) > 0, "área con signo positiva para CCW");
assert.equal(polygonWalls(square).length, 4, "el cuadrado tiene 4 muros");
assert.ok(pointInPolygon({ x: 5, y: 5 }, square), "el centro está dentro");
assert.ok(!pointInPolygon({ x: 11, y: 5 }, square), "un punto afuera está afuera");

// --- triángulo: centroide = promedio de vértices ---------------------------
const tri: CadVec2[] = [
  { x: 0, y: 0 },
  { x: 6, y: 0 },
  { x: 0, y: 9 },
];
assert.ok(near(polygonArea(tri), 27), "área del triángulo");
assert.ok(pointNear(polygonCentroid(tri), { x: 2, y: 3 }), "centroide = promedio de vértices");

// --- cuarto en L (cóncavo) -------------------------------------------------
const ele: CadVec2[] = [
  { x: 0, y: 0 },
  { x: 6, y: 0 },
  { x: 6, y: 3 },
  { x: 3, y: 3 },
  { x: 3, y: 6 },
  { x: 0, y: 6 },
];
assert.ok(near(polygonArea(ele), 27), "área de la L = 6×6 − 3×3 = 27");
assert.ok(!isConvex(ele), "la L no es convexa");
assert.ok(pointInPolygon({ x: 1, y: 1 }, ele), "punto en el ala de la L está dentro");
assert.ok(!pointInPolygon({ x: 5, y: 5 }, ele), "punto en la muesca de la L está fuera");

// --- orientación -----------------------------------------------------------
const cw = [...square].reverse();
assert.ok(isClockwise(cw), "el cuadrado invertido va CW");
assert.ok(signedArea(ensureOrientation(cw, false)) > 0, "ensureOrientation(CCW) corrige un polígono CW");
assert.ok(isClockwise(ensureOrientation(square, true)), "ensureOrientation(CW) invierte un polígono CCW");
assert.ok(!isClockwise(ensureOrientation(square, false)), "ensureOrientation(CCW) deja un CCW igual");

// --- degenerados -----------------------------------------------------------
assert.equal(polygonCentroid([{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 10 }]), null, "colineal → sin centroide");
assert.equal(pointInPolygon({ x: 0, y: 0 }, [{ x: 0, y: 0 }, { x: 1, y: 1 }]), false, "menos de 3 vértices → fuera");

console.log("cad polygon-room specs passed");
