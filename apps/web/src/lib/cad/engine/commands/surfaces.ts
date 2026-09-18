/**
 * Comandos de la familia Superficies.
 *
 * PLANESURF crea una superficie plana (sólido B-rep delgado) a partir de
 * un contorno cerrado. CONVTOSURFACE informa las propiedades de superficie
 * de un sólido existente (área, caras, volumen). SURFOFFSET vacía un sólido
 * convexo desfasando todas sus caras hacia dentro una distancia uniforme,
 * produciendo una cáscara de pared constante. SURFTRIM recorta una superficie
 * restando otra entidad sólida 3D.
 */
import type { CadEntity } from "../../cad-document";
import type { CadSolid3dEntity, CadSolidNode, CadSolidProfile } from "../../cad-entities-v5";
import { bodyToFaceSpecs } from "../../../brep";
import { shellBody, bodyConvexity, maxShellThickness } from "../../../brep/shell";
import { solid3dBody, solid3dMassProperties } from "../../solid3d-build";
import {
  asCadCommand,
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_SELECTION,
  CAD_ACCEPT_TEXT,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
} from "../command-types";
import {
  finishedSolid,
  formatMagnitude,
  makeSolidEntity,
  prefixNodes,
  selectedEntities,
  solidBatch,
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

// --- CONVTOSURFACE: propiedades de superficie de un sólido ---

type CvtSurfaceState = { selection: readonly string[] };

const convtosurfaceCommand: CadCommandDescriptor<CvtSurfaceState | null> = {
  name: "CONVTOSURFACE",
  aliases: ["CVTSURF", "CONVERTIRASUPERFICIE"],
  kind: "inquiry",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: false,
  cursor: "crosshair",
  begin: (context) => ({
    state:
      context.selection.length > 0
        ? { selection: context.selection }
        : null,
    prompt: {
      message:
        context.selection.length > 0
          ? `${context.selection.length} entidad(es) seleccionada(s). Pulse Intro para consultar`
          : "Designe un solido 3D para consultar sus propiedades de superficie",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel")
      return solidMessage(state, "CONVTOSURFACE cancelado.");
    if (input.kind === "selection")
      return {
        state: { selection: input.entityIds },
        prompt: {
          message: `${input.entityIds.length} entidad(es). Pulse Intro para consultar`,
          options: [],
        },
        accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
      };
    if (input.kind === "entityPick") {
      const prev = state?.selection ?? [];
      return {
        state: { selection: [...prev, input.entityId] },
        prompt: {
          message: `${prev.length + 1} entidad(es). Pulse Intro para consultar`,
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
        "CONVTOSURFACE necesita al menos un solido 3D.",
      );

    const entities = selectedEntities(context, ids);
    if (entities.length === 0)
      return solidMessage(
        state,
        "CONVTOSURFACE: no se encontraron las entidades designadas.",
      );

    const entity = entities[0];
    if (entity.type !== "solid3d")
      return solidMessage(
        state,
        "CONVTOSURFACE solo aplica a solidos 3D.",
      );

    const solid = entity as CadSolid3dEntity;
    const body = solid3dBody(solid);
    const faces = body.faces.length;

    if (faces === 0)
      return solidMessage(
        state,
        "CONVTOSURFACE: el solido no tiene caras (B-rep vacio).",
      );

    const props = solid3dMassProperties(solid);
    const area = props.area.toFixed(2);
    const volume = props.volume.toFixed(2);

    return solidMessage(
      state,
      `Superficie: ${faces} cara(s), area ${area} mm², volumen ${volume} mm³.`,
    );
  },
};

// --- SURFOFFSET: vaciar un sólido convexo con pared de espesor uniforme ----

type SurfoffsetState =
  | { step: "select"; selection: readonly string[] }
  | { step: "distance"; solid: CadSolid3dEntity; maxThickness: number };

const surfoffsetCommand: CadCommandDescriptor<SurfoffsetState> = {
  name: "SURFOFFSET",
  aliases: ["SFOFFSET", "DESFSUPERF"],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => ({
    state:
      context.selection.length > 0
        ? { step: "select", selection: context.selection } as SurfoffsetState
        : { step: "select", selection: [] } as SurfoffsetState,
    prompt: {
      message:
        context.selection.length > 0
          ? `${context.selection.length} entidad(es) seleccionada(s). Pulse Intro para continuar`
          : "Designe un solido 3D convexo para vaciar",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel")
      return solidMessage(state, "SURFOFFSET cancelado.");

    if (state.step === "select") {
      if (input.kind === "selection")
        return {
          state: { step: "select", selection: input.entityIds },
          prompt: {
            message: `${input.entityIds.length} entidad(es). Pulse Intro para continuar`,
            options: [],
          },
          accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
        };
      if (input.kind === "entityPick") {
        const prev = state.selection;
        return {
          state: { step: "select", selection: [...prev, input.entityId] },
          prompt: {
            message: `${prev.length + 1} entidad(es). Pulse Intro para continuar`,
            options: [],
          },
          accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
        };
      }
      if (input.kind !== "enter" && input.kind !== "text")
        return {
          state,
          prompt: { message: "Designe entidades o pulse Intro", options: [] },
          accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
        };

      const ids = state.selection;
      if (ids.length === 0)
        return solidMessage(state, "SURFOFFSET no encontró ningún solido 3D.");

      const entities = selectedEntities(context, ids);
      if (entities.length === 0)
        return solidMessage(state, "SURFOFFSET: no se encontraron las entidades.");

      const entity = entities[0];
      if (entity.type !== "solid3d")
        return solidMessage(state, "SURFOFFSET no encontró ningún sólido 3D en la selección.");

      const solid = entity as CadSolid3dEntity;
      const body = solid3dBody(solid);

      if (body.faces.length === 0)
        return solidMessage(state, "SURFOFFSET: el solido no tiene caras.");

      const convexity = bodyConvexity(body);
      if (!convexity.convex) {
        return solidMessage(
          state,
          `SURFOFFSET: el solido es concavo (${convexity.concaveEdges} arista(s) ` +
            `entrante(s), la peor de ${convexity.worstDegrees.toFixed(1)}°). ` +
            `Solo se puede vaciar un solido convexo.`,
        );
      }

      const max = maxShellThickness(body);
      if (max === null || max <= 0)
        return solidMessage(state, "SURFOFFSET: no se pudo calcular el espesor maximo.");

      return {
        state: { step: "distance", solid, maxThickness: max },
        prompt: {
          message: `Espesor de la pared (maximo ${formatMagnitude(max)} mm; Intro = ${formatMagnitude(max / 2)} mm)`,
          options: [],
        },
        accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT,
      };
    }

    // step === "distance"
    let thickness = state.maxThickness / 2;
    if (input.kind === "distance" && input.value > 0) {
      thickness = input.value;
    } else if (input.kind === "text") {
      const escrito = input.value.trim().replace(",", ".");
      if (escrito !== "") {
        const n = Number(escrito);
        if (!Number.isFinite(n) || n <= 0)
          return solidMessage(state, `SURFOFFSET: «${input.value}» no es un espesor valido.`);
        thickness = n;
      }
    } else if (input.kind !== "enter") {
      return solidMessage(state, "SURFOFFSET: escriba un espesor o pulse Intro.");
    }

    if (thickness >= state.maxThickness)
      return solidMessage(
        state,
        `SURFOFFSET: el espesor ${formatMagnitude(thickness)} mm excede el maximo ` +
          `(${formatMagnitude(state.maxThickness)} mm).`,
      );

    const body = solid3dBody(state.solid);
    const result = shellBody(body, thickness);
    if (!result.ok)
      return solidMessage(state, `SURFOFFSET: ${result.reason}`);

    const shelled = result.report.body;
    const pts = shelled.vertices.map((v: { point: { x: number; y: number; z: number } }) => ({ x: v.point.x, y: v.point.y, z: v.point.z }));
    const specs = bodyToFaceSpecs(shelled);
    const faces = specs.map((s: { outer: number[]; inners?: number[][] }) => ({
      outer: [...s.outer],
      ...(s.inners && s.inners.length > 0 ? { inners: s.inners.map((r: number[]) => [...r]) } : {}),
    }));


    const shelledEntity = makeSolidEntity(
      context.newEntityId(),
      [
        {
          id: "cascara",
          op: "brep",
          points: pts,
          faces,
        },
      ],
      "cascara",
      context.activeLayer,
      state.solid.name,
    );

    return solidBatch(
      state,
      [{ type: "insert", entity: shelledEntity }],
      "SURFOFFSET",
      `Solido vaciado: pared ${formatMagnitude(thickness)} mm, ` +
        `${result.report.faces.shell} caras, volumen ${formatMagnitude(result.report.volume.shell)} mm³.`,
    );
  },
};

// --- SURFTRIM: recortar una superficie restando otra entidad ----

type SurftrimState = { selection: readonly string[] };

const surftrimCommand: CadCommandDescriptor<SurftrimState> = {
  name: "SURFTRIM",
  aliases: ["STRIM", "RECORTARSUPERF"],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => ({
    state: { selection: context.selection },
    prompt: {
      message:
        context.selection.length > 0
          ? `${context.selection.length} entidad(es) seleccionada(s). Designe el cortador y pulse Intro`
          : "Designe la superficie a recortar y despues la entidad cortadora",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel")
      return solidMessage(state, "SURFTRIM cancelado.");
    if (input.kind === "selection")
      return {
        state: { selection: input.entityIds },
        prompt: {
          message: `${input.entityIds.length} entidad(es). Designe la entidad cortadora y pulse Intro`,
          options: [],
        },
        accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
      };
    if (input.kind === "entityPick") {
      const prev = state.selection;
      return {
        state: { selection: [...prev, input.entityId] },
        prompt: {
          message: `${prev.length + 1} entidad(es). Pulse Intro para recortar`,
          options: [],
        },
        accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
      };
    }
    if (input.kind !== "enter" && input.kind !== "text")
      return {
        state,
        prompt: { message: "Designe entidades o pulse Intro", options: [] },
        accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
      };

    const ids = state.selection;
    if (ids.length < 2)
      return solidMessage(
        state,
        "SURFTRIM necesita la superficie Y la entidad cortadora (2 solidos 3D).",
      );

    const entities = selectedEntities(context, ids);
    if (entities.length < 2)
      return solidMessage(state, "SURFTRIM: no se encontraron las entidades.");

    const target = entities.find((e) => e.type === "solid3d") as CadSolid3dEntity | undefined;
    const cutter = entities.find((e) => e.type === "solid3d" && e.id !== target?.id) as CadSolid3dEntity | undefined;

    if (!target || !cutter)
      return solidMessage(state, "SURFTRIM: se necesitan dos solidos 3D.");

    const targetBody = solid3dBody(target);
    if (targetBody.faces.length === 0)
      return solidMessage(state, "SURFTRIM: el solido a recortar no tiene caras.");

    const cutterBody = solid3dBody(cutter);
    if (cutterBody.faces.length === 0)
      return solidMessage(state, "SURFTRIM: la entidad cortadora no tiene caras.");

    const propsBefore = solid3dMassProperties(target);
    const areaBefore = propsBefore.area;

    const nodes = [
      ...prefixNodes(target.nodes, "t:"),
      ...prefixNodes(cutter.nodes, "c:"),
      { id: "resultado", op: "subtract" as const, operands: ["t:" + target.root, "c:" + cutter.root] },
    ];

    const result = makeSolidEntity(
      context.newEntityId(),
      nodes,
      "resultado",
      target.layer,
      target.name,
    );

    return finishedSolid(result, {
      state: undefined as never,
      label: "SURFTRIM",
      before: [{ type: "delete", entityId: target.id }],
      notice: `Superficie recortada: area ${formatMagnitude(areaBefore)} mm².`,
    });
  },
};

export const CAD_SURFACE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(planesurfCommand),
  asCadCommand(convtosurfaceCommand),
  asCadCommand(surfoffsetCommand),
  asCadCommand(surftrimCommand),
];