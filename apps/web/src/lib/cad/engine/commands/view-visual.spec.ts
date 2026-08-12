/**
 * VSCURRENT tecleado de verdad.
 *
 * La tabla de estilos tiene su spec (`solid3d-view.spec.ts`) y el visor tiene
 * el suyo (`solid-shade-host.spec.ts`); aquí se prueba el tramo que faltaba:
 * que TECLEAR la orden en el registro REAL produce la petición de anfitrión
 * correcta. Es la diferencia entre «existe una tabla de estilos» y «el usuario
 * puede cambiarlos»: sin este tramo, la tabla era un interruptor sin pared.
 */
import { strict as assert } from "node:assert";
import {
  EMPTY_CAD_COMMAND_ENGINE,
  cadCommandEngineReduce,
  type CadCommandEffect,
  type CadCommandEngineState,
} from "../command-engine";
import type { CadCommandContext } from "../command-types";
import type { CadHostRequest } from "../host-requests";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";

const registry = CAD_COMMAND_REGISTRY_V2;

function context(): CadCommandContext {
  let counter = 0;
  return {
    entityIds: [],
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `id-${(counter += 1)}`,
  };
}

/** Teclea una secuencia y devuelve el estado final más lo que salió. */
function type(tokens: readonly string[]): {
  state: CadCommandEngineState;
  effects: CadCommandEffect[];
} {
  let state = EMPTY_CAD_COMMAND_ENGINE;
  const effects: CadCommandEffect[] = [];
  for (const token of tokens) {
    const reduction = cadCommandEngineReduce(
      state,
      token === "\x1b"
        ? { kind: "input", input: { kind: "cancel" } }
        : { kind: "token", value: token },
      context(),
      registry,
    );
    state = reduction.state;
    effects.push(...reduction.effects);
  }
  return { state, effects };
}

function hostRequests(effects: readonly CadCommandEffect[]): CadHostRequest[] {
  return effects.flatMap((effect) => (effect.kind === "host" ? [effect.request] : []));
}

function errors(effects: readonly CadCommandEffect[]): string[] {
  return effects.flatMap((effect) =>
    effect.kind === "message" && effect.level === "error" ? [effect.text] : [],
  );
}

// --- cada atajo llega a su estilo -------------------------------------------
{
  assert.deepEqual(hostRequests(type(["VSCURRENT", "A"]).effects), [
    { kind: "visual-style", styleId: "wireframe" },
  ]);
  assert.deepEqual(hostRequests(type(["VSCURRENT", "O"]).effects), [
    { kind: "visual-style", styleId: "hidden" },
  ]);
  assert.deepEqual(hostRequests(type(["VSCURRENT", "S"]).effects), [
    { kind: "visual-style", styleId: "shaded" },
  ]);
  assert.deepEqual(hostRequests(type(["VSCURRENT", "C"]).effects), [
    { kind: "visual-style", styleId: "shaded-edges" },
  ]);
}

// --- los alias de AutoCAD y el nombre en español ----------------------------
{
  // SHADEMODE es el nombre viejo; VS lo que se teclea de verdad.
  assert.deepEqual(hostRequests(type(["SHADEMODE", "S"]).effects), [
    { kind: "visual-style", styleId: "shaded" },
  ]);
  // El nombre mostrado también vale, con acento y sin distinguir mayúsculas.
  assert.deepEqual(hostRequests(type(["VS", "oculto"]).effects), [
    { kind: "visual-style", styleId: "hidden" },
  ]);
}

// --- lo desconocido se rechaza sin cambiar nada -----------------------------
{
  const typed = type(["VSCURRENT", "realista"]);
  assert.equal(hostRequests(typed.effects).length, 0, "un estilo inexistente no emite petición");
  // El comando sigue activo esperando un estilo válido; el error nombra los cuatro.
  assert.ok(typed.state.active, "el comando sigue esperando un estilo válido");
  const wrong = errors(typed.effects).concat(
    typed.effects.flatMap((effect) => (effect.kind === "message" ? [effect.text] : [])),
  );
  assert.ok(
    wrong.some((text) => text.includes("realista")) ||
      typed.state.active?.step.prompt.message.includes("realista"),
    "la respuesta cita lo que se tecleó",
  );
  // Y desde ahí, un estilo válido todavía funciona.
  const recovered = type(["VSCURRENT", "realista", "S"]);
  assert.deepEqual(hostRequests(recovered.effects), [{ kind: "visual-style", styleId: "shaded" }]);
}

// --- cancelar no emite nada -------------------------------------------------
{
  const typed = type(["VSCURRENT", "\x1b"]);
  assert.equal(hostRequests(typed.effects).length, 0, "cancelar no cambia el estilo");
  assert.equal(typed.state.active, null, "cancelar cierra el comando");
}

console.log("view-visual.spec: VSCURRENT emite la petición de estilo visual correcta");
