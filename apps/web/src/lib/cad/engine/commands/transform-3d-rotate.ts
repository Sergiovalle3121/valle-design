/**
 * 3DROTATE — giro de sólidos alrededor de un eje arbitrario en 3D.
 *
 * El flujo: seleccionar objetos, punto base, eje de giro (dos puntos o
 * palabra clave X/Y/Z para los ejes del mundo), ángulo de rotación.
 *
 * La rotación se compone con la colocación existente del sólido como una
 * multiplicación de matrices 3×4. El punto base es el centro de giro.
 */
import type { CadPoint3 } from "../../cad-document";
import type { CadSolidPlacement } from "../../cad-entities-v5";
import type { CadEntityCommand } from "../../entity-commands";
import { cadLiftPoint } from "../spatial-point";
import {
  CAD_ACCEPT_ANGLE,
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

const X_AXIS = { keyword: "EjeX", shortcut: "X" } as const;
const Y_AXIS = { keyword: "EjeY", shortcut: "Y" } as const;
const Z_AXIS = { keyword: "EjeZ", shortcut: "Z" } as const;

interface Rotate3dState {
  selection: readonly string[];
  base: CadPoint3 | null;
  /** Primer punto del eje de giro (o el propio base si se elige eje de mundo). */
  axisPoint1: CadPoint3 | null;
  /** Segundo punto del eje de giro. */
  axisPoint2: CadPoint3 | null;
  /** Eje de mundo elegido (X, Y, Z) cuando no se designan dos puntos. */
  worldAxis: "x" | "y" | "z" | null;
}

const EMPTY: Rotate3dState = {
  selection: [],
  base: null,
  axisPoint1: null,
  axisPoint2: null,
  worldAxis: null,
};

function step(state: Rotate3dState): CadCommandStep<Rotate3dState> {
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
  if (!state.axisPoint1 && !state.worldAxis)
    return {
      state,
      prompt: {
        message: "Precise el primer punto del eje de giro",
        options: [X_AXIS, Y_AXIS, Z_AXIS],
      },
      accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    };
  if (state.worldAxis && !state.axisPoint2)
    return {
      state,
      prompt: { message: "Precise el ángulo de rotación", options: [] },
      accepts: CAD_ACCEPT_ANGLE | CAD_ACCEPT_POINT,
    };
  if (state.axisPoint1 && !state.axisPoint2)
    return {
      state,
      prompt: { message: "Precise el segundo punto del eje de giro", options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  return {
    state,
    prompt: { message: "Precise el ángulo de rotación", options: [] },
    accepts: CAD_ACCEPT_ANGLE | CAD_ACCEPT_POINT,
  };
}

function done(
  commands: readonly CadEntityCommand[],
  label: string,
  message?: string,
): CadCommandStep<Rotate3dState> {
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

/**
 * Construye una matriz de rotación 3×4 alrededor de un eje que pasa por
 * `center` con dirección `axis`, por el ángulo `rad`.
 *
 * Fórmula de Rodrigues, trasladada al centro.
 */
function rotationMatrix3x4(
  center: CadPoint3,
  axis: CadPoint3,
  rad: number,
): Pick<CadSolidPlacement, "a" | "b" | "c" | "d" | "m02" | "m12" | "m20" | "m21" | "m22" | "tx" | "ty" | "tz"> {
  const len = Math.hypot(axis.x, axis.y, axis.z);
  if (!(len > 1e-12)) {
    return { a: 1, b: 0, c: 0, d: 1, m02: 0, m12: 0, m20: 0, m21: 0, m22: 1, tx: 0, ty: 0, tz: 0 };
  }
  const ux = axis.x / len;
  const uy = axis.y / len;
  const uz = axis.z / len;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const oneMinusCos = 1 - cos;

  // Rodrigues: R = cos·I + sin·[u]× + (1-cos)·(u⊗u)
  const r00 = cos + ux * ux * oneMinusCos;
  const r01 = ux * uy * oneMinusCos - uz * sin;
  const r02 = ux * uz * oneMinusCos + uy * sin;
  const r10 = uy * ux * oneMinusCos + uz * sin;
  const r11 = cos + uy * uy * oneMinusCos;
  const r12 = uy * uz * oneMinusCos - ux * sin;
  const r20 = uz * ux * oneMinusCos - uy * sin;
  const r21 = uz * uy * oneMinusCos + ux * sin;
  const r22 = cos + uz * uz * oneMinusCos;

  // Trasladar al centro: T·R·T⁻¹ → la traslación es center - R·center
  const cx = center.x;
  const cy = center.y;
  const cz = center.z;
  return {
    a: r00, c: r01, m02: r02,
    b: r10, d: r11, m12: r12,
    m20: r20, m21: r21, m22: r22,
    tx: cx - (r00 * cx + r01 * cy + r02 * cz),
    ty: cy - (r10 * cx + r11 * cy + r12 * cz),
    tz: cz - (r20 * cx + r21 * cy + r22 * cz),
  };
}

/**
 * Compone dos colocaciones3D: primero `base`, después `overlay`.
 * Sólo devuelve los campos3D (m*, tx, ty, tz); los campos2D (a-f, dz)
 * se copian de `base` sin tocar.
 */
function compose3dPlacements(
  base: Required<Pick<CadSolidPlacement, "a" | "b" | "c" | "d" | "e" | "f" | "dz">> &
    Pick<CadSolidPlacement, "m02" | "m12" | "m20" | "m21" | "m22" | "tx" | "ty" | "tz">,
  overlay: Pick<CadSolidPlacement, "a" | "b" | "c" | "d" | "m02" | "m12" | "m20" | "m21" | "m22" | "tx" | "ty" | "tz">,
): CadSolidPlacement {
  // Matriz base: [a,c,m02; b,d,m12; m20,m21,m22]
  // Traslación efectiva: e/f/dz (legado2D) + tx/ty/tz (3D).
  const bm = {
    r00: base.a, r01: base.c, r02: base.m02 ?? 0,
    r10: base.b, r11: base.d, r12: base.m12 ?? 0,
    r20: base.m20 ?? 0, r21: base.m21 ?? 0, r22: base.m22 ?? 1,
    tx: (base.e ?? 0) + (base.tx ?? 0),
    ty: (base.f ?? 0) + (base.ty ?? 0),
    tz: (base.dz ?? 0) + (base.tz ?? 0),
  };
  // Matriz overlay
  const om = {
    r00: overlay.a ?? 1, r01: overlay.c ?? 0, r02: overlay.m02 ?? 0,
    r10: overlay.b ?? 0, r11: overlay.d ?? 1, r12: overlay.m12 ?? 0,
    r20: overlay.m20 ?? 0, r21: overlay.m21 ?? 0, r22: overlay.m22 ?? 1,
    tx: overlay.tx ?? 0, ty: overlay.ty ?? 0, tz: overlay.tz ?? 0,
  };
  // Producto de matrices 3×4: overlay × base (primero base, después overlay)
  // e=f=dz=0: la traslación efectiva ya está en tx/ty/tz.
  return {
    e: 0, f: 0, dz: 0,
    a: om.r00 * bm.r00 + om.r01 * bm.r10 + om.r02 * bm.r20,
    c: om.r00 * bm.r01 + om.r01 * bm.r11 + om.r02 * bm.r21,
    m02: om.r00 * bm.r02 + om.r01 * bm.r12 + om.r02 * bm.r22,
    b: om.r10 * bm.r00 + om.r11 * bm.r10 + om.r12 * bm.r20,
    d: om.r10 * bm.r01 + om.r11 * bm.r11 + om.r12 * bm.r21,
    m12: om.r10 * bm.r02 + om.r11 * bm.r12 + om.r12 * bm.r22,
    m20: om.r20 * bm.r00 + om.r21 * bm.r10 + om.r22 * bm.r20,
    m21: om.r20 * bm.r01 + om.r21 * bm.r11 + om.r22 * bm.r21,
    m22: om.r20 * bm.r02 + om.r21 * bm.r12 + om.r22 * bm.r22,
    tx: om.r00 * bm.tx + om.r01 * bm.ty + om.r02 * bm.tz + om.tx,
    ty: om.r10 * bm.tx + om.r11 * bm.ty + om.r12 * bm.tz + om.ty,
    tz: om.r20 * bm.tx + om.r21 * bm.ty + om.r22 * bm.tz + om.tz,
  };
}

function rotate3dCommands(
  state: Rotate3dState,
  angleRad: number,
  context: CadCommandContext,
): CadEntityCommand[] {
  if (Math.abs(angleRad) < 1e-9) return [];

  const base = state.base!;
  let axis: CadPoint3;
  let center: CadPoint3;
  if (state.worldAxis) {
    axis = state.worldAxis === "x"
      ? { x: 1, y: 0, z: 0 }
      : state.worldAxis === "y"
        ? { x: 0, y: 1, z: 0 }
        : { x: 0, y: 0, z: 1 };
    center = base; // Con ejes de mundo, el punto base es el centro.
  } else {
    const p1 = state.axisPoint1!;
    const p2 = state.axisPoint2!;
    axis = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z };
    center = p1; // Con eje por dos puntos, el primer punto es el centro.
  }

  const rot = rotationMatrix3x4(center, axis, angleRad);

  const commands: CadEntityCommand[] = [];
  for (const entityId of state.selection) {
    // Sólo transformar sólidos3D.
    const existing = context.entity?.(entityId);
    if (!existing || (existing as { type?: string }).type !== "solid3d") continue;
    const current = (existing as { placement?: Record<string, number> }).placement ?? {};
    const currentPlacement = {
      a: current.a ?? 1, b: current.b ?? 0, c: current.c ?? 0,
      d: current.d ?? 1, e: current.e ?? 0, f: current.f ?? 0,
      dz: current.dz ?? 0,
      m02: current.m02 ?? 0, m12: current.m12 ?? 0,
      m20: current.m20 ?? 0, m21: current.m21 ?? 0, m22: current.m22 ?? 1,
      tx: current.tx ?? 0, ty: current.ty ?? 0, tz: current.tz ?? 0,
    } as const;
    const composed = compose3dPlacements(currentPlacement, rot);
    commands.push({ type: "transform3d", entityId, transform3d: composed });
  }
  return commands;
}

const rotate3dCommand: CadCommandDescriptor<Rotate3dState> = {
  name: "3DROTATE",
  aliases: ["3R"],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  spatial: "elevation",
  begin: (context) => step({ ...EMPTY, selection: context.selection }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return done([], "3DROTATE");

    if (input.kind === "selection")
      return step({ ...state, selection: input.entityIds });
    if (input.kind === "entityPick")
      return step({
        ...state,
        selection: [...new Set([...state.selection, input.entityId])],
      });
    if (input.kind === "enter" && state.selection.length === 0)
      return done([], "3DROTATE", "3DROTATE: necesita al menos un sólido designado.");

    if (input.kind === "keyword") {
      const axis = input.keyword === X_AXIS.keyword ? "x"
        : input.keyword === Y_AXIS.keyword ? "y"
          : input.keyword === Z_AXIS.keyword ? "z" : null;
      if (axis && !state.base) {
        // Primero pide base, después el eje.
        return step(state);
      }
      if (axis) {
        return step({ ...state, worldAxis: axis });
      }
      return step(state);
    }

    if (input.kind !== "point" && input.kind !== "angle") return step(state);

    if (!state.base) {
      if (input.kind !== "point") return step(state);
      return step({ ...state, base: cadLiftPoint(input.point) });
    }

    // Eje de mundo elegido: el siguiente input es el ángulo.
    if (state.worldAxis) {
      const degrees = input.kind === "angle" ? input.degrees
        : input.kind === "point" ? Math.atan2(input.point.y - state.base.y, input.point.x - state.base.x) * (180 / Math.PI)
          : null;
      if (degrees === null) return step(state);
      const rad = degrees * (Math.PI / 180);
      const cmds = rotate3dCommands(state, rad, context);
      return done(cmds, "3DROTATE", cmds.length === 0 ? "3DROTATE: la selección no contiene sólidos3D." : undefined);
    }

    // Eje por dos puntos.
    if (!state.axisPoint1) {
      if (input.kind !== "point") return step(state);
      return step({ ...state, axisPoint1: cadLiftPoint(input.point, state.base) });
    }
    if (!state.axisPoint2) {
      if (input.kind !== "point") return step(state);
      const p2 = cadLiftPoint(input.point, state.axisPoint1);
      if (Math.hypot(p2.x - state.axisPoint1.x, p2.y - state.axisPoint1.y, p2.z - state.axisPoint1.z) < 1e-9)
        return done([], "3DROTATE", "Los dos puntos del eje son el mismo: no definen un eje de giro.");
      return step({ ...state, axisPoint2: p2 });
    }

    // Ángulo.
    const degrees = input.kind === "angle" ? input.degrees
      : input.kind === "point" ? Math.atan2(input.point.y - state.base.y, input.point.x - state.base.x) * (180 / Math.PI)
        : null;
    if (degrees === null) return step(state);
    const rad = degrees * (Math.PI / 180);
    const cmds = rotate3dCommands(state, rad, context);
    return done(cmds, "3DROTATE", cmds.length === 0 ? "3DROTATE: la selección no contiene sólidos3D." : undefined);
  },
};

export const CAD_3DROTATE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(rotate3dCommand),
];
