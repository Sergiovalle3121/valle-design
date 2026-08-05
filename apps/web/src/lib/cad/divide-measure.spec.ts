/** DIVIDE y MEASURE (VD-CAD-DEPTH-B6). */
import { strict as assert } from "node:assert";
import type { CadVec2 } from "./primitives";
import { dividePath, measurePath, pointAtDistance } from "./divide-measure";

function near(a: number, b: number, tol = 1e-6): boolean {
  return Math.abs(a - b) <= tol;
}
function pointNear(a: CadVec2, b: CadVec2): boolean {
  return near(a.x, b.x) && near(a.y, b.y);
}

const line: CadVec2[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
];

// --- pointAtDistance -------------------------------------------------------
assert.ok(pointNear(pointAtDistance(line, 40).point, { x: 40, y: 0 }), "punto a 40");
assert.ok(pointNear(pointAtDistance(line, 999).point, { x: 100, y: 0 }), "distancia recortada al final");

// --- DIVIDE ----------------------------------------------------------------
const div = dividePath(line, 4);
assert.equal(div.length, 3, "dividir en 4 → 3 puntos interiores");
assert.ok(pointNear(div[0].point, { x: 25, y: 0 }) && pointNear(div[2].point, { x: 75, y: 0 }), "puntos a 25/50/75");
assert.ok(near(div[0].angle, 0), "tangente horizontal");
const divEnds = dividePath(line, 4, true);
assert.equal(divEnds.length, 5, "con extremos → 5 puntos");
assert.ok(pointNear(divEnds[0].point, { x: 0, y: 0 }) && pointNear(divEnds[4].point, { x: 100, y: 0 }), "incluye inicio y fin");
assert.equal(dividePath(line, 0).length, 0, "parts < 1 → sin puntos");

// --- MEASURE ---------------------------------------------------------------
const meas = measurePath(line, 30);
assert.equal(meas.length, 3, "cada 30 en 100 → 3 marcas (30,60,90)");
assert.ok(pointNear(meas[0].point, { x: 30, y: 0 }), "primera marca a 30");
const measStart = measurePath(line, 30, true);
assert.equal(measStart.length, 4, "con inicio → 4 marcas");
assert.ok(pointNear(measStart[0].point, { x: 0, y: 0 }), "incluye el inicio");
assert.equal(measurePath(line, 0).length, 0, "intervalo ≤ 0 → sin marcas");

// --- camino en L (longitud de arco real por los tramos) --------------------
const ele: CadVec2[] = [
  { x: 0, y: 0 },
  { x: 0, y: 100 },
  { x: 100, y: 100 },
];
const half = dividePath(ele, 2);
assert.equal(half.length, 1, "dividir la L en 2 → 1 punto");
assert.ok(pointNear(half[0].point, { x: 0, y: 100 }), "el punto medio cae en la esquina (100 de 200)");
const measEle = measurePath(ele, 100);
assert.equal(measEle.length, 2, "cada 100 en 200 → 2 marcas");
assert.ok(pointNear(measEle[1].point, { x: 100, y: 100 }), "la última marca al final del camino");

console.log("cad divide-measure specs passed");
