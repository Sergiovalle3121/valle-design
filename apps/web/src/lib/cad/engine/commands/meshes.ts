/**
 * Comandos de la familia Mallas.
 *
 * MESH crea un primitiva de malla (caja) a partir de dos esquinas y una
 * altura. El resultado es un sólido B-rep con la etiqueta «malla» para que
 * los comandos posteriores (MESHSMOOTH, MESHREFINE, etc.) puedan
 * identificarlo. Almacena vértices y caras como un nodo «brep» del árbol
 * CSG, igual que PLANESURF.
 */
import { makeBox, bodyToFaceSpecs, attachPlanarSurfaces, buildBody } from "../../../brep";
import {
  asCadCommand,
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_POINT,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import {
  finishedSolid,
  makeSolidEntity,
  solidMessage,
} from "./solids-support";

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

export const CAD_MESH_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(meshCommand),
];
