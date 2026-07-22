/** Cotas asociativas (AXOS-CAD-DEPTH-A3). */
import { strict as assert } from "node:assert";
import type { CadVec2 } from "./primitives";
import {
  alignedDimension,
  DEFAULT_DIMENSION_STYLE,
  linearDimension,
  type DimensionStyle,
} from "./dimension";

function near(actual: number, expected: number, tol = 1e-6): boolean {
  return Math.abs(actual - expected) <= tol;
}
function pointNear(a: CadVec2, b: CadVec2, tol = 1e-6): boolean {
  return near(a.x, b.x, tol) && near(a.y, b.y, tol);
}

const style: DimensionStyle = {
  extensionGap: 2,
  extensionOvershoot: 3,
  arrowSize: 5,
  textGap: 4,
};

// --- cota alineada horizontal ---------------------------------------------
const h = alignedDimension({ x: 0, y: 0 }, { x: 100, y: 0 }, 20, style);
assert.ok(h, "cota alineada horizontal existe");
if (h) {
  assert.ok(near(h.measurement, 100), "mide la distancia real");
  assert.ok(pointNear(h.dimLine.a, { x: 0, y: 20 }), "línea de cota en el desfase (a)");
  assert.ok(pointNear(h.dimLine.b, { x: 100, y: 20 }), "línea de cota en el desfase (b)");
  assert.ok(near(h.textAngle, 0), "texto horizontal");
  assert.ok(h.textAnchor.y > 20, "texto por fuera de la línea de cota");
  assert.ok(near(h.textAnchor.x, 50), "texto centrado en x");
  // Extensiones verticales desde cada punto.
  assert.ok(pointNear(h.extensionA.a, { x: 0, y: 2 }), "extensión A arranca con hueco");
  assert.ok(pointNear(h.extensionA.b, { x: 0, y: 23 }), "extensión A sobresale la cota");
  assert.equal(h.arrowA.length, 3, "flecha A es triángulo");
  assert.equal(h.arrowB.length, 3, "flecha B es triángulo");
  assert.ok(pointNear(h.arrowA[0], { x: 0, y: 20 }), "punta de flecha A en el extremo");
  assert.ok(pointNear(h.arrowB[0], { x: 100, y: 20 }), "punta de flecha B en el extremo");
}

// --- cota alineada vertical ------------------------------------------------
const v = alignedDimension({ x: 0, y: 0 }, { x: 0, y: 100 }, 20, style);
assert.ok(v && near(v.measurement, 100), "cota vertical mide 100");
assert.ok(v && near(v.textAngle, 90), "texto vertical a 90°");
assert.ok(v && pointNear(v.dimLine.a, { x: -20, y: 0 }), "cota vertical desfasada a la izquierda");

// --- cota alineada diagonal ------------------------------------------------
const d = alignedDimension({ x: 0, y: 0 }, { x: 30, y: 40 }, 10, style);
assert.ok(d && near(d.measurement, 50), "cota diagonal 3-4-5 mide 50");
assert.ok(d && near(d.textAngle, (Math.atan2(40, 30) * 180) / Math.PI), "ángulo del texto = del tramo");
// Reversa: el texto sigue siendo legible (mismo ángulo, no de cabeza).
const dRev = alignedDimension({ x: 30, y: 40 }, { x: 0, y: 0 }, 10, style);
assert.ok(
  dRev && near(dRev.textAngle, (Math.atan2(40, 30) * 180) / Math.PI),
  "cota reversa mantiene texto legible",
);

// --- degenerado ------------------------------------------------------------
assert.equal(
  alignedDimension({ x: 5, y: 5 }, { x: 5, y: 5 }, 10, style),
  null,
  "puntos coincidentes → null",
);

// --- cota lineal horizontal (mide proyección en x) -------------------------
const lx = linearDimension({ x: 0, y: 0 }, { x: 100, y: 30 }, 10, "x", style);
assert.ok(lx && near(lx.measurement, 100), "lineal-x mide la proyección en x");
assert.ok(lx && near(lx.dimLine.a.y, 40), "línea de cota lineal-x en y=max+offset");
assert.ok(lx && near(lx.dimLine.a.x, 0) && near(lx.dimLine.b.x, 100), "extremos sobre las x de los puntos");
assert.ok(lx && near(lx.textAngle, 0), "texto de lineal-x horizontal");

// --- cota lineal vertical (mide proyección en y) ---------------------------
const ly = linearDimension({ x: 0, y: 0 }, { x: 40, y: 100 }, 10, "y", style);
assert.ok(ly && near(ly.measurement, 100), "lineal-y mide la proyección en y");
assert.ok(ly && near(ly.dimLine.a.x, 50), "línea de cota lineal-y en x=max+offset");
assert.ok(ly && near(ly.textAngle, 90), "texto de lineal-y vertical");

// --- lineal degenerado -----------------------------------------------------
assert.equal(
  linearDimension({ x: 5, y: 0 }, { x: 5, y: 100 }, 10, "x", style),
  null,
  "lineal-x sin separación en x → null",
);

// --- estilo por defecto ----------------------------------------------------
const def = alignedDimension({ x: 0, y: 0 }, { x: 1000, y: 0 }, 200);
assert.ok(def, "usa DEFAULT_DIMENSION_STYLE cuando se omite el estilo");
assert.ok(
  def && near(def.textAnchor.y, 200 + DEFAULT_DIMENSION_STYLE.textGap),
  "texto separado por textGap del estilo por defecto",
);

console.log("cad dimension specs passed");
