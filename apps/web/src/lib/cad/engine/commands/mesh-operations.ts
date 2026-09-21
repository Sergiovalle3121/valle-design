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
  makeSolidEntity,
  selectedEntities,
  solidBatch,
  solidMessage,
} from "./solids-support";
import { CAD_MESH_CREASE_EXTRUDE_COMMANDS } from "./mesh-crease-extrude";
import { CAD_MESH_SMOOTHING_COMMANDS } from "./mesh-smoothing";
import { CAD_MESH_SPLIT_COMMANDS } from "./mesh-split";
import { cadDescriptorAunNoDisponible } from "../command-availability";

type MeshOpState = { selection: readonly string[] };

function midpoint(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

/**
 * Subdivide SIN suavizar: cada cara se parte por el punto medio de sus
 * aristas, ningún vértice se mueve. Volumen y caja envolvente salen
 * IDÉNTICOS; caras ×4. Es justo lo que hace MESHREFINE en AutoCAD — a
 * diferencia de MESHSMOOTH/MESHSMOOTHMORE/MESHSMOOTHLESS (`mesh-smoothing.ts`),
 * que SÍ mueven vértices con Loop subdivision de verdad. Antes de esta ola las
 * cuatro llamaban a esta misma función: eso era el relleno que midió la
 * auditoría — «suavizar» que no suaviza nada. Aquí, para MESHREFINE, es
 * exactamente la operación correcta.
 */
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

/** Designar una malla, transformarla y hornear el resultado como entidad NUEVA. */
function meshBakedTransformStep(
  name: string,
  alias: string,
  transform: (
    pts: { x: number; y: number; z: number }[],
    faces: { outer: number[] }[],
  ) => { points: { x: number; y: number; z: number }[]; faces: { outer: number[] }[] } | string,
  label: string,
): CadCommandDescriptor<MeshOpState | null> {
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

const meshrefineCommand = meshBakedTransformStep(
  "MESHREFINE", "REFINARMALLA",
  (pts, faces) => subdivideMesh(pts, faces),
  "Malla refinada",
);

// MESHCOLLAPSE aún no está disponible. Antes «simplificaba» insertando la CAJA
// ENVOLVENTE de la malla encima de ella: medido, una pirámide de 333 333 mm³
// ganaba una caja de 2 000 000 mm³ superpuesta, con el renglón «Malla
// simplificada». Colapsar de verdad es fundir los vértices de una cara o una
// arista y rehacer las caras vecinas; hasta que el núcleo lo sepa hacer, se
// niega en su primer paso sin tocar el documento (`command-availability.ts`).
const meshcollapseCommand = cadDescriptorAunNoDisponible({
  name: "MESHCOLLAPSE",
  aliases: ["COLAPSARMALLA"],
  kind: "modify",
  transparent: false,
});

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

const meshcapCommand = meshBakedTransformStep(
  "MESHCAP", "TAPARMALLA",
  capMesh,
  "Malla tapada",
);

const meshmergeCommand: CadCommandDescriptor<MeshOpState | null> = {
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

export const CAD_MESH_OPS_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  ...CAD_MESH_SMOOTHING_COMMANDS,
  asCadCommand(meshrefineCommand),
  asCadCommand(meshcollapseCommand),
  asCadCommand(meshcapCommand),
  asCadCommand(meshmergeCommand),
  ...CAD_MESH_SPLIT_COMMANDS,
  ...CAD_MESH_CREASE_EXTRUDE_COMMANDS,
];
