/** Intersecciones de geometría (VD-CAD-DEPTH-A7). */
import { strict as assert } from "node:assert";
import type { CadVec2 } from "./primitives";
import {
  arcArcIntersections,
  circleCircleIntersections,
  lineArcIntersections,
  lineCircleIntersections,
  lineLineIntersection,
} from "./intersect";

function near(actual: number, expected: number, tol = 1e-6): boolean {
  return Math.abs(actual - expected) <= tol;
}
function pointNear(a: CadVec2, b: CadVec2, tol = 1e-6): boolean {
  return near(a.x, b.x, tol) && near(a.y, b.y, tol);
}
function hasPoint(list: CadVec2[], p: CadVec2): boolean {
  return list.some((q) => pointNear(q, p));
}

// --- línea-línea -----------------------------------------------------------
const x = lineLineIntersection(
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 5, y: -5 },
  { x: 5, y: 5 },
);
assert.ok(x && pointNear(x, { x: 5, y: 0 }), "cruce de dos rectas en (5,0)");
assert.equal(
  lineLineIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }, { x: 10, y: 1 }),
  null,
  "rectas paralelas no se cruzan",
);
assert.equal(
  lineLineIntersection(
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 5, y: -5 },
    { x: 5, y: 5 },
    true,
  ),
  null,
  "en modo segmento, el cruce fuera del segmento no cuenta",
);

// --- línea-círculo ---------------------------------------------------------
const secant = lineCircleIntersections(
  { x: -10, y: 0 },
  { x: 10, y: 0 },
  { x: 0, y: 0 },
  5,
);
assert.equal(secant.length, 2, "secante corta en dos puntos");
assert.ok(hasPoint(secant, { x: -5, y: 0 }) && hasPoint(secant, { x: 5, y: 0 }), "puntos en ±r");
const tangent = lineCircleIntersections(
  { x: -10, y: 5 },
  { x: 10, y: 5 },
  { x: 0, y: 0 },
  5,
);
assert.equal(tangent.length, 1, "tangente toca en un punto");
assert.ok(pointNear(tangent[0], { x: 0, y: 5 }), "punto de tangencia arriba");
assert.equal(
  lineCircleIntersections({ x: -10, y: 10 }, { x: 10, y: 10 }, { x: 0, y: 0 }, 5).length,
  0,
  "recta que no toca no interseca",
);
assert.equal(
  lineCircleIntersections({ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 0 }, 5, true).length,
  0,
  "segmento interno no alcanza la circunferencia",
);

// --- círculo-círculo -------------------------------------------------------
const cc = circleCircleIntersections({ x: 0, y: 0 }, 5, { x: 8, y: 0 }, 5);
assert.equal(cc.length, 2, "dos círculos que se solapan → dos puntos");
assert.ok(hasPoint(cc, { x: 4, y: 3 }) && hasPoint(cc, { x: 4, y: -3 }), "puntos en (4,±3)");
const ccTan = circleCircleIntersections({ x: 0, y: 0 }, 5, { x: 10, y: 0 }, 5);
assert.equal(ccTan.length, 1, "círculos tangentes → un punto");
assert.ok(pointNear(ccTan[0], { x: 5, y: 0 }), "tangencia en (5,0)");
assert.equal(
  circleCircleIntersections({ x: 0, y: 0 }, 5, { x: 20, y: 0 }, 5).length,
  0,
  "círculos lejanos no se tocan",
);
assert.equal(
  circleCircleIntersections({ x: 0, y: 0 }, 5, { x: 1, y: 0 }, 1).length,
  0,
  "círculo contenido no interseca",
);
assert.equal(
  circleCircleIntersections({ x: 0, y: 0 }, 5, { x: 0, y: 0 }, 3).length,
  0,
  "círculos concéntricos no intersecan",
);

// --- línea-arco (recortada al barrido) -------------------------------------
const la = lineArcIntersections(
  { x: -10, y: 0 },
  { x: 10, y: 0 },
  { x: 0, y: 0 },
  5,
  0,
  90,
);
assert.equal(la.length, 1, "sólo el punto dentro del barrido 0-90 cuenta");
assert.ok(pointNear(la[0], { x: 5, y: 0 }), "el punto a 0° sí, el de 180° no");

// --- arco-arco (recortada a ambos barridos) --------------------------------
const aa = arcArcIntersections(
  { x: 0, y: 0 },
  5,
  0,
  180,
  { x: 8, y: 0 },
  5,
  90,
  270,
);
assert.equal(aa.length, 1, "sólo (4,3) cae en ambos barridos");
assert.ok(pointNear(aa[0], { x: 4, y: 3 }), "el punto superior");

console.log("cad intersect specs passed");
