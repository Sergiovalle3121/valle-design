/** Teselado de curvas: arco, elipse y spline por De Boor (CAD-NEXT-062). */
import { strict as assert } from "node:assert";
import {
  tessellateArc,
  tessellateDxfPrimitive,
  tessellateEllipse,
  tessellateSpline,
} from "./curve-tessellate";

const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;
const pointNear = (p: { x: number; y: number }, x: number, y: number, tol = 1e-6) =>
  near(p.x, x, tol) && near(p.y, y, tol);

// --- arco -------------------------------------------------------------------
const quarter = tessellateArc({ x: 0, y: 0 }, 10, 0, 90, 24);
assert.ok(pointNear(quarter[0], 10, 0), "el arco empieza en el ángulo inicial");
assert.ok(pointNear(quarter[quarter.length - 1], 0, 10), "y termina en el final");
assert.ok(
  quarter.every((p) => near(Math.hypot(p.x, p.y), 10)),
  "todos los puntos del arco están sobre el radio",
);
const full = tessellateArc({ x: 5, y: 5 }, 3, 0, 360, 24);
assert.ok(pointNear(full[0], full[full.length - 1].x, full[full.length - 1].y), "arco completo cierra");
assert.deepEqual(tessellateArc({ x: 0, y: 0 }, 0, 0, 90), [], "radio 0 → vacío");
// Barrido que cruza 0° (315→45): 90° de barrido, no 360-90.
const cross = tessellateArc({ x: 0, y: 0 }, 10, 315, 45, 24);
assert.ok(pointNear(cross[0], 10 * Math.SQRT1_2, -10 * Math.SQRT1_2), "empieza en 315°");
assert.ok(pointNear(cross[cross.length - 1], 10 * Math.SQRT1_2, 10 * Math.SQRT1_2), "termina en 45°");

// --- elipse -----------------------------------------------------------------
const ellipse = tessellateEllipse({ x: 5, y: 5 }, { x: 20, y: 0 }, 0.5, 0, 360, 24);
assert.ok(pointNear(ellipse[0], 25, 5), "t=0 cae en el extremo del eje mayor");
const quarterIdx = ellipse.findIndex((p) => pointNear(p, 5, 15, 1e-6));
assert.ok(quarterIdx > 0, "t=90° cae en el extremo del eje menor (razón 0.5)");
assert.ok(pointNear(ellipse[0], ellipse[ellipse.length - 1].x, ellipse[ellipse.length - 1].y), "elipse completa cierra");
// Elipse rotada: el eje mayor vertical rota toda la curva.
const rotated = tessellateEllipse({ x: 5, y: 5 }, { x: 0, y: 20 }, 0.5, 0, 360, 24);
assert.ok(pointNear(rotated[0], 5, 25), "eje mayor vertical → t=0 arriba");
assert.deepEqual(tessellateEllipse({ x: 0, y: 0 }, { x: 0, y: 0 }, 0.5), [], "eje mayor nulo → vacío");

// --- spline (De Boor) -------------------------------------------------------
const control = [
  { x: 0, y: 0 },
  { x: 10, y: 20 },
  { x: 30, y: 20 },
  { x: 40, y: 0 },
];
const bezierKnots = [0, 0, 0, 0, 1, 1, 1, 1];
const spline = tessellateSpline(control, 3, bezierKnots, 24);
assert.ok(pointNear(spline[0], 0, 0), "clamped: empieza en el primer punto de control");
assert.ok(pointNear(spline[spline.length - 1], 40, 0), "clamped: termina en el último");
// Con nudos [0..0,1..1] la B-spline ES la Bézier: en u=0.5 el de Casteljau da (20,15).
const mid = spline[12];
assert.ok(pointNear(mid, 20, 15, 1e-9), `u=0.5 → (20,15), no el polígono de control (got ${mid.x},${mid.y})`);
// La curva NO pasa por los puntos de control interiores (eso probaría que
// estamos dibujando la curva, no la poligonal).
assert.ok(
  !spline.some((p) => pointNear(p, 10, 20, 0.5)),
  "la curva no toca el control interior (10,20)",
);
// Sin nudos → se sintetizan clamped y los extremos se conservan.
const noKnots = tessellateSpline(control, 3, undefined, 24);
assert.ok(pointNear(noKnots[0], 0, 0) && pointNear(noKnots[noKnots.length - 1], 40, 0), "nudos sintetizados conservan extremos");
assert.deepEqual(tessellateSpline([{ x: 0, y: 0 }], 3), [], "un solo punto → vacío");

// --- despachador ------------------------------------------------------------
assert.equal(
  tessellateDxfPrimitive({ kind: "line", layer: "0", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }),
  null,
  "una línea no es curva → null (la maneja su propia vía)",
);
const viaDispatch = tessellateDxfPrimitive(
  { kind: "arc", layer: "0", points: [{ x: 0, y: 0 }], radius: 10, startAngle: 0, endAngle: 90 },
  24,
);
assert.ok(viaDispatch && pointNear(viaDispatch[0], 10, 0), "el arco se despacha al teselador");
const splineDispatch = tessellateDxfPrimitive(
  { kind: "spline", layer: "0", points: control, degree: 3, knots: bezierKnots },
  24,
);
assert.ok(splineDispatch && pointNear(splineDispatch[12], 20, 15, 1e-9), "la spline se despacha a De Boor");

console.log("cad curve-tessellate specs passed");
