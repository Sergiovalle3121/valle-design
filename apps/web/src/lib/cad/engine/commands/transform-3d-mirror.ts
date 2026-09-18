/**
 * MIRROR3D — reflexión de sólidos respecto a un plano de espejo.
 *
 * Tres formas de definir el plano:
 *   · Tres puntos.
 *   · XY, YZ o ZX más un punto por donde pasa el plano.
 *
 * Después pregunta si borrar los objetos de origen (por defecto No).
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

type PlaneMethod = "points" | "xy" | "yz" | "zx";

interface Mirror3dState {
  selection: readonly string[];
  planeMethod: PlaneMethod;
  p1: CadPoint3 | null;
  p2: CadPoint3 | null;
  p3: CadPoint3 | null;
  /** Punto para planos XY/YZ/ZX. */
  planePoint: CadPoint3 | null;
  /** Pregunta hecha: ¿borrar origen? */
  askedDelete: boolean;
  deleteSource: boolean;
}

const EMPTY: Mirror3dState = {
  selection: [],
  planeMethod: "points",
  p1: null,
  p2: null,
  p3: null,
  planePoint: null,
  askedDelete: false,
  deleteSource: false,
};

const PLANE_KEYWORDS = [
  { keyword: "XY", shortcut: "X" },
  { keyword: "YZ", shortcut: "Y" },
  { keyword: "ZX", shortcut: "Z" },
] as const;

const DELETE_KEYWORDS = [
  { keyword: "Si", shortcut: "S" },
  { keyword: "No", shortcut: "N" },
] as const;

function step(state: Mirror3dState): CadCommandStep<Mirror3dState> {
  if (state.selection.length === 0)
    return {
      state,
      prompt: { message: "Designe objetos", options: [] },
      accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
    };
  // Con método por puntos: pedir los tres puntos.
  if (state.planeMethod === "points") {
    if (!state.p1)
      return {
        state,
        prompt: {
          message:
            "Primer punto del plano de espejo [XY/YZ/ZX]",
          options: PLANE_KEYWORDS,
        },
        accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
      };
    if (!state.p2)
      return {
        state,
        prompt: { message: "Segundo punto del plano de espejo", options: [] },
        accepts: CAD_ACCEPT_POINT,
      };
    if (!state.p3)
      return {
        state,
        prompt: { message: "Tercer punto del plano de espejo", options: [] },
        accepts: CAD_ACCEPT_POINT,
      };
  }
  // Con método por plano canónico: pedir un punto.
  if (!state.planePoint)
    return {
      state,
      prompt: {
        message: `Un punto sobre el plano ${state.planeMethod.toUpperCase()}`,
        options: [],
      },
      accepts: CAD_ACCEPT_POINT,
    };
  // Plano definido. Preguntar borrar origen.
  if (!state.askedDelete)
    return {
      state,
      prompt: {
        message: "¿Borrar los objetos de origen? [Sí/No]",
        options: DELETE_KEYWORDS,
        defaultOption: "No",
      },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
  };
}

function done(
  state: Mirror3dState,
  commands: readonly CadEntityCommand[],
  label: string,
  message?: string,
): CadCommandStep<Mirror3dState> {
  // Si el usuario pidió borrar origen, añadir delete de los originales.
  const allCmds: CadEntityCommand[] = [...commands];
  if (state.deleteSource && commands.length > 0) {
    for (const entityId of state.selection)
      allCmds.push({ type: "delete", entityId });
  }
  return {
    state: EMPTY,
    prompt: { message: "", options: [] },
    accepts: 0,
    result:
      allCmds.length > 0
        ? { kind: "document", commands: allCmds, label }
        : message
          ? { kind: "message", text: message }
          : { kind: "none" },
  };
}

/** Planos canónicos: normal y un punto por donde pasa. */
function canonicalPlane(
  method: PlaneMethod,
  point: CadPoint3,
): { origin: CadPoint3; nx: number; ny: number; nz: number } {
  const origin = point;
  if (method === "xy") return { origin, nx: 0, ny: 0, nz: 1 };
  if (method === "yz") return { origin, nx: 1, ny: 0, nz: 0 };
  return { origin, nx: 0, ny: 1, nz: 0 };
}

function planeFromPoints(
  a: CadPoint3,
  b: CadPoint3,
  c: CadPoint3,
): { origin: CadPoint3; nx: number; ny: number; nz: number } | null {
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
  if (!(len > 1e-12)) return null;
  return { origin: a, nx: nx / len, ny: ny / len, nz: nz / len };
}

function mirror3dCommands(
  state: Mirror3dState,
  context: CadCommandContext,
): CadEntityCommand[] {
  const plane =
    state.planeMethod === "points"
      ? planeFromPoints(state.p1!, state.p2!, state.p3!)
      : canonicalPlane(state.planeMethod, state.planePoint!);
  if (!plane) return [];

  const { origin, nx, ny, nz } = plane;

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

  // Trasladar al origen del plano: T·R·T⁻¹
  const px = origin.x;
  const py = origin.y;
  const pz = origin.z;
  const tx = px - (r00 * px + r01 * py + r02 * pz);
  const ty = py - (r10 * px + r11 * py + r12 * pz);
  const tz = pz - (r20 * px + r21 * py + r22 * pz);

  const commands: CadEntityCommand[] = [];
  for (const entityId of state.selection) {
    const existing = context.entity?.(entityId);
    if (!existing || (existing as { type?: string }).type !== "solid3d")
      continue;
    // Copy the entity and transform the copy.
    const copyId = context.newEntityId();
    commands.push({ type: "copy", entityId, newEntityId: copyId });
    commands.push({
      type: "transform3d",
      entityId: copyId,
      transform3d: {
        e: 0, f: 0, dz: 0,
        a: r00, c: r01, m02: r02,
        b: r10, d: r11, m12: r12,
        m20: r20, m21: r21, m22: r22,
        tx, ty, tz,
      },
    });
  }
  return commands;
}

const mirror3dCommand: CadCommandDescriptor<Mirror3dState> = {
  name: "MIRROR3D",
  aliases: ["MIRROR3", "SIMETRIA3D"],
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
      return done(state, [], "MIRROR3D", "MIRROR3D cancelado.");
    if (input.kind === "selection")
      return step({ ...state, selection: input.entityIds });
    if (input.kind === "entityPick")
      return step({
        ...state,
        selection: [...new Set([...state.selection, input.entityId])],
      });
    if (input.kind === "enter" && state.selection.length === 0)
      return done(
        state,
        [],
        "MIRROR3D",
        "MIRROR3D: necesita al menos un sólido designado.",
      );

    // Keyword: XY, YZ, ZX para plano canónico.
    if (
      input.kind === "keyword" &&
      state.selection.length > 0 &&
      state.planeMethod === "points" &&
      !state.p1
    ) {
      const kw = input.keyword.toLowerCase();
      if (kw === "xy" || kw === "yz" || kw === "zx")
        return step({ ...state, planeMethod: kw as PlaneMethod });
      return step(state);
    }

    // Keyword: Sí/No para borrar origen.
    if (
      input.kind === "keyword" &&
      state.selection.length > 0 &&
      ((state.planeMethod === "points" && state.p3) ||
        (state.planeMethod !== "points" && state.planePoint)) &&
      !state.askedDelete
    ) {
      const kw = input.keyword.toUpperCase();
      const del = kw === "SI" || kw === "S";
      const ready = { ...state, askedDelete: true, deleteSource: del };
      const cmds = mirror3dCommands(ready, context);
      return done(
        ready,
        cmds,
        "MIRROR3D",
        cmds.length === 0
          ? "MIRROR3D: la selección no contiene sólidos3D o el plano es degenerado."
          : undefined,
      );
    }

    // Puntos.
    if (input.kind === "point") {
      const p = cadLiftPoint(input.point);
      if (state.planeMethod !== "points")
        return step({ ...state, planePoint: p });
      if (!state.p1) return step({ ...state, p1: p });
      if (!state.p2) return step({ ...state, p2: p });
      // Tercer punto: validar plano antes de preguntar.
      const withP3 = { ...state, p3: p };
      const plane = planeFromPoints(state.p1, state.p2, p);
      if (!plane)
        return done(
          withP3,
          [],
          "MIRROR3D",
          "MIRROR3D: la selección no contiene sólidos3D o el plano es degenerado.",
        );
      return step(withP3);
    }

    // Enter por defecto en la pregunta de borrar: No.
    if (input.kind === "enter" && !state.askedDelete && (
      (state.planeMethod === "points" && state.p3) ||
      (state.planeMethod !== "points" && state.planePoint)
    )) {
      const ready = { ...state, askedDelete: true, deleteSource: false };
      const cmds = mirror3dCommands(ready, context);
      return done(
        ready,
        cmds,
        "MIRROR3D",
        cmds.length === 0
          ? "MIRROR3D: la selección no contiene sólidos3D o el plano es degenerado."
          : undefined,
      );
    }

    return step(state);
  },
};

export const CAD_MIRROR3D_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(mirror3dCommand),
];
