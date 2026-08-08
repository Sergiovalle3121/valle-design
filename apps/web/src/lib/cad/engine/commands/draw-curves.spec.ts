/**
 * ARC, ELLIPSE y POLYGON.
 *
 * Lo que se comprueba no es que emitan una entidad —eso lo diría un `typeof`—,
 * sino las cuatro decisiones geométricas que si se equivocan producen un dibujo
 * plausible y falso, que es la peor clase de error en un CAD:
 *
 *   1. Un arco de tres puntos designados en horario debe ser el MISMO arco que
 *      designados en antihorario, no su complementario.
 *   2. Un polígono circunscrito tiene el radio dado como APOTEMA, no como
 *      circunradio: confundirlos dibuja uno más pequeño del pedido.
 *   3. Una elipse cuyo segundo semieje resulte más largo es la elipse GIRADA
 *      90°, no un círculo con la razón recortada a 1.
 *   4. Una entidad degenerada no se escribe: se rechaza.
 */
import { strict as assert } from "node:assert";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_DRAW_CURVE_COMMANDS } from "./draw-curves";

const commands = new Map(CAD_DRAW_CURVE_COMMANDS.map((command) => [command.name, command]));

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

/** Recorre un comando con la lista de entradas y devuelve lo que produjo. */
function run(name: string, inputs: readonly CadCommandInput[]) {
  const descriptor = commands.get(name);
  assert.ok(descriptor, `${name} debe estar registrado`);
  const context = makeContext();
  let step = descriptor.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, context);
  }
  return step.result;
}

const point = (x: number, y: number): CadCommandInput => ({
  kind: "point",
  point: { x, y },
  source: "typed",
});
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });

function inserted(result: ReturnType<typeof run>) {
  assert.ok(result && result.kind === "document", "debía producir documento");
  const command = result.commands[0];
  assert.ok(command && command.type === "insert", "debía insertar una entidad");
  return command.entity;
}

// --- ARC: el sentido de designación no cambia el arco -------------------------
{
  // Semicircunferencia superior de radio 100 centrada en el origen, recorrida
  // en los dos sentidos posibles.
  const counter = inserted(run("ARC", [point(100, 0), point(0, 100), point(-100, 0)]));
  const clock = inserted(run("ARC", [point(-100, 0), point(0, 100), point(100, 0)]));
  assert.equal(counter.type, "arc");
  assert.equal(clock.type, "arc");
  if (counter.type !== "arc" || clock.type !== "arc") throw new Error("tipo");

  for (const arc of [counter, clock]) {
    assert.ok(Math.abs(arc.center.x) < 1e-6, "centro en el origen");
    assert.ok(Math.abs(arc.center.y) < 1e-6);
    assert.ok(Math.abs(arc.radius - 100) < 1e-6, "radio 100");
  }
  // El contrato DXF es antihorario de start a end. La mitad SUPERIOR va de 0° a
  // 180°; si el sentido de designación mandara, el segundo caso daría 180°→0°,
  // que es la mitad INFERIOR: el arco que el usuario no señaló.
  assert.ok(Math.abs(counter.startAngle - 0) < 1e-6, `start ${counter.startAngle}`);
  assert.ok(Math.abs(counter.endAngle - 180) < 1e-6, `end ${counter.endAngle}`);
  assert.ok(Math.abs(clock.startAngle - 0) < 1e-6, `designado al revés: start ${clock.startAngle}`);
  assert.ok(Math.abs(clock.endAngle - 180) < 1e-6, `designado al revés: end ${clock.endAngle}`);
}

// --- ARC: tres puntos alineados no son un arco -------------------------------
{
  const result = run("ARC", [point(0, 0), point(50, 0), point(100, 0)]);
  assert.equal(result?.kind, "none", "un arco de radio infinito no se escribe");
}

// --- ARC: centro, inicio y ángulo incluido -----------------------------------
{
  const entity = inserted(
    run("ARC", [
      keyword("Centro"),
      point(0, 0),
      point(100, 0),
      keyword("Ángulo"),
      { kind: "angle", degrees: 90 },
    ]),
  );
  if (entity.type !== "arc") throw new Error("tipo");
  assert.ok(Math.abs(entity.radius - 100) < 1e-6);
  assert.ok(Math.abs(entity.startAngle - 0) < 1e-6);
  assert.ok(Math.abs(entity.endAngle - 90) < 1e-6, `end ${entity.endAngle}`);
}
{
  // Ángulo negativo: el mismo arco recorrido al revés, que en DXF significa
  // intercambiar los extremos, no emitir un ángulo negativo prohibido.
  const entity = inserted(
    run("ARC", [
      keyword("Centro"),
      point(0, 0),
      point(100, 0),
      keyword("Ángulo"),
      { kind: "angle", degrees: -90 },
    ]),
  );
  if (entity.type !== "arc") throw new Error("tipo");
  assert.ok(entity.startAngle >= 0 && entity.startAngle < 360, "sin ángulos negativos");
  assert.ok(Math.abs(entity.startAngle - 270) < 1e-6, `start ${entity.startAngle}`);
  assert.ok(Math.abs(entity.endAngle - 0) < 1e-6, `end ${entity.endAngle}`);
}

// --- ELLIPSE: eje por dos extremos, y el semieje menor por distancia ---------
{
  const entity = inserted(run("ELLIPSE", [point(-100, 0), point(100, 0), point(0, 50)]));
  if (entity.type !== "ellipse") throw new Error("tipo");
  assert.ok(Math.abs(entity.center.x) < 1e-6, "el centro es el punto medio del eje");
  assert.ok(Math.abs(entity.majorAxis.x - 100) < 1e-6, "vector al extremo del eje mayor");
  assert.ok(Math.abs(entity.ratio - 0.5) < 1e-9, `ratio ${entity.ratio}`);
}

// --- ELLIPSE: el semieje «menor» más largo GIRA la elipse, no la recorta -----
{
  const entity = inserted(run("ELLIPSE", [point(-50, 0), point(50, 0), point(0, 200)]));
  if (entity.type !== "ellipse") throw new Error("tipo");
  assert.ok(entity.ratio <= 1, "DXF no admite razón mayor que 1");
  assert.ok(Math.abs(entity.ratio - 0.25) < 1e-9, `ratio ${entity.ratio}`);
  // El eje mayor pasa a ser el vertical, de longitud 200.
  assert.ok(Math.abs(entity.majorAxis.x) < 1e-6, `mayor.x ${entity.majorAxis.x}`);
  assert.ok(Math.abs(Math.abs(entity.majorAxis.y) - 200) < 1e-6, `mayor.y ${entity.majorAxis.y}`);
}

// --- ELLIPSE: degenerada, no se escribe --------------------------------------
{
  assert.equal(
    run("ELLIPSE", [point(0, 0), point(100, 0), point(50, 0)])?.kind,
    "none",
    "semieje menor nulo es un segmento, no una elipse",
  );
}

// --- POLYGON: inscrito pasa POR el radio dado --------------------------------
{
  const entity = inserted(run("POLYGON", [distance(6), point(0, 0), point(100, 0)]));
  if (entity.type !== "polyline") throw new Error("tipo");
  assert.equal(entity.vertices.length, 6, "seis lados, seis vértices");
  assert.equal(entity.closed, true, "un polígono se cierra");
  const radii = entity.vertices.map((vertex) => Math.hypot(vertex.x, vertex.y));
  for (const radius of radii)
    assert.ok(Math.abs(radius - 100) < 1e-6, `vértice a ${radius}, se pidió 100`);
}

// --- POLYGON: circunscrito trata el radio como APOTEMA ----------------------
{
  const entity = inserted(
    run("POLYGON", [distance(6), point(0, 0), keyword("Circunscrito"), point(100, 0)]),
  );
  if (entity.type !== "polyline") throw new Error("tipo");
  // Los vértices quedan MÁS LEJOS que la apotema: r / cos(π/6) ≈ 115,47. Si se
  // tratara el radio como circunradio, quedarían a 100 y el hexágono no
  // envolvería el círculo pedido.
  const expected = 100 / Math.cos(Math.PI / 6);
  for (const vertex of entity.vertices)
    assert.ok(
      Math.abs(Math.hypot(vertex.x, vertex.y) - expected) < 1e-6,
      `vértice a ${Math.hypot(vertex.x, vertex.y)}, se esperaba ${expected.toFixed(3)}`,
    );
  // Y la distancia del centro a cada LADO sí es la apotema pedida.
  const midpoint = {
    x: (entity.vertices[0].x + entity.vertices[1].x) / 2,
    y: (entity.vertices[0].y + entity.vertices[1].y) / 2,
  };
  assert.ok(
    Math.abs(Math.hypot(midpoint.x, midpoint.y) - 100) < 1e-6,
    "el círculo inscrito tiene el radio que se pidió",
  );
}

// --- POLYGON: por un lado ----------------------------------------------------
{
  const entity = inserted(
    run("POLYGON", [distance(4), keyword("Lado"), point(0, 0), point(100, 0)]),
  );
  if (entity.type !== "polyline") throw new Error("tipo");
  assert.equal(entity.vertices.length, 4);
  // Cuadrado de lado 100: todos los lados iguales.
  for (let index = 0; index < 4; index += 1) {
    const a = entity.vertices[index];
    const b = entity.vertices[(index + 1) % 4];
    assert.ok(
      Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - 100) < 1e-6,
      `lado ${index} mide ${Math.hypot(b.x - a.x, b.y - a.y)}`,
    );
  }
}

// --- POLYGON: número de lados fuera de rango, rechazo explícito --------------
{
  const result = run("POLYGON", [distance(2)]);
  assert.equal(result?.kind, "message", "no se dibuja un polígono de dos lados");
  assert.ok(
    result.kind === "message" && result.text.includes("2"),
    "y el aviso dice qué se pidió, no sólo que está mal",
  );
}

// --- POLYGON: Enter acepta el valor por defecto ------------------------------
{
  const entity = inserted(run("POLYGON", [{ kind: "enter" }, point(0, 0), point(100, 0)]));
  if (entity.type !== "polyline") throw new Error("tipo");
  assert.equal(entity.vertices.length, 4, "el defecto de AutoCAD es 4 lados");
}

// --- todo nace en la capa activa ---------------------------------------------
{
  for (const inputs of [
    ["ARC", [point(100, 0), point(0, 100), point(-100, 0)]] as const,
    ["ELLIPSE", [point(-100, 0), point(100, 0), point(0, 50)]] as const,
    ["POLYGON", [distance(5), point(0, 0), point(100, 0)]] as const,
  ]) {
    const entity = inserted(run(inputs[0], inputs[1]));
    assert.equal(entity.layer, "MUROS", `${inputs[0]} debe nacer en la capa activa`);
  }
}

console.log(
  `dibujo de curvas: ${CAD_DRAW_CURVE_COMMANDS.length} comandos (${CAD_DRAW_CURVE_COMMANDS.map((command) => command.name).join(", ")}) verificados`,
);
