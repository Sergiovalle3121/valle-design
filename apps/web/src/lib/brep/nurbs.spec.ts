/**
 * NURBS contrastadas contra las analíticas.
 *
 * Ésta es la razón por la que en el encargo las superficies analíticas van
 * PRIMERO: una NURBS racional de grado 2 con pesos `1, √2/2, 1` representa un
 * arco de circunferencia EXACTO. Si la implementación de las bases o de la
 * racionalización está mal, los puntos dejan de estar a distancia `r` del eje —
 * y eso se detecta con una resta, sin necesidad de creerse nada.
 *
 * Sin la referencia analítica, la única prueba disponible sería "la superficie
 * pasa por sus puntos de control", que es exactamente el tipo de propiedad
 * vacía contra la que avisa el encargo: se cumple aunque el interior sea basura.
 */
import {
  basisFunsDerivatives,
  findSpan,
  makeNurbsSurface,
  nurbsCurveDerivatives,
  nurbsCurvePoint,
  nurbsPlanePatch,
  nurbsSurfaceDerivatives,
  nurbsSurfaceNormal,
  nurbsSurfacePoint,
  uniformClampedKnots,
  type NurbsCurve,
} from "./nurbs";
import { surfaceDerivatives, surfaceLineIntersect, surfaceProject, type BrepSurface } from "./surfaces";
import { check, checkClose, checkPointClose, checkThrows, makeRandom, randomIn, report } from "./spec-support";
import { v3Cross, v3Dot, v3Length, v3Normalize, v3Scale, v3Sub, vec3, V3_X } from "./vec3";

const HALF_SQRT2 = Math.SQRT1_2;

// --- Bases: partición de la unidad y soporte local ---
{
  const degree = 3;
  const count = 7;
  const knots = uniformClampedKnots(count, degree);
  check("nudos clamped tienen la longitud correcta", knots.length === count + degree + 1);
  const random = makeRandom(0x1234_abcd);
  let worstSum = 0;
  let worstDerivativeSum = 0;
  for (let i = 0; i < 300; i += 1) {
    const u = randomIn(random, 0, 1);
    const span = findSpan(count, degree, u, knots);
    const ders = basisFunsDerivatives(span, u, degree, 2, knots);
    const sum = ders[0].reduce((a, b) => a + b, 0);
    worstSum = Math.max(worstSum, Math.abs(sum - 1));
    // Las derivadas de una partición de la unidad SUMAN CERO. Es la comprobación
    // que caza un factorial mal puesto en A2.3.
    worstDerivativeSum = Math.max(
      worstDerivativeSum,
      Math.abs(ders[1].reduce((a, b) => a + b, 0)),
      Math.abs(ders[2].reduce((a, b) => a + b, 0)),
    );
  }
  check("las bases suman 1 (partición de la unidad)", worstSum < 1e-12, `peor ${worstSum.toExponential(3)}`);
  check("y sus derivadas suman 0", worstDerivativeSum < 1e-9, `peor ${worstDerivativeSum.toExponential(3)}`);
  check("findSpan en el extremo derecho no degenera", findSpan(count, degree, 1, knots) === count - 1);
  check("findSpan en el extremo izquierdo devuelve el grado", findSpan(count, degree, 0, knots) === degree);
}

// --- Curva racional = arco de circunferencia EXACTO ---
{
  const quarter: NurbsCurve = {
    kind: "nurbs-curve",
    degree: 2,
    knots: [0, 0, 0, 1, 1, 1],
    controlPoints: [vec3(1, 0, 0), vec3(1, 1, 0), vec3(0, 1, 0)],
    weights: [1, HALF_SQRT2, 1],
  };
  checkPointClose("el arco empieza en (1,0,0)", nurbsCurvePoint(quarter, 0), vec3(1, 0, 0));
  checkPointClose("y acaba en (0,1,0)", nurbsCurvePoint(quarter, 1), vec3(0, 1, 0));
  checkPointClose(
    "el punto medio del arco es (√2/2, √2/2, 0)",
    nurbsCurvePoint(quarter, 0.5),
    vec3(HALF_SQRT2, HALF_SQRT2, 0),
    1e-15,
  );
  let worst = 0;
  for (let i = 0; i <= 200; i += 1) {
    const point = nurbsCurvePoint(quarter, i / 200);
    worst = Math.max(worst, Math.abs(v3Length(point) - 1));
  }
  check("TODO punto del arco está a distancia 1 del origen", worst < 1e-14, `peor ${worst.toExponential(3)}`);

  // La tangente de una circunferencia es perpendicular al radio, en todo punto.
  let worstTangent = 0;
  for (let i = 1; i < 200; i += 1) {
    const u = i / 200;
    const ders = nurbsCurveDerivatives(quarter, u, 2);
    const radial = v3Normalize(ders[0]);
    const tangent = v3Normalize(ders[1]);
    worstTangent = Math.max(worstTangent, Math.abs(v3Dot(radial, tangent)));
  }
  check("la tangente es perpendicular al radio", worstTangent < 1e-12, `peor ${worstTangent.toExponential(3)}`);

  // Y la derivada segunda contra diferencias finitas: la curvatura no se salva
  // con un signo mal puesto.
  const h = 1e-4;
  let worstSecond = 0;
  for (let i = 5; i < 195; i += 1) {
    const u = i / 200;
    const ders = nurbsCurveDerivatives(quarter, u, 2);
    const fd = v3Scale(
      v3Sub(v3Sub(nurbsCurvePoint(quarter, u + h), v3Scale(ders[0], 2)), v3Scale(nurbsCurvePoint(quarter, u - h), -1)),
      1 / (h * h),
    );
    worstSecond = Math.max(worstSecond, v3Length(v3Sub(ders[2], fd)));
  }
  check("derivada segunda de la curva = diferencias finitas", worstSecond < 1e-4, `peor ${worstSecond.toExponential(3)}`);
}

// --- Parche bilineal = plano ---
{
  const patch = nurbsPlanePatch([vec3(0, 0, 0), vec3(4, 0, 0), vec3(4, 3, 0), vec3(0, 3, 0)]);
  checkPointClose("esquina (0,0)", nurbsSurfacePoint(patch, 0, 0), vec3(0, 0, 0));
  checkPointClose("esquina (1,1)", nurbsSurfacePoint(patch, 1, 1), vec3(4, 3, 0));
  checkPointClose("centro del parche", nurbsSurfacePoint(patch, 0.5, 0.5), vec3(2, 1.5, 0));
  checkPointClose("normal del parche plano = Z", nurbsSurfaceNormal(patch, 0.3, 0.7), vec3(0, 0, 1));
  const d = nurbsSurfaceDerivatives(patch, 0.4, 0.6, 2);
  checkPointClose("un plano no tiene curvatura en u", d[2][0], vec3(0, 0, 0), 1e-12);
  checkPointClose("ni en v", d[0][2], vec3(0, 0, 0), 1e-12);
  checkPointClose("ni cruzada", d[1][1], vec3(0, 0, 0), 1e-12);
}

// --- Superficie NURBS racional = cuarto de cilindro EXACTO ---
const RADIUS = 2.5;
const HEIGHT = 4;
const QUARTER_CYLINDER = makeNurbsSurface({
  degreeU: 2,
  degreeV: 1,
  countU: 3,
  countV: 2,
  knotsU: [0, 0, 0, 1, 1, 1],
  knotsV: [0, 0, 1, 1],
  controlPoints: [
    vec3(RADIUS, 0, 0),
    vec3(RADIUS, 0, HEIGHT),
    vec3(RADIUS, RADIUS, 0),
    vec3(RADIUS, RADIUS, HEIGHT),
    vec3(0, RADIUS, 0),
    vec3(0, RADIUS, HEIGHT),
  ],
  weights: [1, 1, HALF_SQRT2, HALF_SQRT2, 1, 1],
});

{
  let worstRadius = 0;
  let worstHeight = 0;
  for (let i = 0; i <= 40; i += 1) {
    for (let j = 0; j <= 10; j += 1) {
      const u = i / 40;
      const v = j / 10;
      const point = nurbsSurfacePoint(QUARTER_CYLINDER, u, v);
      worstRadius = Math.max(worstRadius, Math.abs(Math.hypot(point.x, point.y) - RADIUS));
      worstHeight = Math.max(worstHeight, Math.abs(point.z - v * HEIGHT));
    }
  }
  check(
    "la NURBS racional reproduce el cilindro EXACTO (radio constante)",
    worstRadius < 1e-13,
    `peor desvío de radio ${worstRadius.toExponential(3)}`,
  );
  check("y la altura es lineal en v", worstHeight < 1e-13, `peor ${worstHeight.toExponential(3)}`);
}
{
  // Contraste directo contra la superficie analítica: misma normal, mismo punto.
  const analytic: BrepSurface = {
    kind: "cylinder",
    frame: { origin: vec3(0, 0, 0), xAxis: vec3(1, 0, 0), yAxis: vec3(0, 1, 0), zAxis: vec3(0, 0, 1) },
    radius: RADIUS,
  };
  let worstNormal = 0;
  for (let i = 1; i < 40; i += 1) {
    for (let j = 1; j < 10; j += 1) {
      const point = nurbsSurfacePoint(QUARTER_CYLINDER, i / 40, j / 10);
      const nurbsNormal = nurbsSurfaceNormal(QUARTER_CYLINDER, i / 40, j / 10);
      const projected = surfaceProject(analytic, point);
      const analyticNormal = v3Normalize(vec3(point.x, point.y, 0));
      check(`el punto NURBS (${i},${j}) está sobre el cilindro analítico`, projected.distance < 1e-12);
      worstNormal = Math.max(worstNormal, 1 - Math.abs(v3Dot(nurbsNormal, analyticNormal)));
    }
  }
  check("y su normal coincide con la analítica", worstNormal < 1e-12, `peor ${worstNormal.toExponential(3)}`);
}

// --- Derivadas de superficie contra diferencias finitas ---
{
  const random = makeRandom(0xc0ffee);
  const h = 1e-4;
  let worstFirst = 0;
  let worstSecond = 0;
  for (let i = 0; i < 120; i += 1) {
    const u = randomIn(random, 0.05, 0.95);
    const v = randomIn(random, 0.05, 0.95);
    const d = surfaceDerivatives(QUARTER_CYLINDER, u, v);
    const p = (du: number, dv: number) => nurbsSurfacePoint(QUARTER_CYLINDER, u + du, v + dv);
    const fdU = v3Scale(v3Sub(p(h, 0), p(-h, 0)), 1 / (2 * h));
    const fdV = v3Scale(v3Sub(p(0, h), p(0, -h)), 1 / (2 * h));
    const fdUU = v3Scale(v3Sub(v3Sub(p(h, 0), v3Scale(d.point, 2)), v3Scale(p(-h, 0), -1)), 1 / (h * h));
    const fdUV = v3Scale(v3Sub(v3Sub(p(h, h), p(h, -h)), v3Sub(p(-h, h), p(-h, -h))), 1 / (4 * h * h));
    worstFirst = Math.max(worstFirst, v3Length(v3Sub(d.du, fdU)), v3Length(v3Sub(d.dv, fdV)));
    worstSecond = Math.max(worstSecond, v3Length(v3Sub(d.duu, fdUU)), v3Length(v3Sub(d.duv, fdUV)));
  }
  check("NURBS: derivadas primeras = diferencias finitas", worstFirst < 1e-5, `peor ${worstFirst.toExponential(3)}`);
  check("NURBS: derivadas segundas = diferencias finitas", worstSecond < 1e-3, `peor ${worstSecond.toExponential(3)}`);
}

// --- Proyección numérica contra proyección analítica ---
{
  const random = makeRandom(0x4242_9999);
  let worst = 0;
  let converged = 0;
  let attempts = 0;
  for (let i = 0; i < 120; i += 1) {
    // Puntos alrededor del cuadrante cubierto por el parche.
    const angle = randomIn(random, 0.15, Math.PI / 2 - 0.15);
    const distance = randomIn(random, 0.5, 6);
    const z = randomIn(random, 0.5, HEIGHT - 0.5);
    const point = vec3(Math.cos(angle) * distance, Math.sin(angle) * distance, z);
    const projection = surfaceProject(QUARTER_CYLINDER, point);
    attempts += 1;
    if (projection.converged) converged += 1;
    worst = Math.max(worst, Math.abs(projection.distance - Math.abs(distance - RADIUS)));
  }
  check("la proyección NURBS converge en todos los casos", converged === attempts, `${converged}/${attempts}`);
  check(
    "y da la MISMA distancia que la fórmula cerrada del cilindro",
    worst < 1e-6,
    `peor desvío ${worst.toExponential(3)}`,
  );
}

// --- Intersección recta-NURBS contra la analítica ---
{
  // Recta radial a 45° que atraviesa el cuadrante: debe cortar una sola vez.
  const direction = v3Normalize(vec3(1, 1, 0));
  const origin = vec3(0, 0, 2);
  const hits = surfaceLineIntersect(QUARTER_CYLINDER, origin, direction);
  check("la recta radial corta el parche una vez", hits.length === 1, `obtenidos ${hits.length}`);
  if (hits.length > 0) {
    checkClose("a distancia igual al radio", hits[0].t, RADIUS, 1e-6);
    checkClose("y el punto está en el cilindro", Math.hypot(hits[0].point.x, hits[0].point.y), RADIUS, 1e-6);
  }
  const missing = surfaceLineIntersect(QUARTER_CYLINDER, vec3(0, 0, 20), V3_X);
  check("una recta fuera del parche no lo corta", missing.length === 0, `obtenidos ${missing.length}`);
}

// --- Rechazos explícitos: mejor un error que una malla silenciosamente rota ---
checkThrows("malla de control incoherente se rechaza", () =>
  makeNurbsSurface({ degreeU: 1, degreeV: 1, countU: 2, countV: 2, controlPoints: [vec3(0, 0, 0)] }),
);
checkThrows("grado mayor que el número de puntos se rechaza", () =>
  makeNurbsSurface({
    degreeU: 5,
    degreeV: 1,
    countU: 2,
    countV: 2,
    controlPoints: [vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0), vec3(1, 1, 0)],
  }),
);
checkThrows("vector de nudos con longitud incorrecta se rechaza", () =>
  makeNurbsSurface({
    degreeU: 1,
    degreeV: 1,
    countU: 2,
    countV: 2,
    controlPoints: [vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0), vec3(1, 1, 0)],
    knotsU: [0, 0, 1],
  }),
);

// La normal de una superficie no degenerada nunca es nula.
{
  const normal = nurbsSurfaceNormal(QUARTER_CYLINDER, 0.5, 0.5);
  checkClose("la normal es unitaria", v3Length(normal), 1, 1e-12);
  const d = surfaceDerivatives(QUARTER_CYLINDER, 0.5, 0.5);
  checkClose("y perpendicular a du", v3Dot(normal, d.du), 0, 1e-9);
  checkClose("y a dv", v3Dot(normal, d.dv), 0, 1e-9);
  check("con du × dv no nulo", v3Length(v3Cross(d.du, d.dv)) > 1e-6);
}

report("brep/nurbs", 40);
