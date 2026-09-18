/**
 * 3DALIGN — alineación rígida de sólidos en 3D por pares de puntos.
 *
 * Flujo: seleccionar objetos, 1-3 puntos fuente, 1-3 puntos destino.
 *   1 par  → traslación pura.
 *   2 pares → rotación en planta + traslación.
 *   3 pares → rotación 3D completa + traslación.
 *
 * La colocación se compone con la existente: R_nueva = R_alineación × R_previa.
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

interface Align3dState {
  selection: readonly string[];
  src: readonly CadPoint3[];
  srcLocked: boolean;
  dst: readonly CadPoint3[];
}

const EMPTY: Align3dState = { selection: [], src: [], srcLocked: false, dst: [] };

function promptFor(state: Align3dState): { message: string; accepts: number } {
  if (state.selection.length === 0)
    return { message: "Designe objetos", accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };
  if (!state.srcLocked) {
    const n = state.src.length;
    if (n === 0)
      return { message: "Primer punto fuente", accepts: CAD_ACCEPT_POINT };
    if (n === 1)
      return { message: "Segundo punto fuente (Intro para traslación pura)", accepts: CAD_ACCEPT_POINT };
    return { message: "Tercer punto fuente (Intro para rotación 2D)", accepts: CAD_ACCEPT_POINT };
  }
  const m = state.dst.length;
  if (m === 0)
    return { message: "Primer punto destino", accepts: CAD_ACCEPT_POINT };
  if (m === 1)
    return { message: "Segundo punto destino", accepts: CAD_ACCEPT_POINT };
  return { message: "Tercer punto destino", accepts: CAD_ACCEPT_POINT };
}

function step(state: Align3dState): CadCommandStep<Align3dState> {
  const p = promptFor(state);
  return { state, prompt: { message: p.message, options: [] }, accepts: p.accepts };
}

function finish(
  commands: readonly CadEntityCommand[],
  label: string,
  message?: string,
): CadCommandStep<Align3dState> {
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

function sub(a: CadPoint3, b: CadPoint3): CadPoint3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: CadPoint3, b: CadPoint3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: CadPoint3, b: CadPoint3): CadPoint3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function norm(v: CadPoint3): number {
  return Math.hypot(v.x, v.y, v.z);
}

function normalize(v: CadPoint3): CadPoint3 {
  const n = norm(v);
  return n < 1e-12 ? { x: 0, y: 0, z: 0 } : { x: v.x / n, y: v.y / n, z: v.z / n };
}

/** 3×3 matrix in row-major: [r0c0, r0c1, r0c2, r1c0, ...]. */
type Mat3 = [number, number, number, number, number, number, number, number, number];

const IDENTITY_MAT3: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function mat3Mul(a: Mat3, b: Mat3): Mat3 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}

function mat3Vec(m: Mat3, v: CadPoint3): CadPoint3 {
  return {
    x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
    y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
    z: m[6] * v.x + m[7] * v.y + m[8] * v.z,
  };
}

/** 2-point rotation: rotate sDir to dDir around their cross product. */
function twoPointRotation(sDir: CadPoint3, dDir: CadPoint3): Mat3 {
  const axis = cross(sDir, dDir);
  const sinA = norm(axis);
  const cosA = dot(sDir, dDir);
  if (sinA < 1e-12) return cosA >= 0 ? IDENTITY_MAT3 : negateXY();
  const n = normalize(axis);
  return rotationMatrixFromAxisAngle(n, sinA, cosA);
}

/**
 * Compute the rotation matrix that maps source points to destination points.
 * - 1 pair: identity (translation only).
 * - 2 pairs: rotation in the plane spanned by the two direction vectors.
 * - 3 pairs: full 3D rotation (falls back to 2-point if points are collinear).
 */
function alignRotation(src: readonly CadPoint3[], dst: readonly CadPoint3[]): Mat3 {
  if (src.length < 2 || dst.length < 2) return IDENTITY_MAT3;

  const sDir = normalize(sub(src[1], src[0]));
  const dDir = normalize(sub(dst[1], dst[0]));

  if (src.length < 3 || dst.length < 3) {
    return twoPointRotation(sDir, dDir);
  }

  // 3-point alignment: build orthonormal frames and compose.
  const s1 = normalize(sub(src[1], src[0]));
  let s2raw = sub(src[2], src[0]);
  s2raw = sub(s2raw, { x: s1.x * dot(s2raw, s1), y: s1.y * dot(s2raw, s1), z: s1.z * dot(s2raw, s1) });
  const s2len = norm(s2raw);
  const d1 = normalize(sub(dst[1], dst[0]));
  let d2raw = sub(dst[2], dst[0]);
  d2raw = sub(d2raw, { x: d1.x * dot(d2raw, d1), y: d1.y * dot(d2raw, d1), z: d1.z * dot(d2raw, d1) });
  const d2len = norm(d2raw);

  // Collinear points make Gram-Schmidt degenerate — fall back to2-point rotation.
  if (s2len < 1e-12 || d2len < 1e-12) return twoPointRotation(sDir, dDir);

  const s2 = { x: s2raw.x / s2len, y: s2raw.y / s2len, z: s2raw.z / s2len };
  const s3 = cross(s1, s2);
  const d2 = { x: d2raw.x / d2len, y: d2raw.y / d2len, z: d2raw.z / d2len };
  const d3 = cross(d1, d2);

  // S = [s1 | s2 | s3], D = [d1 | d2 | d3], R = D · Sᵀ
  // Mat3 is row-major: row i of S is (s1[i], s2[i], s3[i]).
  // R[i][j] = sum_k D[i][k] * S[j][k] = sum_k D_ik * S_jk
  // Since S is orthonormal, Sᵀ = S⁻¹, so R = D · Sᵀ.
  return [
    d1.x * s1.x + d2.x * s2.x + d3.x * s3.x,
    d1.x * s1.y + d2.x * s2.y + d3.x * s3.y,
    d1.x * s1.z + d2.x * s2.z + d3.x * s3.z,
    d1.y * s1.x + d2.y * s2.x + d3.y * s3.x,
    d1.y * s1.y + d2.y * s2.y + d3.y * s3.y,
    d1.y * s1.z + d2.y * s2.z + d3.y * s3.z,
    d1.z * s1.x + d2.z * s2.x + d3.z * s3.x,
    d1.z * s1.y + d2.z * s2.y + d3.z * s3.y,
    d1.z * s1.z + d2.z * s2.z + d3.z * s3.z,
  ];
}

/** Fallback 180° rotation around Z when source and destination are antiparallel. */
function negateXY(): Mat3 {
  return [-1, 0, 0, 0, -1, 0, 0, 0, 1];
}

/** Rodrigues rotation matrix from unit axis, precomputed sin and cos. */
function rotationMatrixFromAxisAngle(axis: CadPoint3, sinA: number, cosA: number): Mat3 {
  const { x, y, z } = axis;
  const t = 1 - cosA;
  return [
    t * x * x + cosA,     t * x * y - sinA * z, t * x * z + sinA * y,
    t * x * y + sinA * z, t * y * y + cosA,     t * y * z - sinA * x,
    t * x * z - sinA * y, t * y * z + sinA * x, t * z * z + cosA,
  ];
}

function align3dCommands(
  state: Align3dState,
  context: CadCommandContext,
): CadEntityCommand[] {
  const { src, dst } = state;
  if (src.length === 0 || dst.length === 0 || src.length !== dst.length) return [];

  const R = alignRotation(src, dst);
  const srcMapped = mat3Vec(R, src[0]);
  const tx = dst[0].x - srcMapped.x;
  const ty = dst[0].y - srcMapped.y;
  const tz = dst[0].z - srcMapped.z;

  const commands: CadEntityCommand[] = [];
  for (const entityId of state.selection) {
    const existing = context.entity?.(entityId);
    if (!existing || (existing as { type?: string }).type !== "solid3d") continue;
    const cur = (existing as { placement?: Record<string, number> }).placement ?? {};

    // Existing 3D rotation matrix. Placement layout:
    //   | a   c   m02 |       prev = [a, c, m02, b, d, m12, m20, m21, m22]
    //   | b   d   m12 |
    //   | m20 m21 m22 |
    const prev: Mat3 = [
      cur.a ?? 1, cur.c ?? 0, cur.m02 ?? 0,
      cur.b ?? 0, cur.d ?? 1, cur.m12 ?? 0,
      cur.m20 ?? 0, cur.m21 ?? 0, cur.m22 ?? 1,
    ];
    const composed = mat3Mul(R, prev);

    // Existing translation (world).
    const prevT = { x: (cur.e ?? 0) + (cur.tx ?? 0), y: (cur.f ?? 0) + (cur.ty ?? 0), z: (cur.dz ?? 0) + (cur.tz ?? 0) };
    const rotatedT = mat3Vec(R, prevT);

    commands.push({
      type: "transform3d",
      entityId,
      transform3d: {
        a: composed[0], b: composed[3], c: composed[1],
        d: composed[4],
        e: 0, f: 0, dz: 0,
        m02: composed[2], m12: composed[5],
        m20: composed[6], m21: composed[7], m22: composed[8],
        tx: rotatedT.x + tx,
        ty: rotatedT.y + ty,
        tz: rotatedT.z + tz,
      },
    });
  }
  return commands;
}

const align3dCommand: CadCommandDescriptor<Align3dState> = {
  name: "3DALIGN",
  aliases: ["3AL"],
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
      return finish([], "3DALIGN", "3DALIGN cancelado.");
    if (input.kind === "selection")
      return step({ ...state, selection: input.entityIds });
    if (input.kind === "entityPick")
      return step({
        ...state,
        selection: [...new Set([...state.selection, input.entityId])],
      });

    // Enter with no selection: need objects.
    if (input.kind === "enter" && state.selection.length === 0)
      return finish([], "3DALIGN", "3DALIGN: necesita al menos un sólido designado.");

    // Enter with selection but no source points yet: confirmation, re-prompt.
    if (input.kind === "enter" && state.src.length === 0 && !state.srcLocked)
      return step(state);

    if (input.kind !== "point" && input.kind !== "enter")
      return step(state);

    const pt = input.kind === "point" ? cadLiftPoint(input.point) : null;
    const { src, dst } = state;

    // Collecting source points.
    if (!state.srcLocked) {
      if (input.kind === "enter") {
        // Lock source points, start destination.
        if (src.length === 0)
          return finish([], "3DALIGN", "3DALIGN: necesita al menos un punto fuente.");
        return step({ ...state, srcLocked: true });
      }
      return step({ ...state, src: [...src, pt!] });
    }

    // Collecting destination points.
    if (input.kind === "enter") {
      // Accept fewer destination points (must match source count).
      if (dst.length === 0)
        return finish([], "3DALIGN", "3DALIGN: necesita al menos un punto destino.");
      // Proceed with whatever destination points we have.
      const cmds = align3dCommands({ ...state, dst: [...dst] }, context);
      return finish(
        cmds,
        "3DALIGN",
        cmds.length === 0 ? "3DALIGN: la selección no contiene sólidos 3D." : undefined,
      );
    }
    const newDst = [...dst, pt!];
    if (newDst.length < src.length) return step({ ...state, dst: newDst });

    // All points collected.
    const cmds = align3dCommands({ ...state, dst: newDst }, context);
    return finish(
      cmds,
      "3DALIGN",
      cmds.length === 0 ? "3DALIGN: la selección no contiene sólidos 3D." : undefined,
    );
  },
};

export const CAD_3DALIGN_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(align3dCommand),
];
