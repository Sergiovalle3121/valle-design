/** Curvas spline / Bézier cúbica (VD-CAD-DEPTH-A10). */
import { strict as assert } from "node:assert";
import type { CadVec2 } from "./primitives";
import {
  bezierBounds,
  bezierLength,
  bezierPoint,
  bezierSplit,
  bezierTangent,
  bezierTessellate,
  catmullRomToBeziers,
  type CubicBezier,
} from "./spline";

function near(actual: number, expected: number, tol = 1e-6): boolean {
  return Math.abs(actual - expected) <= tol;
}
function pointNear(a: CadVec2, b: CadVec2, tol = 1e-6): boolean {
  return near(a.x, b.x, tol) && near(a.y, b.y, tol);
}

const straight: CubicBezier = {
  p0: { x: 0, y: 0 },
  p1: { x: 1, y: 0 },
  p2: { x: 2, y: 0 },
  p3: { x: 3, y: 0 },
};

// --- evaluación ------------------------------------------------------------
assert.ok(pointNear(bezierPoint(straight, 0), { x: 0, y: 0 }), "B(0) = p0");
assert.ok(pointNear(bezierPoint(straight, 1), { x: 3, y: 0 }), "B(1) = p3");
assert.ok(pointNear(bezierPoint(straight, 0.5), { x: 1.5, y: 0 }), "punto medio de una recta");
assert.ok(near(bezierLength(straight), 3), "longitud de una Bézier recta = 3");
assert.ok(bezierTangent(straight, 0.5).x > 0 && near(bezierTangent(straight, 0.5).y, 0), "tangente hacia +x");

// --- arco simétrico: B(0.5) = (5, 7.5) -------------------------------------
const arch: CubicBezier = {
  p0: { x: 0, y: 0 },
  p1: { x: 0, y: 10 },
  p2: { x: 10, y: 10 },
  p3: { x: 10, y: 0 },
};
assert.ok(pointNear(bezierPoint(arch, 0.5), { x: 5, y: 7.5 }), "punto medio del arco simétrico");
const ab = bezierBounds(arch);
assert.ok(near(ab.minX, 0) && near(ab.maxX, 10) && near(ab.minY, 0), "caja del arco");
assert.ok(ab.maxY > 7 && ab.maxY <= 7.5 + 1e-6, "la altura del arco no llega a 10");

// --- teselado --------------------------------------------------------------
assert.equal(bezierTessellate(straight, 4).length, 5, "teselado: segments+1 puntos");

// --- partición (De Casteljau) ----------------------------------------------
const [left, right] = bezierSplit(straight, 0.5);
assert.ok(pointNear(left.p0, { x: 0, y: 0 }), "izquierda arranca en p0");
assert.ok(pointNear(right.p3, { x: 3, y: 0 }), "derecha termina en p3");
assert.ok(pointNear(left.p3, right.p0), "las dos mitades se tocan en el corte");
assert.ok(pointNear(left.p3, { x: 1.5, y: 0 }), "el corte está en B(0.5)");
assert.ok(
  pointNear(bezierPoint(left, 0.5), bezierPoint(straight, 0.25)),
  "la mitad izquierda reparametriza la curva original",
);

// --- spline por puntos (Catmull-Rom) ---------------------------------------
const pts: CadVec2[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
];
const beziers = catmullRomToBeziers(pts);
assert.equal(beziers.length, 2, "una Bézier por tramo entre puntos");
assert.ok(pointNear(bezierPoint(beziers[0], 0), { x: 0, y: 0 }), "pasa por el primer punto");
assert.ok(pointNear(bezierPoint(beziers[0], 1), { x: 10, y: 0 }), "pasa por el punto intermedio");
assert.ok(pointNear(bezierPoint(beziers[1], 1), { x: 10, y: 10 }), "pasa por el último punto");
assert.equal(catmullRomToBeziers([{ x: 0, y: 0 }]).length, 0, "menos de 2 puntos → sin spline");

console.log("cad spline specs passed");
