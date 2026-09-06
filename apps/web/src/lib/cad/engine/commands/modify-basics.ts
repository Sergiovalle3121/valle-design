/**
 * ERASE, MOVE, COPY y OFFSET como descriptores del motor.
 *
 * Completan la sustitución del reductor de siete comandos. Los cuatro comparten
 * un rasgo que el reductor anterior no tenía: **respetan la selección previa**.
 * En un CAD se seleccionan objetos y luego se dice qué hacer con ellos, o se
 * dice el comando y él pide los objetos. Ambos caminos llevan al mismo sitio, y
 * ese es el comportamiento que un dibujante da por hecho.
 *
 * COPY es múltiple por defecto, como en AutoCAD: tras el primer destino sigue
 * pidiendo más hasta que se pulsa Enter, porque copiar una vez sola es el caso
 * raro.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import { OFFSET_REJECTION_MESSAGE, offsetCanonicalEntity, offsetSideSign } from "../../draw-action-entities";
import type { CadNativeEntity } from "../../entity-runtime";
import {
  CAD_DESIGNATE_IDLE,
  CAD_SELECT_KEYWORD_OPTIONS,
  cadDesignateStep,
  type CadDesignatePickState,
} from "../../selection/selection-keywords";
import { CAD_BATCH_CONFIRM_NO, CAD_BATCH_CONFIRM_YES, cadBatchConfirmationPrompt } from "./batch-limits";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_SELECTION,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandInput,
  type CadCommandStep,
} from "../command-types";

/**
 * Un prompt «Designe objetos» que acepta las diez palabras clave de T-21
 * (Todo, Previo, Último, Ventana, Captura, Valla, Vpolígono, Cpolígono,
 * Borrar, Añadir), no sólo el ratón. Antes de este arreglo el prompt
 * compartido era `{ message: "Designe objetos", options: [] }` a secas: sin
 * `CAD_ACCEPT_KEYWORD`, ninguna de las diez llegaba siquiera a intentarse.
 */
const SELECT_PROMPT = { message: "Designe objetos", options: CAD_SELECT_KEYWORD_OPTIONS } as const;
const SELECT_ACCEPTS = CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_KEYWORD;

function pendingSelection<S>(state: S): CadCommandStep<S> {
  return { state, prompt: SELECT_PROMPT, accepts: SELECT_ACCEPTS };
}

/**
 * Intenta resolver `input` como designación por palabra clave sobre
 * `(targets, pick, removing)`. Si `cadDesignateStep` la resuelve, reconstruye
 * el estado propio del comando (`EraseState`, `DisplaceState`…) con los tres
 * campos actualizados y el resto intacto; si devuelve `null`, la entrada no
 * es de aquí y el llamador sigue con su propia lógica de siempre —incluida
 * la de terminar de inmediato ante un `selection`/`entityPick` crudo del
 * ratón, que T-21 no toca—.
 */
function tryDesignateKeyword<
  S extends { targets: readonly string[]; pick: CadDesignatePickState; removing: boolean },
>(state: S, input: CadCommandInput, context: CadCommandContext): CadCommandStep<S> | null {
  const outcome = cadDesignateStep(state.targets, state.pick, state.removing, input, context, "Designe objetos");
  if (!outcome) return null;
  return {
    state: { ...state, targets: outcome.targets, pick: outcome.pick, removing: outcome.removing },
    prompt: outcome.prompt,
    accepts: outcome.accepts,
  };
}

// ---------------------------------------------------------------------------
// ERASE
// ---------------------------------------------------------------------------

interface EraseState {
  targets: readonly string[];
  /** Ventana/captura/valla/polígono a medio reunir (T-21). */
  pick: CadDesignatePickState;
  /** «Borrar» quita de `targets` en vez de sumar; «Añadir» lo devuelve a sumar. */
  removing: boolean;
}

const ERASE_IDLE_STATE: EraseState = { targets: [], pick: CAD_DESIGNATE_IDLE, removing: false };

function eraseResult(targets: readonly string[]): CadCommandStep<EraseState> {
  return {
    state: { ...ERASE_IDLE_STATE, targets },
    prompt: { message: "", options: [] },
    accepts: 0,
    result:
      targets.length > 0
        ? {
            kind: "document",
            commands: targets.map((entityId): CadEntityCommand => ({ type: "delete", entityId })),
            label: "ERASE",
          }
        : { kind: "none" },
  };
}

const eraseCommand: CadCommandDescriptor<EraseState> = {
  name: "ERASE",
  aliases: ["E", "BORRAR"],
  kind: "modify",
  transparent: false,
  selection: "required",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  // Con objetos ya designados, ERASE actúa de inmediato: es lo que espera quien
  // selecciona y pulsa Supr.
  begin: (context) =>
    context.selection.length > 0 ? eraseResult(context.selection) : pendingSelection(ERASE_IDLE_STATE),
  step: (state, input, context) => {
    const byKeyword = tryDesignateKeyword(state, input, context);
    if (byKeyword) return byKeyword;
    if (input.kind === "selection") return eraseResult(input.entityIds);
    if (input.kind === "entityPick") return eraseResult([input.entityId]);
    if (input.kind === "enter") return eraseResult(state.targets);
    return pendingSelection(state);
  },
};

// ---------------------------------------------------------------------------
// MOVE y COPY comparten el recorrido base → destino
// ---------------------------------------------------------------------------

interface DisplaceState {
  targets: readonly string[];
  /** El motor lee `points` para `@relativo` y para la entrada directa. */
  points: CadPoint2[];
  commands: CadEntityCommand[];
  copies: number;
  /** Ventana/captura/valla/polígono a medio reunir (T-21). */
  pick: CadDesignatePickState;
  /** «Borrar» quita de `targets` en vez de sumar; «Añadir» lo devuelve a sumar. */
  removing: boolean;
  /** El lote ya calculado, esperando el «¿Continuar?» del techo (T-24·1, sólo COPY). */
  pendingConfirm: { commands: CadEntityCommand[]; message: string } | null;
}

function displaceStep(
  state: DisplaceState,
  context: CadCommandContext,
  copy: boolean,
): CadCommandStep<DisplaceState> {
  if (state.targets.length === 0) return pendingSelection(state);
  if (state.points.length === 0)
    return {
      state,
      prompt: { message: "Precise el punto base", options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  return {
    state,
    prompt: {
      message: copy && state.copies > 0 ? "Precise el punto de destino siguiente" : "Precise el segundo punto",
      options: [],
    },
    accepts: CAD_ACCEPT_POINT,
    preview: context.cursor ? [{ points: [state.points[0], context.cursor] }] : [],
  };
}

function displaceResult(state: DisplaceState, label: string): CadCommandStep<DisplaceState> {
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result:
      state.commands.length > 0
        ? { kind: "document", commands: state.commands, label }
        : { kind: "none" },
  };
}

/**
 * Cierre de COPY (T-24·1): por encima del techo del contrato, pregunta antes
 * de escribir. MOVE no pasa por aquí — no crea entidades, no tiene techo que
 * defender.
 */
function displaceResultWithConfirmation(
  state: DisplaceState,
  label: string,
  context: CadCommandContext,
): CadCommandStep<DisplaceState> {
  const created = state.commands.filter((command) => command.type === "copy").length;
  const confirmation = cadBatchConfirmationPrompt(context.entityIds.length, created);
  if (!confirmation) return displaceResult(state, label);
  return {
    state: { ...state, pendingConfirm: { commands: state.commands, message: confirmation } },
    prompt: {
      message: confirmation,
      options: [CAD_BATCH_CONFIRM_YES, CAD_BATCH_CONFIRM_NO],
      defaultOption: CAD_BATCH_CONFIRM_NO.keyword,
    },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

function makeDisplace(
  name: "MOVE" | "COPY",
  aliases: readonly string[],
  copy: boolean,
): CadCommandDescriptor<DisplaceState> {
  return {
    name,
    aliases,
    kind: "modify",
    transparent: false,
    selection: "required",
    repeatable: true,
    mutates: true,
    cursor: "pick",
    begin: (context) =>
      displaceStep(
        {
          targets: context.selection,
          points: [],
          commands: [],
          copies: 0,
          pick: CAD_DESIGNATE_IDLE,
          removing: false,
          pendingConfirm: null,
        },
        context,
        copy,
      ),
    step: (state, input, context) => {
      if (state.pendingConfirm) {
        if (input.kind === "keyword" && input.keyword === CAD_BATCH_CONFIRM_YES.keyword)
          return displaceResult({ ...state, commands: state.pendingConfirm.commands }, name);
        return {
          state,
          prompt: { message: "", options: [] },
          accepts: 0,
          result: { kind: "message", text: `${name} cancelado: por encima del límite, hacía falta confirmar.` },
        };
      }
      // Sólo mientras aún no hay punto base: una vez que MOVE/COPY empezó a
      // pedir puntos de destino, «Ventana»/«Borrar»/etc ya no tienen prompt
      // donde vivir — el paso pertenece al desplazamiento, no a la designación.
      if (state.points.length === 0) {
        const byKeyword = tryDesignateKeyword(state, input, context);
        if (byKeyword) return byKeyword;
      }
      if (input.kind === "selection")
        return displaceStep({ ...state, targets: input.entityIds }, context, copy);
      if (input.kind === "entityPick")
        return displaceStep({ ...state, targets: [input.entityId] }, context, copy);
      if (input.kind === "enter") {
        // Enter con designación ya reunida (por teclado o por T-21) y AÚN sin
        // punto base: confirma el lote y avanza a pedirlo, en vez de abortar
        // el comando con un lote vacío — es lo que hace AutoCAD tras designar.
        if (state.points.length === 0 && state.targets.length > 0)
          return displaceStep(state, context, copy);
        return copy ? displaceResultWithConfirmation(state, name, context) : displaceResult(state, name);
      }
      if (input.kind !== "point") return displaceStep(state, context, copy);

      if (state.points.length === 0)
        return displaceStep({ ...state, points: [input.point] }, context, copy);

      const base = state.points[0];
      const offset = { x: input.point.x - base.x, y: input.point.y - base.y };
      if (copy) {
        const commands: CadEntityCommand[] = state.targets.map((entityId) => ({
          type: "copy",
          entityId,
          newEntityId: context.newEntityId(),
          offset,
        }));
        // COPY sigue vivo: se pide otro destino hasta que el usuario acepte.
        return displaceStep(
          {
            ...state,
            points: [base],
            commands: [...state.commands, ...commands],
            copies: state.copies + 1,
          },
          context,
          copy,
        );
      }
      return displaceResult(
        {
          ...state,
          points: [base, input.point],
          commands: state.targets.map((entityId) => ({
            type: "transform",
            entityId,
            transform: { translation: offset },
          })),
        },
        name,
      );
    },
  };
}

// ---------------------------------------------------------------------------
// OFFSET
// ---------------------------------------------------------------------------

interface OffsetState {
  distance: number | null;
  commands: CadEntityCommand[];
  /**
   * Objeto ya designado, esperando el punto que dice de qué LADO se
   * desplaza (T-23). Antes el signo de `distance` decidía el lado a ciegas
   * —adivinar la perpendicular de una polilínea de diecisiete vértices—;
   * ahora lo decide un punto real, como en AutoCAD.
   */
  pendingTarget: string | null;
}

function offsetStep(state: OffsetState): CadCommandStep<OffsetState> {
  if (state.distance === null)
    return {
      state,
      prompt: { message: "Precise la distancia de desfase", options: [] },
      accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_POINT,
    };
  if (state.pendingTarget !== null)
    return {
      state,
      prompt: { message: "Precise punto en lado de desplazamiento", options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  return {
    state,
    prompt: { message: "Designe el objeto a desplazar", options: [] },
    accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION | CAD_ACCEPT_KEYWORD,
  };
}

function offsetApply(
  state: OffsetState,
  entityId: string,
  distance: number,
  context: CadCommandContext,
): CadCommandStep<OffsetState> {
  const source = context.entity?.(entityId);
  if (!source)
    return {
      state: { ...state, pendingTarget: null },
      prompt: { message: "", options: [] },
      accepts: 0,
      result: { kind: "message", text: `La entidad ${entityId} ya no existe.` },
    };
  const offset = offsetCanonicalEntity(source, distance, context.newEntityId);
  // Un rechazo se cuenta tal cual: OFFSET de una elipse no es otra elipse y
  // devolver geometría aproximada en silencio cambiaría el dibujo.
  if (!offset.ok)
    return {
      state: { ...state, pendingTarget: null },
      prompt: { message: "", options: [] },
      accepts: 0,
      result: { kind: "message", text: OFFSET_REJECTION_MESSAGE[offset.reason] },
    };
  // OFFSET también es repetitivo: se sigue designando hasta aceptar.
  return offsetStep({
    ...state,
    pendingTarget: null,
    commands: [...state.commands, { type: "insert", entity: offset.entity as CadNativeEntity }],
  });
}

const offsetCommand: CadCommandDescriptor<OffsetState> = {
  name: "OFFSET",
  aliases: ["O"],
  kind: "modify",
  transparent: false,
  selection: "command-first",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: () => offsetStep({ distance: null, commands: [], pendingTarget: null }),
  step: (state, input, context) => {
    if (input.kind === "enter")
      return {
        state,
        prompt: { message: "", options: [] },
        accepts: 0,
        result:
          state.commands.length > 0
            ? { kind: "document", commands: state.commands, label: "OFFSET" }
            : { kind: "none" },
      };

    if (state.distance === null) {
      if (input.kind === "distance") return offsetStep({ ...state, distance: input.value });
      return offsetStep(state);
    }

    if (state.pendingTarget !== null) {
      if (input.kind !== "point") return offsetStep(state);
      const source = context.entity?.(state.pendingTarget);
      // Sin lado que reconocer —una elipse, una spline— se conserva el signo
      // TECLEADO: `offsetCanonicalEntity` rechaza esos tipos de todos modos
      // con su motivo, así que no hace falta una segunda pregunta para
      // llegar al mismo rechazo.
      const sign = source ? offsetSideSign(source, input.point) : null;
      const distance = (sign ?? (Math.sign(state.distance) || 1)) * Math.abs(state.distance);
      return offsetApply(state, state.pendingTarget, distance, context);
    }

    const targets =
      input.kind === "entityPick"
        ? [input.entityId]
        : input.kind === "selection"
          ? input.entityIds
          : [];
    if (targets.length === 0) return offsetStep(state);
    // Un objeto por turno: el LADO se pincha objeto por objeto, así que una
    // selección múltiple sólo toma el primero — el resto se sigue
    // designando en la próxima vuelta del bucle, como ya hacía antes con el
    // signo tecleado.
    return offsetStep({ ...state, pendingTarget: targets[0] });
  },
};

export const CAD_MODIFY_BASIC_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(eraseCommand),
  asCadCommand(makeDisplace("MOVE", ["M"], false)),
  asCadCommand(makeDisplace("COPY", ["CO", "CP"], true)),
  asCadCommand(offsetCommand),
];
