/**
 * ERASE, MOVE, COPY y OFFSET del motor de comandos (Ola 3).
 *
 * Lo que se prueba es el contrato que un dibujante da por hecho: seleccionar y
 * luego decir el comando funciona igual que decir el comando y luego
 * seleccionar; COPY es múltiple; y OFFSET calcula un desfase real, no una
 * traslación disfrazada.
 */
import { strict as assert } from "node:assert";
import type { CadEntity } from "../../cad-document";
import {
  EMPTY_CAD_COMMAND_ENGINE,
  cadCommandEngineReduce,
  type CadCommandAction,
  type CadCommandEffect,
  type CadCommandEngineState,
} from "../command-engine";
import { createCadCommandRegistry } from "../registry";
import { CAD_MODIFY_BASIC_COMMANDS } from "./modify-basics";
import { CAD_DRAW_BASIC_COMMANDS } from "./draw-basics";
import type { CadCommandContext } from "../command-types";

const registry = createCadCommandRegistry([...CAD_DRAW_BASIC_COMMANDS, ...CAD_MODIFY_BASIC_COMMANDS]);

const line: CadEntity = {
  id: "line-1",
  type: "line",
  start: { x: 0, y: 0, z: 0 },
  end: { x: 100, y: 0, z: 0 },
  layer: "0",
};
const ellipse: CadEntity = {
  id: "ellipse-1",
  type: "ellipse",
  center: { x: 0, y: 0, z: 0 },
  majorAxis: { x: 50, y: 0, z: 0 },
  ratio: 0.5,
  startParameter: 0,
  endParameter: 360,
  layer: "0",
};
const entities = new Map<string, CadEntity>([
  [line.id, line],
  [ellipse.id, ellipse],
]);

let nextId = 0;
function context(selection: readonly string[] = [], cursor?: { x: number; y: number }): CadCommandContext {
  return {
    entityIds: [...entities.keys()],
    entity: (id) => entities.get(id),
    selection,
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    cursor,
    newEntityId: () => `n${++nextId}`,
  };
}

function run(
  actions: readonly CadCommandAction[],
  selection: readonly string[] = [],
): { state: CadCommandEngineState; effects: CadCommandEffect[] } {
  let state = EMPTY_CAD_COMMAND_ENGINE;
  const effects: CadCommandEffect[] = [];
  for (const action of actions) {
    const reduction = cadCommandEngineReduce(state, action, context(selection), registry);
    state = reduction.state;
    effects.push(...reduction.effects);
  }
  return { state, effects };
}

const point = (x: number, y: number): CadCommandAction => ({
  kind: "input",
  input: { kind: "point", point: { x, y }, source: "pointer" },
});
const executed = (effects: readonly CadCommandEffect[]) =>
  effects.filter((e): e is Extract<CadCommandEffect, { kind: "execute" }> => e.kind === "execute");
const messages = (effects: readonly CadCommandEffect[]) =>
  effects.filter((e): e is Extract<CadCommandEffect, { kind: "message" }> => e.kind === "message");

// --- ERASE: selección previa, acción inmediata --------------------------------
{
  const { effects, state } = run([{ kind: "invoke", command: "E" }], ["line-1", "ellipse-1"]);
  const runs = executed(effects);
  assert.equal(runs.length, 1, "con objetos designados, ERASE actúa sin pedir nada más");
  assert.equal(runs[0].commands.length, 2, "borra los dos");
  assert.equal(runs[0].commands[0].type, "delete");
  assert.equal(state.active, null, "y termina");
}
{
  // Sin selección previa, pide objetos.
  const started = run([{ kind: "invoke", command: "ERASE" }]);
  assert.ok(started.state.active, "sin selección ERASE espera");
  const picked = cadCommandEngineReduce(
    started.state,
    { kind: "input", input: { kind: "selection", entityIds: ["line-1"] } },
    context(),
    registry,
  );
  assert.equal(executed(picked.effects)[0].commands.length, 1, "y actúa cuando llegan");
}
assert.equal(
  executed(
    cadCommandEngineReduce(
      run([{ kind: "invoke", command: "ERASE" }]).state,
      { kind: "input", input: { kind: "enter" } },
      context(),
      registry,
    ).effects,
  ).length,
  0,
  "aceptar sin haber designado nada no borra nada",
);

// --- MOVE: base y destino -----------------------------------------------------
{
  const { effects } = run([{ kind: "invoke", command: "M" }, point(0, 0), point(30, 40)], ["line-1"]);
  const runs = executed(effects);
  assert.equal(runs.length, 1, "MOVE deja un solo lote");
  assert.equal(runs[0].label, "MOVE");
  const command = runs[0].commands[0];
  assert.equal(command.type, "transform", "mover es transformar, no borrar y recrear");
  if (command.type === "transform")
    assert.deepEqual(command.transform.translation, { x: 30, y: 40 }, "el desplazamiento es destino − base");
}

// --- COPY es múltiple por defecto ---------------------------------------------
{
  const { effects, state } = run(
    [
      { kind: "invoke", command: "CO" },
      point(0, 0),
      point(100, 0),
      point(200, 0),
      point(300, 0),
      { kind: "input", input: { kind: "enter" } },
    ],
    ["line-1"],
  );
  const runs = executed(effects);
  assert.equal(runs.length, 1, "las tres copias caben en UN lote: un solo Ctrl+Z las deshace");
  assert.equal(runs[0].commands.length, 3, "tres destinos, tres copias");
  assert.ok(
    runs[0].commands.every((command) => command.type === "copy"),
    "y son copias, no transformaciones",
  );
  const ids = runs[0].commands.map((command) => (command.type === "copy" ? command.newEntityId : ""));
  assert.equal(new Set(ids).size, 3, "cada copia con su propio id");
  assert.equal(state.active, null, "Enter cierra el comando");
}

// --- OFFSET calcula un desfase real -------------------------------------------
{
  const { effects } = run([
    { kind: "invoke", command: "O" },
    { kind: "token", value: "10" },
    { kind: "input", input: { kind: "entityPick", entityId: "line-1", point: { x: 50, y: 5 } } },
    { kind: "input", input: { kind: "enter" } },
  ]);
  const runs = executed(effects);
  assert.equal(runs.length, 1, "OFFSET deja un lote");
  const command = runs[0].commands[0];
  assert.equal(command.type, "insert", "el desfase crea una entidad nueva");
  if (command.type === "insert" && command.entity.type === "line") {
    // La línea original va de (0,0) a (100,0); desfasada 10 queda paralela.
    assert.equal(command.entity.start.y, command.entity.end.y, "la copia sigue siendo horizontal");
    assert.equal(Math.abs(command.entity.start.y), 10, "y a exactamente 10 unidades");
    assert.equal(command.entity.start.x, 0, "sin trasladarse en X: es un desfase, no una traslación");
  } else {
    assert.fail("OFFSET debería insertar una línea");
  }
}
{
  // Una elipse se rechaza con su motivo, en vez de devolver geometría falsa.
  const { effects } = run([
    { kind: "invoke", command: "OFFSET" },
    { kind: "token", value: "10" },
    { kind: "input", input: { kind: "entityPick", entityId: "ellipse-1", point: { x: 0, y: 0 } } },
  ]);
  assert.equal(executed(effects).length, 0, "no se escribe nada");
  const said = messages(effects).map((message) => message.text).join(" ");
  assert.ok(said.includes("elipse"), "y se explica por qué: el desfase de una elipse no es otra elipse");
}

console.log("cad modify command specs passed");
