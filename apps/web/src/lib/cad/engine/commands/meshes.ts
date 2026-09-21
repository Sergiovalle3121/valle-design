/**
 * Comandos de la familia Mallas.
 *
 * MESH crea un primitiva de malla (caja) a partir de dos esquinas y una
 * altura. El resultado es un sólido B-rep con la etiqueta «malla» para que
 * los comandos posteriores (MESHSMOOTH, MESHREFINE, etc.) puedan
 * identificarlo. Almacena vértices y caras como un nodo «brep» del árbol
 * CSG, igual que PLANESURF.
 */
import { makeBox, bodyToFaceSpecs, attachPlanarSurfaces } from "../../../brep";
import { solid3dBody, solid3dMassProperties } from "../../solid3d-build";
import {
  asCadCommand,
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_SELECTION,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import {
  finishedSolid,
  formatMagnitude,
  makeSolidEntity,
  selectedEntities,
  solidBatch,
  solidMessage,
} from "./solids-support";
import { CAD_MESH_OPS_COMMANDS } from "./mesh-operations";

type MeshBoxState =
  | { step: "corner" }
  | { step: "opposite"; corner: { x: number; y: number; z: number } }
  | { step: "height"; corner: { x: number; y: number; z: number }; opposite: { x: number; y: number; z: number } };

const meshCommand: CadCommandDescriptor<MeshBoxState> = {
  name: "MESH",
  aliases: ["MALLA"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  spatial: true,
  cursor: "crosshair",
  begin: () => ({
    state: { step: "corner" } as MeshBoxState,
    prompt: { message: "Primera esquina de la malla", options: [] },
    accepts: CAD_ACCEPT_POINT,
  }),
  step: (state, input, context): CadCommandStep<MeshBoxState> => {
    if (input.kind === "cancel") return solidMessage(state, "MESH cancelado.");

    if (state.step === "corner") {
      if (input.kind !== "point")
        return solidMessage(state, "MESH: indique la primera esquina.");
      const p = input.point;
      const corner = { x: p.x, y: p.y, z: ("z" in p && typeof p.z === "number") ? p.z : 0 };
      return {
        state: { step: "opposite", corner },
        prompt: { message: "Esquina opuesta", options: [] },
        accepts: CAD_ACCEPT_POINT,
      };
    }

    if (state.step === "opposite") {
      if (input.kind !== "point")
        return solidMessage(state, "MESH: indique la esquina opuesta.");
      const p = input.point;
      const opposite = { x: p.x, y: p.y, z: ("z" in p && typeof p.z === "number") ? p.z : 0 };
      const dx = Math.abs(opposite.x - state.corner.x);
      const dy = Math.abs(opposite.y - state.corner.y);
      if (dx < 0.01 && dy < 0.01)
        return solidMessage(state, "MESH: las esquinas no pueden estar en la misma posicion.");
      return {
        state: { step: "height", corner: state.corner, opposite },
        prompt: { message: "Altura de la malla", options: [] },
        accepts: CAD_ACCEPT_DISTANCE,
      };
    }

    // step === "height"
    if (input.kind !== "distance")
      return solidMessage(state, "MESH: escriba una altura.");
    const height = input.value;
    if (Math.abs(height) < 0.01)
      return solidMessage(state, "MESH: la altura no puede ser cero.");

    const min = {
      x: Math.min(state.corner.x, state.opposite.x),
      y: Math.min(state.corner.y, state.opposite.y),
      z: Math.min(state.corner.z, state.opposite.z),
    };
    const max = {
      x: Math.max(state.corner.x, state.opposite.x),
      y: Math.max(state.corner.y, state.opposite.y),
      z: min.z + Math.abs(height),
    };

    const body = makeBox({ min, max });
    const validated = attachPlanarSurfaces(body);
    const pts = validated.vertices.map((v) => ({ x: v.point.x, y: v.point.y, z: v.point.z }));
    const specs = bodyToFaceSpecs(validated);
    const faces = specs.map((s: { outer: number[]; inners?: number[][] }) => ({
      outer: [...s.outer],
      ...(s.inners && s.inners.length > 0 ? { inners: s.inners.map((r: number[]) => [...r]) } : {}),
    }));

    const solid = makeSolidEntity(
      context.newEntityId(),
      [{ id: "malla", op: "brep", points: pts, faces }],
      "malla",
      context.activeLayer,
    );

    return finishedSolid(solid, {
      state: undefined as unknown as MeshBoxState,
      label: "MESH",
      notice: `Malla creada: ${pts.length} vertices, ${faces.length} caras.`,
    });
  },
};

// --- CONVTOMESH: convertir sólido 3D a representación de malla ---

type CvtMeshState = { selection: readonly string[] };

const convtomeshCommand: CadCommandDescriptor<CvtMeshState | null> = {
  name: "CONVTOMESH",
  aliases: ["CVTMESH", "CONVERTIRAMALLA"],
  kind: "modify",
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
          ? `${context.selection.length} entidad(es) seleccionada(s). Pulse Intro para convertir`
          : "Designe un solido 3D para convertir a malla",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel")
      return solidMessage(state, "CONVTOMESH cancelado.");
    if (input.kind === "selection")
      return {
        state: { selection: input.entityIds },
        prompt: {
          message: `${input.entityIds.length} entidad(es). Pulse Intro para convertir`,
          options: [],
        },
        accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
      };
    if (input.kind === "entityPick") {
      const prev = state?.selection ?? [];
      return {
        state: { selection: [...prev, input.entityId] },
        prompt: {
          message: `${prev.length + 1} entidad(es). Pulse Intro para convertir`,
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

    const ids = state?.selection ?? [];
    if (ids.length === 0)
      return solidMessage(state, "CONVTOMESH no encontró ningún solido 3D.");

    const entities = selectedEntities(context, ids);
    if (entities.length === 0)
      return solidMessage(state, "CONVTOMESH: no se encontraron las entidades.");

    const entity = entities[0];
    if (entity.type !== "solid3d")
      return solidMessage(state, "CONVTOMESH no encontró ningún solido 3D en la selección.");

    const solid = entity as import("../../cad-entities-v5").CadSolid3dEntity;
    const body = solid3dBody(solid);
    if (body.faces.length === 0)
      return solidMessage(state, "CONVTOMESH: el solido no tiene caras.");

    const props = solid3dMassProperties(solid);

    const pts = body.vertices.map((v: { point: { x: number; y: number; z: number } }) => ({
      x: v.point.x, y: v.point.y, z: v.point.z,
    }));
    const specs = bodyToFaceSpecs(body);
    const faces = specs.map((s: { outer: number[]; inners?: number[][] }) => ({
      outer: [...s.outer],
      ...(s.inners && s.inners.length > 0 ? { inners: s.inners.map((r: number[]) => [...r]) } : {}),
    }));

    const meshEntity = makeSolidEntity(
      context.newEntityId(),
      [{ id: "malla", op: "brep", points: pts, faces }],
      "malla",
      context.activeLayer,
      solid.name,
    );

    return solidBatch(
      state,
      [{ type: "insert", entity: meshEntity }],
      "CONVTOMESH",
      `Malla: ${body.faces.length} caras, ${body.vertices.length} vertices, area ${formatMagnitude(props.area)} mm2.`,
    );
  },
};

// --- CONVTOSOLID: convertir malla a sólido 3D ---

const convtosolidCommand: CadCommandDescriptor<CvtMeshState | null> = {
  name: "CONVTOSOLID",
  aliases: ["CVTSOLID", "CONVERTIRASOLIDO"],
  kind: "modify",
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
          ? `${context.selection.length} entidad(es) seleccionada(s). Pulse Intro para convertir`
          : "Designe una malla para convertir a solido 3D",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel")
      return solidMessage(state, "CONVTOSOLID cancelado.");
    if (input.kind === "selection")
      return {
        state: { selection: input.entityIds },
        prompt: {
          message: `${input.entityIds.length} entidad(es). Pulse Intro para convertir`,
          options: [],
        },
        accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
      };
    if (input.kind === "entityPick") {
      const prev = state?.selection ?? [];
      return {
        state: { selection: [...prev, input.entityId] },
        prompt: {
          message: `${prev.length + 1} entidad(es). Pulse Intro para convertir`,
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

    const ids = state?.selection ?? [];
    if (ids.length === 0)
      return solidMessage(state, "CONVTOSOLID no encontró ninguna malla.");

    const entities = selectedEntities(context, ids);
    if (entities.length === 0)
      return solidMessage(state, "CONVTOSOLID: no se encontraron las entidades.");

    const entity = entities[0];
    if (entity.type !== "solid3d")
      return solidMessage(state, "CONVTOSOLID no encontró ningún solido 3D.");

    const solid = entity as import("../../cad-entities-v5").CadSolid3dEntity;
    const body = solid3dBody(solid);
    if (body.faces.length === 0)
      return solidMessage(state, "CONVTOSOLID: la entidad no tiene caras.");

    const props = solid3dMassProperties(solid);

    const pts = body.vertices.map((v: { point: { x: number; y: number; z: number } }) => ({
      x: v.point.x, y: v.point.y, z: v.point.z,
    }));
    const specs = bodyToFaceSpecs(body);
    const faces = specs.map((s: { outer: number[]; inners?: number[][] }) => ({
      outer: [...s.outer],
      ...(s.inners && s.inners.length > 0 ? { inners: s.inners.map((r: number[]) => [...r]) } : {}),
    }));

    const solidEntity = makeSolidEntity(
      context.newEntityId(),
      [{ id: "solido", op: "brep", points: pts, faces }],
      "solido",
      context.activeLayer,
      solid.name,
    );

    return solidBatch(
      state,
      [{ type: "insert", entity: solidEntity }],
      "CONVTOSOLID",
      `Solido: ${body.faces.length} caras, ${body.vertices.length} vertices, volumen ${formatMagnitude(props.volume)} mm3.`,
    );
  },
};

// --- 3DFACE: cara 3D definida por 3 o 4 puntos ---

type Face3dState =
  | { step: "p1" }
  | { step: "p2"; p1: { x: number; y: number; z: number } }
  | { step: "p3"; p1: { x: number; y: number; z: number }; p2: { x: number; y: number; z: number } }
  | { step: "p4"; pts: { x: number; y: number; z: number }[] };

const FACE3D_THICKNESS = 0.001;

const face3dCommand: CadCommandDescriptor<Face3dState> = {
  name: "3DFACE",
  aliases: ["CARA3D"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  spatial: true,
  cursor: "crosshair",
  begin: () => ({
    state: { step: "p1" } as Face3dState,
    prompt: { message: "Primer punto", options: [] },
    accepts: CAD_ACCEPT_POINT,
  }),
  step: (state, input, context): CadCommandStep<Face3dState> => {
    if (input.kind === "cancel") return solidMessage(state, "3DFACE cancelado.");

    const p2d = (p: { x: number; y: number; z?: number }) =>
      ({ x: p.x, y: p.y, z: ("z" in p && typeof p.z === "number") ? p.z : 0 });

    if (state.step === "p1") {
      if (input.kind !== "point") return solidMessage(state, "3DFACE: indique el primer punto.");
      return { state: { step: "p2", p1: p2d(input.point) }, prompt: { message: "Segundo punto", options: [] }, accepts: CAD_ACCEPT_POINT };
    }

    if (state.step === "p2") {
      if (input.kind !== "point") return solidMessage(state, "3DFACE: indique el segundo punto.");
      return { state: { step: "p3", p1: state.p1, p2: p2d(input.point) }, prompt: { message: "Tercer punto", options: [] }, accepts: CAD_ACCEPT_POINT };
    }

    if (state.step === "p3") {
      if (input.kind !== "point") return solidMessage(state, "3DFACE: indique el tercer punto.");
      const pts = [state.p1, state.p2, p2d(input.point)];
      return {
        state: { step: "p4", pts },
        prompt: { message: "Cuarto punto (Intro para triangulo)", options: [] },
        accepts: CAD_ACCEPT_POINT,
      };
    }

    // step === "p4"
    let pts = state.pts;
    if (input.kind === "point") {
      pts = [...pts, p2d(input.point)];
    } else if (input.kind !== "enter") {
      return solidMessage(state, "3DFACE: indique el cuarto punto o pulse Intro.");
    }

    if (pts.length < 3) return solidMessage(state, "3DFACE: se necesitan al menos 3 puntos.");

    const normal = (() => {
      const a = { x: pts[1].x - pts[0].x, y: pts[1].y - pts[0].y, z: pts[1].z - pts[0].z };
      const b = { x: pts[2].x - pts[0].x, y: pts[2].y - pts[0].y, z: pts[2].z - pts[0].z };
      return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
      };
    })();
    const len = Math.hypot(normal.x, normal.y, normal.z);
    if (len < 1e-9)
      return solidMessage(state, "3DFACE: los puntos son colineales.");

    const solid = makeSolidEntity(
      context.newEntityId(),
      [
        {
          id: "perfil",
          op: "extrude",
          profile: { outer: pts.map((p) => ({ x: p.x, y: p.y })) },
          height: FACE3D_THICKNESS,
          frame: { origin: pts[0], zAxis: { x: normal.x / len, y: normal.y / len, z: normal.z / len } },
        },
      ],
      "perfil",
      context.activeLayer,
    );

    return finishedSolid(solid, {
      state: undefined as unknown as Face3dState,
      label: "3DFACE",
      notice: `Cara 3D creada (${pts.length} puntos).`,
    });
  },
};

export const CAD_MESH_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(meshCommand),
  asCadCommand(convtomeshCommand),
  asCadCommand(convtosolidCommand),
  asCadCommand(face3dCommand),
  ...CAD_MESH_OPS_COMMANDS,
];
