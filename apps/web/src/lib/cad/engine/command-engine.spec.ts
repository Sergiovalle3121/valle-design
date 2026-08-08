/**
 * Motor de comandos CAD (Ola 3 del plan de paridad).
 *
 * Lo que se prueba aquí es el TACTO de un CAD, que es donde el producto estaba
 * más lejos de AutoCAD: escribir `L` y dibujar, leer las opciones entre
 * corchetes, elegir una con una letra, repetir con Espacio, meter un `'ZOOM` a
 * mitad de una polilínea y volver donde estabas, y que todo el comando sea UN
 * solo paso de deshacer.
 */
import { strict as assert } from "node:assert";
import {
  EMPTY_CAD_COMMAND_ENGINE,
  cadCommandEngineReduce,
  type CadCommandAction,
  type CadCommandEffect,
  type CadCommandEngineState,
} from "./command-engine";
import { createCadCommandRegistry } from "./registry";
import { CAD_DRAW_BASIC_COMMANDS, __testables } from "./commands/draw-basics";
import { formatCadPrompt, matchCadKeyword } from "./prompt";
import { resolveCadCommandAlias } from "./alias-table";
import { resolveCadToken } from "./input-pipeline";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  asCadCommand,
  type CadCommandContext,
  type CadCommandDescriptor,
} from "./command-types";

// Un ZOOM mínimo, sólo para ejercitar la transparencia.
const zoomCommand: CadCommandDescriptor<Record<string, never>> = {
  name: "ZOOM",
  aliases: ["Z"],
  kind: "view",
  transparent: true,
  selection: "none",
  repeatable: false,
  mutates: false,
  begin: () => ({
    state: {},
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "message", text: "zoom aplicado" },
  }),
  step: (state) => ({ state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } }),
};

const registry = createCadCommandRegistry([...CAD_DRAW_BASIC_COMMANDS, asCadCommand(zoomCommand)]);

let nextId = 0;
function context(cursor?: { x: number; y: number }): CadCommandContext {
  return {
    entityIds: [],
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    cursor,
    newEntityId: () => `e${++nextId}`,
  };
}

/** Encadena acciones y devuelve el estado final junto a todos los efectos. */
function run(
  actions: readonly CadCommandAction[],
  start: CadCommandEngineState = EMPTY_CAD_COMMAND_ENGINE,
  cursor?: { x: number; y: number },
): { state: CadCommandEngineState; effects: CadCommandEffect[] } {
  let state = start;
  const effects: CadCommandEffect[] = [];
  for (const action of actions) {
    const reduction = cadCommandEngineReduce(state, action, context(cursor), registry);
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
  effects.filter((effect): effect is Extract<CadCommandEffect, { kind: "execute" }> => effect.kind === "execute");
const prompts = (effects: readonly CadCommandEffect[]) =>
  effects.filter((effect): effect is Extract<CadCommandEffect, { kind: "prompt" }> => effect.kind === "prompt");

// --- alias: teclear `L` dibuja una línea -------------------------------------
assert.equal(resolveCadCommandAlias("l"), "LINE", "los alias no distinguen mayúsculas");
assert.equal(resolveCadCommandAlias("TR"), "TRIM", "TR es TRIM, como en acad.pgp");
assert.equal(resolveCadCommandAlias("MI"), "MIRROR", "MI es MIRROR");
assert.equal(resolveCadCommandAlias("-LAYER"), "LAYER", "el prefijo de variante sin diálogo no cambia el comando");
assert.equal(resolveCadCommandAlias("_LINE"), "LINE", "y el prefijo internacional tampoco");
assert.equal(resolveCadCommandAlias("QQQ", new Set(["LINE"])), null, "lo desconocido no se inventa");

// --- prompts con opciones entre corchetes ------------------------------------
assert.equal(
  formatCadPrompt({ message: "Precise el punto siguiente", options: [{ keyword: "Cerrar", shortcut: "C" }, { keyword: "desHacer", shortcut: "H" }] }),
  "Precise el punto siguiente o [Cerrar/desHacer]: ",
  "el atajo se resalta dentro de la palabra, aunque no sea la inicial",
);
assert.equal(
  formatCadPrompt({ message: "Precise el radio", options: [], defaultValue: "12.5" }),
  "Precise el radio <12.5>: ",
  "el valor por defecto va entre ángulos",
);

const ambiguous = [{ keyword: "Cerrar", shortcut: "C" }, { keyword: "CEntro", shortcut: "CE" }];
assert.equal(matchCadKeyword("C", ambiguous), "Cerrar", "el atajo exacto gana");
assert.equal(matchCadKeyword("CE", ambiguous), "CEntro", "y el más largo no queda atrapado por el corto");
assert.equal(matchCadKeyword("X", ambiguous), null, "lo que no encaja no se adivina");

// --- LINE encadena y termina en UN lote --------------------------------------
{
  const { state, effects } = run([
    { kind: "invoke", command: "LINE" },
    point(0, 0),
    point(100, 0),
    point(100, 100),
    { kind: "input", input: { kind: "enter" } },
  ]);
  const runs = executed(effects);
  assert.equal(runs.length, 1, "una polilínea de tres vértices deja UN solo lote, no tres");
  assert.equal(runs[0].commands.length, 2, "dos segmentos");
  assert.equal(runs[0].label, "LINE", "la etiqueta de historia es el nombre del comando");
  assert.equal(state.active, null, "el comando terminó");
  assert.equal(state.lastRepeatable, "LINE", "y queda anotado para repetirlo");

  const first = runs[0].commands[0];
  assert.equal(first.type, "insert", "los segmentos entran como inserciones");
  assert.equal(first.type === "insert" && first.entity.type, "line", "y son líneas canónicas");
}

// El prompt cambia cuando aparece la opción de cerrar.
{
  const { effects } = run([{ kind: "invoke", command: "LINE" }, point(0, 0), point(10, 0), point(10, 10)]);
  const shown = prompts(effects).map((effect) => formatCadPrompt(effect.prompt));
  assert.ok(shown[0].startsWith("Precise el primer punto"), "primero pide el punto inicial");
  assert.ok(shown[1].includes("[desHacer]"), "con un vértice sólo se puede deshacer");
  assert.ok(shown[3].includes("[Cerrar/desHacer]"), "con tres vértices ya se puede cerrar");
}

// Cerrar añade el segmento de vuelta al origen.
{
  const { effects } = run([
    { kind: "invoke", command: "LINE" },
    point(0, 0),
    point(100, 0),
    point(100, 100),
    { kind: "token", value: "C" },
  ]);
  const runs = executed(effects);
  assert.equal(runs[0].commands.length, 3, "cerrar añade el tercer segmento");
}

// desHacer retira el vértice Y su segmento, sin dejarlo huérfano.
{
  const { effects } = run([
    { kind: "invoke", command: "LINE" },
    point(0, 0),
    point(100, 0),
    point(100, 100),
    { kind: "token", value: "H" },
    { kind: "input", input: { kind: "enter" } },
  ]);
  assert.equal(executed(effects)[0].commands.length, 1, "queda un solo segmento tras deshacer");
}

// Un clic repetido no crea una línea de longitud cero.
{
  const { effects } = run([
    { kind: "invoke", command: "LINE" },
    point(50, 50),
    point(50, 50),
    { kind: "input", input: { kind: "enter" } },
  ]);
  assert.equal(executed(effects).length, 0, "dos clics en el mismo punto no dibujan nada");
}

// --- Espacio repite el último comando ----------------------------------------
{
  const first = run([
    { kind: "invoke", command: "LINE" },
    point(0, 0),
    point(10, 10),
    { kind: "input", input: { kind: "enter" } },
  ]);
  const repeated = run([{ kind: "repeat" }], first.state);
  assert.equal(repeated.state.active?.name, "LINE", "Espacio sin comando activo repite el último");
  assert.ok(
    prompts(repeated.effects)[0].prompt.message.includes("primer punto"),
    "y arranca desde su primer paso",
  );
}
{
  // Con un comando en curso, Espacio significa «acepta», no «repite».
  const { state } = run([{ kind: "invoke", command: "LINE" }, point(0, 0), point(5, 5), { kind: "repeat" }]);
  assert.equal(state.active, null, "Espacio dentro de LINE lo termina");
}
assert.equal(run([{ kind: "repeat" }]).state.active, null, "sin nada que repetir no pasa nada");

// --- comandos transparentes ---------------------------------------------------
{
  const started = run([{ kind: "invoke", command: "LINE" }, point(0, 0), point(10, 0)]);
  const zoomed = run([{ kind: "token", value: "'Z" }], started.state);
  assert.equal(zoomed.state.active?.name, "LINE", "tras el transparente vuelve el comando de fondo");
  assert.equal(zoomed.state.suspended.length, 0, "y la pila queda limpia");
  const restored = prompts(zoomed.effects).at(-1);
  assert.ok(
    restored && restored.prompt.message.includes("punto siguiente"),
    "con su prompt exactamente donde estaba",
  );

  const continued = run([point(10, 10), { kind: "input", input: { kind: "enter" } }], zoomed.state);
  assert.equal(executed(continued.effects)[0].commands.length, 2, "y el comando sigue acumulando");
}
{
  // Un comando no transparente rechaza el uso transparente en vez de romper.
  const started = run([{ kind: "invoke", command: "LINE" }, point(0, 0)]);
  const nested = run([{ kind: "token", value: "'LINE" }], started.state);
  assert.ok(
    nested.effects.some((effect) => effect.kind === "message" && effect.level === "error"),
    "'LINE se rechaza con un mensaje",
  );
  assert.equal(nested.state.active?.name, "LINE", "y no se pierde el comando en curso");
}

// --- Esc cancela sin escribir nada -------------------------------------------
{
  const { state, effects } = run([
    { kind: "invoke", command: "LINE" },
    point(0, 0),
    point(10, 0),
    { kind: "input", input: { kind: "cancel" } },
  ]);
  assert.equal(state.active, null, "Esc cierra el comando");
  assert.equal(executed(effects).length, 0, "y no aplica NADA al documento, ni siquiera lo ya trazado");
}

// --- override de OSNAP: no consume el paso ------------------------------------
{
  const started = run([{ kind: "invoke", command: "LINE" }, point(0, 0)]);
  const overridden = run([{ kind: "token", value: "MID" }], started.state);
  assert.deepEqual(overridden.state.osnapOverride, ["midpoint"], "MID arma la captura al punto medio");
  assert.equal(
    overridden.state.active?.step.state && (overridden.state.active.step.state as { points: unknown[] }).points.length,
    1,
    "y el comando sigue esperando el mismo punto: el override no avanza el paso",
  );
  const captured = run([point(40, 0)], overridden.state);
  assert.equal(captured.state.osnapOverride, null, "la captura consume el override");
}

// --- PLINE emite UNA polilínea ------------------------------------------------
{
  const { effects } = run([
    { kind: "invoke", command: "PL" },
    point(0, 0),
    point(100, 0),
    point(100, 100),
    { kind: "token", value: "C" },
  ]);
  const runs = executed(effects);
  assert.equal(runs[0].commands.length, 1, "una sola entidad, no un segmento por vértice");
  const command = runs[0].commands[0];
  assert.ok(command.type === "insert" && command.entity.type === "polyline", "y es una polilínea");
  assert.equal(command.type === "insert" && command.entity.type === "polyline" && command.entity.closed, true, "cerrada");
}

// --- RECTANG ------------------------------------------------------------------
{
  const { effects } = run([{ kind: "invoke", command: "REC" }, point(0, 0), point(200, 100)]);
  const command = executed(effects)[0].commands[0];
  assert.ok(command.type === "insert" && command.entity.type === "polyline", "el rectángulo es una polilínea cerrada");
  const vertices = command.type === "insert" && command.entity.type === "polyline" ? command.entity.vertices : [];
  assert.equal(vertices.length, 4, "cuatro vértices");
  assert.deepEqual(
    vertices.map((vertex) => [vertex.x, vertex.y]),
    [[0, 0], [200, 0], [200, 100], [0, 100]],
    "en orden antihorario desde la primera esquina",
  );
}
assert.equal(
  executed(run([{ kind: "invoke", command: "REC" }, point(0, 0), point(0, 100)]).effects).length,
  0,
  "un rectángulo de ancho cero no se dibuja",
);

// --- CIRCLE: centro-radio, diámetro, 2P y 3P ---------------------------------
{
  const { effects } = run([{ kind: "invoke", command: "C" }, point(0, 0), { kind: "token", value: "50" }]);
  const command = executed(effects)[0].commands[0];
  assert.ok(command.type === "insert" && command.entity.type === "circle", "centro y radio tecleado");
  assert.equal(command.type === "insert" && command.entity.type === "circle" && command.entity.radius, 50, "radio 50");
}
{
  const { effects } = run([
    { kind: "invoke", command: "C" },
    point(0, 0),
    { kind: "token", value: "D" },
    { kind: "token", value: "50" },
  ]);
  const command = executed(effects)[0].commands[0];
  assert.equal(
    command.type === "insert" && command.entity.type === "circle" && command.entity.radius,
    25,
    "con la opción Diámetro, 50 son 25 de radio",
  );
}
{
  const { effects } = run([{ kind: "invoke", command: "C" }, { kind: "token", value: "2" }, point(0, 0), point(100, 0)]);
  const command = executed(effects)[0].commands[0];
  assert.ok(command.type === "insert" && command.entity.type === "circle", "2P da una circunferencia");
  if (command.type === "insert" && command.entity.type === "circle") {
    assert.equal(command.entity.radius, 50, "radio = mitad de la distancia");
    assert.equal(command.entity.center.x, 50, "centro en el punto medio");
  }
}
{
  const { effects } = run([
    { kind: "invoke", command: "C" },
    { kind: "token", value: "3" },
    point(0, 0),
    point(100, 0),
    point(0, 100),
  ]);
  const command = executed(effects)[0].commands[0];
  if (command.type === "insert" && command.entity.type === "circle") {
    assert.ok(Math.abs(command.entity.center.x - 50) < 1e-9, "3P: centro en (50,50)");
    assert.ok(Math.abs(command.entity.center.y - 50) < 1e-9);
    assert.ok(Math.abs(command.entity.radius - Math.hypot(50, 50)) < 1e-9, "y el radio correcto");
  } else {
    assert.fail("3P debería producir una circunferencia");
  }
}
assert.equal(__testables.circleThroughThree({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }), null, "tres puntos alineados no definen circunferencia");
{
  const { effects } = run([
    { kind: "invoke", command: "C" },
    { kind: "token", value: "3" },
    point(0, 0),
    point(1, 0),
    point(2, 0),
  ]);
  assert.equal(executed(effects).length, 0, "y el comando lo dice en vez de escribir basura");
  assert.ok(effects.some((effect) => effect.kind === "message"), "con un mensaje");
}

// --- entrada directa de distancia --------------------------------------------
{
  // Se apunta con el cursor y se teclea la distancia: el gesto más usado.
  const started = run([{ kind: "invoke", command: "LINE" }, point(0, 0)], EMPTY_CAD_COMMAND_ENGINE, { x: 10, y: 0 });
  const typed = cadCommandEngineReduce(
    started.state,
    { kind: "token", value: "250" },
    context({ x: 10, y: 0 }),
    registry,
  );
  const points = (typed.state.active?.step.state as { points: { x: number; y: number }[] }).points;
  assert.equal(points.length, 2, "la distancia fija un vértice");
  assert.ok(Math.abs(points[1].x - 250) < 1e-9 && Math.abs(points[1].y) < 1e-9, "sobre la dirección del cursor");
}

// --- coordenadas relativas y polares ------------------------------------------
{
  const resolved = resolveCadToken("@10<45", {
    accepts: CAD_ACCEPT_POINT,
    lastPoint: { x: 0, y: 0 },
  });
  assert.equal(resolved.kind, "input", "@dist<áng se acepta");
  if (resolved.kind === "input" && resolved.input.kind === "point") {
    assert.ok(Math.abs(resolved.input.point.x - Math.SQRT1_2 * 10) < 1e-9, "polar relativa correcta");
  }
}
assert.equal(
  resolveCadToken("C", { accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD, prompt: { message: "", options: [{ keyword: "Cerrar", shortcut: "C" }] } }).kind,
  "input",
  "la palabra clave gana a la coordenada: si no, «C» sería un error de sintaxis",
);
assert.equal(
  resolveCadToken("MID", { accepts: CAD_ACCEPT_POINT }).kind,
  "osnapOverride",
  "MID es un override de captura, no una coordenada",
);
assert.equal(
  resolveCadToken("120", { accepts: CAD_ACCEPT_DISTANCE }).kind,
  "input",
  "un número suelto es una distancia cuando el paso la admite",
);
assert.equal(
  resolveCadToken("PEPE", { knownCommands: registry.names() }).kind,
  "error",
  "un comando inexistente se rechaza con mensaje",
);
assert.equal(
  resolveCadToken("PEPE", {}).kind,
  "invoke",
  "sin registro que consultar no se puede saber que no existe: la validación es del registro, no del pipeline",
);

// --- registro ------------------------------------------------------------------
assert.equal(registry.get("l")?.name, "LINE", "el registro resuelve alias");
assert.equal(registry.get("RECTANGLE")?.name, "RECTANG", "y nombres alternativos");
assert.equal(registry.get("nope"), undefined, "y no inventa comandos");
assert.throws(
  () => createCadCommandRegistry([...CAD_DRAW_BASIC_COMMANDS, ...CAD_DRAW_BASIC_COMMANDS]),
  /duplicado/,
  "registrar dos veces el mismo comando es un error de programación",
);

// Inventario honesto de lo que la tabla de alias promete y aún no existe.
console.log(
  `motor de comandos: ${registry.all().length} comandos registrados · ` +
    `${registry.unresolvedAliases().length} alias de acad.pgp todavía sin implementar`,
);

console.log("cad command engine specs passed");
