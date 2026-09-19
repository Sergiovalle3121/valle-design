/**
 * Familia de comandos de VISUALIZACIÓN.
 *
 * 3DWALK, 3DFLY, 3DSWIVEL, VISUALSTYLES, CAMERA, DVIEW.
 * NAVVCUBE y NAVBAR son controles de UI, no comandos del motor.
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
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "message", text },
  };
}

// ---------------------------------------------------------------------------
// 3DWALK / 3DFLY / 3DSWIVEL — navegación interactiva
// ---------------------------------------------------------------------------

function navCommand(
  name: string,
  aliases: string[],
  description: string,
): CadCommandDescriptor<null> {
  return {
    name,
    aliases,
    kind: "view",
    transparent: true,
    selection: "none",
    repeatable: true,
    mutates: false,
    cursor: "none",
    begin: () => ({
      state: null,
      prompt: {
        message: `${description}: modo de navegación interactiva`,
        options: [],
      },
      accepts: 0,
    }),
    step: (_s, input) => {
      if (input.kind === "cancel") return say(`${name} cancelado.`);
      return say(
        `${name}: navegación interactiva — requiere anfitrión con visor 3D.`,
      );
    },
  };
}

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
  kind: "view",
  transparent: true,
  selection: "none",
  repeatable: true,
  mutates: false,
  cursor: "none",
  begin: () => ({
    state: null,
    prompt: {
      message: "Elija el estilo visual",
      options: VISUAL_STYLES,
      defaultOption: "SombreadoConAristas",
    },
    accepts: CAD_ACCEPT_KEYWORD,
  }),
  step: (_s, input) => {
    if (input.kind === "cancel") return say("VISUALSTYLES cancelado.");
    const style =
      input.kind === "keyword" ? input.keyword : "SombreadoConAristas";
    return say(
      `VISUALSTYLES: estilo «${style}» — requiere anfitrión con visor 3D.`,
    );
  },
};

// ---------------------------------------------------------------------------
// CAMERA — definir posición de cámara y objetivo
// ---------------------------------------------------------------------------

type CameraState =
  | { step: "eye" }
  | { step: "target"; eye: { x: number; y: number; z: number } };

const cmdcamera: CadCommandDescriptor<CameraState> = {
  name: "CAMERA",
  aliases: ["CAMARA"],
  kind: "view",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: false,
  cursor: "crosshair",
  begin: () => ({
    state: { step: "eye" } as CameraState,
    prompt: { message: "Posición de la cámara", options: [] },
    accepts: CAD_ACCEPT_POINT,
  }),
  step: (state, input): CadCommandStep<CameraState> => {
    if (input.kind === "cancel") return say("CAMERA cancelado.");

    if (state.step === "eye") {
      if (input.kind !== "point") return say("CAMERA: indique la posición de la cámara.");
      const p = input.point;
      return {
        state: { step: "target", eye: { x: p.x, y: p.y, z: ("z" in p && typeof p.z === "number") ? p.z : 0 } },
        prompt: { message: "Punto objetivo", options: [] },
        accepts: CAD_ACCEPT_POINT,
      };
    }

    if (input.kind !== "point") return say("CAMERA: indique el punto objetivo.");
    const t = input.point;
    const target = { x: t.x, y: t.y, z: ("z" in t && typeof t.z === "number") ? t.z : 0 };
    const dx = target.x - state.eye.x;
    const dy = target.y - state.eye.y;
    const dz = target.z - state.eye.z;
    const dist = Math.hypot(dx, dy, dz);
    return say(
      `CAMERA: ojo(${state.eye.x.toFixed(2)}, ${state.eye.y.toFixed(2)}, ${state.eye.z.toFixed(2)}) → objetivo(${target.x.toFixed(2)}, ${target.y.toFixed(2)}, ${target.z.toFixed(2)}). Distancia: ${dist.toFixed(2)} — requiere anfitrión con visor 3D.`,
    );
  },
};

// ---------------------------------------------------------------------------
// DVIEW — vista dinámica (selección + opciones de cámara)
// ---------------------------------------------------------------------------

type DviewState =
  | { step: "select"; ids: string[] }
  | { step: "option"; ids: string[] }
  | { step: "camera-angle"; ids: string[]; cameraPoint: { x: number; y: number; z: number } }
  | { step: "target-angle"; ids: string[]; cameraPoint: { x: number; y: number; z: number } };

const DVIEW_OPTIONS = [
  { keyword: "Camara", shortcut: "C" },
  { keyword: "Objetivo", shortcut: "O" },
  { keyword: "Distancia", shortcut: "D" },
  { keyword: "Puntos", shortcut: "P" },
] as const;

const cmddview: CadCommandDescriptor<DviewState> = {
  name: "DVIEW",
  aliases: ["VISTADIN"],
  kind: "view",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: false,
  cursor: "crosshair",
  begin: (context) => ({
    state: context.selection.length > 0
      ? { step: "option" as const, ids: [...context.selection] }
      : { step: "select" as const, ids: [] as string[] },
    prompt: {
      message: context.selection.length > 0
        ? "Seleccione objetos y pulse Intro (o use directamente una opción)"
        : "Seleccione objetos para DVIEW (o Intro para todo el dibujo)",
      options: [],
    },
    accepts: context.selection.length > 0 ? CAD_ACCEPT_KEYWORD : 0,
  }),
  step: (state, input): CadCommandStep<DviewState> => {
    if (input.kind === "cancel") return say("DVIEW cancelado.");

    if (state.step === "select") {
      if (input.kind === "enter" || input.kind === "text") {
        return {
          state: { step: "option", ids: state.ids },
          prompt: { message: "Elija opción de vista", options: DVIEW_OPTIONS, defaultOption: "Puntos" },
          accepts: CAD_ACCEPT_KEYWORD,
        };
      }
      return {
        state,
        prompt: { message: "Seleccione objetos o pulse Intro para todo el dibujo", options: [] },
        accepts: 0,
      };
    }

    if (state.step === "option") {
      const option = input.kind === "keyword" ? input.keyword : "Puntos";
      if (option === "Camara" || option === "Puntos") {
        return {
          state: { step: "camera-angle", ids: state.ids, cameraPoint: { x: 0, y: 0, z: 0 } },
          prompt: { message: "Posición de la cámara", options: [] },
          accepts: CAD_ACCEPT_POINT,
        };
      }
      if (option === "Objetivo") {
        return {
          state: { step: "target-angle", ids: state.ids, cameraPoint: { x: 0, y: 0, z: 0 } },
          prompt: { message: "Punto objetivo", options: [] },
          accepts: CAD_ACCEPT_POINT,
        };
      }
      return say(`DVIEW: opción «${option}» — requiere anfitrión con visor 3D.`);
    }

    if (state.step === "camera-angle") {
      if (input.kind !== "point") return say("DVIEW: indique la posición de la cámara.");
      const p = input.point;
      const eye = { x: p.x, y: p.y, z: ("z" in p && typeof p.z === "number") ? p.z : 0 };
      return {
        state: { step: "target-angle", ids: state.ids, cameraPoint: eye },
        prompt: { message: "Punto objetivo", options: [] },
        accepts: CAD_ACCEPT_POINT,
      };
    }

    if (input.kind !== "point") return say("DVIEW: indique el punto objetivo.");
    const t = input.point;
    const target = { x: t.x, y: t.y, z: ("z" in t && typeof t.z === "number") ? t.z : 0 };
    const dx = target.x - state.cameraPoint.x;
    const dy = target.y - state.cameraPoint.y;
    const dz = target.z - state.cameraPoint.z;
    const dist = Math.hypot(dx, dy, dz);
    return say(
      `DVIEW: cámara(${state.cameraPoint.x.toFixed(2)}, ${state.cameraPoint.y.toFixed(2)}, ${state.cameraPoint.z.toFixed(2)}) → objetivo(${target.x.toFixed(2)}, ${target.y.toFixed(2)}, ${target.z.toFixed(2)}). Distancia: ${dist.toFixed(2)} — requiere anfitrión con visor 3D.`,
    );
  },
};

// ---------------------------------------------------------------------------
// NAVVCUBE / NAVBAR — controles de UI declarados como límite
// ---------------------------------------------------------------------------

const cmdnavvcube: CadCommandDescriptor<null> = {
  name: "NAVVCUBE",
  aliases: ["CUBONAV"],
  kind: "view",
  transparent: true,
  selection: "none",
  repeatable: true,
  mutates: false,
  cursor: "none",
  begin: () => ({
    state: null,
    prompt: { message: "NAVVCUBE: cubo de navegación 3D", options: [] },
    accepts: 0,
  }),
  step: () => say("NAVVCUBE: control de UI del visor 3D — requiere anfitrión con visor 3D."),
};

const cmdnavbar: CadCommandDescriptor<null> = {
  name: "NAVBAR",
  aliases: ["BARRANAV"],
  kind: "view",
  transparent: true,
  selection: "none",
  repeatable: true,
  mutates: false,
  cursor: "none",
  begin: () => ({
    state: null,
    prompt: { message: "NAVBAR: barra de navegación 3D", options: [] },
    accepts: 0,
  }),
  step: () => say("NAVBAR: barra de herramientas de navegación — requiere anfitrión con visor 3D."),
};

export const CAD_VIEW_VISUALIZATION_COMMANDS: readonly CadAnyCommandDescriptor[] =
  [
    asCadCommand(navCommand("3DWALK", ["3W", "CAMINAR3D"], "Caminar")),
    asCadCommand(navCommand("3DFLY", ["3F", "VOLAR3D"], "Volar")),
    asCadCommand(
      navCommand("3DSWIVEL", ["3SW", "GIRAR3D"], "Girar cámara"),
    ),
    asCadCommand(cmdvisualstyles),
    asCadCommand(cmdcamera),
    asCadCommand(cmddview),
    asCadCommand(cmdnavvcube),
    asCadCommand(cmdnavbar),
  ];