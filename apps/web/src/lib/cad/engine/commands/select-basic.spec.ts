/**
 * SELECT por el motor de comandos REAL: arma el conjunto de selección para
 * la orden siguiente y NO toca el documento (T-Ola3, F1).
 */
import { strict as assert } from "node:assert";
import {
  EMPTY_CAD_COMMAND_ENGINE,
  cadCommandEngineReduce,
  type CadCommandAction,
  type CadCommandEffect,
  type CadCommandEngineState,
} from "../command-engine";
import type { CadCommandContext } from "../command-types";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";

// Las implementaciones llegan a demanda en el navegador; un `.spec.ts` no
// admite `await` de nivel superior, así que las trae de golpe.
import "@/lib/cad/engine/all-commands";

const registry = CAD_COMMAND_REGISTRY_V2;

function context(overrides: Partial<CadCommandContext> = {}): CadCommandContext {
  return {
    entityIds: ["e1", "e2", "e3"],
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `e${Math.random()}`,
    ...overrides,
  };
}

function run(
  actions: readonly CadCommandAction[],
  ctxOverrides: Partial<CadCommandContext> = {},
  start: CadCommandEngineState = EMPTY_CAD_COMMAND_ENGINE,
): { state: CadCommandEngineState; effects: CadCommandEffect[] } {
  let state = start;
  const effects: CadCommandEffect[] = [];
  for (const action of actions) {
    const reduction = cadCommandEngineReduce(state, action, context(ctxOverrides), registry);
    state = reduction.state;
    effects.push(...reduction.effects);
  }
  return { state, effects };
}

const selectionEffects = (effects: readonly CadCommandEffect[]) =>
  effects.filter((e): e is Extract<CadCommandEffect, { kind: "selection" }> => e.kind === "selection");
const executed = (effects: readonly CadCommandEffect[]) =>
  effects.filter((e): e is Extract<CadCommandEffect, { kind: "execute" }> => e.kind === "execute");

// --- SELECT designa por ratón y NO mutila el documento ----------------------
{
  const { state, effects } = run([
    { kind: "invoke", command: "SELECT" },
    { kind: "input", input: { kind: "selection", entityIds: ["e1", "e2"] } },
  ]);
  assert.equal(state.active, null, "SELECT termina en un solo paso de designación");
  assert.equal(executed(effects).length, 0, "SELECT no escribe NINGÚN comando de documento");
  const sel = selectionEffects(effects);
  assert.equal(sel.length, 1, "SELECT publica la selección como efecto");
  assert.deepEqual([...sel[0].entityIds].sort(), ["e1", "e2"], "con exactamente lo designado");
}

// --- «Todo» (T-21) selecciona TODAS las entidades del contexto --------------
{
  const { effects } = run([
    { kind: "invoke", command: "SELECT" },
    { kind: "token", value: "Todo" },
    { kind: "input", input: { kind: "enter" } },
  ]);
  const sel = selectionEffects(effects);
  assert.equal(sel.length, 1, "Todo + Intro cierra SELECT");
  assert.deepEqual([...sel[0].entityIds].sort(), ["e1", "e2", "e3"], "Todo trae las tres entidades del contexto");
}

// --- Con algo ya designado (grips, arrastre previo), SELECT lo adopta YA ----
{
  const { state, effects } = run([{ kind: "invoke", command: "SELECT" }], { selection: ["e2"] });
  assert.equal(state.active, null, "con selección previa, SELECT no vuelve a preguntar");
  const sel = selectionEffects(effects);
  assert.deepEqual([...sel[0].entityIds], ["e2"], "adopta exactamente la selección de entrada");
}

// --- «Previo» (T-21) recoge la ÚLTIMA selección de la SESIÓN ----------------
{
  const { effects } = run(
    [{ kind: "invoke", command: "SELECT" }, { kind: "token", value: "Previo" }, { kind: "input", input: { kind: "enter" } }],
    { session: { lastSelectionIds: ["e3"] } },
  );
  const sel = selectionEffects(effects);
  assert.deepEqual([...sel[0].entityIds], ["e3"], "Previo trae la selección de la sesión anterior");
}

// --- Sin nada designado, SELECT + Intro termina con «nada», no con error ----
{
  const { effects } = run([{ kind: "invoke", command: "SELECT" }, { kind: "input", input: { kind: "enter" } }]);
  const sel = selectionEffects(effects);
  assert.equal(sel.length, 1);
  assert.deepEqual([...sel[0].entityIds], [], "Intro sin designar nada deja la selección vacía, no un error");
}

console.log("select-basic: SELECT arma la selección de la orden siguiente por el motor real, sin tocar el documento");
