/**
 * MESHSMOOTH / MESHSMOOTHMORE / MESHSMOOTHLESS — el nivel de suavizado real.
 *
 * Antes de esta ola los tres (y MESHREFINE) llamaban a la misma subdivisión
 * por punto medio (`subdivideMesh` en `mesh-operations.ts`): el volumen y la
 * caja envolvente salían IDÉNTICOS, así que «suavizar» no era más que multiplicar
 * caras. Ahora usan `subdivideLoop` (`lib/cad/mesh/subdivision.ts`), que SÍ
 * mueve vértices — ver ese módulo para la matemática y por qué es Loop y no
 * Catmull-Clark literal.
 *
 * ## Por qué REEMPLAZAN la entidad en vez de insertar una nueva
 *
 * El resto de la familia (MESHCAP, MESHMERGE, CONVTOMESH…) inserta una entidad
 * nueva y deja la de origen intacta — no destructivo, a propósito. El NIVEL de
 * suavizado es distinto: es una propiedad de UNA malla que sube y baja, igual
 * que el redondeo de FILLETEDGE se edita en el panel en vez de apilar copias.
 * Pulsar MESHSMOOTH tres veces no debe dejar tres mallas en el dibujo — debe
 * dejar UNA, en su nivel 3. Por eso estos tres comandos usan `replace`
 * (`{ type: "replace", entityId: solid.id, ... }`), como FILLETEDGE/CHAMFEREDGE
 * en `solids-modify.ts`, y no `insert`.
 *
 * ## La receta que hace exacta la ida y vuelta
 *
 * `meshRecipe` no vuelve a derivar la base de la malla YA suavizada — eso
 * perdería la forma original y congelaría el nivel actual como si fuera el
 * punto de partida. Si el nodo raíz ya trae `meshSubdivision`, se reutiliza SU
 * `base`/`creases` tal cual; si no, la base es la malla explícita de hoy (nivel
 * 0 implícito). `subdivideLoop` es una función pura de (base, creases, nivel):
 * visitar el mismo nivel dos veces —subir, bajar, volver a subir— da bit a bit
 * la misma malla, sin necesidad de «deshacer» nada.
 */
import { bodyToFaceSpecs } from "../../../brep";
import type { CadEntityCommand } from "../../entity-commands";
import { solid3dBody } from "../../solid3d-build";
import {
  meshBounds,
  meshSignedVolume,
  meshSurfaceArea,
  subdivideLoop,
  type MeshCrease,
  type MeshGeometry,
} from "../../mesh/subdivision";
import type { CadSolid3dEntity, CadSolidNode } from "../../cad-entities-v5";
import {
  asCadCommand,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_SELECTION,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
} from "../command-types";
import { formatMagnitude, selectedEntities, solidBatch, solidMessage } from "./solids-support";

type MeshLevelState = { selection: readonly string[] };

export interface MeshRecipe {
  level: number;
  base: MeshGeometry;
  creases: MeshCrease[];
}

/**
 * La receta de suavizado de una entidad: la persistida en su nodo raíz, o el
 * nivel 0 implícito derivado de su malla horneada actual.
 *
 * La reexportan `mesh-crease-extrude.ts` (MESHCREASE/MESHUNCREASE la leen y la
 * vuelven a escribir con su lista de pliegues cambiada) para no duplicar esta
 * lectura.
 */
export function meshRecipe(solid: CadSolid3dEntity): MeshRecipe {
  const root = solid.nodes.find((node) => node.id === solid.root);
  if (root?.op === "brep" && root.meshSubdivision) {
    return {
      level: root.meshSubdivision.level,
      base: root.meshSubdivision.base,
      creases: root.meshSubdivision.creases,
    };
  }
  const body = solid3dBody(solid);
  const points = body.vertices.map((v: { point: { x: number; y: number; z: number } }) => ({
    x: v.point.x, y: v.point.y, z: v.point.z,
  }));
  const faces = bodyToFaceSpecs(body).map((s: { outer: number[] }) => ({ outer: [...s.outer] }));
  return { level: 0, base: { points, faces }, creases: [] };
}

/** Evalúa la receta al nivel dado y monta el nodo `brep` que la persiste. */
export function meshAtLevel(recipe: MeshRecipe): { node: CadSolidNode; evaluated: MeshGeometry } {
  const evaluated = subdivideLoop(recipe.base, recipe.creases, recipe.level);
  const node: CadSolidNode = {
    id: "malla",
    op: "brep",
    points: evaluated.points.map((p) => ({ ...p })),
    faces: evaluated.faces.map((f) => ({ outer: [...f.outer] })),
    meshSubdivision: {
      level: recipe.level,
      base: {
        points: recipe.base.points.map((p) => ({ ...p })),
        faces: recipe.base.faces.map((f) => ({ outer: [...f.outer] })),
      },
      creases: recipe.creases.map((c) => ({ ...c })),
    },
  };
  return { node, evaluated };
}

function levelNotice(label: string, level: number, evaluated: MeshGeometry): string {
  const bounds = meshBounds(evaluated.points);
  const size = `${formatMagnitude(bounds.max.x - bounds.min.x)}×${formatMagnitude(bounds.max.y - bounds.min.y)}×${formatMagnitude(bounds.max.z - bounds.min.z)}`;
  return (
    `${label}: nivel ${level} — ${evaluated.faces.length} caras, ${evaluated.points.length} vértices, ` +
    `volumen ${formatMagnitude(Math.abs(meshSignedVolume(evaluated)))} mm³, ` +
    `área ${formatMagnitude(meshSurfaceArea(evaluated))} mm², caja ${size} mm.`
  );
}

function meshLevelCommand(
  name: string,
  alias: string,
  label: string,
  delta: 1 | -1,
): CadCommandDescriptor<MeshLevelState | null> {
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
          : `Designe una malla para ${label.toLowerCase()}`,
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
      if (entity.type !== "solid3d") return solidMessage(state, `${name}: la entidad no es un sólido 3D.`);

      const solid = entity as CadSolid3dEntity;
      const body = solid3dBody(solid);
      if (body.faces.length === 0) return solidMessage(state, `${name}: la malla no tiene caras.`);

      const recipe = meshRecipe(solid);
      const nextLevel = recipe.level + delta;
      if (nextLevel < 0)
        return solidMessage(
          state,
          `${name}: la malla ya está en su nivel minimo de suavidad (${body.faces.length} caras, ${body.vertices.length} vertices).`,
        );

      const { node, evaluated } = meshAtLevel({ ...recipe, level: nextLevel });
      const next: CadSolid3dEntity = {
        ...solid,
        nodes: [node],
        root: node.id,
      };
      const commands: CadEntityCommand[] = [{ type: "replace", entityId: solid.id, entity: next }];
      return solidBatch(state, commands, name, levelNotice(label, nextLevel, evaluated));
    },
  };
}

const meshsmoothCommand = meshLevelCommand("MESHSMOOTH", "SUAVIZARMALLA", "Malla suavizada", 1);
const meshsmoothmoreCommand = meshLevelCommand("MESHSMOOTHMORE", "SUAVIZARMALLAMAS", "Malla más suave", 1);
const meshsmoothlessCommand = meshLevelCommand("MESHSMOOTHLESS", "SUAVIZARMALLAMENOS", "Malla menos suave", -1);

export const CAD_MESH_SMOOTHING_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(meshsmoothCommand),
  asCadCommand(meshsmoothmoreCommand),
  asCadCommand(meshsmoothlessCommand),
];
