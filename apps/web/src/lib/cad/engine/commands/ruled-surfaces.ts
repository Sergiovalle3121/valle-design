/**
 * Mallas regladas clásicas: RULESURF y TABSURF.
 *
 * RULESURF crea una superficie entre dos curvas (polilíneas).
 * TABSURF extruye una curva a lo largo de otra (tabulated surface).
 *
 * Ambas producen un sólido B-rep delgado (extrusión de espesor mínimo),
 * igual que PLANESURF. Se extraen de `meshes.ts` para respetar el
 * presupuesto de monolito.
 */
import type { CadEntity } from "../../cad-document";
import type { CadSolidProfile } from "../../cad-entities-v5";
import {
  asCadCommand,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_SELECTION,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
} from "../command-types";
import {
  finishedSolid,
  formatMagnitude,
  makeSolidEntity,
  selectedEntities,
  solidMessage,
} from "./solids-support";

const SURFACE_THICKNESS = 0.001;

interface RuledState {
  first: string | null;
  second: string | null;
}

function samplePolyline(entity: CadEntity): { x: number; y: number }[] | string {
  if (entity.type === "polyline" && "vertices" in entity) {
    const verts = (entity as { vertices: { x: number; y: number }[] }).vertices;
    if (verts.length < 2) return "La curva tiene menos de 2 vertices.";
    return verts;
  }
  if (entity.type === "line") {
    return [
      { x: (entity as { start: { x: number; y: number } }).start.x, y: (entity as { start: { x: number; y: number } }).start.y },
      { x: (entity as { end: { x: number; y: number } }).end.x, y: (entity as { end: { x: number; y: number } }).end.y },
    ];
  }
  return "Solo se aceptan polilineas o lineas como curvas de contorno.";
}

function resample(points: { x: number; y: number }[], count: number): { x: number; y: number }[] {
  if (points.length === count) return points;
  if (count <= 1) return [points[0]];
  const result: { x: number; y: number }[] = [];
  const totalLen = segmentLength(points);
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const target = t * totalLen;
    result.push(pointAtDistance(points, target));
  }
  return result;
}

function segmentLength(points: { x: number; y: number }[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
}

function pointAtDistance(
  points: { x: number; y: number }[],
  dist: number,
): { x: number; y: number } {
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const seg = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (acc + seg >= dist || i === points.length - 1) {
      const t = seg > 0 ? (dist - acc) / seg : 0;
      return {
        x: points[i - 1].x + t * (points[i].x - points[i - 1].x),
        y: points[i - 1].y + t * (points[i].y - points[i - 1].y),
      };
    }
    acc += seg;
  }
  return points[points.length - 1];
}

/**
 * Construye un contorno cerrado que recorre rowA de izquierda a derecha y
 * rowB de derecha a izquierda, formando una banda.
 */
function buildRuledProfile(
  rowA: { x: number; y: number }[],
  rowB: { x: number; y: number }[],
): CadSolidProfile {
  const outer = [
    ...rowA.map((p) => ({ x: p.x, y: p.y })),
    ...rowB.slice().reverse().map((p) => ({ x: p.x, y: p.y })),
  ];
  return { outer };
}

// --- RULESURF: superficie reglada entre dos curvas ----------------------------

const rulesurfCommand: CadCommandDescriptor<RuledState> = {
  name: "RULESURF",
  aliases: ["RSURF", "SUPERFICIEREGLADA"],
  kind: "draw",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => ({
    state: context.selection.length >= 2
      ? { first: context.selection[0], second: context.selection[1] }
      : context.selection.length === 1
        ? { first: context.selection[0], second: null }
        : { first: null, second: null },
    prompt: {
      message: context.selection.length >= 2
        ? "Dos curvas seleccionadas. Pulse Intro para crear la superficie reglada"
        : "Designe la primera curva de contorno",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidMessage(state, "RULESURF cancelado.");
    if (input.kind === "entityPick" || input.kind === "selection") {
      const id = input.kind === "entityPick" ? input.entityId : input.entityIds[0];
      if (!state.first)
        return {
          state: { first: id, second: null },
          prompt: { message: "Primera curva seleccionada. Designe la segunda", options: [] },
          accepts: CAD_ACCEPT_ENTITY_PICK,
        };
      return {
        state: { first: state.first, second: id },
        prompt: { message: "Dos curvas. Pulse Intro para crear la superficie reglada", options: [] },
        accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
      };
    }
    if (input.kind !== "enter" && input.kind !== "text")
      return { state, prompt: { message: "Designe curvas o pulse Intro", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION };

    if (!state.first || !state.second)
      return solidMessage(state, "RULESURF necesita dos curvas.");
    const e1 = context.entity?.(state.first);
    const e2 = context.entity?.(state.second);
    if (!e1 || !e2) return solidMessage(state, "RULESURF: no se encontraron las curvas.");

    const s1 = samplePolyline(e1);
    if (typeof s1 === "string") return solidMessage(state, `RULESURF: primera curva — ${s1}`);
    const s2 = samplePolyline(e2);
    if (typeof s2 === "string") return solidMessage(state, `RULESURF: segunda curva — ${s2}`);

    const cols = Math.max(s1.length, s2.length);
    const rowA = resample(s1, cols);
    const rowB = resample(s2, cols);
    const profile = buildRuledProfile(rowA, rowB);

    const solid = makeSolidEntity(
      context.newEntityId(),
      [{ id: "reglada", op: "extrude", profile, height: SURFACE_THICKNESS }],
      "reglada",
      context.activeLayer,
    );

    const width = Math.hypot(rowB[0].x - rowA[0].x, rowB[0].y - rowA[0].y);
    return finishedSolid(solid, {
      state: { first: null, second: null },
      label: "RULESURF",
      notice: `Superficie reglada creada (${cols * 2} vertices, ancho ${formatMagnitude(width)} mm).`,
    });
  },
};

// --- TABSURF: superficie tabulada — extruir curva a lo largo de otra ---------

const tabsurfCommand: CadCommandDescriptor<RuledState> = {
  name: "TABSURF",
  aliases: ["TSURF", "SUPERFICIETABULADA"],
  kind: "draw",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => ({
    state: context.selection.length >= 2
      ? { first: context.selection[0], second: context.selection[1] }
      : context.selection.length === 1
        ? { first: context.selection[0], second: null }
        : { first: null, second: null },
    prompt: {
      message: context.selection.length >= 2
        ? "Dos curvas seleccionadas. Pulse Intro para crear la superficie tabulada"
        : "Designe la curva de perfil",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidMessage(state, "TABSURF cancelado.");
    if (input.kind === "entityPick" || input.kind === "selection") {
      const id = input.kind === "entityPick" ? input.entityId : input.entityIds[0];
      if (!state.first)
        return {
          state: { first: id, second: null },
          prompt: { message: "Perfil seleccionado. Designe la trayectoria", options: [] },
          accepts: CAD_ACCEPT_ENTITY_PICK,
        };
      return {
        state: { first: state.first, second: id },
        prompt: { message: "Dos curvas. Pulse Intro para crear la superficie tabulada", options: [] },
        accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
      };
    }
    if (input.kind !== "enter" && input.kind !== "text")
      return { state, prompt: { message: "Designe curvas o pulse Intro", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION };

    if (!state.first || !state.second)
      return solidMessage(state, "TABSURF necesita una curva de perfil y una trayectoria.");
    const profileEntity = context.entity?.(state.first);
    const pathEntity = context.entity?.(state.second);
    if (!profileEntity || !pathEntity)
      return solidMessage(state, "TABSURF: no se encontraron las curvas.");

    const profilePts = samplePolyline(profileEntity);
    if (typeof profilePts === "string") return solidMessage(state, `TABSURF: perfil — ${profilePts}`);
    const pathPts = samplePolyline(pathEntity);
    if (typeof pathPts === "string") return solidMessage(state, `TABSURF: trayectoria — ${pathPts}`);

    // Construir el contorno desplazando el perfil a lo largo de la trayectoria.
    // Para una trayectoria simple, tomamos el inicio y el fin.
    const dx = pathPts[pathPts.length - 1].x - pathPts[0].x;
    const dy = pathPts[pathPts.length - 1].y - pathPts[0].y;
    const rowA = profilePts;
    const rowB = profilePts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    const profile = buildRuledProfile(rowA, rowB);

    const solid = makeSolidEntity(
      context.newEntityId(),
      [{ id: "tabulada", op: "extrude", profile, height: SURFACE_THICKNESS }],
      "tabulada",
      context.activeLayer,
    );

    const pathLen = segmentLength(pathPts);
    return finishedSolid(solid, {
      state: { first: null, second: null },
      label: "TABSURF",
      notice: `Superficie tabulada creada (${profilePts.length * 2} vertices, trayectoria ${formatMagnitude(pathLen)} mm).`,
    });
  },
};

export const CAD_RULED_SURFACE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(rulesurfCommand),
  asCadCommand(tabsurfCommand),
];
