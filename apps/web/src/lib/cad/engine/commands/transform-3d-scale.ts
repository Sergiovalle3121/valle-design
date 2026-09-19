/**
 * 3DSCALE — escalado uniforme de sólidos en 3D alrededor de un punto base.
 *
 * Flujo: seleccionar objetos, punto base, factor de escala.
 * El escalado se compone con la colocación existente como T·S·T⁻¹.
 */
import type { CadPoint3 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import { cadLiftPoint } from "../spatial-point";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_SELECTION,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

interface Scale3dState {
  selection: readonly string[];
  base: CadPoint3 | null;
}

const EMPTY: Scale3dState = { selection: [], base: null };

function step(state: Scale3dState): CadCommandStep<Scale3dState> {
  if (state.selection.length === 0)
    return {
      state,
      prompt: { message: "Designe objetos", options: [] },
      accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
    };
  if (!state.base)
    return {
      state,
      prompt: { message: "Precise el punto base", options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  return {
    state,
    prompt: { message: "Especifique el factor de escala", options: [] },
    accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_POINT,
  };
}

function done(
  commands: readonly CadEntityCommand[],
  label: string,
  message?: string,
): CadCommandStep<Scale3dState> {
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

function scale3dCommands(
  state: Scale3dState,
  factor: number,
  context: CadCommandContext,
): CadEntityCommand[] {
  if (!(factor > 0) || Math.abs(factor - 1) < 1e-9) return [];
  const center = state.base!;
  const commands: CadEntityCommand[] = [];
  for (const entityId of state.selection) {
    const existing = context.entity?.(entityId);
    if (!existing || (existing as { type?: string }).type !== "solid3d") continue;
    const current =
      (existing as { placement?: Record<string, number> }).placement ?? {};
    // T·S·T⁻¹: escalar alrededor de center.
    const cx = center.x;
    const cy = center.y;
    const cz = center.z;
    commands.push({
      type: "transform3d",
      entityId,
      transform3d: {
        a: (current.a ?? 1) * factor,
        b: (current.b ?? 0) * factor,
        c: (current.c ?? 0) * factor,
        d: (current.d ?? 1) * factor,
        e: 0,
        f: 0,
        dz: 0,
        m02: (current.m02 ?? 0) * factor,
        m12: (current.m12 ?? 0) * factor,
        m20: (current.m20 ?? 0) * factor,
        m21: (current.m21 ?? 0) * factor,
        m22: (current.m22 ?? 1) * factor,
        tx:
          cx +
          factor * ((current.e ?? 0) + (current.tx ?? 0) - cx),
        ty:
          cy +
          factor * ((current.f ?? 0) + (current.ty ?? 0) - cy),
        tz:
          cz +
          factor * ((current.dz ?? 0) + (current.tz ?? 0) - cz),
      },
    });
  }
  return commands;
}

const scale3dCommand: CadCommandDescriptor<Scale3dState> = {
  name: "3DSCALE",
  aliases: ["3S"],
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
      return done([], "3DSCALE", "3DSCALE cancelado.");
    if (input.kind === "selection")
      return step({ ...state, selection: input.entityIds });
    if (input.kind === "entityPick")
      return step({
        ...state,
        selection: [...new Set([...state.selection, input.entityId])],
      });
    if (input.kind === "enter" && state.selection.length === 0)
      return done([], "3DSCALE", "3DSCALE: necesita al menos un sólido designado.");
    if (input.kind !== "point" && input.kind !== "distance")
      return step(state);

    if (!state.base) {
      const base3 = cadLiftPoint(
        input.kind === "point" ? input.point : { x: 0, y: 0 },
      );
      return step({ ...state, base: base3 });
    }

    const factor =
      input.kind === "distance"
        ? input.value
        : Math.hypot(input.point.x, input.point.y);
    if (!(factor > 0))
      return done([], "3DSCALE", "3DSCALE: el factor de escala debe ser positivo.");
    const cmds = scale3dCommands(state, factor, context);
    return done(
      cmds,
      "3DSCALE",
      cmds.length === 0
        ? "3DSCALE: la selección no contiene sólidos3D."
        : undefined,
    );
  },
};

export const CAD_3DSCALE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(scale3dCommand),
];
