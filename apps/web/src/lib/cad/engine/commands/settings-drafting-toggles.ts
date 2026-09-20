/**
 * ORTHO, SNAP y GRID como ÓRDENES tecleadas (T-Ola3, F1).
 *
 * ## Por qué hacía falta, y qué NO era suficiente
 *
 * Las tres ya existían como BOTONES de la barra de estado, y `-DSETTINGS`
 * (`settings-palettes.ts`) ya las escribe por un menú de dos pasos: elegir
 * la ayuda («Orto», «Forzcursor», «Rejilla») y luego Activar/Desactivar. Lo
 * que faltaba es lo primero que prueba quien viene de AutoCAD: teclear
 * `ORTHO` a secas, en mitad de cualquier otro comando, y que pase algo en UN
 * solo paso — que es como se activan de verdad, decenas de veces por plano.
 * Sin esto la funcionalidad estaba construida pero no entregada.
 *
 * Las tres son TRANSPARENTES, como en AutoCAD: se pueden teclear con `'`
 * dentro de un LINE a medio dibujar, porque cambiar una ayuda de dibujo no
 * debería obligar a cancelar el trazo.
 *
 * ## El paso de SNAP y GRID
 *
 * `SNAPUNIT` (`system-variables.ts`) es la variable que declara el puente
 * F2: UN solo paso para las dos ayudas, a propósito — es la que pide la
 * ficha, y separar SNAP de GRID en dos variables inventaría una que nadie
 * pidió. Teclear un número en `SNAP` o en `GRID` fija `SNAPUNIT` y ENCIENDE
 * esa ayuda con el nuevo paso, como en AutoCAD.
 *
 * Correr:  npx tsx src/lib/cad/engine/commands/settings-drafting-toggles.spec.ts
 */
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_KEYWORD,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import {
  createCadVariableAccess,
  type CadSystemVariableValue,
  type CadVariableAccess,
} from "../../system-variables";

/** Mismas palabras que `-DSETTINGS`: lo que se aprende ahí sirve aquí. */
const TOGGLE_ON = { keyword: "ACtivar", shortcut: "AC" } as const;
const TOGGLE_OFF = { keyword: "DEsactivar", shortcut: "DE" } as const;

interface ToggleState {
  readonly done: boolean;
}
const TOGGLE_IDLE: ToggleState = { done: false };

function noResult(): CadCommandStep<ToggleState> {
  return { state: TOGGLE_IDLE, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
}

function messageResult(text: string): CadCommandStep<ToggleState> {
  return { state: TOGGLE_IDLE, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text } };
}

function variablesResult(
  patch: Readonly<Record<string, CadSystemVariableValue>>,
  text: string,
): CadCommandStep<ToggleState> {
  return {
    state: TOGGLE_IDLE,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "variables", patch, text },
  };
}

function access(context: { variables?: CadVariableAccess }): CadVariableAccess {
  return context.variables ?? createCadVariableAccess();
}

// ---------------------------------------------------------------------------
// ORTHO
// ---------------------------------------------------------------------------

function orthoPrompt(store: CadVariableAccess): CadCommandStep<ToggleState> {
  const on = Number(store.get("ORTHOMODE") ?? 0) === 1;
  return {
    state: TOGGLE_IDLE,
    prompt: {
      message: "Especifique el modo orto",
      options: [TOGGLE_ON, TOGGLE_OFF],
      defaultOption: on ? TOGGLE_ON.keyword : TOGGLE_OFF.keyword,
    },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

const orthoCommand: CadCommandDescriptor<ToggleState> = {
  name: "ORTHO",
  aliases: [],
  kind: "manage",
  transparent: true,
  selection: "none",
  repeatable: false,
  mutates: false,
  cursor: "none",
  begin: (context) => orthoPrompt(access(context)),
  step: (state, input, context) => {
    if (input.kind === "cancel" || input.kind === "enter") return noResult();
    if (input.kind !== "keyword") return orthoPrompt(access(context));
    const value = input.keyword === TOGGLE_ON.keyword ? 1 : 0;
    return variablesResult(
      { ORTHOMODE: value },
      `ORTHOMODE = ${value} (modo orto ${value === 1 ? "activado" : "desactivado"}).`,
    );
  },
};

// ---------------------------------------------------------------------------
// SNAP
// ---------------------------------------------------------------------------

function snapPrompt(store: CadVariableAccess): CadCommandStep<ToggleState> {
  const on = Number(store.get("SNAPMODE") ?? 0) === 1;
  const step = Number(store.get("SNAPUNIT") ?? 10);
  return {
    state: TOGGLE_IDLE,
    prompt: {
      message: "Especifique el espaciado del forzado de cursor o",
      options: [TOGGLE_ON, TOGGLE_OFF],
      defaultOption: on ? TOGGLE_ON.keyword : TOGGLE_OFF.keyword,
      defaultValue: String(step),
    },
    accepts: CAD_ACCEPT_KEYWORD | CAD_ACCEPT_DISTANCE,
  };
}

const snapCommand: CadCommandDescriptor<ToggleState> = {
  name: "SNAP",
  aliases: ["SN"],
  kind: "manage",
  transparent: true,
  selection: "none",
  repeatable: false,
  mutates: false,
  cursor: "none",
  begin: (context) => snapPrompt(access(context)),
  step: (state, input, context) => {
    if (input.kind === "cancel" || input.kind === "enter") return noResult();
    if (input.kind === "keyword") {
      const value = input.keyword === TOGGLE_ON.keyword ? 1 : 0;
      return variablesResult(
        { SNAPMODE: value },
        `SNAPMODE = ${value} (forzado de cursor ${value === 1 ? "activado" : "desactivado"}).`,
      );
    }
    if (input.kind === "distance") {
      // Un paso que no separa nada no es un paso: AutoCAD rechaza igual el
      // espaciado cero o negativo en vez de encender SNAP sobre una rejilla
      // que colapsaría a un solo punto.
      if (!(input.value > 0)) return messageResult("El paso del forzado de cursor tiene que ser mayor que cero.");
      // Teclear un paso ENCIENDE el forzado con ese paso, como en AutoCAD: no
      // hace falta un ACtivar aparte después de decir a qué distancia.
      return variablesResult(
        { SNAPUNIT: input.value, SNAPMODE: 1 },
        `SNAPUNIT = ${input.value}; forzado de cursor activado.`,
      );
    }
    return snapPrompt(access(context));
  },
};

// ---------------------------------------------------------------------------
// GRID
// ---------------------------------------------------------------------------

function gridPrompt(store: CadVariableAccess): CadCommandStep<ToggleState> {
  const on = Number(store.get("GRIDMODE") ?? 0) === 1;
  const step = Number(store.get("SNAPUNIT") ?? 10);
  return {
    state: TOGGLE_IDLE,
    prompt: {
      message: "Especifique el espaciado de la rejilla o",
      options: [TOGGLE_ON, TOGGLE_OFF],
      defaultOption: on ? TOGGLE_ON.keyword : TOGGLE_OFF.keyword,
      defaultValue: String(step),
    },
    accepts: CAD_ACCEPT_KEYWORD | CAD_ACCEPT_DISTANCE,
  };
}

const gridCommand: CadCommandDescriptor<ToggleState> = {
  name: "GRID",
  aliases: [],
  kind: "manage",
  transparent: true,
  selection: "none",
  repeatable: false,
  mutates: false,
  cursor: "none",
  begin: (context) => gridPrompt(access(context)),
  step: (state, input, context) => {
    if (input.kind === "cancel" || input.kind === "enter") return noResult();
    if (input.kind === "keyword") {
      const value = input.keyword === TOGGLE_ON.keyword ? 1 : 0;
      return variablesResult(
        { GRIDMODE: value },
        `GRIDMODE = ${value} (rejilla ${value === 1 ? "activada" : "desactivada"}).`,
      );
    }
    if (input.kind === "distance") {
      if (!(input.value > 0)) return messageResult("El paso de la rejilla tiene que ser mayor que cero.");
      // Mismo `SNAPUNIT` que SNAP (F2, un solo paso para las dos ayudas): ver
      // la nota de cabecera.
      return variablesResult(
        { SNAPUNIT: input.value, GRIDMODE: 1 },
        `SNAPUNIT = ${input.value}; rejilla activada.`,
      );
    }
    return gridPrompt(access(context));
  },
};

export const CAD_SETTINGS_DRAFTING_TOGGLE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(orthoCommand),
  asCadCommand(snapCommand),
  asCadCommand(gridCommand),
];
