/**
 * SOLIDEDIT, el subconjunto que hoy se puede hacer con honestidad.
 * (Ola C, 2026-09-02 · ampliado 2026-09-04.)
 *
 * En AutoCAD SOLIDEDIT son tres ramas —Cara, Arista y Cuerpo— con DIECISÉIS
 * operaciones: nueve de Cara (Extruir, Mover, Girar, Desfasar, Inclinar,
 * Borrar, Copiar, Color, Material), dos de Arista (Copiar, Color) y cinco de
 * Cuerpo (Estampar, Separar, Vaciar, Limpiar, Comprobar). Deshacer y Salir no
 * cuentan: son navegación y no editan nada. Esta cabecera decía «unas catorce»
 * —una aproximación de memoria— hasta que `solid3d-frontera.spec.ts` obligó a
 * enumerarlas una por una. Medido antes
 * (`distancia-autocad-completo-20260901.md`): faltaba ENTERO. Aquí entra lo que
 * el kernel y el visor ya saben hacer, y el diálogo sólo OFRECE eso:
 *
 *   - Cara · Extruir: designar una cara con el rayo de cámara (la misma
 *     designación que PRESSPULL) y empujarla una distancia. Es un nodo `push`
 *     sobre el árbol: reeditable, no horneado.
 *   - Cara · Desfasar: la misma cara, desplazada a lo largo de su normal con
 *     el signo de AutoCAD (positivo hacia fuera). También un nodo `push`, y a
 *     diferencia de Extruir está COMPLETA: la Desfasar de AutoCAD es
 *     exactamente esto, mientras que su Extruir admite además trayectoria y
 *     ángulo de inclinación, que este nodo no lleva.
 *   - Cara · Copiar: los lazos de la cara salen como una entidad REGION en
 *     coordenadas del mundo, con su `z` real. El sólido no se toca.
 *   - Arista · Copiar: las aristas del sólido designado salen como entidades
 *     `line`. Designar UNA arista suelta todavía no se puede y se dice.
 *   - Cuerpo · Comprobar: evalúa el árbol, valida los invariantes y responde
 *     con caras, aristas y volumen — o con el motivo por el que no es un
 *     sólido válido.
 *   - Cuerpo · Separar: un sólido cuya raíz es una UNIÓN de cuerpos que no se
 *     tocan se parte en un sólido por operando, cada uno con su subárbol. Si
 *     los operandos interfieren no hay nada que separar, y se dice.
 *   - Cuerpo · Limpiar: funde las caras coplanarias que una booleana dejó
 *     fragmentadas y hornea el resultado como nodo `brep`. Dice cuántas caras y
 *     cuántas aristas retira, y que la historia paramétrica se pierde. Si no
 *     hay nada que fundir, lo dice y NO toca el documento.
 *   - Cuerpo · Vaciar: deja una pared del espesor pedido. El interior entra
 *     como nodo `brep` y se resta con un nodo `subtract`, de modo que el árbol
 *     del exterior sobrevive INTACTO y el sólido se sigue editando por su rama
 *     de siempre. Sólo sobre cuerpos convexos, y la convexidad se comprueba
 *     arista por arista.
 *
 * Las operaciones se construyen en `solids-edit-branches.ts`; este módulo es
 * el DIÁLOGO —qué se pregunta, en qué orden y qué se rechaza—.
 *
 * ## Lo que sigue fuera, nombrado una por una
 *
 * El prompt de cada rama las nombra en su propio renglón, sin ofrecerlas como
 * opción: una opción que no funciona es peor que una ausencia declarada.
 *
 *   - Cara · Mover, Girar, Inclinar y Borrar: piden recomponer las caras
 *     adyacentes, y el kernel no rehace una cara movida.
 *   - Color, tanto de cara como de arista, y Material de cara: el esquema no
 *     guarda un atributo por cara ni por arista, y el color de una entidad es
 *     de la entidad entera. Son tres renglones y una sola razón.
 *   - Cuerpo · Estampar: pide imprimir una curva del dibujo sobre una cara
 *     —partirla por una arista nueva—, y esa cirugía no existe en `lib/brep/`.
 *   - La cáscara ABIERTA de Vaciar: retirar las caras designadas para que el
 *     recipiente quede sin tapa. Vaciar entra cerrado, y el prompt del espesor
 *     lo dice ahí mismo. Quitar caras pide coser el interior con el exterior
 *     por el borde del hueco: otra vez cirugía topológica, no una resta.
 *
 * Son siete operaciones distintas más un modo —ocho renglones de rama, porque
 * Color aparece en dos ramas por el mismo motivo—. Ocho de las dieciséis
 * existen; estas ocho no, y ninguna se insinúa como próxima. El recuento no es
 * decorativo: `solid3d-frontera.spec.ts` lo comprueba en los dos sentidos
 * contra este mismo prompt, así que una ausencia que se deje de nombrar —o un
 * nombre que sobreviva a su construcción— rompe el gate.
 *
 * La orden termina tras UNA operación en vez de volver al menú de la rama:
 * es el único punto en que se aparta del diálogo de AutoCAD, y se prefiere a
 * un bucle que anunciara ramas que no existen.
 */
import type { CadSolid3dEntity, CadSolidNode } from "../../cad-entities-v5";
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
import { cleanBody, copyEdges, copyFace, offsetFace, shellSolid, type SolidEditFacePick } from "./solids-edit-branches";
import { withPushedFace } from "./solids-push-face";
import { finishedSolid, formatMagnitude, selectedSolids, solidBatch, solidCancelled, solidMessage } from "./solids-support";

const FACE = { keyword: "Cara", shortcut: "C" } as const;
const EDGE = { keyword: "Arista", shortcut: "A" } as const;
const BODY = { keyword: "cUerpo", shortcut: "U" } as const;
const EXIT = { keyword: "Salir", shortcut: "S" } as const;
const EXTRUDE = { keyword: "Extruir", shortcut: "E" } as const;
const OFFSET = { keyword: "Desfasar", shortcut: "D" } as const;
const COPY = { keyword: "Copiar", shortcut: "C" } as const;
const SEPARATE = { keyword: "Separar", shortcut: "P" } as const;
const CHECK = { keyword: "Comprobar", shortcut: "C" } as const;
const CLEAN = { keyword: "Limpiar", shortcut: "L" } as const;
const SHELL = { keyword: "Vaciar", shortcut: "V" } as const;

/**
 * Los renglones que nombran lo ausente.
 *
 * Van en el MENSAJE del prompt y no en sus opciones: el analizador de entrada
 * sólo reconoce las palabras clave que el prompt ofrece, así que ofrecerlas
 * para responder «todavía no» sería fabricar una opción que no hace nada.
 * Nombrarlas en el renglón las deja visibles sin volverlas pulsables.
 */
const FACE_PROMPT = "Introduzca una opción de edición de caras; Mover, Girar, Inclinar, Borrar, Color y Material todavía no";
const EDGE_PROMPT = "Introduzca una opción de edición de aristas; Color todavía no";
const BODY_PROMPT = "Introduzca una opción de edición de cuerpos; Estampar todavía no";

/**
 * El renglón del espesor. Nombra ahí mismo el modo que NO entra: la cáscara
 * abierta de AutoCAD, la que deja el recipiente sin tapa. Va en el prompt donde
 * se pide el espesor y no en un aviso posterior, porque quien esperaba designar
 * las caras que retirar tiene que saberlo ANTES de teclear un número.
 */
const SHELL_PROMPT =
  "Precise el espesor de la pared (positivo, hacia dentro); vaciar retirando las caras designadas todavía no";

type Branch = "root" | "face" | "edge" | "body";
type Action = "none" | "extrude" | "offset" | "copyFace" | "copyEdges" | "check" | "separate" | "clean" | "shell";

export interface SolidEditState {
  branch: Branch;
  action: Action;
  selection: readonly string[];
  face: SolidEditFacePick | null;
  /**
   * La designación ya está cerrada y falta la magnitud. Sólo Vaciar la usa: es
   * la única rama de Cuerpo que pide un número DESPUÉS de designar, y sin este
   * bit el Intro que cierra la designación se confundiría con el que la ejecuta.
   */
  sized: boolean;
}

const EMPTY: SolidEditState = { branch: "root", action: "none", selection: [], face: null, sized: false };

/** Cómo se llama la cara en cada rama, para no preguntar tres veces lo mismo. */
const FACE_PICK_PROMPT: Record<string, string> = {
  extrude: "Designe la cara que extruir",
  offset: "Designe la cara que desfasar",
  copyFace: "Designe la cara que copiar",
};

/** Lo mismo en la rama de cuerpos: cada operación nombra lo que va a hacer. */
const BODY_PICK_PROMPT: Record<string, string> = {
  check: "Designe el sólido que comprobar",
  separate: "Designe el sólido que separar",
  clean: "Designe el sólido que limpiar (funde las caras coplanarias y hornea el resultado)",
  shell: "Designe el sólido que vaciar (sólo cuerpos convexos)",
};

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
        prompt: { message: FACE_PROMPT, options: [EXTRUDE, OFFSET, COPY, EXIT], defaultOption: EXIT.keyword },
        accepts: CAD_ACCEPT_KEYWORD,
      };
    if (!state.face)
      return {
        state,
        prompt: { message: FACE_PICK_PROMPT[state.action] ?? "Designe la cara", options: [] },
        accepts: CAD_ACCEPT_FACE_PICK,
      };
    return {
      state,
      prompt: {
        message:
          state.action === "offset"
            ? "Precise la distancia de desfase (positiva hacia fuera)"
            : "Precise la altura de la extrusión (negativa para hundir)",
        options: [],
      },
      accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_POINT,
    };
  }
  if (state.branch === "edge") {
    if (state.action === "none")
      return {
        state,
        prompt: { message: EDGE_PROMPT, options: [COPY, EXIT], defaultOption: EXIT.keyword },
        accepts: CAD_ACCEPT_KEYWORD,
      };
    return {
      state,
      // Se dice aquí, donde se pide, y no en un aviso posterior: el dibujante
      // que esperaba señalar UNA arista tiene que saberlo antes de designar.
      prompt: { message: "Designe el sólido cuyas aristas copiar (salen todas: el visor todavía no designa una arista suelta)", options: [] },
      accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
    };
  }
  if (state.action === "none")
    return {
      state,
      prompt: { message: BODY_PROMPT, options: [SEPARATE, SHELL, CLEAN, CHECK, EXIT], defaultOption: EXIT.keyword },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  if (state.action === "shell" && state.sized)
    return { state, prompt: { message: SHELL_PROMPT, options: [] }, accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_POINT };
  return {
    state,
    prompt: { message: BODY_PICK_PROMPT[state.action] ?? "Designe el sólido", options: [] },
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

/** El motivo, con el nombre de la rama que lo pide. */
function faceNeeded(action: Action): string {
  if (action === "offset") return "SOLIDEDIT Cara Desfasar necesita una cara designada.";
  if (action === "copyFace") return "SOLIDEDIT Cara Copiar necesita una cara designada.";
  return "SOLIDEDIT Cara Extruir necesita una cara designada.";
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
      if (input.kind === "keyword" && input.keyword === EDGE.keyword) return solidEditStep({ ...state, branch: "edge" });
      return solidEditStep(state);
    }

    if (state.branch === "face") {
      if (state.action === "none") {
        if (input.kind === "enter" || (input.kind === "keyword" && input.keyword === EXIT.keyword)) return solidCancelled(state);
        if (input.kind === "keyword" && input.keyword === EXTRUDE.keyword) return solidEditStep({ ...state, action: "extrude" });
        if (input.kind === "keyword" && input.keyword === OFFSET.keyword) return solidEditStep({ ...state, action: "offset" });
        if (input.kind === "keyword" && input.keyword === COPY.keyword) return solidEditStep({ ...state, action: "copyFace" });
        return solidEditStep(state);
      }
      if (!state.face) {
        if (input.kind === "facePick") {
          const picked: SolidEditState = { ...state, face: { entityId: input.entityId, ref: input.face } };
          // Copiar no pide distancia: la cara designada YA es toda la orden.
          return state.action === "copyFace" ? copyFace(picked, picked.face, context) : solidEditStep(picked);
        }
        if (input.kind === "enter") return solidMessage(state, faceNeeded(state.action));
        return solidEditStep(state);
      }
      if (input.kind === "distance")
        return state.action === "offset" ? offsetFace(state, state.face, input.value, context) : extrudeFace(state, input.value, context);
      if (input.kind === "point") {
        const magnitude = Math.hypot(input.point.x, input.point.y);
        return state.action === "offset" ? offsetFace(state, state.face, magnitude, context) : extrudeFace(state, magnitude, context);
      }
      return solidEditStep(state);
    }

    if (state.branch === "edge") {
      if (state.action === "none") {
        if (input.kind === "enter" || (input.kind === "keyword" && input.keyword === EXIT.keyword)) return solidCancelled(state);
        if (input.kind === "keyword" && input.keyword === COPY.keyword)
          return state.selection.length > 0
            ? copyEdges({ ...state, action: "copyEdges" }, selectedSolids(context, state.selection), context)
            : solidEditStep({ ...state, action: "copyEdges" });
        return solidEditStep(state);
      }
      if (input.kind === "selection") return solidEditStep({ ...state, selection: input.entityIds });
      if (input.kind === "entityPick") return solidEditStep({ ...state, selection: [...new Set([...state.selection, input.entityId])] });
      if (input.kind !== "enter") return solidEditStep(state);
      return copyEdges(state, selectedSolids(context, state.selection), context);
    }

    // Cuerpo
    if (state.action === "none") {
      if (input.kind === "enter" || (input.kind === "keyword" && input.keyword === EXIT.keyword)) return solidCancelled(state);
      if (input.kind === "keyword" && input.keyword === CHECK.keyword)
        return state.selection.length > 0 ? checkBody({ ...state, action: "check" }, context) : solidEditStep({ ...state, action: "check" });
      if (input.kind === "keyword" && input.keyword === SEPARATE.keyword)
        return state.selection.length > 0 ? separateBody({ ...state, action: "separate" }, context) : solidEditStep({ ...state, action: "separate" });
      if (input.kind === "keyword" && input.keyword === CLEAN.keyword)
        return state.selection.length > 0
          ? cleanBody({ ...state, action: "clean" }, selectedSolids(context, state.selection))
          : solidEditStep({ ...state, action: "clean" });
      // PICKFIRST en Vaciar no ejecuta: adelanta al espesor. Designar no es
      // toda la orden aquí, porque falta el número que decide la pared.
      if (input.kind === "keyword" && input.keyword === SHELL.keyword)
        return solidEditStep({ ...state, action: "shell", sized: state.selection.length > 0 });
      return solidEditStep(state);
    }
    if (state.action === "shell" && state.sized) {
      if (input.kind === "distance") return shellSolid(state, selectedSolids(context, state.selection), input.value);
      if (input.kind === "point")
        return shellSolid(state, selectedSolids(context, state.selection), Math.hypot(input.point.x, input.point.y));
      if (input.kind === "enter") return solidMessage(state, "SOLIDEDIT Cuerpo Vaciar necesita el espesor de la pared.");
      return solidEditStep(state);
    }
    if (input.kind === "selection") return solidEditStep({ ...state, selection: input.entityIds });
    if (input.kind === "entityPick") return solidEditStep({ ...state, selection: [...new Set([...state.selection, input.entityId])] });
    if (input.kind !== "enter") return solidEditStep(state);
    if (state.action === "shell") return solidEditStep({ ...state, sized: true });
    if (state.action === "clean") return cleanBody(state, selectedSolids(context, state.selection));
    return state.action === "check" ? checkBody(state, context) : separateBody(state, context);
  },
};

export const CAD_SOLIDEDIT_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(solidEditCommand)];

/** Para la spec: lo que Separar produce sin pasar por el diálogo. */
export const __testables = { subtree, separateBody, checkBody };
