/**
 * MESHSPLIT — partir una cara de la malla en dos, por una cuerda entre dos
 * puntos designados sobre ella. La geometría vive en `lib/cad/mesh/
 * mesh-face-split.ts`; aquí sólo está la máquina de estados que pide los dos
 * puntos con `CAD_ACCEPT_FACE_PICK` (el mismo bit que usa PRESSPULL para
 * designar una cara) y hornea el resultado.
 *
 * Antes cortaba el sólido ENTERO por un plano infinito y nunca partía nada —
 * terminaba en «la división geométrica de mallas aún no está implementada»
 * pasara lo que pasara. Ver la cabecera de `mesh-face-split.ts` para por qué
 * ESTA versión sí es tratable: es una operación local, sobre una cara, no
 * global sobre todo el cuerpo.
 */
import { bodyToFaceSpecs } from "../../../brep";
import { solid3dBody } from "../../solid3d-build";
import { splitMeshFace } from "../../mesh/mesh-face-split";
import type { CadSolid3dEntity, CadSolidFaceRef } from "../../cad-entities-v5";
import {
  asCadCommand,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_FACE_PICK,
  CAD_ACCEPT_SELECTION,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import { makeSolidEntity, selectedEntities, solidBatch, solidMessage } from "./solids-support";

type MeshSplitState =
  | { step: "select" }
  | { step: "first"; entityId: string }
  | { step: "second"; entityId: string; face: CadSolidFaceRef; point: { x: number; y: number; z: number } };

const meshsplitCommand: CadCommandDescriptor<MeshSplitState | null> = {
  name: "MESHSPLIT",
  aliases: ["DIVIDIRMALLA"],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => {
    if (context.selection.length === 1) {
      return {
        state: { step: "first", entityId: context.selection[0] },
        prompt: { message: "Designe el primer punto sobre la cara a dividir", options: [] },
        accepts: CAD_ACCEPT_FACE_PICK,
      };
    }
    return {
      state: { step: "select" },
      prompt: { message: "Designe la malla a dividir", options: [] },
      accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
    };
  },
  step: (state, input, context): CadCommandStep<MeshSplitState | null> => {
    if (input.kind === "cancel") return solidMessage(state, "MESHSPLIT cancelado.");

    if (state === null || state.step === "select") {
      if (input.kind === "selection" && input.entityIds.length > 0)
        return {
          state: { step: "first", entityId: input.entityIds[0] },
          prompt: { message: "Designe el primer punto sobre la cara a dividir", options: [] },
          accepts: CAD_ACCEPT_FACE_PICK,
        };
      if (input.kind === "entityPick")
        return {
          state: { step: "first", entityId: input.entityId },
          prompt: { message: "Designe el primer punto sobre la cara a dividir", options: [] },
          accepts: CAD_ACCEPT_FACE_PICK,
        };
      return { state: state ?? { step: "select" }, prompt: { message: "Designe la malla a dividir", options: [] }, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };
    }

    if (state.step === "first") {
      if (input.kind !== "facePick")
        return { state, prompt: { message: "Designe el primer punto sobre la cara a dividir", options: [] }, accepts: CAD_ACCEPT_FACE_PICK };
      if (input.entityId !== state.entityId)
        return solidMessage(state, "MESHSPLIT: designe un punto sobre la malla que seleccionó.");
      return {
        state: { step: "second", entityId: state.entityId, face: input.face, point: input.point },
        prompt: { message: "Designe el segundo punto, sobre la MISMA cara", options: [] },
        accepts: CAD_ACCEPT_FACE_PICK,
      };
    }

    // state.step === "second"
    if (input.kind !== "facePick")
      return { state, prompt: { message: "Designe el segundo punto, sobre la MISMA cara", options: [] }, accepts: CAD_ACCEPT_FACE_PICK };
    if (input.entityId !== state.entityId)
      return solidMessage(state, "MESHSPLIT: designe el segundo punto sobre la misma malla que el primero.");
    if (input.face.index !== state.face.index)
      return solidMessage(state, "MESHSPLIT: designe el segundo punto sobre la MISMA cara que el primero; cayó en otra.");

    const entities = selectedEntities(context, [state.entityId]);
    if (entities.length === 0) return solidMessage(state, "MESHSPLIT: la malla designada ya no existe.");
    const entity = entities[0];
    if (entity.type !== "solid3d") return solidMessage(state, "MESHSPLIT: la entidad no es un sólido 3D.");

    const solid = entity as CadSolid3dEntity;
    const body = solid3dBody(solid);
    if (body.faces.length === 0) return solidMessage(state, "MESHSPLIT: la malla no tiene caras.");

    const pts = body.vertices.map((v: { point: { x: number; y: number; z: number } }) => ({
      x: v.point.x, y: v.point.y, z: v.point.z,
    }));
    const specs = bodyToFaceSpecs(body).map((s: { outer: number[] }) => ({ outer: [...s.outer] }));

    const result = splitMeshFace(pts, specs, state.face.index, state.point, input.point);
    if (typeof result === "string") return solidMessage(state, result);

    const newSolid = makeSolidEntity(
      context.newEntityId(),
      [{ id: "malla", op: "brep", points: result.points, faces: result.faces.map((f) => ({ outer: [...f.outer] })) }],
      "malla",
      context.activeLayer,
      solid.name,
    );

    // La malla de origen se BORRA: MESHSPLIT parte una cara de la MISMA malla,
    // no combina varias entidades en una nueva (a diferencia de MESHCAP o
    // MESHMERGE, que sí dejan sus orígenes intactos a propósito — ver la
    // cabecera de `mesh-smoothing.ts`). Insertar sin borrar dejaba DOS sólidos
    // ocupando exactamente el mismo volumen — un duplicado fantasma con el
    // mismo relleno silencioso que esta ola debía eliminar.
    return solidBatch(
      state,
      [{ type: "delete", entityId: solid.id }, { type: "insert", entity: newSolid }],
      "MESHSPLIT",
      `MESHSPLIT: la cara ${state.face.index} se dividió en dos — la malla pasó de ${specs.length} a ${result.faces.length} caras (${result.points.length} vértices).`,
    );
  },
};

export const CAD_MESH_SPLIT_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(meshsplitCommand),
];
