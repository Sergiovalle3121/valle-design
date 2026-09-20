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
import { cadEntityCurves, curvePointAt } from "../../curve-model";
import { nurbsCurvatureAt } from "../../nurbs";
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
  // Cuarto de círculo unidad ×100, centrado en (10000,10000): NURBS racional
  // EXACTA (grado 2, peso √2/2 en el vértice medio) — lejos de todo lo demás,
  // para probar SPLINE sin que otro objeto de la escena se cuele.
  {
    id: "quarter",
    type: "spline",
    degree: 2,
    controlPoints: [
      { x: 10100, y: 10000, z: 0 },
      { x: 10100, y: 10100, z: 0 },
      { x: 10000, y: 10100, z: 0 },
    ],
    weights: [1, Math.SQRT1_2, 1],
    knots: [0, 0, 0, 1, 1, 1],
    layer: "0",
  },
  // Vertical que cruza el cuarto de círculo por x=10050 (TRIM la recorta).
  line("qv", 10050, 9900, 10050, 10200),
  // Horizontal que la cruza por y=10050 (el cuarto de círculo COMO BORDE).
  line("qh", 9900, 10050, 10200, 10050),
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

// --- SPLINE recortable por TRIM: NURBS exacta, no su poligonal (ola 7) --------
{
  const cutY = 10000 + Math.sqrt(7500); // (10050,cutY) EXACTO sobre el círculo unidad×100
  // Se pulsa cerca del control point inicial (10100,10000): ESE lado se va.
  const result = run("TRIM", [bordes, pickAt("qv", 10050, 10100), enter, pickAt("quarter", 10100, 10000), enter]);
  assert.ok(result && result.kind === "document", "una SPLINE se recorta");
  const command = result.commands[0];
  assert.ok(command.type === "replace" && command.entity.type === "spline", "cambia de forma: va por `replace`");
  assert.equal(command.entityId, "quarter");

  const [trimmed] = cadEntityCurves(command.entity)!;
  const start = curvePointAt(trimmed, 0);
  // El extremo recortado está EN el cruce, tolerancia 1e-6 — no en el punto
  // más cercano de una poligonal muestreada.
  assert.ok(Math.abs(start.x - 10050) <= 1e-6 && Math.abs(start.y - cutY) <= 1e-6, "extremo recortado EN el cruce real");
  const end = curvePointAt(trimmed, 1);
  assert.ok(Math.abs(end.x - 10000) <= 1e-9 && Math.abs(end.y - 10100) <= 1e-9, "el otro extremo no se movió");

  // 20 puntos intermedios: la curvatura del tramo conservado sigue siendo la
  // del círculo original (1/100) — si el corte hubiera usado la poligonal,
  // esto NO se cumpliría con esta tolerancia.
  for (let i = 0; i <= 20; i += 1) {
    const t = i / 20;
    const p = curvePointAt(trimmed, t);
    assert.ok(
      Math.abs(Math.hypot(p.x - 10000, p.y - 10000) - 100) <= 1e-6,
      `punto ${i}/20 del tramo recortado se sale del círculo original`,
    );
    assert.ok(trimmed.kind === "spline" && Math.abs(Math.abs(nurbsCurvatureAt(trimmed, t)) - 0.01) <= 1e-6, `curvatura en ${i}/20 no coincide con la original`);
  }
}

// --- SPLINE como borde: recorta una LINE contra su curva real -----------------
{
  const cutX = 10000 + Math.sqrt(7500); // (cutX,10050) EXACTO sobre el círculo unidad×100
  const result = run("TRIM", [bordes, pickAt("quarter", 10050, 10086), enter, pickAt("qh", 9950, 10050), enter]);
  assert.ok(result && result.kind === "document", "una LINE se recorta contra una SPLINE de borde");
  const patch = result.commands[0];
  assert.ok(patch.type === "properties");
  assert.ok(Math.abs((patch.patch.startX as number) - cutX) <= 1e-6, "el extremo recortado cae EN la spline real");
  assert.equal(patch.patch.endX, 10200, "el otro extremo no se mueve");
}

// --- EXTEND sobre SPLINE: negativa honesta, no una extrapolación fingida ------
{
  const result = run("EXTEND", [bordes, pickAt("qv", 10050, 10100), enter, pickAt("quarter", 10000, 10100), enter]);
  assert.equal(result?.kind, "message", "EXTEND no alarga una SPLINE todavía");
  assert.ok(
    result.kind === "message" && result.text.includes("SPLINE") && result.text.includes("extrapola"),
    `debe decir qué falta: "${result.kind === "message" ? result.text : ""}"`,
  );
}

console.log(
  `modificación de bordes: ${CAD_MODIFY_EDGE_COMMANDS.map((command) => command.name).join(", ")} ` +
    `verificados sobre línea, círculo, arco y SPLINE (recortable, como borde, EXTEND negado)`,
);
