import { bodyToFaceSpecs } from "../../../brep";
import { solid3dBody } from "../../solid3d-build";
import {
  asCadCommand,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_SELECTION,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
} from "../command-types";
import {
  selectedEntities,
  solidMessage,
} from "./solids-support";

type MeshCreaseState = { selection: readonly string[] };

export const meshcreaseCommand: CadCommandDescriptor<MeshCreaseState | null> = {
  name: "MESHCREASE",
  aliases: ["CRESTAMALLA"],
  kind: "inquiry",
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
        : "Designe una malla para marcar crestas",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidMessage(state, "MESHCREASE cancelado.");
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
    if (ids.length === 0) return solidMessage(state, "MESHCREASE: no se encontró ninguna malla.");
    const entities = selectedEntities(context, ids);
    if (entities.length === 0) return solidMessage(state, "MESHCREASE: no se encontraron las entidades.");
    const entity = entities[0];
    if (entity.type !== "solid3d") return solidMessage(state, "MESHCREASE: la entidad no es un sólido 3D.");

    const solid = entity as import("../../cad-entities-v5").CadSolid3dEntity;
    const body = solid3dBody(solid);
    if (body.faces.length === 0) return solidMessage(state, "MESHCREASE: la malla no tiene caras.");

    const pts = body.vertices.map((v: { point: { x: number; y: number; z: number } }) => ({
      x: v.point.x, y: v.point.y, z: v.point.z,
    }));
    const specs = bodyToFaceSpecs(body);

    const edgeFaces = new Map<string, number[]>();
    for (let fi = 0; fi < specs.length; fi++) {
      const outer = specs[fi].outer;
      for (let i = 0; i < outer.length; i++) {
        const a = outer[i];
        const b = outer[(i + 1) % outer.length];
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        const arr = edgeFaces.get(key);
        if (arr) arr.push(fi); else edgeFaces.set(key, [fi]);
      }
    }

    const faceNormals: { x: number; y: number; z: number }[] = [];
    for (const spec of specs) {
      const outer = spec.outer;
      if (outer.length < 3) { faceNormals.push({ x: 0, y: 0, z: 1 }); continue; }
      const p0 = pts[outer[0]], p1 = pts[outer[1]], p2 = pts[outer[2]];
      const ux = p1.x - p0.x, uy = p1.y - p0.y, uz = p1.z - p0.z;
      const vx = p2.x - p0.x, vy = p2.y - p0.y, vz = p2.z - p0.z;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz);
      faceNormals.push(len > 1e-12 ? { x: nx / len, y: ny / len, z: nz / len } : { x: 0, y: 0, z: 1 });
    }

    const creaseThreshold = Math.cos(Math.PI / 6);
    let creaseCount = 0;
    let boundaryCount = 0;

    for (const [, faces] of edgeFaces) {
      if (faces.length === 1) {
        boundaryCount++;
        creaseCount++;
      } else if (faces.length === 2) {
        const n1 = faceNormals[faces[0]];
        const n2 = faceNormals[faces[1]];
        const dot = n1.x * n2.x + n1.y * n2.y + n1.z * n2.z;
        if (Math.abs(dot) < creaseThreshold) creaseCount++;
      }
    }

    return solidMessage(
      state,
      `MESHCREASE: ${creaseCount} aristas marcadas como cresta (${boundaryCount} bordes, ${creaseCount - boundaryCount} angulos agudos).`,
    );
  },
};

function extrudeMeshFaces(
  pts: { x: number; y: number; z: number }[],
  faces: { outer: number[] }[],
  distance: number,
): { points: { x: number; y: number; z: number }[]; faces: { outer: number[] }[] } | string {
  if (faces.length === 0) return "MESHEXTRUDE: la malla no tiene caras.";
  if (Math.abs(distance) < 1e-9) return "MESHEXTRUDE: la distancia no puede ser cero.";

  const vertexNormals = pts.map(() => ({ x: 0, y: 0, z: 0 }));
  for (const face of faces) {
    const outer = face.outer;
    if (outer.length < 3) continue;
    const p0 = pts[outer[0]], p1 = pts[outer[1]], p2 = pts[outer[2]];
    const ux = p1.x - p0.x, uy = p1.y - p0.y, uz = p1.z - p0.z;
    const vx = p2.x - p0.x, vy = p2.y - p0.y, vz = p2.z - p0.z;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const idx of outer) {
      vertexNormals[idx].x += nx;
      vertexNormals[idx].y += ny;
      vertexNormals[idx].z += nz;
    }
  }
  for (const n of vertexNormals) {
    const len = Math.hypot(n.x, n.y, n.z);
    if (len > 1e-12) { n.x /= len; n.y /= len; n.z /= len; }
  }

  const offset = pts.length;
  const newPts = [
    ...pts,
    ...pts.map((p, i) => ({
      x: p.x + vertexNormals[i].x * distance,
      y: p.y + vertexNormals[i].y * distance,
      z: p.z + vertexNormals[i].z * distance,
    })),
  ];

  const newFaces: { outer: number[] }[] = [];
  for (const face of faces) {
    if (face.outer.length < 3) continue;
    newFaces.push({ outer: [...face.outer].reverse().map((i) => i + offset) });
  }

  const seenEdges = new Set<string>();
  for (const face of faces) {
    const outer = face.outer;
    for (let i = 0; i < outer.length; i++) {
      const a = outer[i];
      const b = outer[(i + 1) % outer.length];
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const key = `${lo}-${hi}`;
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      newFaces.push({ outer: [a + offset, b + offset, b, a] });
    }
  }

  if (newFaces.length === 0) return "MESHEXTRUDE: no se extruyó ninguna cara.";

  return { points: newPts, faces: [...faces, ...newFaces] };
}

export const meshextrudeCommand: CadCommandDescriptor<MeshCreaseState | null> = {
  name: "MESHEXTRUDE",
  aliases: ["EXTRUIRMALLA"],
  kind: "inquiry",
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
        : "Designe una malla para extruir",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidMessage(state, "MESHEXTRUDE cancelado.");
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
    if (ids.length === 0) return solidMessage(state, "MESHEXTRUDE: no se encontró ninguna malla.");
    const entities = selectedEntities(context, ids);
    if (entities.length === 0) return solidMessage(state, "MESHEXTRUDE: no se encontraron las entidades.");
    const entity = entities[0];
    if (entity.type !== "solid3d") return solidMessage(state, "MESHEXTRUDE: la entidad no es un sólido 3D.");

    const solid = entity as import("../../cad-entities-v5").CadSolid3dEntity;
    const body = solid3dBody(solid);
    if (body.faces.length === 0) return solidMessage(state, "MESHEXTRUDE: la malla no tiene caras.");

    const pts = body.vertices.map((v: { point: { x: number; y: number; z: number } }) => ({
      x: v.point.x, y: v.point.y, z: v.point.z,
    }));
    const specs = bodyToFaceSpecs(body);
    const faces = specs.map((s: { outer: number[] }) => ({ outer: [...s.outer] }));

    const result = extrudeMeshFaces(pts, faces, 1.0);
    if (typeof result === "string") return solidMessage(state, result);

    return solidMessage(
      state,
      `MESHEXTRUDE: la malla tiene ${faces.length} caras y ${pts.length} vértices. La extrusión geométrica de mallas aún no está implementada.`,
    );
  },
};

export const CAD_MESH_CREASE_EXTRUDE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(meshcreaseCommand),
  asCadCommand(meshextrudeCommand),
];
