/**
 * ZOOM, PAN, VIEW, REGEN y REGENALL — los cinco comandos que un dibujante
 * teclea más veces al día que ningún otro.
 *
 * Ninguno muta el documento, así que ninguno emite `CadEntityCommand[]`:
 * emiten una `CadViewRequest`, que el anfitrión resuelve con
 * `applyCadViewRequest` sobre el `CadViewController` que ya existe. No hay una
 * segunda noción de vista; hay una sola, y estos comandos la piden.
 *
 * Los cinco son TRANSPARENTES: `'ZOOM` a mitad de una polilínea encuadra y
 * devuelve el control al PLINE en el punto exacto donde estaba. Es la razón
 * por la que existe el mecanismo de transparentes, y sin comandos de vista era
 * un mecanismo sin uso.
 */
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_SELECTION,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import type { CadPoint2 } from "../../cad-document";
import { parseCadZoomScale, type CadViewRequest } from "../../view/view-navigation";

function viewResult(request: CadViewRequest, label: string): CadCommandStep<never> {
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "view", request, label },
  };
}

function refuse(text: string): CadCommandStep<never> {
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "message", text },
  };
}

// ---------------------------------------------------------------------------
// ZOOM
// ---------------------------------------------------------------------------

const ZOOM_OPTIONS = [
  { keyword: "Todo", shortcut: "T" },
  { keyword: "CEntro", shortcut: "CE" },
  { keyword: "DInámico", shortcut: "DI" },
  { keyword: "EXtensión", shortcut: "EX" },
  { keyword: "PRevio", shortcut: "PR" },
  { keyword: "ESCala", shortcut: "ESC" },
  { keyword: "Ventana", shortcut: "V" },
  { keyword: "Objeto", shortcut: "O" },
] as const;

/**
 * Qué está esperando ZOOM. El comando arranca ofreciéndolo todo y se estrecha
 * en cuanto el usuario elige: una ventana necesita dos esquinas, un centro
 * necesita punto y altura, un objeto necesita una designación.
 */
type ZoomState =
  | { phase: "start" }
  | { phase: "window"; corner1: CadPoint2 }
  | { phase: "center"; center: CadPoint2 }
  | { phase: "center-point" }
  | { phase: "dynamic"; center: CadPoint2 }
  | { phase: "dynamic-point" }
  | { phase: "scale" }
  | { phase: "object" };

const ZOOM_START_ACCEPTS =
  CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD | CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT;

function zoomStep(state: ZoomState): CadCommandStep<ZoomState> {
  switch (state.phase) {
    case "start":
      return {
        state,
        prompt: {
          message:
            "Precise la esquina de una ventana, indique un factor de escala (nX o nXP)",
          options: ZOOM_OPTIONS,
          defaultOption: "tiempo real",
        },
        accepts: ZOOM_START_ACCEPTS,
      };
    case "window":
      return {
        state,
        prompt: { message: "Precise la esquina opuesta", options: [] },
        accepts: CAD_ACCEPT_POINT,
      };
    case "center-point":
    case "dynamic-point":
      return {
        state,
        prompt: { message: "Precise el centro de la vista", options: [] },
        accepts: CAD_ACCEPT_POINT,
      };
    case "center":
    case "dynamic":
      return {
        state,
        prompt: {
          message: "Indique la altura de la vista, en unidades de dibujo",
          options: [],
          defaultValue: "altura actual",
        },
        accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT,
      };
    case "scale":
      return {
        state,
        prompt: {
          message: "Indique el factor de escala (nX respecto de la vista actual, nXP respecto del papel)",
          options: [],
        },
        accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT,
      };
    case "object":
      return {
        state,
        prompt: { message: "Designe los objetos que quiere encuadrar", options: [] },
        accepts: CAD_ACCEPT_SELECTION,
      };
  }
}

function zoomScale(token: string): CadCommandStep<ZoomState> {
  const parsed = parseCadZoomScale(token);
  if (!parsed) return refuse(`"${token}" no es un factor de escala válido.`);
  return viewResult({ kind: "zoom", zoom: { option: "scale", ...parsed } }, "ZOOM");
}

const zoomCommand: CadCommandDescriptor<ZoomState> = {
  name: "ZOOM",
  aliases: ["Z"],
  kind: "view",
  transparent: true,
  selection: "optional",
  repeatable: true,
  mutates: false,
  cursor: "crosshair",
  begin: () => zoomStep({ phase: "start" }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return refuse("ZOOM cancelado.");

    if (input.kind === "keyword") {
      switch (input.keyword) {
        case "Todo":
          return viewResult({ kind: "zoom", zoom: { option: "all" } }, "ZOOM");
        case "EXtensión":
          return viewResult({ kind: "zoom", zoom: { option: "extents" } }, "ZOOM");
        case "PRevio":
          return viewResult({ kind: "zoom", zoom: { option: "previous" } }, "ZOOM");
        case "Ventana":
          return zoomStep({ phase: "start" });
        case "CEntro":
          return zoomStep({ phase: "center-point" });
        case "DInámico":
          return zoomStep({ phase: "dynamic-point" });
        case "ESCala":
          return zoomStep({ phase: "scale" });
        case "Objeto":
          // Con objetos ya designados, ZOOM Objeto no vuelve a preguntar: es
          // el gesto de «designo, luego encuadro» y preguntar lo rompería.
          return context.selection.length > 0
            ? viewResult(
                { kind: "zoom", zoom: { option: "object", entityIds: [...context.selection] } },
                "ZOOM",
              )
            : zoomStep({ phase: "object" });
        default:
          return zoomStep(state);
      }
    }

    if (input.kind === "selection")
      return input.entityIds.length > 0
        ? viewResult(
            { kind: "zoom", zoom: { option: "object", entityIds: [...input.entityIds] } },
            "ZOOM",
          )
        : refuse("No se designó ningún objeto.");

    if (input.kind === "point") {
      if (state.phase === "window")
        return viewResult(
          { kind: "zoom", zoom: { option: "window", corner1: state.corner1, corner2: input.point } },
          "ZOOM",
        );
      if (state.phase === "center-point") return zoomStep({ phase: "center", center: input.point });
      if (state.phase === "dynamic-point") return zoomStep({ phase: "dynamic", center: input.point });
      // Un punto en el primer paso es la primera esquina de una ventana: es lo
      // que hace AutoCAD y por lo que el prompt lo ofrece sin palabra clave.
      return zoomStep({ phase: "window", corner1: input.point });
    }

    if (input.kind === "distance") {
      if (state.phase === "center")
        return viewResult(
          { kind: "zoom", zoom: { option: "center", center: state.center, height: input.value } },
          "ZOOM",
        );
      if (state.phase === "dynamic")
        return viewResult(
          { kind: "zoom", zoom: { option: "dynamic", center: state.center, height: input.value } },
          "ZOOM",
        );
      return zoomScale(String(input.value));
    }

    if (input.kind === "text") {
      // `2XP` no es número ni palabra clave, así que llega como texto. Aquí es
      // donde `nX`/`nXP` dejan de ser una promesa del prompt.
      if (state.phase === "center" || state.phase === "dynamic") {
        const height = Number(input.value);
        if (!Number.isFinite(height) || height <= 0)
          return refuse(`"${input.value}" no es una altura de vista válida.`);
        return viewResult(
          {
            kind: "zoom",
            zoom:
              state.phase === "center"
                ? { option: "center", center: state.center, height }
                : { option: "dynamic", center: state.center, height },
          },
          "ZOOM",
        );
      }
      return zoomScale(input.value);
    }

    if (input.kind === "enter") {
      if (state.phase === "center")
        return viewResult(
          { kind: "zoom", zoom: { option: "center", center: state.center } },
          "ZOOM",
        );
      // Enter en el primer paso es el zoom en tiempo real, que es un gesto del
      // puntero y no una petición: el comando termina sin pedir nada.
      return refuse("ZOOM en tiempo real: usa la rueda o arrastra.");
    }

    return zoomStep(state);
  },
};

// ---------------------------------------------------------------------------
// PAN
// ---------------------------------------------------------------------------

interface PanState {
  base: CadPoint2 | null;
}

function panStep(state: PanState): CadCommandStep<PanState> {
  return {
    state,
    prompt: {
      message: state.base
        ? "Precise el segundo punto del desplazamiento"
        : "Precise el punto base del desplazamiento",
      options: [],
    },
    accepts: CAD_ACCEPT_POINT,
    ...(state.base ? { preview: [{ points: [state.base] }] } : {}),
  };
}

const panCommand: CadCommandDescriptor<PanState> = {
  name: "PAN",
  aliases: ["P"],
  kind: "view",
  transparent: true,
  selection: "none",
  repeatable: true,
  mutates: false,
  cursor: "crosshair",
  begin: () => panStep({ base: null }),
  step: (state, input) => {
    if (input.kind === "cancel") return refuse("PAN cancelado.");
    if (input.kind === "enter" && !state.base)
      return refuse("PAN en tiempo real: arrastra con el botón central.");
    if (input.kind !== "point") return panStep(state);
    if (!state.base) return panStep({ base: input.point });
    // El desplazamiento de la VISTA es el opuesto al del punto: arrastrar el
    // dibujo hacia la derecha mueve la cámara hacia la izquierda.
    return viewResult(
      {
        kind: "pan",
        displacement: {
          x: state.base.x - input.point.x,
          y: state.base.y - input.point.y,
        },
      },
      "PAN",
    );
  },
};

// ---------------------------------------------------------------------------
// VIEW
// ---------------------------------------------------------------------------

const VIEW_OPTIONS = [
  { keyword: "Guardar", shortcut: "G" },
  { keyword: "Restituir", shortcut: "R" },
  { keyword: "Borrar", shortcut: "B" },
] as const;

type ViewOp = "save" | "restore" | "delete";
interface ViewState {
  op: ViewOp | null;
}

function viewStep(state: ViewState): CadCommandStep<ViewState> {
  if (!state.op)
    return {
      state,
      prompt: { message: "Indique una opción de vista", options: VIEW_OPTIONS },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  return {
    state,
    prompt: {
      message:
        state.op === "save"
          ? "Indique el nombre con el que guardar la vista actual"
          : state.op === "restore"
            ? "Indique el nombre de la vista que quiere restituir"
            : "Indique el nombre de la vista que quiere borrar",
      options: [],
    },
    accepts: CAD_ACCEPT_TEXT,
  };
}

const viewCommand: CadCommandDescriptor<ViewState> = {
  name: "VIEW",
  aliases: ["V"],
  kind: "view",
  transparent: true,
  selection: "none",
  repeatable: false,
  mutates: false,
  cursor: "none",
  begin: () => viewStep({ op: null }),
  step: (state, input) => {
    if (input.kind === "cancel") return refuse("VIEW cancelado.");
    if (input.kind === "keyword") {
      const op: ViewOp =
        input.keyword === "Guardar" ? "save" : input.keyword === "Restituir" ? "restore" : "delete";
      return viewStep({ op });
    }
    if (input.kind === "text" && state.op)
      return viewResult({ kind: "view", op: state.op, name: input.value }, "VIEW");
    if (input.kind === "enter") return refuse("VIEW: no se indicó ningún nombre.");
    return viewStep(state);
  },
};

// ---------------------------------------------------------------------------
// REGEN / REGENALL
// ---------------------------------------------------------------------------

function regenCommand(name: string, scope: "view" | "all"): CadCommandDescriptor<never> {
  return {
    name,
    aliases: scope === "all" ? ["REA"] : ["RE"],
    kind: "view",
    transparent: false,
    selection: "none",
    repeatable: true,
    mutates: false,
    cursor: "none",
    // Termina en su primer paso: el motor ya contempla ese caso y no muestra
    // ningún prompt intermedio, que es exactamente lo que hace AutoCAD.
    begin: () => viewResult({ kind: "regen", scope }, name),
    step: () => viewResult({ kind: "regen", scope }, name),
  };
}

export const CAD_VIEW_NAVIGATION_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(zoomCommand),
  asCadCommand(panCommand),
  asCadCommand(viewCommand),
  asCadCommand(regenCommand("REGEN", "view")),
  asCadCommand(regenCommand("REGENALL", "all")),
];
