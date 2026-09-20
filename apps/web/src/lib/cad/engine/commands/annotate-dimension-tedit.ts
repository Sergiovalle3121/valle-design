/**
 * DIMTEDIT — desplaza el rótulo de una cota a lo largo de su línea de cota.
 *
 * ## Qué lo distingue de DIMEDIT
 *
 * DIMEDIT trabaja sobre VARIAS cotas a la vez y sus operaciones son de
 * fondo — «Nuevo» reescribe el texto, «Girar»/«Oblicuo» giran texto o
 * extensiones. DIMTEDIT es el gesto de todos los días con UNA cota bajo el
 * ratón: moverle el rótulo a un lado, centrarlo, devolverlo a su sitio. En
 * AutoCAD son comandos distintos por eso — el segundo es el que se repite
 * sin pensarlo mientras se acota un plano.
 *
 * ## Las cinco opciones
 *
 * `Izquierda`/`Derecha`/`Centro` escriben `textJustification` — DIMJUST del
 * esquema 10, que hasta esta ola declaraba la posición pero
 * `buildCadDimensionGeometry` no la leía; ahora sí
 * (`justifiedTextAnchor`, `associative-dimension.ts`). Las tres LIMPIAN
 * cualquier `textPosition` arrastrado a mano: elegir una justificación es
 * decir «que lo derive la geometría», no apilar un override sobre otro.
 *
 * `Ángulo` escribe `textRotationOverride` — el MISMO campo que `DIMEDIT
 * «Girar»`, porque en AutoCAD las dos órdenes tocan la misma propiedad del
 * texto.
 *
 * `Inicio` es el reinicio completo: quita `textPosition`, `textJustification`
 * y `textRotationOverride` a la vez, así que un rótulo arrastrado, justificado
 * Y girado vuelve a su sitio derivado de una sola vez. `DIMEDIT «Inicio»`
 * sólo quita `textPosition` — es una orden más vieja y más limitada, y
 * cambiar su alcance no es parte de este encargo.
 *
 * Sólo aplica a cotas LINEALES o ALINEADAS: son las únicas con una línea de
 * cota recta a lo largo de la cual «izquierda» y «derecha» signifiquen algo.
 */
import type { CadDimensionEntity } from "../../associative-dimension";
import type { CadEntity } from "../../cad-document";
import type { CadNativeEntity } from "../../entity-runtime";
import {
  CAD_ACCEPT_ANGLE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_SELECTION,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import { cadCommandCancelled, cadCommandRefused, cadCommandWrites } from "./annotate-support";
import type { CadEntityCommand } from "../../entity-commands";

const LEFT = { keyword: "Izquierda", shortcut: "Iz" } as const;
const RIGHT = { keyword: "Derecha", shortcut: "D" } as const;
const CENTER = { keyword: "Centro", shortcut: "C" } as const;
const HOME = { keyword: "Inicio", shortcut: "In" } as const;
const ANGLE = { keyword: "Ángulo", shortcut: "A" } as const;

type Operation = "left" | "right" | "center" | "home" | "angle";

function asDimension(entity: CadEntity | undefined): CadDimensionEntity | null {
  return entity?.type === "dimension" ? entity : null;
}

interface TeditState {
  mode: "ask" | "angle" | "select";
  operation: Operation;
  angle: number;
  entityIds: string[];
}

const EMPTY: TeditState = { mode: "ask", operation: "home", angle: 0, entityIds: [] };

function teditStep(state: TeditState): CadCommandStep<TeditState> {
  if (state.mode === "ask")
    return {
      state,
      prompt: {
        message: "Precise dónde va el texto de la cota",
        options: [LEFT, RIGHT, CENTER, HOME, ANGLE],
        defaultOption: HOME.keyword,
      },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  if (state.mode === "angle")
    return {
      state,
      prompt: { message: "Precise el ángulo de rotación del texto", options: [] },
      accepts: CAD_ACCEPT_ANGLE,
    };
  return {
    state,
    prompt: { message: "Designe las cotas a mover", options: [], defaultValue: "Enter para aplicar" },
    accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
  };
}

function apply(state: TeditState, context: CadCommandContext): CadCommandStep<TeditState> {
  const commands: CadEntityCommand[] = [];
  for (const entityId of state.entityIds) {
    const dimension = asDimension(context.entity?.(entityId));
    if (!dimension) continue;
    const kind = dimension.dimensionKind ?? "aligned";
    if (kind !== "linear" && kind !== "aligned") continue; // sin línea de cota recta, no hay «izquierda» que signifique algo

    if (state.operation === "home") {
      if (
        dimension.textPosition === undefined &&
        dimension.textJustification === undefined &&
        dimension.textRotationOverride === undefined
      )
        continue;
      const { textPosition: _p, textJustification: _j, textRotationOverride: _r, ...rest } = dimension;
      commands.push({ type: "replace", entityId, entity: rest as CadNativeEntity });
      continue;
    }
    if (state.operation === "angle") {
      commands.push({ type: "replace", entityId, entity: { ...dimension, textRotationOverride: state.angle } });
      continue;
    }
    const textJustification = state.operation === "left" ? "first" : state.operation === "right" ? "second" : "centered";
    const { textPosition: _dropped, ...rest } = dimension;
    commands.push({ type: "replace", entityId, entity: { ...rest, textJustification } });
  }
  if (commands.length === 0)
    return cadCommandRefused(state, "Ninguna de las cotas designadas admite ese cambio.");
  return cadCommandWrites(state, commands, "DIMTEDIT");
}

const teditCommand: CadCommandDescriptor<TeditState> = {
  name: "DIMTEDIT",
  aliases: [],
  kind: "annotate",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => teditStep({ ...EMPTY, entityIds: [...context.selection] }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);

    if (input.kind === "keyword") {
      if (input.keyword === LEFT.keyword) return teditStep({ ...state, mode: "select", operation: "left" });
      if (input.keyword === RIGHT.keyword) return teditStep({ ...state, mode: "select", operation: "right" });
      if (input.keyword === CENTER.keyword) return teditStep({ ...state, mode: "select", operation: "center" });
      if (input.keyword === HOME.keyword) return teditStep({ ...state, mode: "select", operation: "home" });
      if (input.keyword === ANGLE.keyword) return teditStep({ ...state, mode: "angle", operation: "angle" });
      return teditStep(state);
    }

    if (input.kind === "angle" && state.mode === "angle")
      return teditStep({ ...state, angle: input.degrees, mode: "select" });

    if (input.kind === "entityPick" && state.mode === "select")
      return teditStep({ ...state, entityIds: [...new Set([...state.entityIds, input.entityId])] });

    if (input.kind === "selection" && state.mode === "select")
      return teditStep({ ...state, entityIds: [...new Set([...state.entityIds, ...input.entityIds])] });

    if (input.kind === "enter") {
      if (state.mode === "ask") return teditStep({ ...state, mode: "select", operation: "home" });
      if (state.mode === "select" && state.entityIds.length > 0) return apply(state, context);
      return cadCommandCancelled(state);
    }

    return teditStep(state);
  },
};

export const CAD_DIMENSION_TEDIT_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(teditCommand)];
