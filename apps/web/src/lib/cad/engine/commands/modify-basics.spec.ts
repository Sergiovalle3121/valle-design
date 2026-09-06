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

// --- T-24·1: por encima del techo, COPY múltiple pregunta antes de escribir --
// El mismo mecanismo que ARRAY (modify-array.spec.ts): un documento casi en el
// límite del contrato, empujado por encima por unas pocas copias de más, no
// por una matriz gigante — no hace falta escribir 100 000 entidades reales
// para probar el gate.
{
  const nearLimitEntities = new Map(entities);
  for (let index = 0; index < 99_996; index += 1) {
    const id = `dummy-${index}`;
    nearLimitEntities.set(id, { id, type: "point", position: { x: 0, y: 0, z: 0 }, layer: "0" });
  }
  function nearLimitContext(selection: readonly string[] = []): CadCommandContext {
    return {
      entityIds: [...nearLimitEntities.keys()],
      entity: (id) => nearLimitEntities.get(id),
      selection,
      activeLayer: "0",
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      newEntityId: () => `n${++nextId}`,
    };
  }
  function runNearLimit(actions: readonly CadCommandAction[], selection: readonly string[] = []) {
    let state = EMPTY_CAD_COMMAND_ENGINE;
    const effects: CadCommandEffect[] = [];
    for (const action of actions) {
      const reduction = cadCommandEngineReduce(state, action, nearLimitContext(selection), registry);
      state = reduction.state;
      effects.push(...reduction.effects);
    }
    return { state, effects };
  }
  const keyword = (value: string): CadCommandAction => ({
    kind: "input",
    input: { kind: "keyword", keyword: value },
  });
  const copySequence: CadCommandAction[] = [
    { kind: "invoke", command: "CO" },
    point(0, 0),
    point(100, 0),
    point(200, 0),
    point(300, 0),
    { kind: "input", input: { kind: "enter" } },
  ];
  {
    const { effects } = runNearLimit(copySequence, ["line-1"]);
    assert.equal(executed(effects).length, 0, "sin confirmar todavía, COPY múltiple no ha escrito nada");
    const prompts = effects.filter((e): e is Extract<CadCommandEffect, { kind: "prompt" }> => e.kind === "prompt");
    assert.ok(
      prompts.some((effect) => effect.prompt.message.includes("Continuar")),
      "y pregunta antes de hacerlo",
    );
  }
  {
    const { effects } = runNearLimit([...copySequence, keyword("Sí")], ["line-1"]);
    const runs = executed(effects);
    assert.equal(runs.length, 1, "con «Sí», el lote se emite igual que sin gate");
    assert.equal(runs[0].commands.length, 3, "tres destinos, tres copias, incluso por encima del techo");
  }
  {
    const { effects } = runNearLimit([...copySequence, keyword("No")], ["line-1"]);
    assert.equal(executed(effects).length, 0, "«No» cancela sin escribir nada");
    assert.ok(
      messages(effects).some((message) => message.text.includes("cancelado")),
      "con un mensaje de cancelación, no un lote a medias",
    );
  }
  {
    // Por debajo del techo (el contexto normal de este archivo), COPY no pregunta.
    const { effects } = run(
      [
        { kind: "invoke", command: "CO" },
        point(0, 0),
        point(100, 0),
        { kind: "input", input: { kind: "enter" } },
      ],
      ["line-1"],
    );
    assert.equal(executed(effects).length, 1, "por debajo del techo, COPY no pregunta nada");
  }
}

// --- OFFSET calcula un desfase real, y el LADO lo dice un punto (T-23) --------
{
  const { effects } = run([
    { kind: "invoke", command: "O" },
    { kind: "token", value: "10" },
    { kind: "input", input: { kind: "entityPick", entityId: "line-1", point: { x: 50, y: 0 } } },
    point(50, 5), // por ENCIMA de la línea (0,0)-(100,0): el lado, no el signo tecleado
    { kind: "input", input: { kind: "enter" } },
  ]);
  const runs = executed(effects);
  assert.equal(runs.length, 1, "OFFSET deja un lote");
  const command = runs[0].commands[0];
  assert.equal(command.type, "insert", "el desfase crea una entidad nueva");
  if (command.type === "insert" && command.entity.type === "line") {
    // La línea original va de (0,0) a (100,0); desfasada 10 queda paralela.
    assert.equal(command.entity.start.y, command.entity.end.y, "la copia sigue siendo horizontal");
    assert.equal(command.entity.start.y, 10, "hacia el lado del punto pinchado, arriba");
    assert.equal(command.entity.start.x, 0, "sin trasladarse en X: es un desfase, no una traslación");
  } else {
    assert.fail("OFFSET debería insertar una línea");
  }
}
{
  // El punto de lado, del OTRO lado, desplaza hacia abajo: no es el signo de
  // la distancia tecleada —siempre positiva aquí— el que decide.
  const { effects } = run([
    { kind: "invoke", command: "O" },
    { kind: "token", value: "10" },
    { kind: "input", input: { kind: "entityPick", entityId: "line-1", point: { x: 50, y: 0 } } },
    point(50, -5),
    { kind: "input", input: { kind: "enter" } },
  ]);
  const command = executed(effects)[0].commands[0];
  if (command.type === "insert" && command.entity.type === "line") {
    assert.equal(command.entity.start.y, -10, "el mismo comando, el lado opuesto, el signo opuesto");
  } else {
    assert.fail("OFFSET debería insertar una línea");
  }
}
{
  // Una elipse se rechaza con su motivo, en vez de devolver geometría falsa.
  // Sin lado que reconocer, el rechazo llega igual: no hace falta una
  // segunda pregunta para llegar al mismo «no».
  const { effects } = run([
    { kind: "invoke", command: "OFFSET" },
    { kind: "token", value: "10" },
    { kind: "input", input: { kind: "entityPick", entityId: "ellipse-1", point: { x: 0, y: 0 } } },
    point(0, 60),
  ]);
  assert.equal(executed(effects).length, 0, "no se escribe nada");
  const said = messages(effects).map((message) => message.text).join(" ");
  assert.ok(said.includes("elipse"), "y se explica por qué: el desfase de una elipse no es otra elipse");
}

// --- T-21: «Designe objetos» acepta palabras clave, no sólo el ratón ----------
// El golden exacto de la ficha: teclear BORRAR (alias de ERASE), la palabra
// clave V (Ventana), dos esquinas y luego Intro, y afirmar el conteo. La
// ventana (-10,-10)-(150,10) encierra ENTERA a `line-1` —(0,0) a (100,0)— y
// deja fuera a `ellipse-1`, cuya caja se sale por arriba y por abajo (radio
// menor 25 > la mitad de alto de la ventana).
{
  const { effects, state } = run([
    { kind: "invoke", command: "BORRAR" },
    { kind: "token", value: "V" },
    { kind: "token", value: "-10,-10" },
    { kind: "token", value: "150,10" },
    { kind: "input", input: { kind: "enter" } },
  ]);
  const runs = executed(effects);
  assert.equal(runs.length, 1, "BORRAR → V → dos esquinas → Intro deja un solo lote");
  assert.equal(runs[0].commands.length, 1, "la ventana sólo encierra ENTERA a line-1");
  assert.equal(runs[0].commands[0].type, "delete");
  assert.equal(
    runs[0].commands[0].type === "delete" ? runs[0].commands[0].entityId : "",
    "line-1",
    "y borra justo la que cae dentro, no la elipse",
  );
  assert.equal(state.active, null, "el Intro final cierra el comando");
}
// Todo, seguido de Intro sin más designación, actúa sobre el dibujo entero.
{
  const { effects } = run([
    { kind: "invoke", command: "ERASE" },
    { kind: "token", value: "Todo" },
    { kind: "input", input: { kind: "enter" } },
  ]);
  const runs = executed(effects);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].commands.length, 2, "Todo designa las dos entidades del documento");
}

console.log("cad modify command specs passed");
