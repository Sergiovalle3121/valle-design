/**
 * TRIM, EXTEND y BREAK.
 *
 * Las cuatro afirmaciones que importan:
 *
 *   1. TRIM conserva el trozo del lado DONDE SE PULSÓ. Es lo único que
 *      distingue recortar de borrar la mitad equivocada, y no se puede deducir
 *      de la geometría: hay que mirar el punto de designación.
 *   2. Recortar quince objetos es UN paso de deshacer. El comando acumula y
 *      emite un lote; si emitiera uno por objeto, Ctrl+Z desharía sólo el
 *      último y quien pulsó una vez creería haberlo deshecho todo.
 *   3. Lo que no se pudo tratar se CUENTA. Un TRIM que trata ocho de doce y
 *      calla deja creyendo que trató los doce.
 *   4. BREAK conserva el id del primer trozo, para no romper lo que apunta a la
 *      entidad original.
 */
import { strict as assert } from "node:assert";
import type { CadEntity } from "../../cad-document";
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
 * centrado en el origen que la horizontal `low` atraviesa, y un MTEXT que sirve
 * para comprobar que lo que no es geometría se rechaza nombrándolo.
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

// --- TRIM conserva el lado donde se pulsó -------------------------------------
{
  // Borde: la vertical en x=500. Se pulsa la horizontal a la IZQUIERDA (x=100),
  // así que sobrevive el trozo 0→500.
  const left = run("TRIM", [pickAt("v", 500, 100), enter, pickAt("h", 100, 100), enter]);
  assert.ok(left && left.kind === "document");
  const leftPatch = left.commands[0];
  assert.ok(leftPatch.type === "properties");
  assert.equal(leftPatch.entityId, "h");
  assert.equal(leftPatch.patch.startX, 0, "conserva desde el origen");
  assert.equal(leftPatch.patch.endX, 500, "hasta el borde");

  // La misma orden pulsando a la DERECHA debe conservar el OTRO trozo. Si el
  // punto de designación no se usara, saldría idéntico a lo anterior.
  const right = run("TRIM", [pickAt("v", 500, 100), enter, pickAt("h", 900, 100), enter]);
  assert.ok(right && right.kind === "document");
  const rightPatch = right.commands[0];
  assert.ok(rightPatch.type === "properties");
  assert.equal(rightPatch.patch.startX, 500, "conserva desde el borde");
  assert.equal(rightPatch.patch.endX, 1000, "hasta el final");
}

// --- varios recortes, UN solo lote --------------------------------------------
{
  const descriptor = commands.get("TRIM");
  assert.ok(descriptor);
  const context = makeContext();
  let step = descriptor.begin(context);
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

// --- `Todos` toma cualquier línea como borde ----------------------------------
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
  // sobrevive la media superior. Antes esto era un rechazo por tipo.
  const result = run("TRIM", [pickAt("low", 0, 0), enter, pickAt("circ", 0, 50), enter]);
  assert.ok(result && result.kind === "document", "el círculo se recorta");
  const command = result.commands[0];
  assert.ok(
    command.type === "replace",
    "cambia de tipo, así que va por `replace` y CONSERVA el id",
  );
  assert.equal(command.entityId, "circ");
  assert.ok(command.entity.type === "arc");
  assert.equal(command.entity.startAngle, 0, "media superior: de 0°…");
  assert.equal(command.entity.endAngle, 180, "…a 180°");
}

// --- lo que no es geometría se cuenta -------------------------------------------
{
  const result = run("TRIM", [pickAt("v", 500, 100), enter, pickAt("note", 0, 0), enter]);
  assert.equal(result?.kind, "message", "un MTEXT no se recorta, y se dice");
  assert.ok(
    result.kind === "message" && result.text.includes("MTEXT"),
    `debe nombrar el tipo: "${result.kind === "message" ? result.text : ""}"`,
  );
}
{
  // Una línea que no cruza el borde: no se recorta, y se explica.
  const result = run("TRIM", [pickAt("v", 500, 100), enter, pickAt("far", 100, 900), enter]);
  assert.equal(result?.kind, "message");
  assert.ok(result.kind === "message" && result.text.includes("no cruza"));
}

// --- EXTEND alarga hasta el borde ----------------------------------------------
{
  const result = run("EXTEND", [pickAt("v", 500, 50), enter, pickAt("short", 100, 50), enter]);
  assert.ok(result && result.kind === "document", "la corta alcanza el borde alargándose");
  assert.equal(result.commands.length, 1);
  const patch = result.commands[0];
  assert.ok(patch.type === "properties");
  assert.equal(patch.entityId, "short");
  assert.equal(patch.patch.endX, 500, "el extremo que apuntaba al borde llega hasta él");
  assert.equal(patch.patch.startX, 0, "y el otro extremo no se mueve");
}

// --- BREAK conserva el id del primer trozo -------------------------------------
{
  const result = run("BREAK", [pickAt("h", 100, 100), { kind: "point", point: { x: 400, y: 100 }, source: "typed" }]);
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
  assert.equal(kept.patch.endX, 400);
  assert.ok(added.type === "insert" && added.entity.type === "line");
  assert.equal(added.entity.start.x, 400, "el segundo trozo arranca en el corte");
  assert.equal(added.entity.end.x, 1000);
  assert.equal(added.entity.layer, "0", "y hereda la capa del original, no la activa");
}

// --- BREAK en un extremo no parte nada -----------------------------------------
{
  const result = run("BREAK", [pickAt("h", 0, 100), { kind: "point", point: { x: 0, y: 100 }, source: "typed" }]);
  assert.equal(result?.kind, "message");
  assert.ok(result.kind === "message" && result.text.includes("extremo"));
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

console.log(
  `modificación de bordes: ${CAD_MODIFY_EDGE_COMMANDS.map((command) => command.name).join(", ")} ` +
    `verificados sobre línea, círculo y arco`,
);
