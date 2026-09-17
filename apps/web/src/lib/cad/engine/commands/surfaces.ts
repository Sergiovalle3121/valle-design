/**
 * PLANESURF — superficie plana a partir de un contorno cerrado.
 *
 * Acepta polilíneas cerradas seleccionadas y crea un sólido B-rep con
 * espesor mínimo (0.001 mm) usando extrusión. El perfil se extrae de
 * los vértices de la polilínea.
 *
 * La sonda de integridad exige que el sólido sea válido (cerrado) y que
 * su volumen y área sean positivos.
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
  makeSolidEntity,
  selectedEntities,
  solidMessage,
} from "./solids-support";

const SURFACE_THICKNESS = 0.001;

type PlanesurfState = { selection: readonly string[] };

function profileFromPolyline(entity: CadEntity): CadSolidProfile | string {
  if (entity.type !== "polyline" || !("vertices" in entity))
    return "PLANESURF requiere una polilinea como contorno.";
  const verts = (entity as { vertices: { x: number; y: number }[] }).vertices;
  if (verts.length < 3)
    return "La polilinea tiene menos de 3 vertices.";
  return { outer: verts.map((v) => ({ x: v.x, y: v.y })) };
}

const planesurfCommand: CadCommandDescriptor<PlanesurfState | null> = {
  name: "PLANESURF",
  aliases: ["PLSURF", "SUPERFICIEPLANA"],
  kind: "draw",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => ({
    state:
      context.selection.length > 0
        ? { selection: context.selection }
        : null,
    prompt: {
      message:
        context.selection.length > 0
          ? `${context.selection.length} entidad(es) seleccionada(s). Pulse Intro para crear la superficie plana`
          : "Designe las entidades del contorno cerrado (polilineas)",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel")
      return solidMessage(state, "PLANESURF cancelado.");
    if (input.kind === "selection")
      return {
        state: { selection: input.entityIds },
        prompt: {
          message: `${input.entityIds.length} entidad(es). Pulse Intro para crear`,
          options: [],
        },
        accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
      };
    if (input.kind === "entityPick") {
      const prev = state?.selection ?? [];
      return {
        state: { selection: [...prev, input.entityId] },
        prompt: {
          message: `${prev.length + 1} entidad(es). Pulse Intro para crear`,
          options: [],
        },
        accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
      };
    }
    if (input.kind !== "enter" && input.kind !== "text")
      return {
        state,
        prompt: {
          message: "Designe entidades o pulse Intro",
          options: [],
        },
        accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
      };

    const ids = state?.selection ?? [];
    if (ids.length === 0)
      return solidMessage(
        state,
        "PLANESURF necesita al menos una entidad de contorno.",
      );

    const entities = selectedEntities(context, ids);
    if (entities.length === 0)
      return solidMessage(
        state,
        "PLANESURF: no se encontraron las entidades designadas.",
      );

    const profile = profileFromPolyline(entities[0]);
    if (typeof profile === "string")
      return solidMessage(state, profile);

    const id = context.newEntityId();
    const solid = makeSolidEntity(
      id,
      [
        {
          id: "perfil",
          op: "extrude",
          profile,
          height: SURFACE_THICKNESS,
        },
      ],
      "perfil",
      context.activeLayer,
    );

    return finishedSolid(solid, {
      state: undefined as never,
      label: "PLANESURF",
      notice: `Superficie plana creada (${profile.outer.length} vertices).`,
    });
  },
};

export const CAD_SURFACE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(planesurfCommand),
];