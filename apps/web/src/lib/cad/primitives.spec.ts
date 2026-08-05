/** Geometría de primitivas puras del CAD (VD-CAD-DEPTH-A1). */
import { strict as assert } from "node:assert";
import {
  arcContainsAngle,
  arcPoint,
  arcSweepDeg,
  arcToPolyline,
  circleToPolyline,
  nearestDistance,
  norm360,
  primitiveArea,
  primitiveBounds,
  primitiveLength,
  primitivesBounds,
  rotatePrimitive,
  scalePrimitive,
  translatePrimitive,
  type CadPrimitive,
} from "./primitives";

function near(actual: number, expected: number, tol = 1e-6): boolean {
  return Math.abs(actual - expected) <= tol;
}

// --- ángulos ---------------------------------------------------------------
assert.equal(norm360(0), 0, "norm360 identidad");
assert.equal(norm360(360), 0, "norm360 envuelve 360");
assert.equal(norm360(-90), 270, "norm360 negativos");
assert.equal(norm360(450), 90, "norm360 mayores a 360");

assert.equal(arcSweepDeg(0, 90), 90, "barrido simple");
assert.equal(arcSweepDeg(350, 10), 20, "barrido cruzando 0");
assert.equal(arcSweepDeg(0, 0), 360, "start=end es circunferencia completa");
assert.equal(arcSweepDeg(90, 0), 270, "barrido CCW largo");

assert.ok(arcContainsAngle(45, 0, 90), "45° dentro de 0→90");
assert.ok(!arcContainsAngle(180, 0, 90), "180° fuera de 0→90");
assert.ok(arcContainsAngle(0, 350, 10), "0° dentro del arco que cruza 0");
assert.ok(arcContainsAngle(355, 350, 10), "355° dentro del arco que cruza 0");
assert.ok(!arcContainsAngle(180, 350, 10), "180° fuera del arco que cruza 0");

// --- arcPoint --------------------------------------------------------------
const p0 = arcPoint({ x: 0, y: 0 }, 10, 0);
assert.ok(near(p0.x, 10) && near(p0.y, 0), "arcPoint 0° → (r,0)");
const p90 = arcPoint({ x: 0, y: 0 }, 10, 90);
assert.ok(near(p90.x, 0) && near(p90.y, 10), "arcPoint 90° → (0,r)");

// --- bounds ----------------------------------------------------------------
const circle: CadPrimitive = { kind: "circle", center: { x: 5, y: 5 }, radius: 3 };
const cb = primitiveBounds(circle);
assert.ok(
  near(cb.minX, 2) && near(cb.minY, 2) && near(cb.maxX, 8) && near(cb.maxY, 8),
  "bounds de círculo",
);

// Arco del primer cuadrante (0→90): la caja va del centro a (r,r), NO abarca
// todo el círculo — ésa es la prueba clave de que no aproximamos por círculo.
const arcQ1: CadPrimitive = {
  kind: "arc",
  center: { x: 0, y: 0 },
  radius: 10,
  startAngle: 0,
  endAngle: 90,
};
const ab = primitiveBounds(arcQ1);
assert.ok(
  near(ab.minX, 0) && near(ab.minY, 0) && near(ab.maxX, 10) && near(ab.maxY, 10),
  "bounds de arco Q1 ceñido a (0,0)-(10,10)",
);

// Arco que cruza 90° incluye el punto cardinal superior (y = r).
const arcCrossTop: CadPrimitive = {
  kind: "arc",
  center: { x: 0, y: 0 },
  radius: 10,
  startAngle: 45,
  endAngle: 135,
};
const act = primitiveBounds(arcCrossTop);
assert.ok(near(act.maxY, 10), "arco que cruza 90° toca y=r");

const line: CadPrimitive = { kind: "line", a: { x: 0, y: 0 }, b: { x: 3, y: 4 } };
assert.ok(near(primitiveLength(line), 5), "longitud de línea 3-4-5");

const all = primitivesBounds([circle, line]);
assert.ok(all !== null && near(all.minX, 0) && near(all.maxX, 8), "bounds combinado");
assert.equal(primitivesBounds([]), null, "bounds de conjunto vacío es null");

// --- longitud y área -------------------------------------------------------
assert.ok(near(primitiveLength(circle), 2 * Math.PI * 3), "circunferencia");
assert.ok(
  near(primitiveLength(arcQ1), 10 * (Math.PI / 2)),
  "longitud de arco = r·θ",
);
const closedSquare: CadPrimitive = {
  kind: "polyline",
  points: [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ],
  closed: true,
};
assert.ok(near(primitiveLength(closedSquare), 16), "perímetro de cuadrado cerrado");
assert.ok(near(primitiveArea(closedSquare), 16), "área de cuadrado cerrado");
assert.ok(near(primitiveArea(circle), Math.PI * 9), "área de círculo");
assert.equal(primitiveArea(line), 0, "línea no encierra área");
assert.equal(primitiveArea(arcQ1), 0, "arco abierto no encierra área");

// --- transformaciones ------------------------------------------------------
const moved = translatePrimitive(circle, 10, -2);
assert.ok(
  moved.kind === "circle" && near(moved.center.x, 15) && near(moved.center.y, 3),
  "translate mueve el centro",
);

const rotated = rotatePrimitive(arcQ1, { x: 0, y: 0 }, 90);
assert.ok(
  rotated.kind === "arc" &&
    near(norm360(rotated.startAngle), 90) &&
    near(norm360(rotated.endAngle), 180),
  "rotate suma al ángulo del arco",
);
const rotatedLine = rotatePrimitive(
  { kind: "line", a: { x: 1, y: 0 }, b: { x: 2, y: 0 } },
  { x: 0, y: 0 },
  90,
);
assert.ok(
  rotatedLine.kind === "line" &&
    near(rotatedLine.a.x, 0) &&
    near(rotatedLine.a.y, 1) &&
    near(rotatedLine.b.x, 0) &&
    near(rotatedLine.b.y, 2),
  "rotate 90° de línea horizontal → vertical",
);

const scaled = scalePrimitive(circle, { x: 5, y: 5 }, 2);
assert.ok(
  scaled.kind === "circle" && near(scaled.radius, 6),
  "scale duplica el radio",
);

// --- distancia mínima ------------------------------------------------------
assert.ok(
  near(nearestDistance(circle, { x: 5, y: 5 }), 3),
  "distancia del centro al trazo del círculo = radio",
);
assert.ok(
  near(nearestDistance(circle, { x: 5, y: 10 }), 2),
  "distancia exterior al círculo",
);
assert.ok(
  near(nearestDistance(line, { x: 0, y: 0 }), 0),
  "punto sobre la línea",
);
// Punto fuera del barrido del arco: cae al extremo más cercano, NO a la
// circunferencia (que daría 0 para un punto a radio-distancia del centro).
// (-10,0) está a 180°, fuera de [0°,90°]; el extremo más cercano es (0,10).
const arcNear = nearestDistance(arcQ1, { x: -10, y: 0 });
assert.ok(
  near(arcNear, Math.hypot(10, 10)),
  "punto opuesto al arco Q1 usa el extremo, no la circunferencia",
);
// Punto radialmente alineado dentro del barrido: usa |dist-radio|.
assert.ok(
  near(nearestDistance(arcQ1, { x: 20, y: 0 }), 10),
  "punto dentro del barrido usa distancia radial",
);

// --- teselado --------------------------------------------------------------
const arcTess = arcToPolyline({ x: 0, y: 0 }, 10, 0, 90, 4);
assert.equal(arcTess.length, 5, "teselado de arco: segments+1 puntos");
assert.ok(near(arcTess[0].x, 10) && near(arcTess[0].y, 0), "arco teselado empieza en start");
assert.ok(
  near(arcTess[arcTess.length - 1].x, 0) && near(arcTess[arcTess.length - 1].y, 10),
  "arco teselado termina en end",
);
const circPoly = circleToPolyline({ x: 0, y: 0 }, 10, 6);
assert.equal(circPoly.length, 6, "teselado de círculo: N puntos");
assert.ok(
  circPoly.every((pt) => near(Math.hypot(pt.x, pt.y), 10)),
  "todos los vértices del círculo teselado están sobre el radio",
);

console.log("cad primitives specs passed");
