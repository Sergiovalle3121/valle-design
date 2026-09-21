/**
 * NURBS: evaluación racional, derivada y partición por inserción de nudo.
 *
 * Ancla contra tres oráculos independientes, no contra la propia
 * implementación:
 *
 *   1. Un CUARTO DE CÍRCULO unidad tiene representación NURBS EXACTA y
 *      conocida (control points (1,0),(1,1),(0,1), pesos (1,√2/2,1), grado 2):
 *      su punto, su curvatura (constante = 1/radio) y su cruce con una recta
 *      se pueden calcular a mano con trigonometría — sin pasar por
 *      `nurbs.ts` — y compararse contra lo que devuelve el módulo.
 *   2. `splitNurbsAt` de una Bézier cúbica PURA (pesos 1) debe coincidir con
 *      `bezierSplit` (De Casteljau) de `spline.ts`, que es una implementación
 *      completamente distinta de la MISMA operación.
 *   3. La tangente analítica de `nurbsPointAndTangent` debe coincidir con una
 *      diferencia finita centrada, que no comparte ni una línea de código con
 *      la derivada de De Boor.
 */
import { strict as assert } from "node:assert";
import { bezierSplit, type CubicBezier } from "./spline";
import {
  nurbsClosestParam,
  nurbsCurvatureAt,
  nurbsLineIntersections,
  nurbsPointAndTangent,
  nurbsPointAt,
  nurbsSubcurve,
  splitNurbsAt,
  type CadNurbsCurve,
} from "./nurbs";

let checks = 0;
function near(actual: number, expected: number, tolerance: number, what: string) {
  checks += 1;
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${what}: se esperaba ${expected} ±${tolerance}, salió ${actual}`,
  );
}

// --- Cuarto de círculo unidad como NURBS racional de grado 2 --------------
const quarterCircle: CadNurbsCurve = {
  controlPoints: [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
  weights: [1, Math.SQRT1_2, 1],
  degree: 2,
  knots: [0, 0, 0, 1, 1, 1],
};

{
  // El punto medio EXACTO de un cuarto de círculo es 45°: (√2/2, √2/2).
  const p = nurbsPointAt(quarterCircle, 0.5);
  near(p.x, Math.SQRT1_2, 1e-10, "cuarto de círculo, t=0.5, x");
  near(p.y, Math.SQRT1_2, 1e-10, "cuarto de círculo, t=0.5, y");
  for (let i = 0; i <= 10; i += 1) {
    const t = i / 10;
    const q = nurbsPointAt(quarterCircle, t);
    near(Math.hypot(q.x, q.y), 1, 1e-9, `cuarto de círculo permanece a radio 1 en t=${t}`);
  }
}

// --- Tangente analítica vs diferencia finita central -----------------------
{
  const h = 1e-6;
  for (const t of [0.2, 0.5, 0.8]) {
    const { tangent } = nurbsPointAndTangent(quarterCircle, t);
    const p1 = nurbsPointAt(quarterCircle, t + h);
    const p0 = nurbsPointAt(quarterCircle, t - h);
    near(tangent.x, (p1.x - p0.x) / (2 * h), 1e-4, `tangente.x en t=${t}`);
    near(tangent.y, (p1.y - p0.y) / (2 * h), 1e-4, `tangente.y en t=${t}`);
  }
}

// --- Curvatura constante = 1/radio en toda la curva -------------------------
for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) near(Math.abs(nurbsCurvatureAt(quarterCircle, t)), 1, 1e-6, `curvatura en t=${t}`);

// --- splitNurbsAt (De Boor/Boehm) coincide con bezierSplit (De Casteljau) --
{
  const bez: CubicBezier = { p0: { x: 0, y: 0 }, p1: { x: 1, y: 3 }, p2: { x: 3, y: 3 }, p3: { x: 4, y: 0 } };
  const nurbsBez: CadNurbsCurve = {
    controlPoints: [bez.p0, bez.p1, bez.p2, bez.p3],
    weights: [1, 1, 1, 1],
    degree: 3,
    knots: [0, 0, 0, 0, 1, 1, 1, 1],
  };
  const [left, right] = splitNurbsAt(nurbsBez, 0.4);
  const [expectLeft, expectRight] = bezierSplit(bez, 0.4);
  const leftExpected = [expectLeft.p0, expectLeft.p1, expectLeft.p2, expectLeft.p3];
  const rightExpected = [expectRight.p0, expectRight.p1, expectRight.p2, expectRight.p3];
  left.controlPoints.forEach((p, i) => {
    near(p.x, leftExpected[i].x, 1e-9, `split izquierdo, control point ${i}, x`);
    near(p.y, leftExpected[i].y, 1e-9, `split izquierdo, control point ${i}, y`);
  });
  right.controlPoints.forEach((p, i) => {
    near(p.x, rightExpected[i].x, 1e-9, `split derecho, control point ${i}, x`);
    near(p.y, rightExpected[i].y, 1e-9, `split derecho, control point ${i}, y`);
  });
}

// --- El tramo recortado es una NURBS EXACTA: extremos y curvatura ----------
{
  const sub = nurbsSubcurve(quarterCircle, 0.2, 0.7);
  const expectStart = nurbsPointAt(quarterCircle, 0.2);
  const expectEnd = nurbsPointAt(quarterCircle, 0.7);
  near(nurbsPointAt(sub, 0).x, expectStart.x, 1e-9, "subcurve: extremo inicial x EN el corte");
  near(nurbsPointAt(sub, 0).y, expectStart.y, 1e-9, "subcurve: extremo inicial y EN el corte");
  near(nurbsPointAt(sub, 1).x, expectEnd.x, 1e-9, "subcurve: extremo final x EN el corte");
  near(nurbsPointAt(sub, 1).y, expectEnd.y, 1e-9, "subcurve: extremo final y EN el corte");
  // 20 puntos intermedios: la curvatura del tramo sigue siendo la del original.
  for (let i = 0; i <= 20; i += 1) {
    const t = i / 20;
    near(Math.hypot(nurbsPointAt(sub, t).x, nurbsPointAt(sub, t).y), 1, 1e-8, `subcurve radio en t=${t}`);
    near(Math.abs(nurbsCurvatureAt(sub, t)), 1, 1e-6, `subcurve curvatura en t=${t}`);
  }
}

// --- Cruce con una recta, afinado por Newton --------------------------------
{
  const roots = nurbsLineIntersections(quarterCircle, { x: 0.5, y: -5 }, { x: 0.5, y: 5 });
  assert.equal(roots.length, 1, `se esperaba 1 cruce con x=0.5, salieron ${roots.length}`);
  checks += 1;
  const hit = nurbsPointAt(quarterCircle, roots[0]);
  near(hit.x, 0.5, 1e-9, "cruce con x=0.5: x");
  near(hit.y, Math.sqrt(1 - 0.25), 1e-9, "cruce con x=0.5: y = √(1−0.25) exacto");
}

// --- Multi-tramo: split/subcurve en un span distinto del primero -----------
{
  function clampedKnots(n: number, degree: number): number[] {
    const knots: number[] = [];
    const spans = n - degree;
    for (let i = 0; i <= degree; i += 1) knots.push(0);
    for (let i = 1; i < spans; i += 1) knots.push(i / spans);
    for (let i = 0; i <= degree; i += 1) knots.push(1);
    return knots;
  }
  const cps = [{ x: 0, y: 0 }, { x: 1, y: 4 }, { x: 3, y: 5 }, { x: 5, y: -2 }, { x: 7, y: 3 }, { x: 9, y: 0 }];
  const multi: CadNurbsCurve = { controlPoints: cps, weights: cps.map(() => 1), degree: 3, knots: clampedKnots(6, 3) };
  const sub = nurbsSubcurve(multi, 0.3, 0.75);
  for (let i = 0; i <= 20; i += 1) {
    const tSub = i / 20;
    const a = nurbsPointAt(sub, tSub);
    const b = nurbsPointAt(multi, 0.3 + tSub * 0.45);
    near(a.x, b.x, 1e-6, `multi-tramo subcurve x en tSub=${tSub}`);
    near(a.y, b.y, 1e-6, `multi-tramo subcurve y en tSub=${tSub}`);
  }
}

// --- Grado 1: curvatura 0, no lanza -----------------------------------------
{
  const linear: CadNurbsCurve = {
    controlPoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }],
    weights: [1, 1, 1],
    degree: 1,
    knots: [0, 0, 0.5, 1, 1],
  };
  near(nurbsCurvatureAt(linear, 0.25), 0, 1e-9, "curvatura de grado 1 es 0");
}

// --- Proyección al punto más cercano ----------------------------------------
{
  const t = nurbsClosestParam(quarterCircle, { x: 0, y: 2 });
  const p = nurbsPointAt(quarterCircle, t);
  near(p.x, 0, 1e-3, "proyección de (0,2): converge al extremo final (0,1)");
  near(p.y, 1, 1e-3, "proyección de (0,2): converge al extremo final (0,1)");
}

console.log(
  `nurbs: evaluación racional, tangente/curvatura analíticas y partición por inserción de ` +
    `nudo verificadas con ${checks} anclas (cuarto de círculo, cruce con recta, De Casteljau, multi-tramo)`,
);
