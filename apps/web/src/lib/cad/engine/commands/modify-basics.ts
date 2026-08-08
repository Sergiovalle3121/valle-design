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
import { OFFSET_REJECTION_MESSAGE, offsetCanonicalEntity } from "../../draw-action-entities";
import type { CadNativeEntity } from "../../entity-runtime";
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
  type CadCommandStep,
} from "../command-types";

const SELECT_PROMPT = { message: "Designe objetos", options: [] } as const;

function pendingSelection<S>(state: S): CadCommandStep<S> {
  return { state, prompt: SELECT_PROMPT, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };
}

// ---------------------------------------------------------------------------
// ERASE
// ---------------------------------------------------------------------------

interface EraseState {
  targets: readonly string[];
}

function eraseResult(targets: readonly string[]): CadCommandStep<EraseState> {
  return {
    state: { targets },
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
  aliases: ["E"],
  kind: "modify",
  transparent: false,
  selection: "required",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  // Con objetos ya designados, ERASE actúa de inmediato: es lo que espera quien
  // selecciona y pulsa Supr.
  begin: (context) =>
    context.selection.length > 0
      ? eraseResult(context.selection)
      : pendingSelection({ targets: [] }),
  step: (state, input) => {
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
        { targets: context.selection, points: [], commands: [], copies: 0 },
        context,
        copy,
      ),
    step: (state, input, context) => {
      if (input.kind === "selection")
        return displaceStep({ ...state, targets: input.entityIds }, context, copy);
      if (input.kind === "entityPick")
        return displaceStep({ ...state, targets: [input.entityId] }, context, copy);
      if (input.kind === "enter") return displaceResult(state, name);
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
}

function offsetStep(state: OffsetState): CadCommandStep<OffsetState> {
  if (state.distance === null)
    return {
      state,
      prompt: { message: "Precise la distancia de desfase", options: [] },
      accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_POINT,
    };
  return {
    state,
    prompt: { message: "Designe el objeto a desplazar", options: [] },
    accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION | CAD_ACCEPT_KEYWORD,
  };
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
  begin: () => offsetStep({ distance: null, commands: [] }),
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

    const targets =
      input.kind === "entityPick"
        ? [input.entityId]
        : input.kind === "selection"
          ? input.entityIds
          : [];
    if (targets.length === 0) return offsetStep(state);

    const commands = [...state.commands];
    for (const entityId of targets) {
      const source = context.entity?.(entityId);
      if (!source)
        return {
          state,
          prompt: { message: "", options: [] },
          accepts: 0,
          result: { kind: "message", text: `La entidad ${entityId} ya no existe.` },
        };
      const offset = offsetCanonicalEntity(source, state.distance, context.newEntityId);
      // Un rechazo se cuenta tal cual: OFFSET de una elipse no es otra elipse y
      // devolver geometría aproximada en silencio cambiaría el dibujo.
      if (!offset.ok)
        return {
          state,
          prompt: { message: "", options: [] },
          accepts: 0,
          result: { kind: "message", text: OFFSET_REJECTION_MESSAGE[offset.reason] },
        };
      commands.push({ type: "insert", entity: offset.entity as CadNativeEntity });
    }
    // OFFSET también es repetitivo: se sigue designando hasta aceptar.
    return offsetStep({ ...state, commands });
  },
};

export const CAD_MODIFY_BASIC_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(eraseCommand),
  asCadCommand(makeDisplace("MOVE", ["M"], false)),
  asCadCommand(makeDisplace("COPY", ["CO", "CP"], true)),
  asCadCommand(offsetCommand),
];
