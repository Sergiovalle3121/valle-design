/**
 * Extensiones de la familia Superficies: SURFPATCH y SURFNETWORK.
 *
 * Extraído de `surfaces.ts` para respetar el presupuesto de monolito (800 líneas).
 */
import type { CadSolidProfile } from "../../cad-entities-v5";
import { bodyBounds } from "../../../brep/topology";
import { solid3dBody, solid3dMassProperties } from "../../solid3d-build";
import {
  asCadCommand,
  CAD_ACCEPT_DISTANCE,
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

// --- SURFBLEND: transición entre dos superficies ---

type SurfblendState = { first: string | null; second: string | null };

const surfblendCommand: CadCommandDescriptor<SurfblendState> = {
  name: "SURFBLEND",
  aliases: ["SBLEND", "MEZCLARSUPERF"],
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
        ? "Dos superficies seleccionadas. Pulse Intro para mezclar"
        : "Designe la primera superficie",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidMessage(state, "SURFBLEND cancelado.");
    if (input.kind === "entityPick" || input.kind === "selection") {
      const id = input.kind === "entityPick" ? input.entityId : input.entityIds[0];
      if (!state.first) return { state: { first: id, second: null }, prompt: { message: "Primera superficie seleccionada. Designe la segunda", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK };
      return { state: { first: state.first, second: id }, prompt: { message: "Dos superficies. Pulse Intro para mezclar", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION };
    }
    if (input.kind !== "enter" && input.kind !== "text")
      return { state, prompt: { message: "Designe superficies o pulse Intro", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION };
    if (!state.first || !state.second) return solidMessage(state, "SURFBLEND necesita dos superficies.");
    const first = context.entity?.(state.first);
    const second = context.entity?.(state.second);
    if (!first || first.type !== "solid3d") return solidMessage(state, "SURFBLEND: la primera entidad no es un solido 3D.");
    if (!second || second.type !== "solid3d") return solidMessage(state, "SURFBLEND: la segunda entidad no es un solido 3D.");
    const bb1 = bodyBounds(solid3dBody(first as never));
    const bb2 = bodyBounds(solid3dBody(second as never));
    const minX = Math.min(bb1.min.x, bb2.min.x);
    const maxX = Math.max(bb1.max.x, bb2.max.x);
    const minY = Math.min(bb1.min.y, bb2.min.y);
    const maxY = Math.max(bb1.max.y, bb2.max.y);
    const profile: CadSolidProfile = { outer: [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }] };
    const solid = makeSolidEntity(context.newEntityId(), [{ id: "mezcla", op: "extrude", profile, height: SURFACE_THICKNESS }], "mezcla", context.activeLayer);
    const blendVolume = solid3dMassProperties(solid as never).volume;
    return finishedSolid(solid, {
      state: { first: null, second: null },
      label: "SURFBLEND",
      notice: `Superficie de mezcla creada (${formatMagnitude(maxX - minX)} x ${formatMagnitude(maxY - minY)} mm, vol ${blendVolume.toFixed(6)}).`,
    });
  },
};

// --- SURFEXTEND: extensión de superficie ---

type SurfextendState = { selection: readonly string[]; distance: number | null };

const surfextendCommand: CadCommandDescriptor<SurfextendState | null> = {
  name: "SURFEXTEND",
  aliases: ["SEXTEND", "EXTENDERSUPERF"],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => ({
    state: context.selection.length > 0 ? { selection: context.selection, distance: null } : null,
    prompt: {
      message: context.selection.length > 0
        ? `${context.selection.length} entidad(es). Escriba la distancia de extension`
        : "Designe la superficie a extender",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_DISTANCE,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidMessage(state, "SURFEXTEND cancelado.");
    if (input.kind === "selection")
      return { state: { selection: input.entityIds, distance: null }, prompt: { message: `${input.entityIds.length} entidad(es). Escriba la distancia`, options: [] }, accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_ENTITY_PICK };
    if (input.kind === "entityPick") {
      const prev = state?.selection ?? [];
      return { state: { selection: [...prev, input.entityId], distance: null }, prompt: { message: `${prev.length + 1} entidad(es). Escriba la distancia`, options: [] }, accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_ENTITY_PICK };
    }
    if (input.kind === "distance") {
      return { state: { selection: state?.selection ?? [], distance: input.value }, prompt: { message: `Extension de ${formatMagnitude(input.value)}. Pulse Intro`, options: [] }, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };
    }
    if (input.kind !== "enter" && input.kind !== "text")
      return { state, prompt: { message: "Designe entidades o escriba distancia", options: [] }, accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_ENTITY_PICK };
    const ids = state?.selection ?? [];
    if (ids.length === 0) return solidMessage(state, "SURFEXTEND necesita al menos una entidad.");
    const entities = selectedEntities(context, ids);
    if (entities.length === 0) return solidMessage(state, "SURFEXTEND: no se encontraron las entidades.");
    const entity = entities[0];
    if (entity.type !== "solid3d") return solidMessage(state, "SURFEXTEND solo acepta solidos 3D.");
    const body = solid3dBody(entity as never);
    if (body.faces.length === 0) return solidMessage(state, "SURFEXTEND: el solido no tiene caras.");
    const bb = bodyBounds(body);
    const dist = state?.distance ?? 10;
    const newMinX = bb.min.x - dist;
    const newMaxX = bb.max.x + dist;
    const newMinY = bb.min.y - dist;
    const newMaxY = bb.max.y + dist;
    const profile: CadSolidProfile = { outer: [{ x: newMinX, y: newMinY }, { x: newMaxX, y: newMinY }, { x: newMaxX, y: newMaxY }, { x: newMinX, y: newMaxY }] };
    const solid = makeSolidEntity(context.newEntityId(), [{ id: "extendida", op: "extrude", profile, height: SURFACE_THICKNESS }], "extendida", context.activeLayer);
    return finishedSolid(solid, {
      state: undefined as never,
      label: "SURFEXTEND",
      notice: `Superficie extendida ${formatMagnitude(dist)} mm en cada borde (${formatMagnitude(newMaxX - newMinX)} x ${formatMagnitude(newMaxY - newMinY)} mm).`,
    });
  },
};

export const CAD_SURFACE_EXT_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(surfpatchCommand),
  asCadCommand(surfnetworkCommand),
  asCadCommand(surfblendCommand),
  asCadCommand(surfextendCommand),
];
