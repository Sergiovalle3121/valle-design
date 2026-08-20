/**
 * BLEND.
 *
 * Lo que más importa afirmar es la GEOMETRÍA con número: que el puente sale
 * tangente de verdad (dirección exacta del primer mango), que «Suave» iguala
 * la curvatura con signo del arco de apoyo (±1/r, calculada de los puntos de
 * control con la fórmula de la Bézier), y que el clic elige el EXTREMO. Y los
 * rechazos, con su causa nombrada: cerradas, splines, la misma entidad dos
 * veces y extremos que ya se tocan.
 */
import { strict as assert } from "node:assert";
import type { CadEntity, CadPoint3 } from "../../cad-document";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_MODIFY_BLEND_COMMANDS } from "./modify-blend";

const blend = CAD_MODIFY_BLEND_COMMANDS[0];
assert.equal(blend.name, "BLEND");
assert.deepEqual([...blend.aliases], ["BLE"], "BLE es el alias de acad.pgp");

function near(actual: number, expected: number, tolerance: number, what: string) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${what}: se esperaba ${expected} ±${tolerance}, salió ${actual}`,
  );
}

const SCENE: CadEntity[] = [
  // Dos trozos colineales con hueco entre (10,0) y (25,0).
  { id: "a", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: "0" },
  { id: "b", type: "line", start: { x: 25, y: 0, z: 0 }, end: { x: 40, y: 0, z: 0 }, layer: "0" },
  // Arco cuyo INICIO está en (25,0) con tangente +X y curvatura +1/10 (CCW).
  {
    id: "arco",
    type: "arc",
    center: { x: 25, y: 10, z: 0 },
    radius: 10,
    startAngle: 270,
    endAngle: 0,
    layer: "0",
  },
  { id: "circulo", type: "circle", center: { x: 60, y: 0, z: 0 }, radius: 5, layer: "0" },
  {
    id: "cerrada",
    type: "polyline",
    vertices: [
      { x: 0, y: 50, z: 0 },
      { x: 10, y: 50, z: 0 },
      { x: 10, y: 60, z: 0 },
    ],
    closed: true,
    layer: "0",
  },
  {
    id: "curva",
    type: "spline",
    degree: 3,
    controlPoints: [
      { x: 0, y: 80, z: 0 },
      { x: 5, y: 85, z: 0 },
      { x: 10, y: 80, z: 0 },
      { x: 15, y: 85, z: 0 },
    ],
    knots: [0, 0, 0, 0, 1, 1, 1, 1],
    layer: "0",
  },
];

function makeContext(): CadCommandContext {
  const entities = new Map(SCENE.map((entity) => [entity.id, entity]));
  let ids = 0;
  return {
    entityIds: [...entities.keys()],
    entity: (id) => entities.get(id),
    selection: [],
    activeLayer: "PUENTES",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `n${++ids}`,
  };
}

function run(inputs: readonly CadCommandInput[], context = makeContext()) {
  let step = blend.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = blend.step(step.state, input, context);
  }
  return step.result;
}

const pick = (entityId: string, x: number, y: number): CadCommandInput => ({
  kind: "entityPick",
  entityId,
  point: { x, y },
});
const keyword = (word: string): CadCommandInput => ({ kind: "keyword", keyword: word });

type Spline = Extract<CadEntity, { type: "spline" }>;

function resultSpline(result: ReturnType<typeof run>): Spline {
  assert.ok(result && result.kind === "document", "BLEND debe emitir un lote de documento");
  assert.equal(result.commands.length, 1, "el puente es UNA entidad; las curvas no se tocan");
  const command = result.commands[0];
  assert.equal(command.type, "insert");
  if (command.type !== "insert") throw new Error("inalcanzable");
  const entity = command.entity as CadEntity;
  assert.equal(entity.type, "spline");
  return entity as Spline;
}

/** Curvatura con signo de una Bézier (grado n) en t=1, desde sus controles. */
function bezierEndCurvature(points: readonly CadPoint3[]): number {
  const n = points.length - 1;
  const b = points;
  const v = { x: n * (b[n].x - b[n - 1].x), y: n * (b[n].y - b[n - 1].y) };
  const a = {
    x: n * (n - 1) * (b[n].x - 2 * b[n - 1].x + b[n - 2].x),
    y: n * (n - 1) * (b[n].y - 2 * b[n - 1].y + b[n - 2].y),
  };
  const speed = Math.hypot(v.x, v.y);
  return (v.x * a.y - v.y * a.x) / (speed * speed * speed);
}

// --- Tangente entre dos líneas colineales: el puente es la recta que falta ------
{
  const spline = resultSpline(run([pick("a", 10, 0), pick("b", 25, 0)]));
  assert.equal(spline.degree, 3, "Tangente emite la cúbica");
  assert.equal(spline.controlPoints.length, 4);
  assert.deepEqual(spline.knots, [0, 0, 0, 0, 1, 1, 1, 1], "forma de Bézier de un tramo");
  assert.equal(spline.layer, "PUENTES", "el puente nace en la capa activa");
  near(spline.controlPoints[0].x, 10, 1e-9, "sale del extremo de a");
  near(spline.controlPoints[3].x, 25, 1e-9, "llega al extremo de b");
  for (const [index, point] of spline.controlPoints.entries())
    near(point.y, 0, 1e-9, `entre colineales el puente es recto (control ${index})`);
  near(spline.controlPoints[1].x, 15, 1e-9, "primer mango a d/3");
  near(spline.controlPoints[2].x, 20, 1e-9, "segundo mango a d/3");
}

// --- El clic elige el extremo: designar `b` cerca de (40,0) fusiona por ahí -----
{
  const spline = resultSpline(run([pick("a", 10, 0), pick("b", 40, 0)]));
  near(spline.controlPoints[3].x, 40, 1e-9, "el extremo lejano de b, no el cercano");
  // La tangente de llegada apunta hacia FUERA de b (dirección +X del mango).
  const handle = spline.controlPoints[2];
  assert.ok(handle.x > 40, `el mango de llegada continúa la marcha de b (x=${handle.x})`);
}

// --- Suave iguala la curvatura del arco de apoyo: ±1/r exacto --------------------
{
  const spline = resultSpline(
    run([keyword("CONtinuidad"), keyword("Suave"), pick("a", 10, 0), pick("arco", 25, 0)]),
  );
  assert.equal(spline.degree, 5, "Suave emite la quíntica");
  assert.equal(spline.controlPoints.length, 6);
  assert.deepEqual(spline.knots, [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]);
  near(spline.controlPoints[0].x, 10, 1e-9, "sale del extremo de a");
  near(spline.controlPoints[5].x, 25, 1e-9, "llega al inicio del arco");
  near(spline.controlPoints[5].y, 0, 1e-9, "…que está en (25,0)");
  // En la salida (recta): curvatura cero → los tres primeros controles alineados.
  near(spline.controlPoints[2].y, 0, 1e-9, "curvatura nula en la salida recta");
  // En la llegada: el arco es CCW con radio 10 → curvatura +0.1 con signo.
  near(bezierEndCurvature(spline.controlPoints), 0.1, 1e-9, "curvatura ±1/r igualada");
}

// --- Rechazos con causa nombrada -------------------------------------------------
{
  const closed = run([pick("circulo", 55, 0)]);
  assert.ok(closed && closed.kind === "message" && closed.text.includes("ABIERTAS"), "el círculo se rechaza por cerrado");

  const closedPoly = run([pick("cerrada", 0, 50)]);
  assert.ok(closedPoly && closedPoly.kind === "message" && closedPoly.text.includes("cerrada"), "la polilínea cerrada también");

  const nurbs = run([pick("curva", 0, 80)]);
  assert.ok(nurbs && nurbs.kind === "message" && nurbs.text.includes("SPLINE"), "la spline se rechaza nombrando el tipo");

  const twice = run([pick("a", 10, 0), pick("a", 0, 0)]);
  assert.ok(twice && twice.kind === "message" && twice.text.includes("distintas"), "la misma entidad dos veces se rechaza");

  // Dos curvas cuyos extremos designados COINCIDEN: no hay hueco que fusionar.
  const touching = run([pick("b", 25, 0), pick("arco", 25, 0)]);
  assert.ok(touching && touching.kind === "message" && touching.text.includes("JOIN"), "extremos que se tocan remiten a JOIN");
}

// --- La cancelación no emite nada ------------------------------------------------
{
  const cancelled = run([pick("a", 10, 0), { kind: "cancel" }]);
  assert.ok(cancelled && cancelled.kind === "none");
}

console.log("cad blend command specs passed");
