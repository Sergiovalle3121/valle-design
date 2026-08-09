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
import type { CadViewRequest } from "../../view/view-navigation";

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

// --- PAN: el desplazamiento de la VISTA es el opuesto al del punto -----------
{
  assert.deepEqual(viewRequests(type(["P", "100,100", "130,90"]).effects), [
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
