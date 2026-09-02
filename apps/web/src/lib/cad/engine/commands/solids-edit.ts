/**
 * SOLIDEDIT, el subconjunto que hoy se puede hacer con honestidad (Ola C,
 * 2026-09-02).
 *
 * En AutoCAD SOLIDEDIT son tres ramas —Cara, Arista y Cuerpo— con unas
 * catorce operaciones. Medido antes (`distancia-autocad-completo-20260901.md`):
 * faltaba ENTERO. Aquí entra lo que el kernel y el visor ya saben hacer, y el
 * diálogo sólo ANUNCIA eso:
 *
 *   - Cara · Extruir: designar una cara con el rayo de cámara (la misma
 *     designación que PRESSPULL) y empujarla una distancia. Es un nodo `push`
 *     sobre el árbol: reeditable, no horneado.
 *   - Cuerpo · Comprobar: evalúa el árbol, valida los invariantes y responde
 *     con caras, aristas y volumen — o con el motivo por el que no es un
 *     sólido válido.
 *   - Cuerpo · Separar: un sólido cuya raíz es una UNIÓN de cuerpos que no se
 *     tocan se parte en un sólido por operando, cada uno con su subárbol. Si
 *     los operandos interfieren no hay nada que separar, y se dice.
 *
 * Lo que NO se ofrece, y por qué:
 *
 *   - Cara · Mover, Girar, Desfasar, Inclinar, Borrar, Copiar y Color: piden
 *     recomponer las caras adyacentes (el kernel no rehace una cara movida)
 *     o un atributo de cara que el esquema no guarda. El prompt de la rama
 *     Cara sólo anuncia Extruir.
 *   - Arista (Copiar, Color): las aristas no se pueden designar en el visor.
 *     La rama termina con su motivo.
 *   - Cuerpo · Estampar, Vaciar (SHELL) y Limpiar: sin operación de kernel.
 *
 * La orden termina tras UNA operación en vez de volver al menú de la rama:
 * es el único punto en que se aparta del diálogo de AutoCAD, y se prefiere a
 * un bucle que anunciara ramas que no existen.
 */
import type { CadSolid3dEntity, CadSolidFaceRef, CadSolidNode } from "../../cad-entities-v5";
import type { CadEntityCommand } from "../../entity-commands";
import { booleanEpsilon, meshVolume, tessellateBody, tryBoolean } from "../../../brep";
import { evaluateSolidTree, solid3dBody, validateSolidTree } from "../../solid3d-build";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_FACE_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_SELECTION,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import { withPushedFace } from "./solids-push-face";
import { finishedSolid, formatMagnitude, selectedSolids, solidBatch, solidCancelled, solidMessage } from "./solids-support";

const FACE = { keyword: "Cara", shortcut: "C" } as const;
const EDGE = { keyword: "Arista", shortcut: "A" } as const;
const BODY = { keyword: "cUerpo", shortcut: "U" } as const;
const EXIT = { keyword: "Salir", shortcut: "S" } as const;
const EXTRUDE = { keyword: "Extruir", shortcut: "E" } as const;
const SEPARATE = { keyword: "Separar", shortcut: "P" } as const;
const CHECK = { keyword: "Comprobar", shortcut: "C" } as const;

type Branch = "root" | "face" | "body";
type Action = "none" | "extrude" | "check" | "separate";

export interface SolidEditState {
  branch: Branch;
  action: Action;
  selection: readonly string[];
  face: { entityId: string; ref: CadSolidFaceRef } | null;
}

const EMPTY: SolidEditState = { branch: "root", action: "none", selection: [], face: null };

function solidEditStep(state: SolidEditState): CadCommandStep<SolidEditState> {
  if (state.branch === "root")
    return {
      state,
      prompt: { message: "Introduzca una opción de edición de sólidos", options: [FACE, EDGE, BODY, EXIT], defaultOption: EXIT.keyword },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  if (state.branch === "face") {
    if (state.action === "none")
      return {
        state,
        prompt: { message: "Introduzca una opción de edición de caras", options: [EXTRUDE, EXIT], defaultOption: EXIT.keyword },
        accepts: CAD_ACCEPT_KEYWORD,
      };
    if (!state.face)
      return { state, prompt: { message: "Designe la cara que extruir", options: [] }, accepts: CAD_ACCEPT_FACE_PICK };
    return {
      state,
      prompt: { message: "Precise la altura de la extrusión (negativa para hundir)", options: [] },
      accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_POINT,
    };
  }
  if (state.action === "none")
    return {
      state,
      prompt: { message: "Introduzca una opción de edición de cuerpos", options: [SEPARATE, CHECK, EXIT], defaultOption: EXIT.keyword },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  return {
    state,
    prompt: { message: state.action === "check" ? "Designe el sólido que comprobar" : "Designe el sólido que separar", options: [] },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  };
}

/** Cara · Extruir: el nodo `push` de PRESSPULL, con la cara designada aquí. */
function extrudeFace(state: SolidEditState, distance: number, context: CadCommandContext): CadCommandStep<SolidEditState> {
  if (!state.face) return solidMessage(state, "SOLIDEDIT Cara Extruir necesita una cara designada.");
  if (!(Math.abs(distance) > 1e-9)) return solidMessage(state, "Una extrusión de distancia cero no cambia el sólido.");
  const entity = context.entity?.(state.face.entityId);
  if (!entity || entity.type !== "solid3d") return solidMessage(state, "La cara designada ya no pertenece a ningún sólido.");
  const pushed = withPushedFace(entity as CadSolid3dEntity, state.face.ref, distance);
  const before: CadEntityCommand[] = [{ type: "delete", entityId: entity.id }];
  return finishedSolid(pushed, { state, label: "SOLIDEDIT Cara Extruir", before });
}

/** Cuerpo · Comprobar: lo que el validador y el kernel dicen del árbol. */
function checkBody(state: SolidEditState, context: CadCommandContext): CadCommandStep<SolidEditState> {
  const solids = selectedSolids(context, state.selection);
  if (solids.length === 0) return solidMessage(state, "SOLIDEDIT Comprobar necesita un sólido designado; no hay ningún SOLID3D entre lo designado.");
  const lines: string[] = [];
  for (const solid of solids) {
    const structural = validateSolidTree(solid);
    if (structural.length > 0) {
      lines.push(`${solid.id}: NO es un sólido válido — ${structural[0].message}`);
      continue;
    }
    try {
      const body = evaluateSolidTree(solid);
      const volume = Math.abs(meshVolume(tessellateBody(body)));
      lines.push(`${solid.id}: sólido válido, ${body.faces.length} caras, ${body.edges.length} aristas, volumen ${formatMagnitude(volume)}.`);
    } catch (error) {
      lines.push(`${solid.id}: NO es un sólido válido — ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return solidMessage(state, lines.join("\n"));
}

/** Los nodos que cuelgan de `root`, en el orden original del árbol. */
function subtree(nodes: readonly CadSolidNode[], root: string): CadSolidNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const keep = new Set<string>();
  const visit = (id: string) => {
    if (keep.has(id)) return;
    const node = byId.get(id);
    if (!node) return;
    keep.add(id);
    if ("operands" in node) node.operands.forEach(visit);
    if ("operand" in node) visit(node.operand);
  };
  visit(root);
  return nodes.filter((node) => keep.has(node.id));
}

/** Cuerpo · Separar: una unión de cuerpos que no se tocan, en un sólido por operando. */
function separateBody(state: SolidEditState, context: CadCommandContext): CadCommandStep<SolidEditState> {
  const solids = selectedSolids(context, state.selection);
  if (solids.length === 0) return solidMessage(state, "SOLIDEDIT Separar necesita un sólido designado; no hay ningún SOLID3D entre lo designado.");
  const commands: CadEntityCommand[] = [];
  const notes: string[] = [];
  for (const solid of solids) {
    const root = solid.nodes.find((node) => node.id === solid.root);
    if (!root || root.op !== "union" || root.operands.length < 2) {
      notes.push(`${solid.id}: es de una sola pieza (su raíz no es una unión); no hay nada que separar.`);
      continue;
    }
    const parts = root.operands.map((operand, index) => ({
      entity: {
        ...solid,
        id: `${solid.id}:${index + 1}`,
        nodes: subtree(solid.nodes, operand),
        root: operand,
        ...(solid.name ? { name: `${solid.name} ${index + 1}` } : {}),
      } as CadSolid3dEntity,
    }));
    let touching = false;
    for (let i = 0; i < parts.length && !touching; i += 1)
      for (let j = i + 1; j < parts.length && !touching; j += 1) {
        try {
          const a = solid3dBody(parts[i].entity);
          const b = solid3dBody(parts[j].entity);
          if (tryBoolean("intersection", a, b, { tolerance: { linear: booleanEpsilon(a, b) } })) touching = true;
        } catch (error) {
          notes.push(`${solid.id}: no se pudo evaluar un operando — ${error instanceof Error ? error.message : String(error)}`);
          touching = true;
        }
      }
    if (touching) {
      notes.push(`${solid.id}: sus cuerpos se tocan o se cruzan; una unión de piezas en contacto es UN sólido y no se separa.`);
      continue;
    }
    for (const part of parts) {
      const finished = finishedSolid(part.entity, { state, label: "SOLIDEDIT Separar" });
      if (finished.result?.kind !== "document") return finished;
      commands.push(...finished.result.commands);
    }
    commands.push({ type: "delete", entityId: solid.id });
    notes.push(`${solid.id}: separado en ${parts.length} sólidos.`);
  }
  if (commands.length === 0) return solidMessage(state, notes.join("\n"));
  return solidBatch(state, commands, "SOLIDEDIT Separar");
}

const solidEditCommand: CadCommandDescriptor<SolidEditState> = {
  name: "SOLIDEDIT",
  aliases: [],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => solidEditStep({ ...EMPTY, selection: context.selection }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidCancelled(state);

    if (state.branch === "root") {
      if (input.kind === "enter" || (input.kind === "keyword" && input.keyword === EXIT.keyword)) return solidCancelled(state);
      if (input.kind === "keyword" && input.keyword === FACE.keyword) return solidEditStep({ ...state, branch: "face" });
      if (input.kind === "keyword" && input.keyword === BODY.keyword) return solidEditStep({ ...state, branch: "body" });
      if (input.kind === "keyword" && input.keyword === EDGE.keyword)
        return solidMessage(
          state,
          "SOLIDEDIT Arista (Copiar, Color) todavía no está disponible: las aristas no se pueden designar en el visor. Están Cara Extruir y Cuerpo Separar/Comprobar.",
        );
      return solidEditStep(state);
    }

    if (state.branch === "face") {
      if (state.action === "none") {
        if (input.kind === "enter" || (input.kind === "keyword" && input.keyword === EXIT.keyword)) return solidCancelled(state);
        if (input.kind === "keyword" && input.keyword === EXTRUDE.keyword) return solidEditStep({ ...state, action: "extrude" });
        return solidEditStep(state);
      }
      if (!state.face) {
        if (input.kind === "facePick") return solidEditStep({ ...state, face: { entityId: input.entityId, ref: input.face } });
        if (input.kind === "enter") return solidMessage(state, "SOLIDEDIT Cara Extruir necesita una cara designada.");
        return solidEditStep(state);
      }
      if (input.kind === "distance") return extrudeFace(state, input.value, context);
      if (input.kind === "point") return extrudeFace(state, Math.hypot(input.point.x, input.point.y), context);
      return solidEditStep(state);
    }

    // Cuerpo
    if (state.action === "none") {
      if (input.kind === "enter" || (input.kind === "keyword" && input.keyword === EXIT.keyword)) return solidCancelled(state);
      if (input.kind === "keyword" && input.keyword === CHECK.keyword)
        return state.selection.length > 0 ? checkBody({ ...state, action: "check" }, context) : solidEditStep({ ...state, action: "check" });
      if (input.kind === "keyword" && input.keyword === SEPARATE.keyword)
        return state.selection.length > 0 ? separateBody({ ...state, action: "separate" }, context) : solidEditStep({ ...state, action: "separate" });
      return solidEditStep(state);
    }
    if (input.kind === "selection") return solidEditStep({ ...state, selection: input.entityIds });
    if (input.kind === "entityPick") return solidEditStep({ ...state, selection: [...new Set([...state.selection, input.entityId])] });
    if (input.kind !== "enter") return solidEditStep(state);
    return state.action === "check" ? checkBody(state, context) : separateBody(state, context);
  },
};

export const CAD_SOLIDEDIT_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(solidEditCommand)];

/** Para la spec: lo que Separar produce sin pasar por el diálogo. */
export const __testables = { subtree, separateBody, checkBody };
