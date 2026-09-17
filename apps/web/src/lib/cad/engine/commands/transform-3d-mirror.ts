/**
 * MIRROR3D — reflexión de sólidos respecto a un plano definido por tres puntos.
 *
 * Flujo: seleccionar objetos, tres puntos que definen el plano de espejo.
 * La reflexión se compone con la colocación existente del sólido.
 */
import type { CadPoint3 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import { cadLiftPoint } from "../spatial-point";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_SELECTION,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

interface Mirror3dState {
  selection: readonly string[];
  p1: CadPoint3 | null;
  p2: CadPoint3 | null;
  p3: CadPoint3 | null;
}

const EMPTY: Mirror3dState = { selection: [], p1: null, p2: null, p3: null };

function step(state: Mirror3dState): CadCommandStep<Mirror3dState> {
  if (state.selection.length === 0)
    return {
      state,
      prompt: { message: "Designe objetos", options: [] },
      accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
    };
  if (!state.p1)
    return {
      state,
      prompt: { message: "Primer punto del plano de espejo", options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  if (!state.p2)
    return {
      state,
      prompt: { message: "Segundo punto del plano de espejo", options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  return {
    state,
    prompt: { message: "Tercer punto del plano de espejo", options: [] },
    accepts: CAD_ACCEPT_POINT,
  };
}

function done(
  commands: readonly CadEntityCommand[],
  label: string,
  message?: string,
): CadCommandStep<Mirror3dState> {
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

function mirror3dCommands(
  state: Mirror3dState,
  context: CadCommandContext,
): CadEntityCommand[] {
  const a = state.p1!;
  const b = state.p2!;
  const c = state.p3!;

  // Normal del plano: (b-a) × (c-a)
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uz = b.z - a.z;
  const vx = c.x - a.x;
  const vy = c.y - a.y;
  const vz = c.z - a.z;
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz);
  if (!(len > 1e-12)) return [];
  nx /= len;
  ny /= len;
  nz /= len;

  // Matriz de reflexión: R = I - 2·n·nᵀ
  const r00 = 1 - 2 * nx * nx;
  const r01 = -2 * nx * ny;
  const r02 = -2 * nx * nz;
  const r10 = -2 * ny * nx;
  const r11 = 1 - 2 * ny * ny;
  const r12 = -2 * ny * nz;
  const r20 = -2 * nz * nx;
  const r21 = -2 * nz * ny;
  const r22 = 1 - 2 * nz * nz;

  // Trasladar al punto a del plano: T·R·T⁻¹
  const px = a.x;
  const py = a.y;
  const pz = a.z;
  const tx = px - (r00 * px + r01 * py + r02 * pz);
  const ty = py - (r10 * px + r11 * py + r12 * pz);
  const tz = pz - (r20 * px + r21 * py + r22 * pz);

  const commands: CadEntityCommand[] = [];
  for (const entityId of state.selection) {
    const existing = context.entity?.(entityId);
    if (!existing || (existing as { type?: string }).type !== "solid3d")
      continue;
    const current =
      (existing as { placement?: Record<string, number> }).placement ?? {};
    // Componer: reflexión × colocación existente.
    const bm = {
      r00: current.a ?? 1,
      r01: current.c ?? 0,
      r02: current.m02 ?? 0,
      r10: current.b ?? 0,
      r11: current.d ?? 1,
      r12: current.m12 ?? 0,
      r20: current.m20 ?? 0,
      r21: current.m21 ?? 0,
      r22: current.m22 ?? 1,
      tx: (current.e ?? 0) + (current.tx ?? 0),
      ty: (current.f ?? 0) + (current.ty ?? 0),
      tz: (current.dz ?? 0) + (current.tz ?? 0),
    };
    commands.push({
      type: "transform3d",
      entityId,
      transform3d: {
        e: 0,
        f: 0,
        dz: 0,
        a: r00 * bm.r00 + r01 * bm.r10 + r02 * bm.r20,
        c: r00 * bm.r01 + r01 * bm.r11 + r02 * bm.r21,
        m02: r00 * bm.r02 + r01 * bm.r12 + r02 * bm.r22,
        b: r10 * bm.r00 + r11 * bm.r10 + r12 * bm.r20,
        d: r10 * bm.r01 + r11 * bm.r11 + r12 * bm.r21,
        m12: r10 * bm.r02 + r11 * bm.r12 + r12 * bm.r22,
        m20: r20 * bm.r00 + r21 * bm.r10 + r22 * bm.r20,
        m21: r20 * bm.r01 + r21 * bm.r11 + r22 * bm.r21,
        m22: r20 * bm.r02 + r21 * bm.r12 + r22 * bm.r22,
        tx: r00 * bm.tx + r01 * bm.ty + r02 * bm.tz + tx,
        ty: r10 * bm.tx + r11 * bm.ty + r12 * bm.tz + ty,
        tz: r20 * bm.tx + r21 * bm.ty + r22 * bm.tz + tz,
      },
    });
  }
  return commands;
}

const mirror3dCommand: CadCommandDescriptor<Mirror3dState> = {
  name: "MIRROR3D",
  aliases: ["MIRROR3"],
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
      return done([], "MIRROR3D", "MIRROR3D cancelado.");
    if (input.kind === "selection")
      return step({ ...state, selection: input.entityIds });
    if (input.kind === "entityPick")
      return step({
        ...state,
        selection: [...new Set([...state.selection, input.entityId])],
      });
    if (input.kind === "enter" && state.selection.length === 0)
      return done(
        [],
        "MIRROR3D",
        "MIRROR3D: necesita al menos un sólido designado.",
      );
    if (input.kind !== "point") return step(state);

    const p = cadLiftPoint(input.point);
    if (!state.p1) return step({ ...state, p1: p });
    if (!state.p2) return step({ ...state, p2: p });
    const cmds = mirror3dCommands({ ...state, p3: p }, context);
    return done(
      cmds,
      "MIRROR3D",
      cmds.length === 0
        ? "MIRROR3D: la selección no contiene sólidos3D o el plano es degenerado."
        : undefined,
    );
  },
};

export const CAD_MIRROR3D_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(mirror3dCommand),
];
