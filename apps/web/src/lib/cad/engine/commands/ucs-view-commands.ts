/**
 * UCSICON y PLAN: las dos órdenes que hacen VISIBLE el sistema de coordenadas.
 *
 * ## Por qué no son decoración
 *
 * Un SCU que no se ve es un SCU en el que no se confía. El icono responde a la
 * pregunta que se hace cualquiera al volver a un dibujo después de comer —«¿en
 * qué sistema estoy dibujando?»— y `PLAN` es la forma de dejar de mirar de
 * canto el plano en el que se está trabajando. En AutoCAD se teclean cien veces
 * al día precisamente porque el SCU manda de verdad.
 *
 * ## El reparto con el visor, dicho sin rodeos
 *
 * Ninguno de los dos DIBUJA nada aquí. `UCSICON` fija el estado —visible, en el
 * origen, tamaño— en las variables de sistema, y pintar el icono es del visor,
 * que en esta ola pertenece a otra sesión; `cadUcsIconState` es la única puerta
 * por la que tendrá que leerlo, y ya está abierta. `PLAN` calcula la vista en
 * planta y la manda al anfitrión como una petición declarativa, igual que hacen
 * PLOT y DXFOUT, en vez de tocar la cámara desde dentro del motor.
 *
 * Ese reparto es lo que permite probar los dos en Node sobre números, y lo que
 * hace que el día que llegue la cámara 3D no haya que reescribirlos.
 */
import {
  cadActiveUcs,
  createCadVariableAccess,
} from "../../system-variables";
import { CAD_WORLD_UCS, describeCadUcs } from "../../ucs";
import {
  cadUcsIconBits,
  cadUcsIconState,
  cadUcsPlanView,
  describeCadUcsIcon,
} from "../../ucs-view";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

function variablesOf(context: CadCommandContext) {
  return context.variables ?? createCadVariableAccess();
}

function message<S>(state: S, text: string): CadCommandStep<S> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text } };
}

function cancelled<S>(state: S): CadCommandStep<S> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
}

// ---------------------------------------------------------------------------
// UCSICON
// ---------------------------------------------------------------------------

const ICON_ON = { keyword: "ACtivado", shortcut: "AC" } as const;
const ICON_OFF = { keyword: "DEsactivado", shortcut: "DE" } as const;
const ICON_ORIGIN = { keyword: "ORigen", shortcut: "OR" } as const;
const ICON_CORNER = { keyword: "SINorigen", shortcut: "SI" } as const;
const ICON_PROPERTIES = { keyword: "Propiedades", shortcut: "P" } as const;
const ICON_ALL = { keyword: "Todo", shortcut: "T" } as const;

interface IconState {
  askingSize: boolean;
}

const iconCommand: CadCommandDescriptor<IconState> = {
  name: "UCSICON",
  aliases: [],
  kind: "view",
  transparent: true,
  selection: "none",
  repeatable: false,
  mutates: false,
  cursor: "none",
  begin: (context) => ({
    state: { askingSize: false },
    prompt: {
      message: describeCadUcsIcon(cadUcsIconState(variablesOf(context))),
      options: [ICON_ON, ICON_OFF, ICON_ORIGIN, ICON_CORNER, ICON_ALL, ICON_PROPERTIES],
      defaultOption: ICON_ON.keyword,
    },
    accepts: CAD_ACCEPT_KEYWORD,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cancelled(state);
    const access = variablesOf(context);
    const icon = cadUcsIconState(access);

    if (state.askingSize) {
      if (input.kind !== "distance") return cancelled(state);
      const size = Math.round(input.value);
      // El rango lo impone la tabla de variables; aquí se explica el rechazo en
      // vez de dejar que llegue como «UCSICONSIZE no baja de 12».
      if (!(size >= 12 && size <= 120))
        return message(state, `El icono del SCU mide entre 12 y 120 píxeles; llegó ${size}.`);
      return {
        state: { askingSize: false },
        prompt: { message: "", options: [] },
        accepts: 0,
        result: {
          kind: "variables",
          patch: { UCSICONSIZE: size },
          text: `Icono del SCU a ${size} px.`,
        },
      };
    }

    const keyword = input.kind === "keyword" ? input.keyword : null;
    if (keyword === null) return message(state, describeCadUcsIcon(icon));

    if (keyword === ICON_PROPERTIES.keyword)
      return {
        state: { askingSize: true },
        prompt: {
          message: "Precise el lado del icono en píxeles",
          options: [],
          defaultValue: String(icon.sizePx),
        },
        accepts: CAD_ACCEPT_DISTANCE,
      };

    if (keyword === ICON_ALL.keyword)
      // `Todo` aplica a TODAS las ventanas gráficas. Aquí sólo hay una, así que
      // no hay nada que propagar: se dice, en vez de fingir que hizo algo.
      return message(
        state,
        "Este espacio de trabajo tiene una sola ventana gráfica, así que Todo no cambia nada: " +
          "lo que fije UCSICON ya vale para ella.",
      );

    const next = {
      visible: keyword === ICON_OFF.keyword ? false : keyword === ICON_ON.keyword ? true : icon.visible,
      atOrigin:
        keyword === ICON_ORIGIN.keyword
          ? true
          : keyword === ICON_CORNER.keyword
            ? false
            : icon.atOrigin,
    };
    return {
      state,
      prompt: { message: "", options: [] },
      accepts: 0,
      result: {
        kind: "variables",
        patch: { UCSICON: cadUcsIconBits(next) },
        text: describeCadUcsIcon({ ...next, sizePx: icon.sizePx }),
      },
    };
  },
};

// ---------------------------------------------------------------------------
// PLAN
// ---------------------------------------------------------------------------

const PLAN_CURRENT = { keyword: "ACtual", shortcut: "AC" } as const;
const PLAN_WORLD = { keyword: "Universal", shortcut: "U" } as const;
const PLAN_NAMED = { keyword: "NOmbrado", shortcut: "NO" } as const;

interface PlanState {
  askingName: boolean;
}

function planResult(
  state: PlanState,
  ucs: Parameters<typeof cadUcsPlanView>[0],
  note: string,
): CadCommandStep<PlanState> {
  const plan = cadUcsPlanView(ucs);
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "host", request: { kind: "ucs-plan", plan }, label: note },
  };
}

const planCommand: CadCommandDescriptor<PlanState> = {
  name: "PLAN",
  aliases: [],
  kind: "view",
  transparent: true,
  selection: "none",
  repeatable: false,
  mutates: false,
  cursor: "none",
  begin: (context) => ({
    state: { askingName: false },
    prompt: {
      message: `Vista en planta de ${describeCadUcs(cadActiveUcs(variablesOf(context)))}`,
      options: [PLAN_CURRENT, PLAN_WORLD, PLAN_NAMED],
      defaultOption: PLAN_CURRENT.keyword,
    },
    accepts: CAD_ACCEPT_KEYWORD,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cancelled(state);
    const access = variablesOf(context);

    if (state.askingName) {
      if (input.kind !== "text") return cancelled(state);
      const catalog = context.catalogs?.coordinateSystems;
      if (!catalog)
        return message(
          state,
          "Los SCU con nombre necesitan el catálogo de la sesión y este espacio de trabajo no lo aporta.",
        );
      const found = catalog.get(input.value.trim());
      if (!found) return message(state, `No hay ningún SCU llamado "${input.value.trim()}".`);
      return planResult({ askingName: false }, found, `Planta del SCU "${found.name}"`);
    }

    if (input.kind === "keyword" && input.keyword === PLAN_WORLD.keyword)
      return planResult(state, CAD_WORLD_UCS, "Planta del SCU universal");
    if (input.kind === "keyword" && input.keyword === PLAN_NAMED.keyword)
      return {
        state: { askingName: true },
        prompt: { message: "Nombre del SCU", options: [] },
        accepts: CAD_ACCEPT_TEXT,
      };
    return planResult(state, cadActiveUcs(access), "Planta del SCU actual");
  },
};

export const CAD_UCS_VIEW_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(iconCommand),
  asCadCommand(planCommand),
];
