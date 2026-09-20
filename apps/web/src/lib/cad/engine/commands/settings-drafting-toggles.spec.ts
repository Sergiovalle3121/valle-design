/**
 * ORTHO, SNAP y GRID por el motor de comandos REAL (T-Ola3, F1), y el puente
 * de variables de sistema que las une con `-OSNAP`/`-DSETTINGS`/SETVAR/GETVAR
 * (T-Ola3, F2): antes de esta ficha, `OSMODE`/`ORTHOMODE`/`SNAPMODE`/
 * `GRIDMODE` sólo tenían un camino de escritura por la línea de comandos
 * (`-OSNAP`/`-DSETTINGS`/`SETVAR`) y ORTHO/SNAP/GRID no existían tecleados en
 * absoluto. Este spec teclea por TODOS los caminos sobre el MISMO almacén y
 * exige que cada uno vea lo que escribió el otro — la prueba de que es una
 * sola variable, no dos.
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
import { CadSystemVariableStore } from "../../system-variables";
import { describeCadOsmode } from "../../osnap-bits";

// Las implementaciones llegan a demanda en el navegador; un `.spec.ts` no
// admite `await` de nivel superior, así que las trae de golpe.
import "@/lib/cad/engine/all-commands";

const registry = CAD_COMMAND_REGISTRY_V2;

/**
 * Aplica los efectos `variables` de una reducción sobre un almacén REAL —
 * exactamente lo que hace el anfitrión tras cada `cadCommandEngineReduce`.
 * Sin esto el spec sólo comprobaría que el comando PIDE escribir, no que lo
 * escrito se lee después: la parte que de verdad mide el puente.
 */
function applyVariableEffects(store: CadSystemVariableStore, effects: readonly CadCommandEffect[]): void {
  for (const effect of effects) {
    if (effect.kind !== "variables") continue;
    for (const [name, value] of Object.entries(effect.patch)) {
      const outcome = effect.system ? store.publish(name, value) : store.set(name, value);
      assert.ok(outcome.ok, `${name} debería aceptar ${value}: ${outcome.ok ? "" : outcome.reason}`);
    }
  }
}

function contextFor(store: CadSystemVariableStore): CadCommandContext {
  return {
    entityIds: [],
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    variables: store,
    newEntityId: () => `e${Math.random()}`,
  };
}

/**
 * Teclea una secuencia de acciones sobre EL MISMO almacén, aplicando cada
 * efecto de variables como lo haría el anfitrión.
 */
function type(
  store: CadSystemVariableStore,
  actions: readonly CadCommandAction[],
): { state: CadCommandEngineState; effects: CadCommandEffect[] } {
  let state: CadCommandEngineState = EMPTY_CAD_COMMAND_ENGINE;
  const effects: CadCommandEffect[] = [];
  for (const action of actions) {
    const reduction = cadCommandEngineReduce(state, action, contextFor(store), registry);
    state = reduction.state;
    effects.push(...reduction.effects);
    applyVariableEffects(store, reduction.effects);
  }
  return { state, effects };
}

const invoke = (command: string): CadCommandAction => ({ kind: "invoke", command });
const token = (value: string): CadCommandAction => ({ kind: "token", value });
const ENTER: CadCommandAction = { kind: "input", input: { kind: "enter" } };

const promptOf = (effects: readonly CadCommandEffect[]) =>
  effects.find((e): e is Extract<CadCommandEffect, { kind: "prompt" }> => e.kind === "prompt")?.prompt;
const messageOf = (effects: readonly CadCommandEffect[]) =>
  effects.find((e): e is Extract<CadCommandEffect, { kind: "message" }> => e.kind === "message");

// --- ORTHO: on/off en un solo paso, y transparente (aliases: ninguno, como
// en AutoCAD) -----------------------------------------------------------------
{
  const store = new CadSystemVariableStore();
  assert.equal(store.number("ORTHOMODE"), 0, "ORTHOMODE arranca apagado");

  const { state } = type(store, [invoke("ORTHO"), token("AC")]);
  assert.equal(store.number("ORTHOMODE"), 1, "ORTHO AC enciende ORTHOMODE");
  assert.equal(state.active, null, "ORTHO termina en un solo paso, no encadena nada más");

  type(store, [invoke("ORTHO"), token("DE")]);
  assert.equal(store.number("ORTHOMODE"), 0, "ORTHO DE lo apaga");

  // Intro sin teclear nada deja el valor COMO ESTABA (es «cancelar», no
  // «alternar»): un Intro accidental no debe invertir el modo orto a mitad
  // de un LINE transparente.
  const { effects } = type(store, [invoke("ORTHO"), ENTER]);
  assert.equal(store.number("ORTHOMODE"), 0, "Intro no cambia ORTHOMODE");
  assert.equal(effects.filter((e) => e.kind === "variables").length, 0, "y no emite ninguna escritura");
}

// --- SNAP también se INVOCA tecleando su alias «SN», no sólo con el nombre
// completo: un alias que sólo vive en el descriptor no basta (ver la nota de
// `alias-table.ts`, «DX»/«3DZ») — hay que teclearlo de verdad, con el TOKEN,
// no invocarlo directo.
{
  const store = new CadSystemVariableStore();
  const { state } = type(store, [token("SN")]);
  assert.equal(state.active?.name, "SNAP", "«SN» invoca SNAP por el pipeline de entrada real");
}

// --- SNAP: on/off, y un número ENCIENDE con ESE paso, como en AutoCAD -------
{
  const store = new CadSystemVariableStore();

  type(store, [invoke("SNAP"), token("300")]);
  assert.equal(store.number("SNAPUNIT"), 300, "SNAP 300 fija el paso");
  assert.equal(store.number("SNAPMODE"), 1, "y enciende el forzado de cursor con ese paso");

  type(store, [invoke("SNAP"), token("DE")]);
  assert.equal(store.number("SNAPMODE"), 0, "SNAP DE lo apaga");
  assert.equal(store.number("SNAPUNIT"), 300, "sin tocar el paso, que sobrevive a apagarlo");

  // Un paso que no separa nada no es un paso: se rechaza en vez de encender
  // el forzado sobre una rejilla que colapsaría a un punto.
  const { effects } = type(store, [invoke("SNAP"), token("0")]);
  assert.equal(store.number("SNAPMODE"), 0, "0 no enciende SNAP");
  assert.ok(
    (messageOf(effects)?.text ?? "").includes("mayor que cero"),
    "y lo dice, no se queda mudo",
  );
}

// --- GRID comparte el MISMO paso que SNAP (F2: un solo SNAPUNIT) -----------
{
  const store = new CadSystemVariableStore();
  type(store, [invoke("SNAP"), token("50")]);
  assert.equal(store.number("SNAPUNIT"), 50);

  type(store, [invoke("GRID"), token("AC")]);
  assert.equal(store.number("GRIDMODE"), 1, "GRID AC enciende la rejilla");
  assert.equal(store.number("SNAPUNIT"), 50, "sin tocar el paso que ya había puesto SNAP");

  type(store, [invoke("GRID"), token("120")]);
  assert.equal(store.number("SNAPUNIT"), 120, "GRID 120 cambia el MISMO paso que lee SNAP");
  assert.equal(store.number("GRIDMODE"), 1, "y enciende la rejilla");

  // SNAP, tecleado después, muestra el paso que dejó GRID: es una variable,
  // no dos con el mismo nombre de casualidad.
  const { effects } = type(store, [invoke("SNAP")]);
  assert.equal(promptOf(effects)?.defaultValue, "120", "SNAP ve el paso que fijó GRID");
}

// --- F2, LA TRAMPA: -DSETTINGS y ORTHO/SNAP/GRID leen y escriben LA MISMA
// variable, en las DOS direcciones -------------------------------------------
{
  const store = new CadSystemVariableStore();

  // -DSETTINGS (el menú de dos pasos) enciende Orto...
  type(store, [invoke("-DSETTINGS"), token("Orto"), token("ACtivar")]);
  assert.equal(store.number("ORTHOMODE"), 1, "-DSETTINGS encendió ORTHOMODE");

  // ...y ORTHO, tecleado DIRECTO, lo ve encendido: <ACtivar> por defecto.
  const { effects: seenByOrtho } = type(store, [invoke("ORTHO")]);
  assert.equal(
    promptOf(seenByOrtho)?.defaultOption,
    "ACtivar",
    "ORTHO lee lo que -DSETTINGS escribió: NO hay un segundo estado",
  );

  // Y al revés: ORTHO lo apaga, y -DSETTINGS ? lo lista apagado.
  type(store, [invoke("ORTHO"), token("DE")]);
  const { effects: listing } = type(store, [invoke("-DSETTINGS"), token("?")]);
  assert.ok(
    messageOf(listing)?.text.includes("Modo orto".padEnd(20) + " desactivado"),
    "-DSETTINGS ve lo que ORTHO acaba de apagar",
  );
}

// --- Y lo mismo para OSMODE: -OSNAP escribe, GETVAR y -DSETTINGS ? leen ----
{
  const store = new CadSystemVariableStore();
  type(store, [invoke("-OSNAP"), token("MED,CEN")]);
  const osmode = store.number("OSMODE");
  assert.ok(osmode > 0, "-OSNAP encendió algún bit de OSMODE");

  const { effects: getvar } = type(store, [invoke("GETVAR"), token("OSMODE")]);
  assert.ok(messageOf(getvar)?.text.includes(`OSMODE = ${osmode}`), "GETVAR ve el OSMODE que puso -OSNAP");

  const { effects: listing } = type(store, [invoke("-DSETTINGS"), token("?")]);
  assert.ok(
    messageOf(listing)?.text.includes(describeCadOsmode(osmode)),
    "-DSETTINGS ? también lo lee: una sola tabla para las dos puertas",
  );
}

console.log(
  "settings-drafting-toggles: ORTHO/SNAP/GRID por el motor real, y -OSNAP/-DSETTINGS/SETVAR/GETVAR " +
    "comparten la MISMA variable en las dos direcciones",
);
