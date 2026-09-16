/**
 * Familia de comandos de TRANSFORMACIÓN 3D (4 comandos).
 *
 * 3DALIGN, 3DSCALE, MIRROR3D, 3DARRAY — operaciones de transformación
 * espacial que aplican a sólidos 3D. ALIGN ya existe en modify-align.ts.
 */
import {
  asCadCommand,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_POINT,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

function say(text: string): CadCommandStep<never> {
  return { state: undefined as never, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text } };
}

// ---------------------------------------------------------------------------
// 3DALIGN — alinear sólido con tres pares de puntos
// ---------------------------------------------------------------------------

type Align3dState = { step: "source" | "target" | "confirm" };

const cmd3dalign: CadCommandDescriptor<Align3dState> = {
  name: "3DALIGN",
  aliases: ["3AL", "ALINEAR3D"],
  kind: "modify", transparent: false, selection: "none", repeatable: true, mutates: true, cursor: "pick",
  begin: () => ({ state: { step: "source" } as Align3dState, prompt: { message: "Designe el sólido a alinear", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK }),
  step: (state, input) => {
    if (input.kind === "cancel") return say("3DALIGN cancelado.");
    if (state.step === "source" && input.kind === "entityPick")
      return { state: { step: "target" }, prompt: { message: "Punto de origen (1 de 3)", options: [] }, accepts: CAD_ACCEPT_POINT };
    if (state.step === "target" && input.kind === "point")
      return { state: { step: "confirm" }, prompt: { message: "Punto de destino (1 de 3)", options: [] }, accepts: CAD_ACCEPT_POINT };
    if (state.step === "confirm")
      return say("3DALIGN: alineación 3D — operación pendiente del kernel.");
    return say("3DALIGN: designe el sólido.");
  },
};

// ---------------------------------------------------------------------------
// 3DSCALE — escalar sólido en tres ejes
// ---------------------------------------------------------------------------

const cmd3dscale: CadCommandDescriptor<null> = {
  name: "3DSCALE",
  aliases: ["3SC", "ESCALAR3D"],
  kind: "modify", transparent: false, selection: "none", repeatable: true, mutates: true, cursor: "pick",
  begin: () => ({ state: null, prompt: { message: "Designe el sólido a escalar", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK }),
  step: (_s, input) => {
    if (input.kind === "cancel") return say("3DSCALE cancelado.");
    if (input.kind === "entityPick")
      return { state: null, prompt: { message: "Factor de escala", options: [], defaultValue: "1" }, accepts: CAD_ACCEPT_DISTANCE };
    if (input.kind === "distance")
      return say("3DSCALE: escala 3D — operación pendiente del kernel.");
    return say("3DSCALE: designe el sólido.");
  },
};

// ---------------------------------------------------------------------------
// MIRROR3D — espejo de sólido por plano
// ---------------------------------------------------------------------------

const MIRROR_PLANE_OPTIONS = [
  { keyword: "Objeto", shortcut: "O" },
  { keyword: "Última", shortcut: "U" },
  { keyword: "EjeZ", shortcut: "Z" },
  { keyword: "XY", shortcut: "X" },
  { keyword: "YZ", shortcut: "Y" },
] as const;

const cmdmirror3d: CadCommandDescriptor<null> = {
  name: "MIRROR3D",
  aliases: ["M3D", "ESPEJO3D"],
  kind: "modify", transparent: false, selection: "none", repeatable: true, mutates: true, cursor: "pick",
  begin: () => ({ state: null, prompt: { message: "Designe los sólidos a reflejar", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK }),
  step: (_s, input) => {
    if (input.kind === "cancel") return say("MIRROR3D cancelado.");
    if (input.kind === "entityPick")
      return { state: null, prompt: { message: "Plano de simetría", options: MIRROR_PLANE_OPTIONS }, accepts: CAD_ACCEPT_KEYWORD };
    if (input.kind === "keyword")
      return say("MIRROR3D: espejo 3D — operación pendiente del kernel.");
    return say("MIRROR3D: designe los sólidos.");
  },
};

// ---------------------------------------------------------------------------
// 3DARRAY — matriz 3D de sólidos
// ---------------------------------------------------------------------------

const ARRAY3D_OPTIONS = [
  { keyword: "Rectangular", shortcut: "R" },
  { keyword: "Polar", shortcut: "P" },
] as const;

const cmd3darray: CadCommandDescriptor<null> = {
  name: "3DARRAY",
  aliases: ["3AR", "MATRIZ3D"],
  kind: "modify", transparent: false, selection: "none", repeatable: true, mutates: true, cursor: "pick",
  begin: () => ({ state: null, prompt: { message: "Designe el sólido a repetir", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK }),
  step: (_s, input) => {
    if (input.kind === "cancel") return say("3DARRAY cancelado.");
    if (input.kind === "entityPick")
      return { state: null, prompt: { message: "Tipo de matriz", options: ARRAY3D_OPTIONS, defaultOption: "Rectangular" }, accepts: CAD_ACCEPT_KEYWORD };
    if (input.kind === "keyword")
      return say("3DARRAY: matriz 3D — operación pendiente del kernel.");
    return say("3DARRAY: designe el sólido.");
  },
};

export const CAD_TRANSFORM_3D_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(cmd3dalign),
  asCadCommand(cmd3dscale),
  asCadCommand(cmdmirror3d),
  asCadCommand(cmd3darray),
];
