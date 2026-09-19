/**
 * Los cinco comandos de navegación, tecleados de verdad.
 *
 * Lo que se prueba aquí no es la aritmética del encuadre —eso es de
 * `view-navigation.spec.ts`— sino que TECLEAR llega hasta ella: que `Z`, `EX`,
 * Enter produce una petición de extensión y no un error; que `2XP` sobrevive al
 * pipeline de entrada, que interpreta `2` como distancia y `2XP` como texto; y
 * que `'ZOOM` a mitad de un LINE encuadra y devuelve el LINE intacto.
 */
import { strict as assert } from "node:assert";
import {
  EMPTY_CAD_COMMAND_ENGINE,
  cadCommandEngineReduce,
  type CadCommandEffect,
  type CadCommandEngineState,
} from "../command-engine";
import type { CadCommandContext } from "../command-types";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import { formatCadKeyword } from "../prompt";
import type { CadViewRequest } from "../../view/view-navigation";

// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

const registry = CAD_COMMAND_REGISTRY_V2;

function context(overrides: Partial<CadCommandContext> = {}): CadCommandContext {
  let counter = 0;
  return {
    entityIds: [],
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `id-${(counter += 1)}`,
    ...overrides,
  };
}

/** Teclea una secuencia y devuelve el estado final más lo que salió. */
function type(
  tokens: readonly string[],
  overrides: Partial<CadCommandContext> = {},
): { state: CadCommandEngineState; effects: CadCommandEffect[] } {
  let state = EMPTY_CAD_COMMAND_ENGINE;
  const effects: CadCommandEffect[] = [];
  for (const token of tokens) {
    const reduction = cadCommandEngineReduce(
      state,
      token === "\r" ? { kind: "repeat" } : { kind: "token", value: token },
      context(overrides),
      registry,
    );
    state = reduction.state;
    effects.push(...reduction.effects);
  }
  return { state, effects };
}

function viewRequests(effects: readonly CadCommandEffect[]): CadViewRequest[] {
  return effects.flatMap((effect) => (effect.kind === "view" ? [effect.request] : []));
}

function messages(effects: readonly CadCommandEffect[]): string[] {
  return effects.flatMap((effect) => (effect.kind === "message" ? [effect.text] : []));
}

// --- ZOOM y sus ocho opciones -----------------------------------------------
{
  assert.deepEqual(viewRequests(type(["ZOOM", "T"]).effects), [
    { kind: "zoom", zoom: { option: "all" } },
  ]);
  // El alias de una sola letra es lo que se teclea de verdad.
  assert.deepEqual(viewRequests(type(["Z", "EX"]).effects), [
    { kind: "zoom", zoom: { option: "extents" } },
  ]);
  assert.deepEqual(viewRequests(type(["Z", "PR"]).effects), [
    { kind: "zoom", zoom: { option: "previous" } },
  ]);

  // Ventana sin palabra clave: dos esquinas y ya. Es como se usa.
  assert.deepEqual(viewRequests(type(["Z", "10,20", "60,80"]).effects), [
    {
      kind: "zoom",
      zoom: { option: "window", corner1: { x: 10, y: 20 }, corner2: { x: 60, y: 80 } },
    },
  ]);

  assert.deepEqual(viewRequests(type(["Z", "V", "0,0", "100,50"]).effects), [
    {
      kind: "zoom",
      zoom: { option: "window", corner1: { x: 0, y: 0 }, corner2: { x: 100, y: 50 } },
    },
  ]);

  assert.deepEqual(viewRequests(type(["Z", "CE", "40,40", "250"]).effects), [
    { kind: "zoom", zoom: { option: "center", center: { x: 40, y: 40 }, height: 250 } },
  ]);
  assert.deepEqual(viewRequests(type(["Z", "DI", "5,5", "80"]).effects), [
    { kind: "zoom", zoom: { option: "dynamic", center: { x: 5, y: 5 }, height: 80 } },
  ]);

  // Objeto CON designación previa: no vuelve a preguntar.
  assert.deepEqual(
    viewRequests(type(["Z", "O"], { selection: ["a", "b"] }).effects),
    [{ kind: "zoom", zoom: { option: "object", entityIds: ["a", "b"] } }],
  );
  // Y sin designación previa, pregunta: el comando queda vivo esperando.
  const pending = type(["Z", "O"]);
  assert.equal(pending.state.active?.name, "ZOOM");
  assert.equal(viewRequests(pending.effects).length, 0);
}

// --- nX y nXP: el pipeline los parte por caminos distintos --------------------
{
  // `2` entra como DISTANCIA (el pipeline lo reconoce como número)…
  assert.deepEqual(viewRequests(type(["Z", "2"]).effects), [
    { kind: "zoom", zoom: { option: "scale", factor: 2, basis: "absolute" } },
  ]);
  // …y `2X`/`2XP` como TEXTO, porque no son números ni palabras clave. Si el
  // paso no aceptara texto, aquí saldría «Entrada no válida» en vez de un zoom.
  assert.deepEqual(viewRequests(type(["Z", "2X"]).effects), [
    { kind: "zoom", zoom: { option: "scale", factor: 2, basis: "relative" } },
  ]);
  assert.deepEqual(viewRequests(type(["ZOOM", "0.02XP"]).effects), [
    { kind: "zoom", zoom: { option: "scale", factor: 0.02, basis: "paper" } },
  ]);
  // Vía la opción ESCala explícita.
  assert.deepEqual(viewRequests(type(["Z", "ESC", "1.5X"]).effects), [
    { kind: "zoom", zoom: { option: "scale", factor: 1.5, basis: "relative" } },
  ]);
  // Y una escala imposible se rechaza con nombre propio.
  const bad = type(["Z", "ESC", "dos"]);
  assert.equal(viewRequests(bad.effects).length, 0);
  assert.ok(messages(bad.effects).some((text) => text.includes("no es un factor")));
}

// --- Las letras que teclea la mano de AutoCAD: E, A, W y los globales con _ ---
// Quien viene de AutoCAD no lee el prompt: teclea `Z`, `E`, Intro. En AutoCAD
// en español «E» es Extensión y en inglés también; con `_` delante manda la
// palabra inglesa, que es como vienen escritos los guiones y los menús de toda
// la vida. Antes de esto «E» empataba entre EXtensión y ESCala, caía a factor
// de escala y el dibujante leía «"E" no es un factor de escala válido».
{
  const extents: CadViewRequest[] = [{ kind: "zoom", zoom: { option: "extents" } }];
  for (const token of ["E", "e", "_E", "_e", "EXTENSION", "extension", "Extensión", "EXTENTS", "_EXTENTS"])
    assert.deepEqual(viewRequests(type(["Z", token]).effects), extents, `Z ${token} es Extensión`);

  const all: CadViewRequest[] = [{ kind: "zoom", zoom: { option: "all" } }];
  for (const token of ["T", "A", "a", "_A", "ALL", "_ALL", "todo"])
    assert.deepEqual(viewRequests(type(["Z", token]).effects), all, `Z ${token} es Todo`);

  const window: CadViewRequest[] = [
    { kind: "zoom", zoom: { option: "window", corner1: { x: 0, y: 0 }, corner2: { x: 100, y: 50 } } },
  ];
  for (const token of ["V", "W", "w", "_W", "WINDOW", "_WINDOW", "ventana"])
    assert.deepEqual(
      viewRequests(type(["Z", token, "0,0", "100,50"]).effects),
      window,
      `Z ${token} pide las dos esquinas de una ventana`,
    );

  const previous: CadViewRequest[] = [{ kind: "zoom", zoom: { option: "previous" } }];
  for (const token of ["P", "PR", "_P", "PREVIOUS", "_PREVIOUS"])
    assert.deepEqual(viewRequests(type(["Z", token]).effects), previous, `Z ${token} es Previo`);

  for (const token of ["D", "DI", "_D", "DINAMICO", "_DYNAMIC"])
    assert.deepEqual(
      viewRequests(type(["Z", token, "5,5", "80"]).effects),
      [{ kind: "zoom", zoom: { option: "dynamic", center: { x: 5, y: 5 }, height: 80 } }],
      `Z ${token} es Dinámico`,
    );
  for (const token of ["C", "CE", "_C", "_CENTER"])
    assert.deepEqual(
      viewRequests(type(["Z", token, "40,40", "250"]).effects),
      [{ kind: "zoom", zoom: { option: "center", center: { x: 40, y: 40 }, height: 250 } }],
      `Z ${token} es Centro`,
    );
  for (const token of ["ESC", "ES", "S", "_S", "_SCALE"])
    assert.deepEqual(
      viewRequests(type(["Z", token, "1.5X"]).effects),
      [{ kind: "zoom", zoom: { option: "scale", factor: 1.5, basis: "relative" } }],
      `Z ${token} es Escala`,
    );
  for (const token of ["O", "_O", "_OBJECT"])
    assert.deepEqual(
      viewRequests(type(["Z", token], { selection: ["a"] }).effects),
      [{ kind: "zoom", zoom: { option: "object", entityIds: ["a"] } }],
      `Z ${token} es Objeto`,
    );

  // Como toda palabra clave de AutoCAD, la inglesa vale abreviada a partir de
  // su atajo: `_EXT` es `_EXTENTS` igual que `LT` es `LType` para INITGET. Los
  // guiones y las rutinas LISP de toda la vida la escriben así (`_zoom _ext`).
  for (const token of ["_EX", "_EXT", "_ext", "_EXTEN", "_EXTENT", "EXTENT"])
    assert.deepEqual(viewRequests(type(["Z", token]).effects), extents, `Z ${token} es Extensión`);
  for (const token of ["_AL", "AL"])
    assert.deepEqual(viewRequests(type(["Z", token]).effects), all, `Z ${token} es Todo`);
  for (const token of ["_WIN", "WIN", "_WINDO"])
    assert.deepEqual(
      viewRequests(type(["Z", token, "0,0", "100,50"]).effects),
      window,
      `Z ${token} pide las dos esquinas de una ventana`,
    );
  for (const token of ["_PREV", "_PRE"])
    assert.deepEqual(viewRequests(type(["Z", token]).effects), previous, `Z ${token} es Previo`);
  for (const token of ["_DYN", "DYN"])
    assert.deepEqual(
      viewRequests(type(["Z", token, "5,5", "80"]).effects),
      [{ kind: "zoom", zoom: { option: "dynamic", center: { x: 5, y: 5 }, height: 80 } }],
      `Z ${token} es Dinámico`,
    );
  for (const token of ["_CEN", "_CENT"])
    assert.deepEqual(
      viewRequests(type(["Z", token, "40,40", "250"]).effects),
      [{ kind: "zoom", zoom: { option: "center", center: { x: 40, y: 40 }, height: 250 } }],
      `Z ${token} es Centro`,
    );
  for (const token of ["_SC", "SC", "SCAL"])
    assert.deepEqual(
      viewRequests(type(["Z", token, "1.5X"]).effects),
      [{ kind: "zoom", zoom: { option: "scale", factor: 1.5, basis: "relative" } }],
      `Z ${token} es Escala`,
    );
  for (const token of ["_OB", "_OBJ"])
    assert.deepEqual(
      viewRequests(type(["Z", token], { selection: ["a"] }).effects),
      [{ kind: "zoom", zoom: { option: "object", entityIds: ["a"] } }],
      `Z ${token} es Objeto`,
    );
  // Un `_` suelto o una palabra inglesa que no es de ZOOM siguen siendo error.
  for (const token of ["_", "_EXTENTSX", "_WX"]) {
    const wrong = type(["Z", token]);
    assert.equal(viewRequests(wrong.effects).length, 0, `${token} no es ninguna opción de ZOOM`);
    assert.ok(messages(wrong.effects).some((text) => text.includes("no es un factor")));
  }

  // El guion de siempre, con el comando y la opción en inglés.
  assert.deepEqual(viewRequests(type(["_ZOOM", "_E"]).effects), extents, "_ZOOM _E es Extensión");
  assert.deepEqual(viewRequests(type(["_ZOOM", "_EXT"]).effects), extents, "_ZOOM _EXT es Extensión");
  // Y dentro de un LINE, transparente: encuadra y el LINE sigue vivo.
  const inside = type(["LINE", "0,0", "'Z", "E"]);
  assert.deepEqual(viewRequests(inside.effects), extents, "'Z E encuadra la extensión");
  assert.equal(inside.state.active?.name, "LINE", "y devuelve el LINE intacto");

  // Lo que ya era un número o una escala no se toca por aceptar letras.
  assert.deepEqual(viewRequests(type(["Z", "2"]).effects), [
    { kind: "zoom", zoom: { option: "scale", factor: 2, basis: "absolute" } },
  ]);
  assert.deepEqual(viewRequests(type(["Z", "0.5XP"]).effects), [
    { kind: "zoom", zoom: { option: "scale", factor: 0.5, basis: "paper" } },
  ]);
  // Y una letra que no es de ZOOM en ningún idioma sigue siendo un error con nombre.
  const unknown = type(["Z", "_T"]);
  assert.equal(viewRequests(unknown.effects).length, 0, "_T no es ninguna opción inglesa de ZOOM");
  assert.ok(messages(unknown.effects).some((text) => text.includes("no es un factor")));

  // El prompt dice la verdad: la E de Extensión es la que se teclea.
  const zoom = registry.get("ZOOM");
  assert.ok(zoom, "ZOOM está en el registro");
  const begun = zoom.begin(context());
  const extension = begun.prompt.options.find((option) => option.keyword === "EXtensión");
  assert.equal(extension?.shortcut, "E", "el atajo anunciado de Extensión es E, como en AutoCAD");
  assert.equal(extension && formatCadKeyword(extension), "Extensión", "y el prompt lo escribe así");
}

// --- PAN: el desplazamiento de la VISTA es el opuesto al del punto -----------
{
  assert.deepEqual(viewRequests(type(["P", "10,20", "40,10"]).effects), [
    { kind: "pan", displacement: { x: -30, y: 10 } },
  ]);
}

// --- VIEW: guardar, restituir, borrar ----------------------------------------
{
  assert.deepEqual(viewRequests(type(["V", "G", "PLANTA"]).effects), [
    { kind: "view", op: "save", name: "PLANTA" },
  ]);
  assert.deepEqual(viewRequests(type(["VIEW", "R", "planta"]).effects), [
    { kind: "view", op: "restore", name: "planta" },
  ]);
  assert.deepEqual(viewRequests(type(["VIEW", "B", "planta"]).effects), [
    { kind: "view", op: "delete", name: "planta" },
  ]);
}

// --- REGEN y REGENALL terminan en su primer paso ------------------------------
{
  const regen = type(["RE"]);
  assert.deepEqual(viewRequests(regen.effects), [{ kind: "regen", scope: "view" }]);
  assert.equal(regen.state.active, null, "REGEN no deja ningún comando vivo");
  assert.deepEqual(viewRequests(type(["REA"]).effects), [{ kind: "regen", scope: "all" }]);
  assert.deepEqual(viewRequests(type(["REGENALL"]).effects), [{ kind: "regen", scope: "all" }]);
}

// --- Transparencia: 'ZOOM dentro de un LINE devuelve el LINE intacto ---------
{
  let state = EMPTY_CAD_COMMAND_ENGINE;
  const effects: CadCommandEffect[] = [];
  for (const token of ["LINE", "0,0", "'ZOOM", "EX"]) {
    const reduction = cadCommandEngineReduce(
      state,
      { kind: "token", value: token },
      context(),
      registry,
    );
    state = reduction.state;
    effects.push(...reduction.effects);
  }
  assert.deepEqual(viewRequests(effects), [{ kind: "zoom", zoom: { option: "extents" } }]);
  assert.equal(state.active?.name, "LINE", "el LINE sigue en curso tras el zoom transparente");
  assert.equal(state.suspended.length, 0);
  // Y sigue aceptando el siguiente vértice, que es la propiedad que importa.
  const resumed = cadCommandEngineReduce(
    state,
    { kind: "token", value: "100,0" },
    context(),
    registry,
  );
  assert.equal(resumed.state.active?.name, "LINE");

  // REGEN NO es transparente en AutoCAD, y aquí tampoco: pedirlo con `'` se
  // rechaza en vez de colarse a mitad de un comando.
  const refused = cadCommandEngineReduce(
    resumed.state,
    { kind: "token", value: "'REGEN" },
    context(),
    registry,
  );
  assert.ok(messages(refused.effects).some((text) => text.includes("no admite uso transparente")));
  assert.equal(refused.state.active?.name, "LINE");
}

// --- ninguno de los cinco muta el documento ----------------------------------
{
  for (const name of ["ZOOM", "PAN", "VIEW", "REGEN", "REGENALL"]) {
    const descriptor = registry.get(name);
    assert.ok(descriptor, `${name} no está en el registro`);
    assert.equal(descriptor.mutates, false, `${name} no debe declararse mutante`);
    assert.equal(descriptor.kind, "view");
  }
  for (const name of ["ZOOM", "PAN", "VIEW"])
    assert.equal(registry.get(name)?.transparent, true, `${name} debe poder usarse con '`);
}

console.log("cad view navigation command specs passed");
