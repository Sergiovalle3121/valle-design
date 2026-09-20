/**
 * MESHCREASE / MESHUNCREASE / MESHEXTRUDE.
 *
 * ## MESHCREASE — antes y ahora
 *
 * Antes «marcaba crestas» CONTANDO aristas de ángulo agudo y diciendo el
 * número — nunca escribía nada en la malla, así que un MESHSMOOTH posterior no
 * tenía ningún pliegue que respetar (`kind: "inquiry"`, `mutates: false`: ni
 * siquiera fingía mutar). Ahora designa aristas de verdad (`CAD_ACCEPT_EDGE_PICK`,
 * el mismo bit que usa FILLETEDGE) y las persiste como pliegue BINARIO —
 * plegada o no— en `meshSubdivision.creases` (`cad-entities-v5.ts`); es
 * `subdivideLoop` (`lib/cad/mesh/subdivision.ts`) quien las respeta de verdad
 * al suavizar.
 *
 * Sólo se puede plegar una malla en su NIVEL 0: el índice de una arista
 * designada es del CUERPO EVALUADO, y en el nivel 0 ese cuerpo ES la base —
 * los mismos índices que persiste `meshSubdivision.base`. En un nivel mayor el
 * cuerpo evaluado es el YA SUBDIVIDIDO, con más vértices que no corresponden a
 * los de la base, así que designar una arista ahí no significaría lo que el
 * dibujante cree. Se pide bajar primero con MESHSMOOTHLESS en vez de adivinar.
 *
 * ## MESHEXTRUDE — antes y ahora
 *
 * Antes calculaba normales por vértice y una distancia fija de 1,0 — y las
 * TIRABA: terminaba siempre en «la extrusión geométrica de mallas aún no está
 * implementada», calculase lo que calculase antes. Ahora reutiliza el MISMO
 * mecanismo que PRESSPULL sobre una cara (`withPushedFace`,
 * `solids-push-face.ts`): designar una cara (`CAD_ACCEPT_FACE_PICK`) y
 * empujarla su altura. No es una reimplementación — es el gesto de modelado
 * directo que el kernel ya sabe hacer, aplicado a una malla en vez de a un
 * sólido paramétrico.
 */
import { halfEdgeDestination } from "../../../brep";
import { solid3dBody } from "../../solid3d-build";
import { meshAtLevel, meshRecipe } from "./mesh-smoothing";
import { meshEdgeKey, type MeshCrease } from "../../mesh/subdivision";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadSolid3dEntity, CadSolidFaceRef } from "../../cad-entities-v5";
import {
  asCadCommand,
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_EDGE_PICK,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_FACE_PICK,
  CAD_ACCEPT_SELECTION,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import { finishedSolid, selectedEntities, solidBatch, solidMessage } from "./solids-support";
import { withPushedFace } from "./solids-push-face";

// ---------------------------------------------------------------------------
// MESHCREASE / MESHUNCREASE — comparten la selección y el picoteo de aristas.
// ---------------------------------------------------------------------------

type CreaseState = { selection: readonly string[]; pickedEdges: MeshCrease[] };

function creaseStep(name: string, verb: string, state: CreaseState): CadCommandStep<CreaseState | null> {
  if (state.selection.length === 0)
    return { state, prompt: { message: `Designe una malla para ${verb}`, options: [] }, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };
  const picked = state.pickedEdges.length > 0 ? ` (${state.pickedEdges.length} arista(s) designada(s))` : "";
  return {
    state,
    prompt: { message: `Designe las aristas a ${verb}, o pulse Intro${picked}`, options: [] },
    accepts: CAD_ACCEPT_EDGE_PICK,
  };
}

function pickedEdgeToCrease(solid: CadSolid3dEntity, edgeIndex: number): MeshCrease | string {
  const body = solid3dBody(solid);
  const halfEdge = body.edges[edgeIndex]?.a;
  if (halfEdge === undefined) return "la arista designada ya no existe en esta malla";
  const a = body.halfEdges[halfEdge].origin;
  const b = halfEdgeDestination(body, halfEdge);
  return { a, b };
}

/**
 * Detección automática de aristas «de ángulo agudo»: la MISMA heurística que
 * antes sólo contaba (bordes de la malla, y ángulo diedro que se desvía más
 * de 30° de plano) — ver la auditoría del 19-sep. Es lo que aplica MESHCREASE
 * cuando el dibujante no designa ninguna arista a mano.
 */
function detectSharpEdges(
  pts: readonly { x: number; y: number; z: number }[],
  faces: readonly { outer: readonly number[] }[],
): MeshCrease[] {
  const edgeFaces = new Map<string, number[]>();
  for (let fi = 0; fi < faces.length; fi++) {
    const outer = faces[fi].outer;
    for (let i = 0; i < outer.length; i++) {
      const key = meshEdgeKey(outer[i], outer[(i + 1) % outer.length]);
      const arr = edgeFaces.get(key);
      if (arr) arr.push(fi); else edgeFaces.set(key, [fi]);
    }
  }
  const faceNormals = faces.map((face) => {
    const outer = face.outer;
    if (outer.length < 3) return { x: 0, y: 0, z: 1 };
    const p0 = pts[outer[0]], p1 = pts[outer[1]], p2 = pts[outer[2]];
    const ux = p1.x - p0.x, uy = p1.y - p0.y, uz = p1.z - p0.z;
    const vx = p2.x - p0.x, vy = p2.y - p0.y, vz = p2.z - p0.z;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    return len > 1e-12 ? { x: nx / len, y: ny / len, z: nz / len } : { x: 0, y: 0, z: 1 };
  });
  const creaseThreshold = Math.cos(Math.PI / 6);
  const creases: MeshCrease[] = [];
  for (const [key, fis] of edgeFaces) {
    if (fis.length === 1) {
      const [a, b] = key.split("|").map(Number);
      creases.push({ a, b });
      continue;
    }
    if (fis.length === 2) {
      const n1 = faceNormals[fis[0]], n2 = faceNormals[fis[1]];
      const dot = n1.x * n2.x + n1.y * n2.y + n1.z * n2.z;
      if (Math.abs(dot) < creaseThreshold) {
        const [a, b] = key.split("|").map(Number);
        creases.push({ a, b });
      }
    }
  }
  return creases;
}

/** Común a MESHCREASE y MESHUNCREASE: exige nivel 0 para poder fiarse de los índices. */
function requireBaseLevel(name: string, solid: CadSolid3dEntity): string | null {
  const recipe = meshRecipe(solid);
  if (recipe.level !== 0)
    return (
      `${name}: la malla está en el nivel de suavizado ${recipe.level}; baje primero al nivel 0 con ` +
      `MESHSMOOTHLESS — los índices de arista sólo corresponden a la malla base.`
    );
  return null;
}

const meshcreaseCommand: CadCommandDescriptor<CreaseState | null> = {
  name: "MESHCREASE",
  aliases: ["CRESTAMALLA"],
  // `manage`, no `modify`: a nivel 0 —el único nivel en el que se puede
  // designar una arista, ver `requireBaseLevel`— marcar un pliegue no cambia
  // ni un vértice de la malla EVALUADA; sólo escribe la receta que un
  // suavizado FUTURO va a respetar. Es la misma razón por la que GROUP es
  // `manage` y no `modify`: escribe datos del documento —aquí,
  // `meshSubdivision.creases`— sin dibujar nada todavía. El botón sigue en el
  // panel «Mallas» igual que siempre: `ribbon.ts` lo coloca por el NOMBRE del
  // comando (`/^MESH[A-Z]+$/`), no por `kind`.
  kind: "manage",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => creaseStep("MESHCREASE", "marcar cresta", { selection: context.selection, pickedEdges: [] }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidMessage(state, "MESHCREASE cancelado.");
    const current: CreaseState = state ?? { selection: [], pickedEdges: [] };
    if (input.kind === "selection") return creaseStep("MESHCREASE", "marcar cresta", { selection: input.entityIds, pickedEdges: [] });
    if (input.kind === "entityPick")
      return creaseStep("MESHCREASE", "marcar cresta", { selection: [...new Set([...current.selection, input.entityId])], pickedEdges: [] });

    if (current.selection.length === 0)
      return { state: current, prompt: { message: "Designe una malla para marcar cresta", options: [] }, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };

    const entities = selectedEntities(context, current.selection);
    const entity = entities[0];
    if (!entity || entity.type !== "solid3d") return solidMessage(current, "MESHCREASE: la entidad no es un sólido 3D.");
    const solid = entity as CadSolid3dEntity;

    if (input.kind === "edgePick") {
      if (input.entityId !== solid.id) return creaseStep("MESHCREASE", "marcar cresta", current);
      const levelIssue = requireBaseLevel("MESHCREASE", solid);
      if (levelIssue) return solidMessage(current, levelIssue);
      const crease = pickedEdgeToCrease(solid, input.edge);
      if (typeof crease === "string") return solidMessage(current, `MESHCREASE: ${crease}.`);
      return creaseStep("MESHCREASE", "marcar cresta", { ...current, pickedEdges: [...current.pickedEdges, crease] });
    }

    if (input.kind !== "enter" && input.kind !== "text") return creaseStep("MESHCREASE", "marcar cresta", current);

    const levelIssue = requireBaseLevel("MESHCREASE", solid);
    if (levelIssue) return solidMessage(current, levelIssue);
    const recipe = meshRecipe(solid);

    // Sin aristas designadas: la MISMA detección que antes sólo contaba —
    // bordes y ángulos de más de 30°— pero ahora se PERSISTE de verdad.
    let picked = current.pickedEdges;
    let auto = false;
    if (picked.length === 0) {
      picked = detectSharpEdges(recipe.base.points, recipe.base.faces);
      auto = true;
      if (picked.length === 0)
        return solidMessage(
          current,
          "MESHCREASE: no se encontraron bordes ni aristas de ángulo agudo (>30°) que plegar automáticamente; designe alguna arista a mano.",
        );
    }

    const existingKeys = new Set(recipe.creases.map((c) => meshEdgeKey(c.a, c.b)));
    const merged = [...recipe.creases];
    for (const c of picked) {
      const key = meshEdgeKey(c.a, c.b);
      if (!existingKeys.has(key)) { existingKeys.add(key); merged.push(c); }
    }
    if (merged.length === recipe.creases.length)
      return solidMessage(current, "MESHCREASE: las aristas designadas ya estaban plegadas; no hay nada nuevo que marcar.");

    const { node, evaluated } = meshAtLevel({ level: recipe.level, base: recipe.base, creases: merged });
    const next: CadSolid3dEntity = { ...solid, nodes: [node], root: node.id };
    const commands: CadEntityCommand[] = [{ type: "replace", entityId: solid.id, entity: next }];
    const origin = auto ? `${picked.length} arista(s) detectada(s) automáticamente (bordes y ángulos > 30°)` : `${picked.length} arista(s) designada(s)`;
    return solidBatch(
      current,
      commands,
      "MESHCREASE",
      `MESHCREASE: ${origin} — ${merged.length} pliegue(s) en total (${evaluated.faces.length} caras).`,
    );
  },
};

const meshuncreaseCommand: CadCommandDescriptor<CreaseState | null> = {
  name: "MESHUNCREASE",
  aliases: ["QUITARCRESTA"],
  // `manage` por la misma razón que MESHCREASE: en nivel 0 quitar un pliegue
  // tampoco mueve un vértice — sólo en un nivel ya suavizado se ve redondear
  // (medido en `mesh-crease-extrude.spec.ts`).
  kind: "manage",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => creaseStep("MESHUNCREASE", "quitar cresta", { selection: context.selection, pickedEdges: [] }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidMessage(state, "MESHUNCREASE cancelado.");
    const current: CreaseState = state ?? { selection: [], pickedEdges: [] };
    if (input.kind === "selection") return creaseStep("MESHUNCREASE", "quitar cresta", { selection: input.entityIds, pickedEdges: [] });
    if (input.kind === "entityPick")
      return creaseStep("MESHUNCREASE", "quitar cresta", { selection: [...new Set([...current.selection, input.entityId])], pickedEdges: [] });

    if (current.selection.length === 0)
      return { state: current, prompt: { message: "Designe una malla para quitar cresta", options: [] }, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };

    const entities = selectedEntities(context, current.selection);
    const entity = entities[0];
    if (!entity || entity.type !== "solid3d") return solidMessage(current, "MESHUNCREASE: la entidad no es un sólido 3D.");
    const solid = entity as CadSolid3dEntity;

    if (input.kind === "edgePick") {
      if (input.entityId !== solid.id) return creaseStep("MESHUNCREASE", "quitar cresta", current);
      const levelIssue = requireBaseLevel("MESHUNCREASE", solid);
      if (levelIssue) return solidMessage(current, levelIssue);
      const crease = pickedEdgeToCrease(solid, input.edge);
      if (typeof crease === "string") return solidMessage(current, `MESHUNCREASE: ${crease}.`);
      return creaseStep("MESHUNCREASE", "quitar cresta", { ...current, pickedEdges: [...current.pickedEdges, crease] });
    }

    if (input.kind !== "enter" && input.kind !== "text") return creaseStep("MESHUNCREASE", "quitar cresta", current);

    const recipe = meshRecipe(solid);
    if (recipe.creases.length === 0) return solidMessage(current, "MESHUNCREASE: la malla no tiene ningún pliegue que quitar.");

    // Sin aristas designadas: quitar TODOS los pliegues (no exige nivel 0 —
    // no hay ningún índice que interpretar, sólo se vacía la lista y se
    // vuelve a evaluar el MISMO nivel: las aristas que estaban a pico se
    // redondean).
    let remaining: MeshCrease[];
    let removedCount: number;
    if (current.pickedEdges.length === 0) {
      removedCount = recipe.creases.length;
      remaining = [];
    } else {
      const levelIssue = requireBaseLevel("MESHUNCREASE", solid);
      if (levelIssue) return solidMessage(current, levelIssue);
      const toRemove = new Set(current.pickedEdges.map((c) => meshEdgeKey(c.a, c.b)));
      remaining = recipe.creases.filter((c) => !toRemove.has(meshEdgeKey(c.a, c.b)));
      removedCount = recipe.creases.length - remaining.length;
      if (removedCount === 0) return solidMessage(current, "MESHUNCREASE: ninguna de las aristas designadas tenía pliegue.");
    }

    const { node, evaluated } = meshAtLevel({ level: recipe.level, base: recipe.base, creases: remaining });
    const next: CadSolid3dEntity = { ...solid, nodes: [node], root: node.id };
    const commands: CadEntityCommand[] = [{ type: "replace", entityId: solid.id, entity: next }];
    return solidBatch(
      current,
      commands,
      "MESHUNCREASE",
      `MESHUNCREASE: ${removedCount} pliegue(s) quitado(s) — quedan ${remaining.length}; la malla se redondea en su nivel ${recipe.level} (${evaluated.faces.length} caras).`,
    );
  },
};

// ---------------------------------------------------------------------------
// MESHEXTRUDE — empujar una cara de la malla, igual que PRESSPULL.
// ---------------------------------------------------------------------------

type ExtrudeFaceState = { entityId: string | null; face: CadSolidFaceRef | null };

const EMPTY_EXTRUDE_FACE: ExtrudeFaceState = { entityId: null, face: null };

function extrudeFaceStep(state: ExtrudeFaceState): CadCommandStep<ExtrudeFaceState> {
  if (!state.face)
    return { state, prompt: { message: "Designe la cara de la malla a extruir", options: [] }, accepts: CAD_ACCEPT_FACE_PICK };
  return { state, prompt: { message: "Precise la altura de la extrusión", options: [] }, accepts: CAD_ACCEPT_DISTANCE };
}

const meshextrudeCommand: CadCommandDescriptor<ExtrudeFaceState> = {
  name: "MESHEXTRUDE",
  aliases: ["EXTRUIRMALLA"],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: () => extrudeFaceStep(EMPTY_EXTRUDE_FACE),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidMessage(state, "MESHEXTRUDE cancelado.");
    if (input.kind === "facePick")
      return extrudeFaceStep({ entityId: input.entityId, face: input.face });
    if (input.kind !== "distance") return extrudeFaceStep(state);

    if (!state.entityId || !state.face) return solidMessage(state, "MESHEXTRUDE necesita una cara designada.");
    if (!(Math.abs(input.value) > 1e-9)) return solidMessage(state, "MESHEXTRUDE: la altura no puede ser cero.");

    const entity = context.entity?.(state.entityId);
    if (!entity || entity.type !== "solid3d") return solidMessage(state, "MESHEXTRUDE: la cara designada ya no pertenece a ninguna malla.");

    const pushed = withPushedFace(entity as CadSolid3dEntity, state.face, input.value);
    const before: CadEntityCommand[] = [{ type: "delete", entityId: entity.id }];
    return finishedSolid(pushed, { state, label: "MESHEXTRUDE", before });
  },
};

export const CAD_MESH_CREASE_EXTRUDE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(meshcreaseCommand),
  asCadCommand(meshuncreaseCommand),
  asCadCommand(meshextrudeCommand),
];
