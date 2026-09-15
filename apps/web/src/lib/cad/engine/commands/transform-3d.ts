/**
 * 3DMOVE — traslación de sólidos en tres dimensiones.
 *
 * Igual que MOVE pero el desplazamiento tiene componente Z. El punto base y
 * el destino se elevan a 3D con `cadLiftPoint`, que usa el SCU activo o la
 * Z del propio punto cuando la hay.
 *
 * La traslación se escribe como componente `tx`/`ty`/`tz` de la colocación
 * 3D del sólido, componiéndola con la que ya tuviera. La afín 2×3 (a-f) y
 * el `dz` original no se tocan: sólo se añaden los campos3D.
 */
import type { CadPoint3 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import { cadLiftPoint } from "../spatial-point";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_SELECTION,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

const COPY_OPTION = { keyword: "Copiar", shortcut: "C" } as const;

interface Move3dState {
  selection: readonly string[];
  base: CadPoint3 | null;
  copy: boolean;
}

const EMPTY: Move3dState = { selection: [], base: null, copy: false };

function step(state: Move3dState): CadCommandStep<Move3dState> {
  if (state.selection.length === 0)
    return {
      state,
      prompt: { message: "Designe objetos", options: [] },
      accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
    };
  if (!state.base)
    return {
      state,
      prompt: { message: "Precise el punto base", options: [COPY_OPTION] },
      accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    };
  return {
    state,
    prompt: { message: "Precise el punto de destino", options: [] },
    accepts: CAD_ACCEPT_POINT,
  };
}

function done(
  commands: readonly CadEntityCommand[],
  label: string,
): CadCommandStep<Move3dState> {
  return {
    state: EMPTY,
    prompt: { message: "", options: [] },
    accepts: 0,
    result:
      commands.length > 0
        ? { kind: "document", commands, label }
        : { kind: "none" },
  };
}

function move3dCommands(
  state: Move3dState,
  destination: CadPoint3,
  context: CadCommandContext,
): CadEntityCommand[] {
  const base = state.base!;
  const dx = destination.x - base.x;
  const dy = destination.y - base.y;
  const dz = destination.z - base.z;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9 && Math.abs(dz) < 1e-9)
    return [];
  const commands: CadEntityCommand[] = [];
  for (const entityId of state.selection) {
    const target = state.copy ? context.newEntityId() : entityId;
    if (state.copy) commands.push({ type: "copy", entityId, newEntityId: target });
    // Obtener la colocación existente para componer.
    const existing = context.entity?.(entityId);
    const current = (existing as { placement?: Record<string, number> })?.placement ?? {};
    commands.push({
      type: "transform3d",
      entityId: target,
      transform3d: {
        // Conservar la afín 2D existente.
        a: current.a ?? 1, b: current.b ?? 0, c: current.c ?? 0,
        d: current.d ?? 1, e: current.e ?? 0, f: current.f ?? 0,
        dz: current.dz ?? 0,
        // Componer la traslación3D.
        m02: current.m02 ?? 0, m10: current.m10 ?? 0, m11: current.m11 ?? 1, m12: current.m12 ?? 0,
        m20: current.m20 ?? 0, m21: current.m21 ?? 0, m22: current.m22 ?? 1,
        tx: (current.tx ?? 0) + dx,
        ty: (current.ty ?? 0) + dy,
        tz: (current.tz ?? 0) + dz,
      },
    });
  }
  return commands;
}

const move3dCommand: CadCommandDescriptor<Move3dState> = {
  name: "3DMOVE",
  aliases: ["3M"],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  spatial: "elevation",
  begin: (context) => step({ ...EMPTY, selection: context.selection }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return done([], "3DMOVE");

    if (input.kind === "selection")
      return step({ ...state, selection: input.entityIds });
    if (input.kind === "entityPick")
      return step({
        ...state,
        selection: [...new Set([...state.selection, input.entityId])],
      });
    if (input.kind === "enter" && state.selection.length === 0)
      return done([], "3DMOVE: necesita al menos un objeto designado.");

    if (input.kind === "keyword") {
      if (input.keyword === COPY_OPTION.keyword)
        return step({ ...state, copy: true });
      return step(state);
    }

    if (input.kind !== "point") return step(state);

    if (!state.base) {
      const base3 = cadLiftPoint(input.point);
      return step({ ...state, base: base3 });
    }

    const dest = cadLiftPoint(input.point, state.base);
    return done(move3dCommands(state, dest, context), "3DMOVE");
  },
};

export const CAD_3DMOVE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(move3dCommand),
];
