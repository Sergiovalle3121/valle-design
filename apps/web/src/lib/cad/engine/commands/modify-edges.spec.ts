/**
 * TRIM, EXTEND y BREAK.
 *
 * Las afirmaciones que importan:
 *
 *   1. TRIM ELIMINA el trozo del lado DONDE SE PULSÓ — la convención de
 *      AutoCAD desde la campaña de cimientos. Es lo único que
 *      distingue recortar de borrar la mitad equivocada, y no se puede deducir
 *      de la geometría: hay que mirar el punto de designación.
 *   2. Recortar quince objetos es UN paso de deshacer. El comando acumula y
 *      emite un lote; si emitiera uno por objeto, Ctrl+Z desharía sólo el
 *      último y quien pulsó una vez creería haberlo deshecho todo.
 *   3. Lo que no se pudo tratar se CUENTA. Un TRIM que trata ocho de doce y
 *      calla deja creyendo que trató los doce.
 *   4. BREAK conserva el id del primer trozo, para no romper lo que apunta a la
 *      entidad original.
 *   5. Ola 3 «recortar» (2026-09-19): el comando abre en modo RÁPIDO — sin fase
 *      de bordes, un clic recorta contra todo lo visible —, y `Bordes` vuelve
 *      al flujo clásico de dos fases dentro de la MISMA invocación. La mayoría
 *      de los casos de abajo usan `Bordes` a propósito, para acotar el corte a
 *      UN borde concreto y comprobar la geometría sin que otro objeto de la
 *      escena se cuele; el primer bloque nuevo prueba el modo rápido en sí.
 *   6. La opción `Arista` (`Alargar`) trata un borde CORTO como si llegara:
 *      recortar o alargar contra su prolongación implícita, no sólo contra el
 *      cruce que ya existe.
 */
import { strict as assert } from "node:assert";
import type { CadEntity } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import { tessellateSpline } from "../../curve-tessellate";
import { createCadVariableAccess } from "../../system-variables";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_MODIFY_EDGE_COMMANDS } from "./modify-edges";

const commands = new Map(CAD_MODIFY_EDGE_COMMANDS.map((command) => [command.name, command]));

function line(id: string, x1: number, y1: number, x2: number, y2: number): CadEntity {
  return {
    id,
    type: "line",
    start: { x: x1, y: y1, z: 0 },
    end: { x: x2, y: y2, z: 0 },
    layer: "0",
  };
}

/**
 * Escena: una horizontal larga cruzada por una vertical en x=500, un círculo
 * centrado en el origen que la horizontal `low` atraviesa, un MTEXT que sirve
 * para comprobar que lo que no es geometría se rechaza nombrándolo, y —lejos
 * de todo lo anterior, para no interferir con TRIM/EXTEND— un arco y una
 * polilínea de dos tramos que usa BREAK.
 */
const SCENE: CadEntity[] = [
  line("h", 0, 100, 1000, 100),
  line("v", 500, 0, 500, 200),
  line("far", 0, 900, 300, 900),
  // Corta, apunta al borde vertical y NO llega: el caso de EXTEND.
  line("short", 0, 50, 200, 50),
  { id: "circ", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 50, layer: "0" },
  // Atraviesa el círculo de lado a lado por y=0: dos cortes en x=±50.
  line("low", -200, 0, 200, 0),
  {
    id: "note",
    type: "mtext",
    insertion: { x: 0, y: 0, z: 0 },
    text: "no es geometría",
    layer: "0",
  },
  // Semicírculo superior, de (2100,0) a (1900,0) pasando por (2000,100).
  {
    id: "arc1",
    type: "arc",
    center: { x: 2000, y: 0, z: 0 },
    radius: 100,
    startAngle: 0,
    endAngle: 180,
    layer: "0",
  },
  // Dos tramos rectos: (3000,0)→(3000,1000)→(4000,1000), sin cerrar.
  {
    id: "poly1",
    type: "polyline",
    vertices: [
      { x: 3000, y: 0, z: 0 },
      { x: 3000, y: 1000, z: 0 },
      { x: 4000, y: 1000, z: 0 },
    ],
    closed: false,
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
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `new${++ids}`,
  };
}

function run(name: string, inputs: readonly CadCommandInput[]) {
  const descriptor = commands.get(name);
  assert.ok(descriptor, `${name} debe existir`);
  const context = makeContext();
  let step = descriptor.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, context);
  }
  return step.result;
}

const enter: CadCommandInput = { kind: "enter" };
const pickAt = (entityId: string, x: number, y: number): CadCommandInput => ({
  kind: "entityPick",
  entityId,
  point: { x, y },
});
const point = (x: number, y: number): CadCommandInput => ({
  kind: "point",
  point: { x, y },
  source: "typed",
});
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
/**
 * El comando abre en modo rápido (T-1, ola 3); este input, en cabeza de la
 * secuencia, lo devuelve al flujo clásico de dos fases para que el resto de la
 * prueba —heredada de antes de esa ola— siga acotando el corte a los bordes
 * que designa a mano, sin que colarse cualquier otro objeto de la escena
 * cambie el resultado.
 */
const bordes: CadCommandInput = keyword("Bordes");

// --- TRIM elimina el lado donde se pulsó (convención AutoCAD) -------------------
{
  // Borde: la vertical en x=500. Se pulsa la horizontal a la IZQUIERDA (x=100),
  // así que ESE trozo se va y sobrevive el 500→1000.
  const left = run("TRIM", [bordes, pickAt("v", 500, 100), enter, pickAt("h", 100, 100), enter]);
  assert.ok(left && left.kind === "document");
  const leftPatch = left.commands[0];
  assert.ok(leftPatch.type === "properties");
  assert.equal(leftPatch.entityId, "h");
  assert.equal(leftPatch.patch.startX, 500, "lo pulsado se elimina: queda desde el borde");
  assert.equal(leftPatch.patch.endX, 1000, "hasta el final");

  // La misma orden pulsando a la DERECHA elimina el OTRO trozo. Si el punto
  // de designación no se usara, saldría idéntico a lo anterior.
  const right = run("TRIM", [bordes, pickAt("v", 500, 100), enter, pickAt("h", 900, 100), enter]);
  assert.ok(right && right.kind === "document");
  const rightPatch = right.commands[0];
  assert.ok(rightPatch.type === "properties");
  assert.equal(rightPatch.patch.startX, 0, "queda desde el origen");
  assert.equal(rightPatch.patch.endX, 500, "hasta el borde");
}

// --- varios recortes, UN solo lote --------------------------------------------
{
  const descriptor = commands.get("TRIM");
  assert.ok(descriptor);
  const context = makeContext();
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, bordes, context);
  step = descriptor.step(step.state, pickAt("v", 500, 100), context);
  step = descriptor.step(step.state, enter, context);
  // Se recorta la misma horizontal dos veces (a un lado y al otro): dos
  // designaciones dentro de la MISMA invocación.
  step = descriptor.step(step.state, pickAt("h", 100, 100), context);
  assert.ok(!step.result, "la orden sigue viva tras el primer recorte");
  step = descriptor.step(step.state, pickAt("h", 900, 100), context);
  assert.ok(!step.result, "y tras el segundo");
  step = descriptor.step(step.state, enter, context);
  assert.ok(step.result && step.result.kind === "document");
  assert.equal(
    step.result.commands.length,
    2,
    "los dos recortes salen en UN lote: un solo paso de deshacer",
  );
}

// --- `Todos` toma cualquier línea como borde (y es lo que ya hace el modo rápido) --
{
  const result = run("TRIM", [
    { kind: "keyword", keyword: "Todos" },
    pickAt("h", 100, 100),
    enter,
  ]);
  assert.ok(result && result.kind === "document", "sin designar bordes, valen todas las líneas");
}

// --- un CÍRCULO sí se recorta, y deja de ser un círculo -------------------------
{
  // Dos cortes (x=±50) contra la horizontal que lo atraviesa. Pinchando arriba
  // SE VA la media superior y sobrevive la inferior, como en AutoCAD.
  const result = run("TRIM", [bordes, pickAt("low", 0, 0), enter, pickAt("circ", 0, 50), enter]);
  assert.ok(result && result.kind === "document", "el círculo se recorta");
  const command = result.commands[0];
  assert.ok(
    command.type === "replace",
    "cambia de tipo, así que va por `replace` y CONSERVA el id",
  );
  assert.equal(command.entityId, "circ");
  assert.ok(command.entity.type === "arc");
  assert.equal(command.entity.startAngle, 180, "queda la media inferior: de 180°…");
  assert.equal(command.entity.endAngle, 0, "…a 0°, dando la vuelta por abajo");
}

// --- lo que no es geometría se cuenta -------------------------------------------
{
  const result = run("TRIM", [bordes, pickAt("v", 500, 100), enter, pickAt("note", 0, 0), enter]);
  assert.equal(result?.kind, "message", "un MTEXT no se recorta, y se dice");
  assert.ok(
    result.kind === "message" && result.text.includes("MTEXT"),
    `debe nombrar el tipo: "${result.kind === "message" ? result.text : ""}"`,
  );
}
{
  // Una línea que no cruza el borde: no se recorta, y se explica.
  const result = run("TRIM", [bordes, pickAt("v", 500, 100), enter, pickAt("far", 100, 900), enter]);
  assert.equal(result?.kind, "message");
  assert.ok(result.kind === "message" && result.text.includes("no cruza"));
}

// --- EXTEND alarga hasta el borde ----------------------------------------------
{
  const result = run("EXTEND", [bordes, pickAt("v", 500, 50), enter, pickAt("short", 100, 50), enter]);
  assert.ok(result && result.kind === "document", "la corta alcanza el borde alargándose");
  assert.equal(result.commands.length, 1);
  const patch = result.commands[0];
  assert.ok(patch.type === "properties");
  assert.equal(patch.entityId, "short");
  assert.equal(patch.patch.endX, 500, "el extremo que apuntaba al borde llega hasta él");
  assert.equal(patch.patch.startX, 0, "y el otro extremo no se mueve");
}

// --- BREAK parte con HUECO REAL entre los dos puntos ----------------------------
{
  // Se designa «h» en x=100 (primer punto por defecto) y se precisa x=400 como
  // segundo: el hueco [100,400] desaparece y quedan DOS líneas, no dos que se
  // tocan en el mismo punto.
  const result = run("BREAK", [pickAt("h", 100, 100), point(400, 100)]);
  assert.ok(result && result.kind === "document");
  assert.equal(result.commands.length, 2, "recortar el original e insertar el resto");
  const [kept, added] = result.commands;
  assert.ok(kept.type === "properties");
  assert.equal(
    kept.entityId,
    "h",
    "el primer trozo CONSERVA el id: lo que apunte a esta línea sigue apuntando",
  );
  assert.equal(kept.patch.startX, 0);
  assert.equal(kept.patch.endX, 100, "el primer trozo termina en x=100, NO en x=400: hay hueco real");
  assert.ok(added.type === "insert" && added.entity.type === "line");
  assert.equal(added.entity.start.x, 400, "el segundo trozo arranca al otro lado del hueco");
  assert.equal(added.entity.end.x, 1000);
  assert.equal(added.entity.layer, "0", "y hereda la capa del original, no la activa");
}

// --- BREAK: opción «Primer punto» sustituye el punto de designación ------------
{
  // Se designa «h» en x=900 (que sería el primer punto por defecto), pero se
  // pide `Primer punto` y se precisa x=100 en su lugar; el segundo punto es
  // x=400. El resultado debe ser IDÉNTICO al caso anterior (hueco [100,400]),
  // no [400,900].
  const result = run("BREAK", [
    pickAt("h", 900, 100),
    keyword("Primer punto"),
    point(100, 100),
    point(400, 100),
  ]);
  assert.ok(result && result.kind === "document", "«Primer punto» no debe abortar la orden");
  const [kept] = result.commands;
  assert.ok(kept.type === "properties");
  assert.equal(kept.entityId, "h");
  assert.equal(kept.patch.endX, 100, "el primer punto sustituido (x=100) manda, no el de designación (x=900)");
}

// --- BREAK en un extremo no parte nada -----------------------------------------
{
  const result = run("BREAK", [pickAt("h", 0, 100), point(0, 100)]);
  assert.equal(result?.kind, "message");
  assert.ok(result.kind === "message" && result.text.includes("extremo"));
}

// --- BREAK sobre un ARCO: se parte en DOS, como con una LINE --------------------
{
  // arc1: semicírculo de 0° a 180°, centro (2000,0), radio 100. Se rompe entre
  // 45° y 90°: sobreviven [0°,45°] (con el id) y nace [90°,180°].
  const p45 = { x: 2000 + 100 * Math.cos(Math.PI / 4), y: 100 * Math.sin(Math.PI / 4) };
  const p90 = { x: 2000, y: 100 };
  const result = run("BREAK", [pickAt("arc1", p45.x, p45.y), point(p90.x, p90.y)]);
  assert.ok(result && result.kind === "document", "BREAK ya admite ARC");
  assert.equal(result.commands.length, 2);
  const [kept, added] = result.commands;
  assert.ok(kept.type === "properties");
  assert.equal(kept.entityId, "arc1");
  assert.ok(Math.abs((kept.patch.startAngle as number) - 0) < 1e-6, `start ${kept.patch.startAngle}`);
  assert.ok(Math.abs((kept.patch.endAngle as number) - 45) < 1e-6, `end ${kept.patch.endAngle}`);
  assert.ok(added.type === "insert" && added.entity.type === "arc");
  assert.ok(Math.abs(added.entity.startAngle - 90) < 1e-6, `nuevo start ${added.entity.startAngle}`);
  assert.ok(Math.abs(added.entity.endAngle - 180) < 1e-6, `nuevo end ${added.entity.endAngle}`);
}

// --- BREAK sobre un CÍRCULO: siempre UNA sola pieza (un anillo no se parte en dos)
{
  // «circ»: centro (0,0), radio 50. Se rompe de 0° a 90°: se quita ese cuadrante
  // y sobrevive el arco de 270° restante, de 90° a 0° dando la vuelta.
  const result = run("BREAK", [pickAt("circ", 50, 0), point(0, 50)]);
  assert.ok(result && result.kind === "document", "BREAK ya admite CIRCLE");
  assert.equal(result.commands.length, 1, "un círculo partido da UNA pieza, no dos");
  const [replaced] = result.commands;
  assert.ok(replaced.type === "replace", "cambia de tipo: un círculo partido deja de ser círculo");
  assert.equal(replaced.entityId, "circ", "conserva el id");
  assert.ok(replaced.entity.type === "arc");
  assert.ok(Math.abs(replaced.entity.startAngle - 90) < 1e-6, `start ${replaced.entity.startAngle}`);
  assert.ok(Math.abs(replaced.entity.endAngle - 0) < 1e-6, `end ${replaced.entity.endAngle}`);
}

// --- BREAK sobre un CÍRCULO exige DOS puntos distintos --------------------------
{
  const result = run("BREAK", [pickAt("circ", 50, 0), point(50, 0)]);
  assert.equal(result?.kind, "message");
  assert.ok(result.kind === "message" && result.text.includes("coinciden"));
}

// --- BREAK sobre una POLYLINE: el hueco puede cruzar un vértice -----------------
{
  // poly1: (3000,0)→(3000,1000)→(4000,1000). Se rompe entre (3000,300), del
  // primer tramo, y (3500,1000), del segundo: el vértice de en medio desaparece
  // con el hueco.
  const result = run("BREAK", [pickAt("poly1", 3000, 300), point(3500, 1000)]);
  assert.ok(result && result.kind === "document", "BREAK ya admite POLYLINE");
  assert.equal(result.commands.length, 2);
  const [kept, added] = result.commands;
  assert.ok(kept.type === "replace" && kept.entity.type === "polyline");
  assert.equal(kept.entityId, "poly1");
  assert.equal(kept.entity.vertices.length, 2);
  assert.deepEqual(
    [kept.entity.vertices[0].x, kept.entity.vertices[0].y],
    [3000, 0],
    "el primer trozo arranca donde arrancaba la polilínea",
  );
  assert.deepEqual(
    [kept.entity.vertices[1].x, kept.entity.vertices[1].y],
    [3000, 300],
    "…y termina en el primer punto de ruptura",
  );
  assert.ok(added.type === "insert" && added.entity.type === "polyline");
  assert.deepEqual(
    [added.entity.vertices[0].x, added.entity.vertices[0].y],
    [3500, 1000],
    "el segundo trozo nace al otro lado del hueco, ya en el segundo tramo",
  );
  assert.deepEqual([added.entity.vertices[1].x, added.entity.vertices[1].y], [4000, 1000]);
}

// --- BREAK se niega ante lo que no es geometría de las cuatro admitidas --------
{
  const result = run("BREAK", [pickAt("note", 0, 0), point(0, 0)]);
  assert.equal(result?.kind, "message");
  assert.ok(
    result.kind === "message" && result.text.includes("MTEXT"),
    `debe nombrar el tipo: "${result.kind === "message" ? result.text : ""}"`,
  );
}

// --- BREAKATPOINT: la mitad de BREAK que corta SIN hueco, como orden propia ----
{
  const result = run("BREAKATPOINT", [pickAt("h", 100, 100), point(400, 100)]);
  assert.ok(result && result.kind === "document");
  assert.equal(result.commands.length, 2);
  const [kept, added] = result.commands;
  assert.ok(kept.type === "properties");
  assert.equal(kept.entityId, "h");
  assert.equal(kept.patch.startX, 0);
  assert.equal(kept.patch.endX, 400, "SIN hueco: el primer trozo llega justo hasta el punto");
  assert.ok(added.type === "insert" && added.entity.type === "line");
  assert.equal(added.entity.start.x, 400, "y el segundo arranca EN EL MISMO punto, sin separación");
  assert.equal(added.entity.end.x, 1000);
}
{
  // En un extremo no habría dos tramos, igual que en BREAK.
  const result = run("BREAKATPOINT", [pickAt("h", 0, 100), point(0, 100)]);
  assert.equal(result?.kind, "message");
  assert.ok(result.kind === "message" && result.text.includes("extremo"));
}

// --- BREAKATPOINT rechaza un CÍRCULO: no hay hueco cero identificable en un anillo
{
  const result = run("BREAKATPOINT", [pickAt("circ", 50, 0), point(50, 0)]);
  assert.equal(result?.kind, "message");
  assert.ok(
    result.kind === "message" && result.text.includes("CÍRCULO"),
    `debe explicar por qué: "${result.kind === "message" ? result.text : ""}"`,
  );
}

// --- REVERSE invierte LINE: el primer vértice pasa a ser el último -------------
{
  const result = run("REVERSE", [pickAt("h", 0, 0), enter]);
  assert.ok(result && result.kind === "document");
  assert.equal(result.commands.length, 1);
  const [command] = result.commands;
  assert.ok(command.type === "replace" && command.entity.type === "line");
  assert.equal(command.entityId, "h");
  assert.deepEqual(
    [command.entity.start.x, command.entity.start.y],
    [1000, 100],
    "el que era el FINAL pasa a ser el arranque",
  );
  assert.deepEqual([command.entity.end.x, command.entity.end.y], [0, 100]);
}

// --- REVERSE invierte POLYLINE: vértices Y bulges cambian de sentido -----------
{
  // Un cuarto de círculo entre dos vértices (bulge = tan(90°/4) = 1), cerrado
  // con un tercer vértice recto. El bulge tiene que seguir describiendo EL
  // MISMO arco visual tras invertir, sólo que recorrido al revés.
  const bulgy: CadEntity = {
    id: "curvy",
    type: "polyline",
    vertices: [
      { x: 0, y: 0, z: 0, bulge: 1 },
      { x: 100, y: 100, z: 0 },
      { x: 200, y: 0, z: 0 },
    ],
    closed: false,
    layer: "0",
  };
  const entities = new Map([bulgy].map((e) => [e.id, e]));
  let ids = 0;
  const context: CadCommandContext = {
    entityIds: [...entities.keys()],
    entity: (id) => entities.get(id),
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `rev${++ids}`,
  };
  const descriptor = commands.get("REVERSE")!;
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, pickAt("curvy", 0, 0), context);
  step = descriptor.step(step.state, enter, context);
  assert.ok(step.result && step.result.kind === "document");
  const [command] = step.result.commands;
  assert.ok(command.type === "replace" && command.entity.type === "polyline");
  const vertices = command.entity.vertices;
  assert.equal(vertices.length, 3);
  assert.deepEqual([vertices[0].x, vertices[0].y], [200, 0], "primer vértice = antiguo último");
  assert.deepEqual([vertices[2].x, vertices[2].y], [0, 0], "último vértice = antiguo primero");
  assert.ok(
    Math.abs((vertices[1].bulge ?? 0) - -1) < 1e-9,
    `el bulge del tramo del medio se NIEGA (mismo arco, al revés): ${vertices[1].bulge}`,
  );
  assert.ok(
    vertices[0].bulge === undefined || Math.abs(vertices[0].bulge) < 1e-9,
    "el tramo que antes no tenía bulge sigue sin tenerlo",
  );
}

// --- REVERSE invierte SPLINE: control points y pesos, igual que SPLINEDIT ------
{
  const spline: CadEntity = {
    id: "spl",
    type: "spline",
    degree: 2,
    controlPoints: [
      { x: 0, y: 0, z: 0 },
      { x: 50, y: 100, z: 0 },
      { x: 100, y: 0, z: 0 },
    ],
    knots: [0, 0, 0, 1, 1, 1],
    // Asimétricos a propósito: si REVERSE no invirtiera también los pesos, el
    // primero seguiría siendo 1 tras invertir los puntos, y no se notaría.
    weights: [1, 2, 3],
    layer: "0",
  };
  const entities = new Map([spline].map((e) => [e.id, e]));
  let ids = 0;
  const context: CadCommandContext = {
    entityIds: [...entities.keys()],
    entity: (id) => entities.get(id),
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `revspl${++ids}`,
  };
  const descriptor = commands.get("REVERSE")!;
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, pickAt("spl", 0, 0), context);
  step = descriptor.step(step.state, enter, context);
  assert.ok(step.result && step.result.kind === "document");
  const [command] = step.result.commands;
  assert.ok(command.type === "replace" && command.entity.type === "spline");
  assert.deepEqual(
    command.entity.controlPoints.map((p) => p.x),
    [100, 50, 0],
    "primer punto de control = antiguo último",
  );
  assert.deepEqual(command.entity.weights, [3, 2, 1], "los pesos viajan CON su punto, también invertidos");
}

// --- REVERSE invierte también los NUDOS de una SPLINE, no sólo puntos y pesos --
// (hallazgo del escepticismo de la ola 2): un vector de nudos CLAMPED UNIFORME
// —el único que este producto escribe al dibujar una spline propia— es
// simétrico, así que dejar los nudos intactos no se nota. Pero una spline
// IMPORTADA de un DXF ajeno trae nudos arbitrarios, y sin invertirlos la
// "misma curva al revés" es en realidad OTRA curva, distinta y silenciosa —
// exactamente el defecto que este comando existe para evitar. La medida real
// es geométrica: se tesela la curva ANTES de invertir y se compara, punto a
// punto, contra la curva que deja REVERSE recorrida en el mismo sentido.
{
  const controlPoints = [
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 40, z: 0 },
    { x: 30, y: -20, z: 0 },
    { x: 60, y: 50, z: 0 },
    { x: 100, y: 0, z: 0 },
  ];
  const degree = 3;
  // Longitud correcta (n=5, grado=3 → 9 nudos) y ASIMÉTRICA a propósito: el
  // nudo interior está en 0.35, no en 0.5. Un vector simétrico no distinguiría
  // "invertir los nudos" de "no tocarlos".
  const knots = [0, 0, 0, 0, 0.35, 1, 1, 1, 1];
  const spline: CadEntity = {
    id: "asymspl",
    type: "spline",
    degree,
    controlPoints,
    knots,
    layer: "0",
  };
  const entities = new Map([spline].map((e) => [e.id, e]));
  const context: CadCommandContext = {
    entityIds: [...entities.keys()],
    entity: (id) => entities.get(id),
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => "asymrev1",
  };
  const descriptor = commands.get("REVERSE")!;
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, pickAt("asymspl", 0, 0), context);
  step = descriptor.step(step.state, enter, context);
  assert.ok(step.result && step.result.kind === "document");
  const [command] = step.result.commands;
  assert.ok(command.type === "replace" && command.entity.type === "spline");

  const originalCurve = tessellateSpline(controlPoints, degree, knots, 32);
  const expectedReversedCurve = [...originalCurve].reverse();
  const producedCurve = tessellateSpline(
    command.entity.controlPoints,
    command.entity.degree,
    command.entity.knots,
    32,
  );
  let maxError = 0;
  for (let i = 0; i < expectedReversedCurve.length; i += 1) {
    maxError = Math.max(
      maxError,
      Math.hypot(
        producedCurve[i].x - expectedReversedCurve[i].x,
        producedCurve[i].y - expectedReversedCurve[i].y,
      ),
    );
  }
  assert.ok(
    maxError < 1e-6,
    `REVERSE con nudos asimétricos debe dibujar la MISMA curva al revés, no otra (error máximo: ${maxError})`,
  );
}

// --- REVERSE rechaza ARC a propósito: el esquema no guarda dirección propia ----
{
  const result = run("REVERSE", [pickAt("arc1", 0, 0), enter]);
  assert.equal(result?.kind, "message");
  assert.ok(
    result.kind === "message" && result.text.includes("LINE, POLYLINE y SPLINE"),
    `debe decir qué SÍ admite: "${result.kind === "message" ? result.text : ""}"`,
  );
}

// --- objetos de TIPOS DISTINTOS, un solo lote -------------------------------------
{
  // Que el círculo salga por `replace` y la línea por `properties` no debe
  // partir la orden en dos: sigue siendo UN paso de deshacer.
  const descriptor = commands.get("TRIM");
  assert.ok(descriptor);
  const context = makeContext();
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, { kind: "keyword", keyword: "Todos" }, context);
  step = descriptor.step(step.state, pickAt("circ", 0, 50), context);
  step = descriptor.step(step.state, pickAt("h", 100, 100), context);
  step = descriptor.step(step.state, enter, context);
  assert.ok(step.result && step.result.kind === "document");
  assert.equal(step.result.commands.length, 2, "un círculo y una línea, UN lote");
  assert.equal(step.result.commands[0].type, "replace", "el círculo cambia de tipo");
  assert.equal(step.result.commands[1].type, "properties", "la línea sólo mueve números");
}

// --- T-21/T-23: `Valla` recorta TODO lo que cruza, sin designar uno a uno ------
{
  // Misma escena y mismo borde («v», x=500) que el primer caso de esta
  // suite; en vez de pinchar «h» a mano, se arrastra una valla vertical que
  // la cruza en x=100 — el MISMO punto de designación, así que el resultado
  // tiene que ser idéntico: se va el lado izquierdo.
  const fence = run("TRIM", [
    bordes,
    pickAt("v", 500, 100),
    enter,
    { kind: "keyword", keyword: "Valla" },
    { kind: "point", point: { x: 100, y: -50 }, source: "typed" },
    { kind: "point", point: { x: 100, y: 150 }, source: "typed" },
    enter,
    enter,
  ]);
  assert.ok(fence && fence.kind === "document", "la valla sí produjo un recorte");
  const patch = fence.commands[0];
  assert.ok(patch.type === "properties");
  assert.equal(patch.entityId, "h");
  assert.equal(patch.patch.startX, 500, "el mismo resultado que pinchar h en x=100 a mano");
  assert.equal(patch.patch.endX, 1000);
}
{
  // Una valla que cruza VARIAS entidades las recorta todas en UN lote: la
  // valla vertical en x=100 cruza tanto «h» (y=100, frontera «v» en x=500)
  // como «low» (y=0, frontera «circ» en x=±50). `Todos` como frontera para
  // que las dos tengan contra qué recortar.
  const descriptor = commands.get("TRIM");
  assert.ok(descriptor);
  const context = makeContext();
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, { kind: "keyword", keyword: "Todos" }, context);
  step = descriptor.step(step.state, { kind: "keyword", keyword: "Valla" }, context);
  step = descriptor.step(step.state, { kind: "point", point: { x: 100, y: -50 }, source: "typed" }, context);
  step = descriptor.step(step.state, { kind: "point", point: { x: 100, y: 150 }, source: "typed" }, context);
  step = descriptor.step(step.state, enter, context);
  assert.ok(!step.result, "la valla recorta y la orden sigue viva, esperando más designación o Intro");
  step = descriptor.step(step.state, enter, context);
  assert.ok(step.result && step.result.kind === "document");
  assert.equal(step.result.commands.length, 2, "h y low, cada una recortada, en UN solo lote");
}

// --- T15: Esc conserva trims acumulados ----------------------------------------
{
  const cancel: CadCommandInput = { kind: "cancel" };
  // Borde: vertical en x=500. Recortar h en x=100 y luego en x=900, después Esc.
  const result = run("TRIM", [
    bordes,
    pickAt("v", 500, 100), enter,  // borde
    pickAt("h", 100, 100),         // primer trim
    pickAt("h", 900, 100),         // segundo trim
    cancel,                         // Esc
  ]);
  assert.ok(result && result.kind === "document", "TRIM: Esc después de 2 recortes produce lote");
  assert.equal(result.commands.length, 2, "TRIM: los 2 recortes se conservan");
}

// --- T16: TRIM dos veces sobre el mismo objeto ---------------------------------
{
  // Escena personalizada: dos bordes verticales y una horizontal larga.
  const t16Scene: CadEntity[] = [
    line("h", 0, 100, 1000, 100),
    line("e1", 100, 0, 100, 200),
    line("e2", 900, 0, 900, 200),
  ];
  const t16Entities = new Map(t16Scene.map((e) => [e.id, e]));
  let t16Ids = 0;
  const t16Ctx: CadCommandContext = {
    entityIds: [...t16Entities.keys()],
    entity: (id) => t16Entities.get(id),
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `t16_${++t16Ids}`,
  };
  const trim = commands.get("TRIM")!;
  let step = trim.begin(t16Ctx);
  step = trim.step(step.state, bordes, t16Ctx);
  // Fase bordes: e1 y e2
  step = trim.step(step.state, { kind: "entityPick", entityId: "e1", point: { x: 100, y: 100 } }, t16Ctx);
  step = trim.step(step.state, { kind: "entityPick", entityId: "e2", point: { x: 900, y: 100 } }, t16Ctx);
  step = trim.step(step.state, enter, t16Ctx);
  // Primer trim: pulsar a la izquierda de e1 (x=50) → elimina 0→100, queda 100→1000
  step = trim.step(step.state, { kind: "entityPick", entityId: "h", point: { x: 50, y: 100 } }, t16Ctx);
  // Segundo trim: pulsar a la derecha de e2 (x=950) → sobre la geometría YA recortada
  step = trim.step(step.state, { kind: "entityPick", entityId: "h", point: { x: 950, y: 100 } }, t16Ctx);
  step = trim.step(step.state, enter, t16Ctx);
  assert.ok(step.result && step.result.kind === "document", "T16: TRIM doble produce lote");
  const hPatches = step.result.commands.filter(
    (c) => c.type === "properties" && c.entityId === "h",
  ) as Extract<CadEntityCommand, { type: "properties" }>[];
  assert.equal(hPatches.length, 2, "T16: 2 propiedades para h (un trim por borde)");
  assert.equal(hPatches[0].patch.startX, 100, "T16: primer trim — startX pasa a 100 (borde e1)");
  assert.equal(hPatches[1].patch.endX, 900, "T16: segundo trim — endX pasa a 900 (borde e2, sobre geometría ya recortada)");
}

// --- T-1 (ola 3): modo RÁPIDO por defecto — sin fase de bordes -----------------
{
  // Tres líneas que se cruzan DOS A DOS («en cruz»): «a» horizontal, cruzada
  // por «b» (vertical, x=60) y por «c» (diagonal) en x=40; «b» y «c» se cruzan
  // entre sí en (60,20), así que ningún par comparte designación con otro. Sin
  // fase de bordes ni palabra clave, un solo clic en el tramo sobrante de «a»
  // —entre sus dos cortes— lo recorta contra el borde correcto.
  const crossScene: CadEntity[] = [
    line("a", 0, 0, 200, 0),
    line("b", 60, -100, 60, 100),
    line("c", 0, -40, 200, 160),
  ];
  const entities = new Map(crossScene.map((entity) => [entity.id, entity]));
  const context: CadCommandContext = {
    entityIds: [...entities.keys()],
    entity: (id) => entities.get(id),
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => "cross1",
  };
  const trim = commands.get("TRIM")!;
  const begin = trim.begin(context);
  assert.equal(
    begin.prompt.message,
    "Designe el objeto a recortar",
    "modo rápido: sin fase de bordes, se pide directamente el objeto",
  );
  assert.ok(
    begin.prompt.options.some((option) => option.keyword === "Bordes"),
    "y ofrece Bordes para quien quiera el flujo clásico",
  );
  assert.ok(
    begin.prompt.options.some((option) => option.keyword === "Arista"),
    "y Arista para el borde corto que no llega a cruzar",
  );
  let step = trim.step(begin.state, pickAt("a", 50, 0), context);
  assert.ok(!step.result, "el recorte se acumula; falta Intro para cerrar el lote");
  step = trim.step(step.state, enter, context);
  assert.ok(step.result && step.result.kind === "document", "un solo clic basta en modo rápido");
  assert.equal(step.result.commands.length, 2, "el tramo del medio se va: «a» queda partida en dos");
  const [kept, created] = step.result.commands;
  assert.ok(kept.type === "properties" && kept.entityId === "a");
  assert.equal(kept.patch.startX, 0);
  assert.equal(kept.patch.endX, 40, "el primer cacho llega hasta el corte con «c» (x=40)");
  assert.ok(created.type === "insert" && created.entity.type === "line");
  assert.equal(created.entity.start.x, 60, "el segundo cacho arranca en el corte con «b» (x=60)");
  assert.equal(created.entity.end.x, 200);
}

// --- TRIMEXTENDMODE decide el arranque, no sólo `Bordes` dentro del comando ---
{
  const context: CadCommandContext = { ...makeContext(), variables: createCadVariableAccess({ TRIMEXTENDMODE: 0 }) };
  const trim = commands.get("TRIM")!;
  const begin = trim.begin(context);
  assert.equal(
    begin.prompt.message,
    "Designe los bordes de corte",
    "TRIMEXTENDMODE=0 arranca en el flujo clásico sin que nadie teclee Bordes",
  );
}

// --- Opción `Arista`: un borde corto cuenta prolongado -------------------------
{
  // «e» es un tramo vertical en x=100 de y=10 a y=50: NO incluye y=0, así que
  // no cruza a «t» de verdad. Prolongado (Arista: Alargar) sí lo hace, en
  // x=100.
  const edgeScene: CadEntity[] = [line("t", 0, 0, 200, 0), line("e", 100, 10, 100, 50)];
  const entities = new Map(edgeScene.map((entity) => [entity.id, entity]));
  const context: CadCommandContext = {
    entityIds: [...entities.keys()],
    entity: (id) => entities.get(id),
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => "edge1",
  };
  const trim = commands.get("TRIM")!;

  // Sin Arista (No alargar, el valor de fábrica): el borde no llega.
  let plain = trim.step(trim.begin(context).state, pickAt("t", 50, 0), context);
  assert.ok(!plain.result, "el rechazo se cuenta; la orden sigue viva");
  plain = trim.step(plain.state, enter, context);
  assert.equal(plain.result?.kind, "message", "sin Arista, un borde que no llega no cuenta");
  assert.ok(plain.result?.kind === "message" && plain.result.text.includes("no cruza"));

  // Con Arista: Alargar, el MISMO borde, prolongado, sí cuenta.
  let extended = trim.step(trim.begin(context).state, keyword("Arista"), context);
  extended = trim.step(extended.state, keyword("Alargar"), context);
  extended = trim.step(extended.state, pickAt("t", 50, 0), context);
  extended = trim.step(extended.state, enter, context);
  assert.ok(
    extended.result && extended.result.kind === "document",
    "con Arista: Alargar, el borde corto sí recorta",
  );
  const patch = extended.result.commands[0];
  assert.ok(patch.type === "properties");
  assert.equal(patch.patch.startX, 100, "recorta contra la prolongación implícita de «e» (x=100)");
  assert.equal(patch.patch.endX, 200);
}

// --- `Arista` también alarga contra un contorno corto (EXTEND) -----------------
{
  const edgeScene: CadEntity[] = [line("s", 0, 0, 50, 0), line("e2", 100, 10, 100, 50)];
  const entities = new Map(edgeScene.map((entity) => [entity.id, entity]));
  const context: CadCommandContext = {
    entityIds: [...entities.keys()],
    entity: (id) => entities.get(id),
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => "edge2",
  };
  const extend = commands.get("EXTEND")!;

  let plain = extend.step(extend.begin(context).state, pickAt("s", 40, 0), context);
  plain = extend.step(plain.state, enter, context);
  assert.equal(plain.result?.kind, "message", "sin Arista, EXTEND tampoco alcanza el contorno corto");

  let extended = extend.step(extend.begin(context).state, keyword("Arista"), context);
  extended = extend.step(extended.state, keyword("Alargar"), context);
  extended = extend.step(extended.state, pickAt("s", 40, 0), context);
  extended = extend.step(extended.state, enter, context);
  assert.ok(
    extended.result && extended.result.kind === "document",
    "con Arista: Alargar, EXTEND alcanza la prolongación de «e2»",
  );
  const patch = extended.result.commands[0];
  assert.ok(patch.type === "properties");
  assert.equal(patch.patch.endX, 100, "el extremo que apuntaba al contorno llega hasta su prolongación");
  assert.equal(patch.patch.startX, 0);
}

console.log(
  `modificación de bordes: ${CAD_MODIFY_EDGE_COMMANDS.map((command) => command.name).join(", ")} ` +
    `verificados sobre línea, círculo y arco`,
);
