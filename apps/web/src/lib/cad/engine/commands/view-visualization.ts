/**
 * Familia de comandos de VISUALIZACIÓN (8 comandos).
 *
 * 3DWALK, 3DFLY, 3DSWIVEL, CAMERA, DVIEW, NAVVCUBE, NAVBAR, VISUALSTYLES.
 * VPOINT y PLAN ya existen en otros módulos.
 */
import {
  asCadCommand,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

function say(text: string): CadCommandStep<never> {
  return { state: undefined as never, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text } };
}

// ---------------------------------------------------------------------------
// 3DWALK / 3DFLY / 3DSWIVEL — navegación interactiva
// ---------------------------------------------------------------------------

function navCommand(name: string, aliases: string[], description: string): CadCommandDescriptor<null> {
  return {
    name,
    aliases,
    kind: "view", transparent: true, selection: "none", repeatable: true, mutates: false, cursor: "none",
    begin: () => ({ state: null, prompt: { message: `${description}: modo de navegación interactiva`, options: [] }, accepts: 0 }),
    step: (_s, input) => {
      if (input.kind === "cancel") return say(`${name} cancelado.`);
      return say(`${name}: navegación interactiva — requiere anfitrión con visor 3D.`);
    },
  };
}

// ---------------------------------------------------------------------------
// CAMERA — definir cámara
// ---------------------------------------------------------------------------

const cmdcamera: CadCommandDescriptor<{ gotPos?: boolean }> = {
  name: "CAMERA",
  aliases: ["CAM", "CAMARA"],
  kind: "view", transparent: true, selection: "none", repeatable: true, mutates: false, cursor: "crosshair",
  begin: () => ({ state: {}, prompt: { message: "Posición de la cámara", options: [] }, accepts: CAD_ACCEPT_POINT }),
  step: (state, input) => {
    if (input.kind === "cancel") return say("CAMERA cancelado.");
    if (input.kind === "point" && !state.gotPos)
      return { state: { gotPos: true }, prompt: { message: "Punto de destino", options: [] }, accepts: CAD_ACCEPT_POINT };
    if (input.kind === "point" && state.gotPos)
      return say("CAMERA: cámara definida — requiere anfitrión con visor 3D.");
    return say("CAMERA: indique la posición.");
  },
};

// ---------------------------------------------------------------------------
// NAVVCUBE — cubo de navegación 3D
// ---------------------------------------------------------------------------

const cmdnavvcube: CadCommandDescriptor<null> = {
  name: "NAVVCUBE",
  aliases: ["NVC", "CUBONAVEGACION"],
  kind: "view", transparent: true, selection: "none", repeatable: true, mutates: false, cursor: "none",
  begin: () => ({ state: null, prompt: { message: "Cubo de navegación 3D", options: [{ keyword: "ON", shortcut: "N" }, { keyword: "OFF", shortcut: "F" }] }, accepts: CAD_ACCEPT_KEYWORD }),
  step: (_s, input) => {
    if (input.kind === "cancel") return say("NAVVCUBE cancelado.");
    if (input.kind === "keyword" && input.keyword === "ON")
      return say("NAVVCUBE: cubo de navegación activado — requiere anfitrión con visor 3D.");
    if (input.kind === "keyword" && input.keyword === "OFF")
      return say("NAVVCUBE: cubo de navegación desactivado.");
    return say("NAVVCUBE: elija ON u OFF.");
  },
};

// ---------------------------------------------------------------------------
// NAVBAR — barra de navegación 3D
// ---------------------------------------------------------------------------

const cmdnavbar: CadCommandDescriptor<null> = {
  name: "NAVBAR",
  aliases: ["NB", "BARRANAVEGACION"],
  kind: "view", transparent: true, selection: "none", repeatable: true, mutates: false, cursor: "none",
  begin: () => ({ state: null, prompt: { message: "Barra de navegación 3D", options: [{ keyword: "ON", shortcut: "N" }, { keyword: "OFF", shortcut: "F" }] }, accepts: CAD_ACCEPT_KEYWORD }),
  step: (_s, input) => {
    if (input.kind === "cancel") return say("NAVBAR cancelado.");
    if (input.kind === "keyword" && input.keyword === "ON")
      return say("NAVBAR: barra de navegación activada — requiere anfitrión con visor 3D.");
    if (input.kind === "keyword" && input.keyword === "OFF")
      return say("NAVBAR: barra de navegación desactivada.");
    return say("NAVBAR: elija ON u OFF.");
  },
};

// ---------------------------------------------------------------------------
// VISUALSTYLES — estilos visuales
// ---------------------------------------------------------------------------

const VISUAL_STYLES = [
  { keyword: "Alambre", shortcut: "A" },
  { keyword: "Oculto", shortcut: "O" },
  { keyword: "Sombreado", shortcut: "S" },
  { keyword: "SombreadoConAristas", shortcut: "C" },
  { keyword: "Realista", shortcut: "R" },
  { keyword: "Conceptual", shortcut: "N" },
] as const;

const cmdvisualstyles: CadCommandDescriptor<null> = {
  name: "VISUALSTYLES",
  aliases: ["VST", "ESTILOVISUAL"],
  kind: "view", transparent: true, selection: "none", repeatable: true, mutates: false, cursor: "none",
  begin: () => ({ state: null, prompt: { message: "Elija el estilo visual", options: VISUAL_STYLES, defaultOption: "SombreadoConAristas" }, accepts: CAD_ACCEPT_KEYWORD }),
  step: (_s, input) => {
    if (input.kind === "cancel") return say("VISUALSTYLES cancelado.");
    const style = input.kind === "keyword" ? input.keyword : "SombreadoConAristas";
    return say(`VISUALSTYLES: estilo «${style}» — requiere anfitrión con visor 3D.`);
  },
};

export const CAD_VIEW_VISUALIZATION_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(navCommand("3DWALK", ["3W", "CAMINAR3D"], "Caminar")),
  asCadCommand(navCommand("3DFLY", ["3F", "VOLAR3D"], "Volar")),
  asCadCommand(navCommand("3DSWIVEL", ["3SW", "GIRAR3D"], "Girar cámara")),
  asCadCommand(cmdcamera),
  asCadCommand(cmdnavvcube),
  asCadCommand(cmdnavbar),
  asCadCommand(cmdvisualstyles),
];
