/**
 * 3DARRAY — copia rectanglar de sólidos en una rejilla 3D.
 *
 * Flujo: seleccionar objetos, filas, columnas, niveles, espaciado en cada
 * dirección. Crea copias en cada posición de la rejilla.
 */
import type { CadEntityCommand } from "../../entity-commands";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_SELECTION,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

interface Array3dState {
  selection: readonly string[];
  rows: number;
  cols: number;
  levels: number;
  rowDist: number;
  colDist: number;
  levelDist: number;
  phase: "rows" | "cols" | "levels" | "rowDist" | "colDist" | "levelDist" | "done";
}

const EMPTY: Array3dState = {
  selection: [],
  rows: 2,
  cols: 1,
  levels: 1,
  rowDist: 0,
  colDist: 0,
  levelDist: 0,
  phase: "rows",
};

function promptFor(state: Array3dState): { message: string; accepts: number } {
  switch (state.phase) {
    case "rows":
      return { message: `Numero de filas (actual: ${state.rows})`, accepts: CAD_ACCEPT_DISTANCE };
    case "cols":
      return { message: `Numero de columnas (actual: ${state.cols})`, accepts: CAD_ACCEPT_DISTANCE };
    case "levels":
      return { message: `Numero de niveles (actual: ${state.levels})`, accepts: CAD_ACCEPT_DISTANCE };
    case "rowDist":
      return { message: "Espaciado entre filas", accepts: CAD_ACCEPT_DISTANCE };
    case "colDist":
      return { message: "Espaciado entre columnas", accepts: CAD_ACCEPT_DISTANCE };
    case "levelDist":
      return { message: "Espaciado entre niveles", accepts: CAD_ACCEPT_DISTANCE };
    default:
      return { message: "", accepts: 0 };
  }
}

function step(state: Array3dState): CadCommandStep<Array3dState> {
  if (state.selection.length === 0)
    return {
      state,
      prompt: { message: "Designe objetos", options: [] },
      accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
    };
  const p = promptFor(state);
  return { state, prompt: { message: p.message, options: [] }, accepts: p.accepts };
}

function done(
  commands: readonly CadEntityCommand[],
  label: string,
  message?: string,
): CadCommandStep<Array3dState> {
  return {
    state: EMPTY,
    prompt: { message: "", options: [] },
    accepts: 0,
    result:
      commands.length > 0
        ? { kind: "document", commands, label }
        : message
          ? { kind: "message", text: message }
          : { kind: "none" },
  };
}

function array3dCommands(state: Array3dState, context: CadCommandContext): CadEntityCommand[] {
  const { rows, cols, levels, rowDist, colDist, levelDist, selection } = state;
  if (rows < 2 && cols < 2 && levels < 2) return [];

  const commands: CadEntityCommand[] = [];

  for (let l = 0; l < levels; l++) {
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if (r === 0 && c === 0 && l === 0) continue; // Original position
        const dx = r * rowDist;
        const dy = c * colDist;
        const dz = l * levelDist;
        for (const entityId of selection) {
          const existing = context.entity?.(entityId);
          if (!existing || (existing as { type?: string }).type !== "solid3d")
            continue;
          const newId = context.newEntityId();
          commands.push({ type: "copy", entityId, newEntityId: newId });
          const current =
            (existing as { placement?: Record<string, number> }).placement ?? {};
          commands.push({
            type: "transform3d",
            entityId: newId,
            transform3d: {
              a: current.a ?? 1,
              b: current.b ?? 0,
              c: current.c ?? 0,
              d: current.d ?? 1,
              e: 0,
              f: 0,
              dz: 0,
              m02: current.m02 ?? 0,
              m12: current.m12 ?? 0,
              m20: current.m20 ?? 0,
              m21: current.m21 ?? 0,
              m22: current.m22 ?? 1,
              tx: (current.e ?? 0) + (current.tx ?? 0) + dx,
              ty: (current.f ?? 0) + (current.ty ?? 0) + dy,
              tz: (current.dz ?? 0) + (current.tz ?? 0) + dz,
            },
          });
        }
      }
    }
  }
  return commands;
}

const array3dCommand: CadCommandDescriptor<Array3dState> = {
  name: "3DARRAY",
  aliases: ["3A"],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  spatial: "elevation",
  begin: (context) => step({ ...EMPTY, selection: context.selection }),
  step: (state, input, context) => {
    if (input.kind === "cancel")
      return done([], "3DARRAY", "3DARRAY cancelado.");
    if (input.kind === "selection")
      return step({ ...state, selection: input.entityIds });
    if (input.kind === "entityPick")
      return step({
        ...state,
        selection: [...new Set([...state.selection, input.entityId])],
      });
    if (input.kind === "enter" && state.selection.length === 0)
      return done([], "3DARRAY", "3DARRAY: necesita al menos un sólido designado.");

    const val = input.kind === "distance"
      ? input.value
      : input.kind === "point"
        ? Math.hypot(input.point.x, input.point.y)
        : null;
    if (val === null) return step(state);

    let next: Array3dState;
    switch (state.phase) {
      case "rows":
        next = { ...state, rows: Math.max(1, Math.round(val)), phase: "cols" };
        break;
      case "cols":
        next = { ...state, cols: Math.max(1, Math.round(val)), phase: "levels" };
        break;
      case "levels":
        next = { ...state, levels: Math.max(1, Math.round(val)), phase: "rowDist" };
        break;
      case "rowDist":
        next = { ...state, rowDist: val, phase: "colDist" };
        break;
      case "colDist":
        next = { ...state, colDist: val, phase: "levelDist" };
        break;
      case "levelDist": {
        const final = { ...state, levelDist: val, phase: "done" as const };
        const cmds = array3dCommands(final, context);
        return done(
          cmds,
          "3DARRAY",
          cmds.length === 0
            ? "3DARRAY: no se crearon copias (al menos una dimension >= 2)."
            : undefined,
        );
      }
      default:
        return step(state);
    }
    return step(next);
  },
};

export const CAD_3DARRAY_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(array3dCommand),
];
