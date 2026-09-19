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
import { CAD_MESH_CREASE_EXTRUDE_COMMANDS } from "./mesh-crease-extrude";

type MeshSmoothState = { selection: readonly string[] };

function midpoint(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

export function subdivideMesh(
  pts: { x: number; y: number; z: number }[],
  faces: { outer: number[] }[],
): { points: { x: number; y: number; z: number }[]; faces: { outer: number[] }[] } {
  const newPts = [...pts];
  const edgeMidpoints = new Map<string, number>();
  const midpointIndex = (i: number, j: number): number => {
    const key = i < j ? `${i}-${j}` : `${j}-${i}`;
    const existing = edgeMidpoints.get(key);
    if (existing !== undefined) return existing;
    const idx = newPts.length;
    newPts.push(midpoint(newPts[i], newPts[j]));
    edgeMidpoints.set(key, idx);
    return idx;
  };
  const newFaces: { outer: number[] }[] = [];
  for (const face of faces) {
    const outer = face.outer;
    if (outer.length === 3) {
      const [a, b, c] = outer;
      const ab = midpointIndex(a, b);
      const bc = midpointIndex(b, c);
      const ca = midpointIndex(c, a);
      newFaces.push({ outer: [a, ab, ca] });
      newFaces.push({ outer: [b, bc, ab] });
      newFaces.push({ outer: [c, ca, bc] });
      newFaces.push({ outer: [ab, bc, ca] });
    } else if (outer.length === 4) {
      const [a, b, c, d] = outer;
      const ab = midpointIndex(a, b);
      const bc = midpointIndex(b, c);
      const cd = midpointIndex(c, d);
      const da = midpointIndex(d, a);
      const center = newPts.length;
      newPts.push(midpoint(midpoint(newPts[a], newPts[c]), midpoint(newPts[b], newPts[d])));
      newFaces.push({ outer: [a, ab, center, da] });
      newFaces.push({ outer: [b, bc, center, ab] });
      newFaces.push({ outer: [c, cd, center, bc] });
      newFaces.push({ outer: [d, da, center, cd] });
    } else {
      newFaces.push({ outer: [...outer] });
    }
  }
  return { points: newPts, faces: newFaces };
}

function meshSmoothStep(
  name: string,
  alias: string,
  transform: (
    pts: { x: number; y: number; z: number }[],
    faces: { outer: number[] }[],
  ) => { points: { x: number; y: number; z: number }[]; faces: { outer: number[] }[] } | string,
  label: string,
): CadCommandDescriptor<MeshSmoothState | null> {
  return {
    name,
    aliases: [alias],
    kind: "modify",
    transparent: false,
    selection: "optional",
    repeatable: true,
    mutates: true,
    cursor: "crosshair",
    begin: (context) => ({
      state: context.selection.length > 0 ? { selection: context.selection } : null,
      prompt: {
        message: context.selection.length > 0
          ? `${context.selection.length} entidad(es) seleccionada(s). Pulse Intro`
          : `Designe una malla para ${label}`,
        options: [],
      },
      accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
    }),
    step: (state, input, context) => {
      if (input.kind === "cancel") return solidMessage(state, `${name} cancelado.`);
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
        return { state, prompt: { message: "Designe entidades o pulse Intro", options: [] }, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };

      const ids = state?.selection ?? [];
      if (ids.length === 0) return solidMessage(state, `${name}: no se encontró ninguna malla.`);
      const entities = selectedEntities(context, ids);
      if (entities.length === 0) return solidMessage(state, `${name}: no se encontraron las entidades.`);
      const entity = entities[0];
      if (entity.type !== "solid3d") return solidMessage(state, `${name}: la entidad no es un solido 3D.`);

      const solid = entity as import("../../cad-entities-v5").CadSolid3dEntity;
      const body = solid3dBody(solid);
      if (body.faces.length === 0) return solidMessage(state, `${name}: la malla no tiene caras.`);

      const pts = body.vertices.map((v: { point: { x: number; y: number; z: number } }) => ({
        x: v.point.x, y: v.point.y, z: v.point.z,
      }));
      const specs = bodyToFaceSpecs(body);
      const faces = specs.map((s: { outer: number[] }) => ({ outer: [...s.outer] }));

      const result = transform(pts, faces);
      if (typeof result === "string") return solidMessage(state, result);

      const newSolid = makeSolidEntity(
        context.newEntityId(),
        [{ id: "malla", op: "brep", points: result.points, faces: result.faces }],
        "malla",
        context.activeLayer,
        solid.name,
      );

      return solidBatch(
        state,
        [{ type: "insert", entity: newSolid }],
        name,
        `${label}: ${result.faces.length} caras, ${result.points.length} vertices.`,
      );
    },
  };
}

const meshsmoothCommand = meshSmoothStep(
  "MESHSMOOTH", "SUAVIZARMALLA",
  (pts, faces) => subdivideMesh(pts, faces),
  "Malla suavizada",
);
const meshsmoothmoreCommand = meshSmoothStep(
  "MESHSMOOTHMORE", "SUAVIZARMALLAMAS",
  (pts, faces) => subdivideMesh(pts, faces),
  "Malla mas suave",
);
const meshsmoothlessCommand: CadCommandDescriptor<MeshSmoothState | null> = {
  name: "MESHSMOOTHLESS",
  aliases: ["SUAVIZARMALLAMENOS"],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: false,
  cursor: "crosshair",
  begin: (context) => ({
    state: context.selection.length > 0 ? { selection: context.selection } : null,
    prompt: {
      message: context.selection.length > 0
        ? `${context.selection.length} entidad(es) seleccionada(s). Pulse Intro`
        : "Designe una malla para reducir suavidad",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidMessage(state, "MESHSMOOTHLESS cancelado.");
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
      return { state, prompt: { message: "Designe entidades o pulse Intro", options: [] }, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };

    const ids = state?.selection ?? [];
    if (ids.length === 0) return solidMessage(state, "MESHSMOOTHLESS: no se encontró ninguna malla.");
    const entities = selectedEntities(context, ids);
    if (entities.length === 0) return solidMessage(state, "MESHSMOOTHLESS: no se encontraron las entidades.");
    const entity = entities[0];
    if (entity.type !== "solid3d") return solidMessage(state, "MESHSMOOTHLESS: la entidad no es un solido 3D.");

    const solid = entity as import("../../cad-entities-v5").CadSolid3dEntity;
    const body = solid3dBody(solid);
    if (body.faces.length === 0) return solidMessage(state, "MESHSMOOTHLESS: la malla no tiene caras.");

    return solidMessage(
      state,
      `MESHSMOOTHLESS: la malla ya esta en su nivel minimo de suavidad (${body.faces.length} caras, ${body.vertices.length} vertices).`,
    );
  },
};

const meshrefineCommand = meshSmoothStep(
  "MESHREFINE", "REFINARMALLA",
  (pts, faces) => subdivideMesh(pts, faces),
  "Malla refinada",
);

function collapseMesh(
  pts: { x: number; y: number; z: number }[],
  faces: { outer: number[] }[],
): { points: { x: number; y: number; z: number }[]; faces: { outer: number[] }[] } | string {
  if (faces.length < 4) return "MESHCOLLAPSE: la malla tiene menos de 4 caras, no se puede simplificar.";

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
  }

  if (pts.length <= 10 && faces.length <= 8) {
    return "MESHCOLLAPSE: la malla ya está en su forma más simple.";
  }

  const boxPts = [
    { x: minX, y: minY, z: minZ },
    { x: maxX, y: minY, z: minZ },
    { x: maxX, y: maxY, z: minZ },
    { x: minX, y: maxY, z: minZ },
    { x: minX, y: minY, z: maxZ },
    { x: maxX, y: minY, z: maxZ },
    { x: maxX, y: maxY, z: maxZ },
    { x: minX, y: maxY, z: maxZ },
  ];

  const boxFaces = [
    { outer: [0, 3, 2, 1] },
    { outer: [4, 5, 6, 7] },
    { outer: [0, 1, 5, 4] },
    { outer: [2, 3, 7, 6] },
    { outer: [0, 4, 7, 3] },
    { outer: [1, 2, 6, 5] },
  ];

  return { points: boxPts, faces: boxFaces };
}

const meshcollapseCommand = meshSmoothStep(
  "MESHCOLLAPSE", "COLAPSARMALLA",
  collapseMesh,
  "Malla simplificada",
);

function capMesh(
  pts: { x: number; y: number; z: number }[],
  faces: { outer: number[] }[],
): { points: { x: number; y: number; z: number }[]; faces: { outer: number[] }[] } | string {
  const edgeCount = new Map<string, number>();
  for (const face of faces) {
    const outer = face.outer;
    for (let i = 0; i < outer.length; i++) {
      const a = outer[i];
      const b = outer[(i + 1) % outer.length];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
    }
  }

  const openEdges: [number, number][] = [];
  for (const [key, count] of edgeCount) {
    if (count === 1) {
      const [a, b] = key.split("-").map(Number);
      openEdges.push([a, b]);
    }
  }

  if (openEdges.length === 0) return "MESHCAP: la malla no tiene bordes abiertos.";

  const adjacency = new Map<number, number[]>();
  for (const [a, b] of openEdges) {
    const arrA = adjacency.get(a);
    if (arrA) arrA.push(b); else adjacency.set(a, [b]);
    const arrB = adjacency.get(b);
    if (arrB) arrB.push(a); else adjacency.set(b, [a]);
  }

  const visited = new Set<number>();
  const newFaces: { outer: number[] }[] = [];
  for (const start of adjacency.keys()) {
    if (visited.has(start)) continue;
    const contour: number[] = [];
    let current = start;
    while (!visited.has(current)) {
      visited.add(current);
      contour.push(current);
      const neighbors = adjacency.get(current) ?? [];
      let next: number | undefined;
      for (const n of neighbors) {
        if (!visited.has(n) || (n === start && contour.length >= 3)) { next = n; break; }
      }
      if (next === undefined) break;
      if (next === start) { contour.push(start); break; }
      current = next;
    }
    if (contour.length >= 3) {
      if (contour[0] === contour[contour.length - 1]) contour.pop();
      if (contour.length >= 3) newFaces.push({ outer: contour });
    }
  }

  if (newFaces.length === 0) return "MESHCAP: no se encontraron contornos cerrados para tapar.";

  return { points: [...pts], faces: [...faces, ...newFaces] };
}

const meshcapCommand = meshSmoothStep(
  "MESHCAP", "TAPARMALLA",
  capMesh,
  "Malla tapada",
);

const meshmergeCommand: CadCommandDescriptor<MeshSmoothState | null> = {
  name: "MESHMERGE",
  aliases: ["UNIRMALLA"],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => ({
    state: context.selection.length > 0 ? { selection: context.selection } : null,
    prompt: {
      message: context.selection.length > 0
        ? `${context.selection.length} entidad(es) seleccionada(s). Pulse Intro para combinar`
        : "Designe varias mallas para combinar",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidMessage(state, "MESHMERGE cancelado.");
    if (input.kind === "selection")
      return {
        state: { selection: input.entityIds },
        prompt: { message: `${input.entityIds.length} entidad(es). Pulse Intro para combinar`, options: [] },
        accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
      };
    if (input.kind === "entityPick") {
      const prev = state?.selection ?? [];
      return {
        state: { selection: [...prev, input.entityId] },
        prompt: { message: `${prev.length + 1} entidad(es). Pulse Intro para combinar`, options: [] },
        accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
      };
    }
    if (input.kind !== "enter" && input.kind !== "text")
      return { state, prompt: { message: "Designe mallas o pulse Intro", options: [] }, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };

    const ids = state?.selection ?? [];
    if (ids.length < 2) return solidMessage(state, "MESHMERGE: seleccione al menos dos mallas.");
    const entities = selectedEntities(context, ids);
    if (entities.length < 2) return solidMessage(state, "MESHMERGE: no se encontraron suficientes entidades.");

    const solids = entities.filter((e) => e.type === "solid3d") as import("../../cad-entities-v5").CadSolid3dEntity[];
    if (solids.length < 2) return solidMessage(state, "MESHMERGE: se necesitan al menos dos sólidos 3D.");

    const mergedPts: { x: number; y: number; z: number }[] = [];
    const mergedFaces: { outer: number[] }[] = [];

    for (const solid of solids) {
      const body = solid3dBody(solid);
      if (body.faces.length === 0) continue;
      const offset = mergedPts.length;
      for (const v of body.vertices) {
        mergedPts.push({ x: v.point.x, y: v.point.y, z: v.point.z });
      }
      const specs = bodyToFaceSpecs(body);
      for (const s of specs) {
        mergedFaces.push({ outer: s.outer.map((i) => i + offset) });
      }
    }

    if (mergedPts.length === 0) return solidMessage(state, "MESHMERGE: las mallas no tienen geometría.");

    const newSolid = makeSolidEntity(
      context.newEntityId(),
      [{ id: "malla", op: "brep", points: mergedPts, faces: mergedFaces }],
      "malla",
      context.activeLayer,
    );

    return solidBatch(
      state,
      [{ type: "insert", entity: newSolid }],
      "MESHMERGE",
      `Mallas combinadas: ${mergedFaces.length} caras, ${mergedPts.length} vertices.`,
    );
  },
};

type MeshSplitState =
  | { step: "select"; selection: readonly string[] }
  | { step: "point"; selection: readonly string[] }
  | { step: "normal"; selection: readonly string[]; planePoint: { x: number; y: number; z: number } };

const meshsplitCommand: CadCommandDescriptor<MeshSplitState | null> = {
  name: "MESHSPLIT",
  aliases: ["DIVIDIRMALLA"],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: false,
  cursor: "crosshair",
  begin: (context) => ({
    state: context.selection.length > 0
      ? { step: "point" as const, selection: context.selection }
      : { step: "select" as const, selection: [] as readonly string[] },
    prompt: {
      message: context.selection.length > 0
        ? "Indique un punto en el plano de corte"
        : "Designe una malla para dividir",
      options: [],
    },
    accepts: context.selection.length > 0 ? CAD_ACCEPT_POINT : (CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK),
  }),
  step: (state, input, context): CadCommandStep<MeshSplitState | null> => {
    if (input.kind === "cancel") return solidMessage(state, "MESHSPLIT cancelado.");

    if (state === null || state.step === "select") {
      if (input.kind === "selection")
        return {
          state: { step: "point", selection: input.entityIds },
          prompt: { message: "Indique un punto en el plano de corte", options: [] },
          accepts: CAD_ACCEPT_POINT,
        };
      if (input.kind === "entityPick") {
        const prev = state?.selection ?? [];
        return {
          state: { step: "point", selection: [...prev, input.entityId] },
          prompt: { message: "Indique un punto en el plano de corte", options: [] },
          accepts: CAD_ACCEPT_POINT,
        };
      }
      return { state, prompt: { message: "Designe una malla para dividir", options: [] }, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };
    }

    if (state.step === "point") {
      if (input.kind !== "point") return solidMessage(state, "MESHSPLIT: indique un punto en el plano.");
      const p = input.point;
      return {
        state: { step: "normal", selection: state.selection, planePoint: { x: p.x, y: p.y, z: ("z" in p && typeof p.z === "number") ? p.z : 0 } },
        prompt: { message: "Indique la dirección normal del plano (o un segundo punto)", options: [] },
        accepts: CAD_ACCEPT_POINT,
      };
    }

    if (input.kind !== "point") return solidMessage(state, "MESHSPLIT: indique la normal del plano.");
    const n = input.point;
    const normal = { x: n.x - state.planePoint.x, y: n.y - state.planePoint.y, z: ("z" in n && typeof n.z === "number") ? n.z - state.planePoint.z : 0 };
    const len = Math.hypot(normal.x, normal.y, normal.z);
    if (len < 1e-9) return solidMessage(state, "MESHSPLIT: el vector normal no puede ser cero.");
    normal.x /= len; normal.y /= len; normal.z /= len;

    const ids = state.selection;
    const entities = selectedEntities(context, ids);
    if (entities.length === 0) return solidMessage(state, "MESHSPLIT: no se encontraron entidades.");
    const entity = entities[0];
    if (entity.type !== "solid3d") return solidMessage(state, "MESHSPLIT: la entidad no es un sólido 3D.");

    const solid = entity as import("../../cad-entities-v5").CadSolid3dEntity;
    const body = solid3dBody(solid);
    if (body.faces.length === 0) return solidMessage(state, "MESHSPLIT: la malla no tiene caras.");

    const pts = body.vertices.map((v) => ({ x: v.point.x, y: v.point.y, z: v.point.z }));
    const specs = bodyToFaceSpecs(body);
    const dot = (p: { x: number; y: number; z: number }) =>
      normal.x * (p.x - state.planePoint.x) + normal.y * (p.y - state.planePoint.y) + normal.z * (p.z - state.planePoint.z);

    let above = 0;
    let below = 0;
    for (const face of specs) {
      const cx = face.outer.reduce((s, i) => s + pts[i].x, 0) / face.outer.length;
      const cy = face.outer.reduce((s, i) => s + pts[i].y, 0) / face.outer.length;
      const cz = face.outer.reduce((s, i) => s + pts[i].z, 0) / face.outer.length;
      if (dot({ x: cx, y: cy, z: cz }) >= 0) above++; else below++;
    }

    if (above === 0 || below === 0)
      return solidMessage(state, `MESHSPLIT: el plano no intersecta la malla (${specs.length} caras, todas de un lado).`);

    return solidMessage(
      state,
      `MESHSPLIT: ${specs.length} caras divididas — ${above} arriba, ${below} abajo. La división geométrica de mallas aún no está implementada.`,
    );
  },
};

const meshuncreaseCommand: CadCommandDescriptor<MeshSmoothState | null> = {
  name: "MESHUNCREASE",
  aliases: ["QUITARCRESTA"],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => ({
    state: context.selection.length > 0 ? { selection: context.selection } : null,
    prompt: {
      message: context.selection.length > 0
        ? `${context.selection.length} entidad(es) seleccionada(s). Pulse Intro`
        : "Designe una malla para quitar crestas",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidMessage(state, "MESHUNCREASE cancelado.");
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
      return { state, prompt: { message: "Designe entidades o pulse Intro", options: [] }, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };

    const ids = state?.selection ?? [];
    if (ids.length === 0) return solidMessage(state, "MESHUNCREASE: no se encontró ninguna malla.");
    const entities = selectedEntities(context, ids);
    if (entities.length === 0) return solidMessage(state, "MESHUNCREASE: no se encontraron las entidades.");
    const entity = entities[0];
    if (entity.type !== "solid3d") return solidMessage(state, "MESHUNCREASE: la entidad no es un sólido 3D.");

    const solid = entity as import("../../cad-entities-v5").CadSolid3dEntity;
    const body = solid3dBody(solid);
    if (body.faces.length === 0) return solidMessage(state, "MESHUNCREASE: la malla no tiene caras.");

    const pts = body.vertices.map((v: { point: { x: number; y: number; z: number } }) => ({
      x: v.point.x, y: v.point.y, z: v.point.z,
    }));
    const specs = bodyToFaceSpecs(body);
    const faces = specs.map((s: { outer: number[] }) => ({ outer: [...s.outer] }));

    const result = subdivideMesh(pts, faces);

    const newSolid = makeSolidEntity(
      context.newEntityId(),
      [{ id: "malla", op: "brep", points: result.points, faces: result.faces }],
      "malla",
      context.activeLayer,
      solid.name,
    );

    return solidBatch(
      state,
      [{ type: "insert", entity: newSolid }],
      "MESHUNCREASE",
      `Crestas eliminadas: ${result.faces.length} caras, ${result.points.length} vertices.`,
    );
  },
};

export const CAD_MESH_OPS_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(meshsmoothCommand),
  asCadCommand(meshsmoothmoreCommand),
  asCadCommand(meshsmoothlessCommand),
  asCadCommand(meshrefineCommand),
  asCadCommand(meshcollapseCommand),
  asCadCommand(meshcapCommand),
  asCadCommand(meshmergeCommand),
  asCadCommand(meshsplitCommand),
  asCadCommand(meshuncreaseCommand),
  ...CAD_MESH_CREASE_EXTRUDE_COMMANDS,
];
