/**
 * TRIM y EXTEND sobre curvas que no son líneas.
 *
 * Lo que este spec vigila, por orden de gravedad:
 *
 *   1. Que la REGLA sea una sola y sea la de AutoCAD: el clic señala el tramo
 *      que SE ELIMINA (el que queda entre los cortes vecinos al clic), igual
 *      para línea, arco, círculo, elipse y polilínea. Si el tramo eliminado
 *      queda entre dos cortes de una curva abierta, el objeto se PARTE y la
 *      segunda mitad sale por `create`.
 *   2. Que el TIPO cambie cuando debe. Un círculo recortado ya no es un
 *      círculo: sale por `replace`, conservando el id, porque borrarlo y crear
 *      un arco rompería las cotas asociativas y los sombreados que lo apuntan.
 *   3. Que NINGÚN número emitido sea NaN. Es el modo de fallo documentado del
 *      repositorio: una coordenada no finita entra en el documento, se guarda y
 *      se exporta a DXF sin un solo error visible.
 *   4. Que los rechazos DIGAN por qué. «Una curva cerrada no tiene extremos» es
 *      información; el silencio es un fallo disfrazado de éxito.
 */
import { strict as assert } from "node:assert";
import type { CadEntity } from "./cad-document";
import {
  computeCadCurveExtend,
  computeCadCurveTrim,
  type CadCurveEditOutcome,
} from "./curve-edit";

let checks = 0;
function near(actual: number, expected: number, tolerance: number, what: string) {
  checks += 1;
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${what}: se esperaba ${expected} ±${tolerance}, salió ${actual}`,
  );
}

/** Todo número que sale de aquí acaba en el documento: ninguno puede ser NaN. */
function assertFinite(outcome: CadCurveEditOutcome, what: string) {
  checks += 1;
  assert.ok(!("error" in outcome), `${what}: se esperaba un cambio, salió "${(outcome as { error?: string }).error}"`);
  const numbers: number[] = [];
  if ("patch" in outcome && outcome.patch)
    for (const value of Object.values(outcome.patch)) if (typeof value === "number") numbers.push(value);
  if ("replace" in outcome && outcome.replace)
    JSON.stringify(outcome.replace, (_key, value) => {
      if (typeof value === "number") numbers.push(value);
      return value;
    });
  for (const value of numbers)
    assert.ok(Number.isFinite(value), `${what}: emitió un número no finito (${value})`);
}

const line = (id: string, x1: number, y1: number, x2: number, y2: number): CadEntity => ({
  id,
  type: "line",
  start: { x: x1, y: y1, z: 0 },
  end: { x: x2, y: y2, z: 0 },
  layer: "0",
});
const circle = (id: string, x: number, y: number, radius: number): CadEntity => ({
  id,
  type: "circle",
  center: { x, y, z: 0 },
  radius,
  layer: "0",
});
const arc = (id: string, radius: number, startAngle: number, endAngle: number): CadEntity => ({
  id,
  type: "arc",
  center: { x: 0, y: 0, z: 0 },
  radius,
  startAngle,
  endAngle,
  layer: "0",
});

let splitIds = 0;
const trim = (target: CadEntity, boundaries: CadEntity[], x: number, y: number) =>
  computeCadCurveTrim({
    target: target as never,
    boundaries,
    pick: { x, y },
    newEntityId: () => `split${(splitIds += 1)}`,
  });
const extend = (target: CadEntity, boundaries: CadEntity[], x: number, y: number) =>
  computeCadCurveExtend({ target: target as never, boundaries, pick: { x, y } });

// --- la regla es la de AutoCAD: se ELIMINA el lado donde se pulsó ---------------
{
  const horizontal = line("h", 0, 100, 1000, 100);
  const vertical = line("v", 500, 0, 500, 200);

  const left = trim(horizontal, [vertical], 100, 100);
  assertFinite(left, "TRIM izquierda");
  assert.ok("patch" in left && left.patch);
  near(left.patch!.startX as number, 500, 1e-9, "pulsar la izquierda la elimina: queda desde el borde");
  near(left.patch!.endX as number, 1000, 1e-9, "hasta el final");

  const right = trim(horizontal, [vertical], 900, 100);
  assert.ok("patch" in right && right.patch);
  near(right.patch!.startX as number, 0, 1e-9, "pulsar la derecha conserva desde el origen");
  near(right.patch!.endX as number, 500, 1e-9, "hasta el borde");
}

// --- una LÍNEA contra un CÍRCULO: dos cortes, tres tramos -----------------------
{
  const target = line("l", -20, 0, 20, 0);
  const cutter = circle("c", 0, 0, 5);

  const outside = trim(target, [cutter], -15, 0);
  assertFinite(outside, "TRIM línea/círculo fuera");
  assert.ok("patch" in outside && outside.patch);
  near(outside.patch!.startX as number, -5, 1e-9, "el saliente pulsado se va: queda desde el círculo");
  near(outside.patch!.endX as number, 20, 1e-9, "hasta el final original");

  // Pinchar DENTRO elimina la cuerda: el objeto SE PARTE en dos mitades,
  // exactamente lo que hace AutoCAD con una línea que atraviesa un círculo.
  const inside = trim(target, [cutter], 0, 0);
  assert.ok("patch" in inside && inside.patch, "la mitad inicial conserva el id por patch");
  near(inside.patch!.startX as number, -20, 1e-9, "la primera mitad arranca donde arrancaba");
  near(inside.patch!.endX as number, -5, 1e-9, "y muere en el primer corte");
  assert.ok("create" in inside && inside.create, "y nace la segunda mitad");
  assert.equal(inside.create!.type, "line");
  assert.ok(inside.create!.type === "line");
  near(inside.create!.start.x, 5, 1e-9, "que arranca en el segundo corte");
  near(inside.create!.end.x, 20, 1e-9, "y llega al final original");
  assert.notEqual(inside.create!.id, target.id, "con id PROPIO");

  // Sin generador de ids no se puede partir, y se dice en vez de fingir.
  const stuck = computeCadCurveTrim({
    target: target as never,
    boundaries: [cutter],
    pick: { x: 0, y: 0 },
  });
  assert.ok("error" in stuck && stuck.error.includes("parte el objeto"), "partir exige poder crear");
}

// --- un CÍRCULO recortado deja de ser un círculo ---------------------------------
{
  const target = circle("c", 0, 0, 10);
  const cutter = line("h", -20, 0, 20, 0);

  const upper = trim(target, [cutter], 0, 10);
  assertFinite(upper, "TRIM círculo arriba");
  assert.ok("replace" in upper && upper.replace, "cambia de tipo, así que va por `replace`");
  assert.equal(upper.replace!.id, "c", "y CONSERVA el id: lo que lo apunte sigue apuntando");
  assert.equal(upper.replace!.type, "arc");
  assert.ok(upper.replace!.type === "arc");
  near(upper.replace!.startAngle, 180, 1e-9, "pulsar arriba QUITA la mitad superior: queda de 180°…");
  near(upper.replace!.endAngle, 0, 1e-9, "…a 0°, dando la vuelta por abajo");

  const lower = trim(target, [cutter], 0, -10);
  assert.ok("replace" in lower && lower.replace && lower.replace.type === "arc");
  near(lower.replace!.startAngle, 0, 1e-9, "pulsar abajo conserva la superior: de 0°…");
  near(lower.replace!.endAngle, 180, 1e-9, "…a 180°");

  // UN solo corte no basta para una curva cerrada, y se dice.
  const tangent = trim(target, [line("t", -20, 10, 20, 10)], 0, 10);
  assert.ok("error" in tangent && tangent.error.includes("DOS cortes"), tangentMessage(tangent));
}
function tangentMessage(outcome: CadCurveEditOutcome): string {
  return `debía explicar que hacen falta dos cortes: ${JSON.stringify(outcome)}`;
}

// --- un ARCO se recorta moviendo ÁNGULOS, no puntos --------------------------------
{
  // Semicírculo superior de radio 10, cortado por la vertical x=0.
  const target = arc("a", 10, 0, 180);
  const cutter = line("v", 0, -20, 0, 20);
  const right = trim(target, [cutter], 10, 0);
  assertFinite(right, "TRIM arco derecha");
  assert.ok("patch" in right && right.patch);
  near(right.patch!.startAngle as number, 90, 1e-9, "pulsar el cuadrante derecho lo quita: queda de 90°…");
  near(right.patch!.endAngle as number, 180, 1e-9, "…a 180°");

  const left = trim(target, [cutter], -10, 0);
  assert.ok("patch" in left && left.patch);
  near(left.patch!.startAngle as number, 0, 1e-9, "y pulsar el izquierdo conserva de 0°…");
  near(left.patch!.endAngle as number, 90, 1e-9, "…a 90°");
}

// --- una ELIPSE completa se recorta en sus parámetros --------------------------------
{
  const target: CadEntity = {
    id: "e",
    type: "ellipse",
    center: { x: 0, y: 0, z: 0 },
    majorAxis: { x: 20, y: 0, z: 0 },
    ratio: 0.5,
    startParameter: 0,
    endParameter: 360,
    layer: "0",
  };
  // La vertical x=0 la corta en (0,±10), o sea en los parámetros 90° y 270°.
  const outcome = trim(target, [line("v", 0, -30, 0, 30)], 20, 0);
  assertFinite(outcome, "TRIM elipse");
  assert.ok("patch" in outcome && outcome.patch);
  near(outcome.patch!.startParameter as number, 90, 1e-6, "el sector que contiene (20,0) SE VA: queda de 90°");
  near(outcome.patch!.endParameter as number, 270, 1e-6, "a 270°, el lado que no se pulsó");
}

// --- una POLILÍNEA se recorta reconstruyendo sus vértices ------------------------------
{
  const target: CadEntity = {
    id: "p",
    type: "polyline",
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 10, y: 10, z: 0 },
    ],
    closed: false,
    layer: "0",
  };
  const cutter = line("v", 5, -5, 5, 5);

  const head = trim(target, [cutter], 2, 0);
  assertFinite(head, "TRIM polilínea cabeza");
  assert.ok("replace" in head && head.replace && head.replace.type === "polyline");
  assert.equal(head.replace!.vertices.length, 3, "pulsar la cabeza la elimina: quedan los otros tramos");
  near(head.replace!.vertices[0].x, 5, 1e-9, "arrancando en el corte");
  near(head.replace!.vertices[2].y, 10, 1e-9, "y llegando al final original");

  const tail = trim(target, [cutter], 8, 0);
  assert.ok("replace" in tail && tail.replace && tail.replace.type === "polyline");
  assert.equal(tail.replace!.vertices.length, 2, "pulsar tras el corte deja sólo la cabeza");
  near(tail.replace!.vertices[1].x, 5, 1e-9, "que muere en el corte");
}

// --- una POLILÍNEA CERRADA recortada se ABRE, y el tramo da la vuelta -------------------
{
  const square: CadEntity = {
    id: "sq",
    type: "polyline",
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 10, y: 10, z: 0 },
      { x: 0, y: 10, z: 0 },
    ],
    closed: true,
    layer: "0",
  };
  // Una vertical por x=5 corta el lado inferior y el superior.
  const outcome = trim(square, [line("v", 5, -5, 5, 15)], 0, 5);
  assertFinite(outcome, "TRIM polilínea cerrada");
  assert.ok("replace" in outcome && outcome.replace && outcome.replace.type === "polyline");
  assert.equal(
    outcome.replace!.closed,
    false,
    "queda ABIERTA: si siguiera cerrada, el trozo quitado volvería como cuerda de cierre",
  );
  // Se pulsó el lado IZQUIERDO (x=0): ése se va; queda la mitad derecha,
  // recorrida del corte inferior al superior.
  const vertices = outcome.replace!.vertices;
  near(vertices[0].x, 5, 1e-9, "arranca en el corte del lado inferior");
  near(vertices[0].y, 0, 1e-9, "");
  near(vertices[vertices.length - 1].x, 5, 1e-9, "y termina en el del superior");
  near(vertices[vertices.length - 1].y, 10, 1e-9, "");
}

// --- EXTEND: hasta el cruce MÁS CERCANO, por el extremo que se designa -----------------
{
  const stub = line("s", 0, 0, 1, 0);
  const target = circle("c", 5, 0, 1);
  const grown = extend(stub, [target], 1, 0);
  assertFinite(grown, "EXTEND línea a círculo");
  assert.ok("patch" in grown && grown.patch);
  near(grown.patch!.endX as number, 4, 1e-9, "para en el primer cruce, no atraviesa el círculo");
  near(grown.patch!.startX as number, 0, 1e-9, "y el otro extremo no se mueve");

  // Por el extremo INICIAL, y también al cruce más cercano a él.
  const back = extend(line("s2", 4, 0, 10, 0), [circle("c2", 0, 0, 1)], 4, 0);
  assert.ok("patch" in back && back.patch);
  near(back.patch!.startX as number, 1, 1e-9, "crece hacia atrás hasta el cruce inmediato");
  near(back.patch!.endX as number, 10, 1e-9, "sin tocar el final");
}

// --- EXTEND de un ARCO: crece en ángulo -------------------------------------------------
{
  const quarter = arc("q", 10, 0, 90);
  const boundary = line("b", -20, 0, -5, 0);
  const forward = extend(quarter, [boundary], 0, 10);
  assertFinite(forward, "EXTEND arco hacia delante");
  assert.ok("patch" in forward && forward.patch);
  near(forward.patch!.startAngle as number, 0, 1e-9, "el arranque no se mueve");
  near(forward.patch!.endAngle as number, 180, 1e-9, "y el final llega al contorno");

  const backward = extend(quarter, [boundary], 10, 0);
  assert.ok("patch" in backward && backward.patch);
  near(backward.patch!.startAngle as number, 180, 1e-9, "hacia atrás arranca en el contorno");
  near(backward.patch!.endAngle as number, 90, 1e-9, "y conserva su final");
}

// --- los rechazos dicen POR QUÉ ------------------------------------------------------------
{
  const closed = extend(circle("c", 0, 0, 10), [line("b", 50, -10, 50, 10)], 10, 0);
  assert.ok("error" in closed && closed.error.includes("cerrada"), "un círculo no se alarga");

  const far = trim(line("l", 0, 900, 300, 900), [line("v", 500, 0, 500, 200)], 100, 900);
  assert.ok("error" in far && far.error.includes("no cruza"), "lo que no cruza se dice");

  const unreachable = extend(line("l", 0, 0, 1, 0), [line("v", 0, 50, 0, 60)], 1, 0);
  assert.ok("error" in unreachable && unreachable.error.includes("más allá"), "lo que no alcanza, también");

  // Un SPLINE como borde no se aproxima por su poligonal: aplanarlo cortaría en
  // el sitio equivocado, y un corte equivocado parece geometría buena.
  const spline: CadEntity = {
    id: "sp",
    type: "spline",
    degree: 3,
    controlPoints: [
      { x: 5, y: -5, z: 0 },
      { x: 5, y: 0, z: 0 },
      { x: 5, y: 3, z: 0 },
      { x: 5, y: 5, z: 0 },
    ],
    knots: [0, 0, 0, 0, 1, 1, 1, 1],
    layer: "0",
  };
  const refused = trim(line("l", 0, 0, 10, 0), [spline], 2, 0);
  assert.ok("error" in refused, "un SPLINE no sirve de borde todavía");
}

// --- ningún número no finito, ni siquiera con geometría degenerada -----------------------
{
  const degenerate: CadEntity[] = [
    line("z", 3, 3, 3, 3),
    circle("r0", 0, 0, 0),
    arc("a0", 0, 0, 90),
    {
      id: "flat",
      type: "ellipse",
      center: { x: 0, y: 0, z: 0 },
      majorAxis: { x: 0, y: 0, z: 0 },
      ratio: 0.5,
      startParameter: 0,
      endParameter: 360,
      layer: "0",
    },
  ];
  const sane: CadEntity[] = [line("s", -50, 0, 50, 1), circle("c", 1, 1, 7), arc("a", 7, 20, 200)];
  for (const target of [...degenerate, ...sane])
    for (const boundary of [...degenerate, ...sane]) {
      if (target.id === boundary.id) continue;
      for (const outcome of [
        trim(target, [boundary], 1, 1),
        extend(target, [boundary], 1, 1),
      ]) {
        checks += 1;
        if ("error" in outcome) continue;
        const numbers: number[] = [];
        JSON.stringify(outcome, (_key, value) => {
          if (typeof value === "number") numbers.push(value);
          return value;
        });
        for (const value of numbers)
          assert.ok(
            Number.isFinite(value),
            `${target.type}/${boundary.type} emitió un no finito: ${JSON.stringify(outcome)}`,
          );
      }
    }
}

console.log(
  `edición de curvas: TRIM y EXTEND sobre línea, arco, círculo, elipse y polilínea ` +
    `(abierta y cerrada), con ${checks} comprobaciones y ningún número no finito`,
);
