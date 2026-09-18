/**
 * Extensiones de la familia Superficies: SURFPATCH y SURFNETWORK.
 *
 * Extraído de `surfaces.ts` para respetar el presupuesto de monolito (800 líneas).
 */
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
  makeSolidEntity,
  selectedEntities,
  solidMessage,
} from "./solids-support";

const SURFACE_THICKNESS = 0.001;

type SurfaceExtState = { selection: readonly string[] };

const surfpatchCommand: CadCommandDescriptor<SurfaceExtState | null> = {
  name: "SURFPATCH",
  aliases: ["SPATCH", "PARCHE"],
  kind: "draw",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => ({
    state: context.selection.length > 0 ? { selection: context.selection } : null,
    prompt: {
      message:
        context.selection.length > 0
          ? `${context.selection.length} entidad(es) seleccionada(s). Pulse Intro para parchear`
          : "Designe el contorno cerrado para crear el parche de superficie",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidMessage(state, "SURFPATCH cancelado.");
    if (input.kind === "selection")
      return {
        state: { selection: input.entityIds },
        prompt: { message: `${input.entityIds.length} entidad(es). Pulse Intro para parchear`, options: [] },
        accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
      };
    if (input.kind === "entityPick") {
      const prev = state?.selection ?? [];
      return {
        state: { selection: [...prev, input.entityId] },
        prompt: { message: `${prev.length + 1} entidad(es). Pulse Intro`, options: [] },
        accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
      };
    }
    if (input.kind !== "enter" && input.kind !== "text")
      return { state, prompt: { message: "Designe entidades o pulse Intro", options: [] }, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };

    const ids = state?.selection ?? [];
    if (ids.length === 0) return solidMessage(state, "SURFPATCH necesita al menos una entidad de contorno.");
    const entities = selectedEntities(context, ids);
    if (entities.length === 0) return solidMessage(state, "SURFPATCH: no se encontraron las entidades designadas.");
    if (entities[0].type !== "polyline" || !("vertices" in entities[0]))
      return solidMessage(state, "SURFPATCH requiere una polilinea como contorno.");
    const verts = (entities[0] as { vertices: { x: number; y: number }[] }).vertices;
    if (verts.length < 3) return solidMessage(state, "La polilinea tiene menos de 3 vertices.");
    const profile: CadSolidProfile = { outer: verts.map((v) => ({ x: v.x, y: v.y })) };
    const solid = makeSolidEntity(
      context.newEntityId(),
      [{ id: "parche", op: "extrude", profile, height: SURFACE_THICKNESS }],
      "parche",
      context.activeLayer,
    );
    return finishedSolid(solid, {
      state: undefined as never,
      label: "SURFPATCH",
      notice: `Parche de superficie creado (${profile.outer.length} vertices).`,
    });
  },
};

const surfnetworkCommand: CadCommandDescriptor<SurfaceExtState | null> = {
  name: "SURFNETWORK",
  aliases: ["SNETWORK", "RED"],
  kind: "draw",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => ({
    state: context.selection.length > 0 ? { selection: context.selection } : null,
    prompt: {
      message:
        context.selection.length > 0
          ? `${context.selection.length} entidad(es) seleccionada(s). Pulse Intro para crear la red`
          : "Designe las curvas de la red (minimo dos polilineas)",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidMessage(state, "SURFNETWORK cancelado.");
    if (input.kind === "selection")
      return {
        state: { selection: input.entityIds },
        prompt: { message: `${input.entityIds.length} entidad(es). Pulse Intro`, options: [] },
        accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
      };
    if (input.kind === "entityPick") {
      const prev = state?.selection ?? [];
      return {
        state: { selection: [...prev, input.entityId] },
        prompt: { message: `${prev.length + 1} entidad(es). Pulse Intro`, options: [] },
        accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
      };
    }
    if (input.kind !== "enter" && input.kind !== "text")
      return { state, prompt: { message: "Designe curvas o pulse Intro", options: [] }, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };

    const ids = state?.selection ?? [];
    if (ids.length < 2) return solidMessage(state, "SURFNETWORK necesita al menos dos curvas.");
    const entities = selectedEntities(context, ids);
    if (entities.length < 2) return solidMessage(state, "SURFNETWORK: no se encontraron suficientes curvas.");
    const allVerts: { x: number; y: number }[] = [];
    for (const e of entities) {
      if (e.type !== "polyline" || !("vertices" in e))
        return solidMessage(state, "SURFNETWORK: todas las entidades deben ser polilineas.");
      const verts = (e as { vertices: { x: number; y: number }[] }).vertices;
      if (verts.length < 2) return solidMessage(state, "SURFNETWORK: una curva tiene menos de 2 vertices.");
      allVerts.push(...verts);
    }
    const xs = allVerts.map((v) => v.x);
    const ys = allVerts.map((v) => v.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    if (maxX - minX < 1e-9 || maxY - minY < 1e-9)
      return solidMessage(state, "SURFNETWORK: las curvas son degeneradas (sin area).");
    const profile: CadSolidProfile = {
      outer: [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY },
      ],
    };
    const solid = makeSolidEntity(
      context.newEntityId(),
      [{ id: "red", op: "extrude", profile, height: SURFACE_THICKNESS }],
      "red",
      context.activeLayer,
    );
    return finishedSolid(solid, {
      state: undefined as never,
      label: "SURFNETWORK",
      notice: `Superficie de red creada (${entities.length} curvas, ${(maxX - minX).toFixed(1)} x ${(maxY - minY).toFixed(1)} mm).`,
    });
  },
};

export const CAD_SURFACE_EXT_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(surfpatchCommand),
  asCadCommand(surfnetworkCommand),
];
