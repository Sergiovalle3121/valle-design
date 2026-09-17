/**
 * Familia de comandos de VISUALIZACIÓN.
 *
 * 3DWALK, 3DFLY, 3DSWIVEL, VISUALSTYLES.
 * CAMERA, NAVVCUBE, NAVBAR retirados (T18): afirman éxito sin efecto real.
 */
import {
  asCadCommand,
  CAD_ACCEPT_KEYWORD,
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

export const CAD_VIEW_VISUALIZATION_COMMANDS: readonly CadAnyCommandDescriptor[] =
  [
    asCadCommand(navCommand("3DWALK", ["3W", "CAMINAR3D"], "Caminar")),
    asCadCommand(navCommand("3DFLY", ["3F", "VOLAR3D"], "Volar")),
    asCadCommand(
      navCommand("3DSWIVEL", ["3SW", "GIRAR3D"], "Girar cámara"),
    ),
    asCadCommand(cmdvisualstyles),
  ];