/**
 * SPLINE por ajuste y por vértices de control.
 *
 * La comprobación que importa es la que separa las dos cosas que se confunden:
 * una spline de AJUSTE tiene que PASAR por los puntos designados. Usar los
 * puntos de ajuste como puntos de control produce una curva que se queda corta
 * en cada codo y parece bien hasta que alguien la acota. Aquí se evalúa la
 * curva emitida con el mismo teselado que usa el producto y se mide la
 * distancia real a cada punto designado.
 */
import { strict as assert } from "node:assert";
import { tessellateSpline } from "../../curve-tessellate";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_DRAW_SPLINE_COMMANDS } from "./draw-spline";
import { fitPointsToNurbs, simplifyWithinTolerance } from "./draw-spline";

const descriptor = CAD_DRAW_SPLINE_COMMANDS[0];

function makeContext(): CadCommandContext {
  let ids = 0;
  return {
    entityIds: [],
    entity: () => undefined,
    selection: [],
    activeLayer: "MUROS",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `id${++ids}`,
  };
}

function run(inputs: readonly CadCommandInput[]) {
  const context = makeContext();
  let step = descriptor.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, context);
  }
  return step.result;
}

const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const ENTER: CadCommandInput = { kind: "enter" };

function spline(result: ReturnType<typeof run>) {
  assert.ok(result && result.kind === "document", `debía producir documento, dio ${result?.kind}`);
  const command = result.commands[0];
  assert.ok(command && command.type === "insert");
  if (command.type !== "insert" || command.entity.type !== "spline") throw new Error("tipo");
  return command.entity;
}

/** Distancia mínima de un punto a la curva teselada. */
function distanceToCurve(
  curve: { x: number; y: number }[],
  target: { x: number; y: number },
): number {
  let best = Infinity;
  for (const sample of curve) best = Math.min(best, Math.hypot(sample.x - target.x, sample.y - target.y));
  return best;
}

const FIT_POINTS = [
  { x: 0, y: 0 },
  { x: 100, y: 200 },
  { x: 300, y: -100 },
  { x: 500, y: 150 },
];

// --- AJUSTE: la curva PASA por todos los puntos designados -------------------
{
  const entity = spline(run([...FIT_POINTS.map((p) => point(p.x, p.y)), ENTER]));
  assert.equal(entity.degree, 3, "el ajuste produce una cúbica");
  // 3 tramos → 3·3 + 1 = 10 puntos de control y 3·3 + 5 = 14 nudos, que es
  // exactamente `puntos + grado + 1`. Si no cuadrara, el teselado sintetizaría
  // nudos por su cuenta y la curva emitida no sería la que se ve.
  assert.equal(entity.controlPoints.length, 10, "10 puntos de control para 3 tramos");
  assert.equal(entity.knots.length, entity.controlPoints.length + entity.degree + 1);
  assert.equal(entity.knots.length, 14);

  const curve = tessellateSpline(entity.controlPoints, entity.degree, entity.knots, 600);
  for (const target of FIT_POINTS)
    assert.ok(
      distanceToCurve(curve, target) < 1,
      `la curva debe pasar por (${target.x}, ${target.y}); se queda a ${distanceToCurve(curve, target).toFixed(2)}`,
    );

  // Y el control: la MISMA lista tratada como puntos de control NO pasa por los
  // interiores. Es la diferencia que esta orden existe para respetar.
  const asControl = spline(
    run([keyword("Método"), keyword("CV"), ...FIT_POINTS.map((p) => point(p.x, p.y)), ENTER]),
  );
  const controlCurve = tessellateSpline(asControl.controlPoints, asControl.degree, asControl.knots, 600);
  assert.ok(
    distanceToCurve(controlCurve, FIT_POINTS[1]) > 30,
    "una spline por vértices de control NO toca sus puntos interiores",
  );
  // Los extremos sí, en los dos métodos: una B-spline clamped empieza y acaba
  // en su primer y último punto de control.
  assert.ok(distanceToCurve(controlCurve, FIT_POINTS[0]) < 1e-6);
  assert.ok(distanceToCurve(controlCurve, FIT_POINTS[3]) < 1e-6);
}

// --- CV: los puntos designados SON los puntos de control ---------------------
{
  const entity = spline(
    run([keyword("Método"), keyword("CV"), ...FIT_POINTS.map((p) => point(p.x, p.y)), ENTER]),
  );
  assert.equal(entity.controlPoints.length, 4, "copia directa, sin conversión");
  assert.deepEqual(
    entity.controlPoints.map((control) => [control.x, control.y]),
    FIT_POINTS.map((p) => [p.x, p.y]),
  );
  assert.equal(entity.degree, 3);
}

// --- Grado en modo CV --------------------------------------------------------
{
  const entity = spline(
    run([
      keyword("Método"),
      keyword("CV"),
      keyword("Grado"),
      distance(2),
      ...FIT_POINTS.map((p) => point(p.x, p.y)),
      ENTER,
    ]),
  );
  assert.equal(entity.degree, 2, "una cuadrática cuando se pide grado 2");
  assert.equal(entity.knots.length, entity.controlPoints.length + 2 + 1);
}

// --- Tolerancia: descarta puntos que ya quedan dentro de ella ----------------
{
  // Cinco puntos casi alineados: el intermedio se aparta 2 de la recta.
  const almostStraight = [
    { x: 0, y: 0 },
    { x: 100, y: 2 },
    { x: 200, y: 0 },
  ];
  assert.equal(simplifyWithinTolerance(almostStraight, 0).length, 3, "tolerancia 0 no descarta nada");
  assert.equal(
    simplifyWithinTolerance(almostStraight, 5).length,
    2,
    "con tolerancia 5, el punto a 2 de la cuerda sobra",
  );
  assert.equal(
    simplifyWithinTolerance(almostStraight, 1).length,
    3,
    "con tolerancia 1 el punto a 2 sigue mandando",
  );

  const entity = spline(
    run([
      keyword("Tolerancia"),
      distance(5),
      ...almostStraight.map((p) => point(p.x, p.y)),
      ENTER,
    ]),
  );
  // Un solo tramo → 4 puntos de control.
  assert.equal(entity.controlPoints.length, 4, "la curva se simplifica a un tramo");
}

// --- Cerrar ------------------------------------------------------------------
{
  const entity = spline(
    run([point(0, 0), point(200, 0), point(200, 200), point(0, 200), keyword("Cerrar")]),
  );
  assert.equal(entity.closed, true);
  const curve = tessellateSpline(entity.controlPoints, entity.degree, entity.knots, 400);
  const first = curve[0];
  const last = curve[curve.length - 1];
  assert.ok(
    Math.hypot(last.x - first.x, last.y - first.y) < 1,
    "una spline cerrada vuelve a su punto de partida",
  );
}

// --- degenerados no se escriben ---------------------------------------------
{
  assert.equal(run([point(0, 0), ENTER])?.kind, "none", "un punto no es una curva");
  assert.equal(fitPointsToNurbs([{ x: 0, y: 0 }]), null, "sin dos puntos no hay Bézier");
}

// --- nace en la capa activa ---------------------------------------------------
{
  assert.equal(spline(run([point(0, 0), point(100, 100), ENTER])).layer, "MUROS");
}

console.log(
  "SPLINE: el ajuste PASA por sus puntos (medido sobre la curva teselada) y CV no; " +
    "nudos coherentes con grado y puntos de control, grado, tolerancia y cierre verificados",
);
