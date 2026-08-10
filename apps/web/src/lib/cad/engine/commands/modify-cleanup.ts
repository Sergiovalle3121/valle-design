/**
 * OVERKILL y DRAWORDER: limpiar y apilar.
 *
 * Los dos comparten una propiedad que en un CAD no es un detalle: emiten UN
 * lote. OVERKILL que borrase trescientos duplicados en trescientas
 * transacciones dejaría a quien pulsa Ctrl+Z con doscientos noventa y nueve
 * duplicados y la sensación de haberlo deshecho; DRAWORDER que reordenase de
 * uno en uno rompería el orden relativo de lo designado en el camino.
 *
 * El algoritmo de OVERKILL vive en `lib/cad/overkill.ts` porque hay que
 * probarlo con veinte configuraciones de líneas y hacerlo a través de la
 * máquina de estados costaría veinte contextos.
 */
import type { CadEntity } from "../../cad-document";
import { planCadOverkill, type CadOverkillOptions } from "../../overkill";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_SELECTION,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

function pendingSelection<S>(state: S, message: string): CadCommandStep<S> {
  return {
    state,
    prompt: { message, options: [] },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  };
}

function message<S>(state: S, text: string): CadCommandStep<S> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text } };
}

function cancelled<S>(state: S): CadCommandStep<S> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
}

function resolve(context: CadCommandContext, ids: readonly string[]): CadEntity[] {
  return ids
    .map((entityId) => context.entity?.(entityId))
    .filter((entity): entity is CadEntity => entity !== undefined);
}

// ---------------------------------------------------------------------------
// OVERKILL
// ---------------------------------------------------------------------------

const OK_TOLERANCE = { keyword: "Tolerancia", shortcut: "T" } as const;
const OK_LAYER = { keyword: "ignorarCapa", shortcut: "C" } as const;
const OK_COMBINE = { keyword: "cOlineales", shortcut: "O" } as const;
const OK_RUN = { keyword: "Ejecutar", shortcut: "E" } as const;

interface OverkillState {
  targets: readonly string[];
  options: CadOverkillOptions;
  askingTolerance: boolean;
}

const EMPTY_OVERKILL: OverkillState = {
  targets: [],
  options: { tolerance: 1e-6, combineCollinear: true },
  askingTolerance: false,
};

function overkillOptionsStep(state: OverkillState): CadCommandStep<OverkillState> {
  if (state.askingTolerance)
    return {
      state,
      prompt: {
        message: "Tolerancia con la que dos puntos son el mismo",
        options: [],
        defaultValue: String(state.options.tolerance ?? 1e-6),
      },
      accepts: CAD_ACCEPT_DISTANCE,
    };
  return {
    state,
    prompt: {
      message:
        `${state.targets.length} objeto(s) designados. ` +
        `Tolerancia ${state.options.tolerance}; ` +
        `capa ${state.options.ignoreLayer ? "IGNORADA" : "respetada"}; ` +
        `colineales ${state.options.combineCollinear ? "se funden" : "se dejan"}`,
      options: [OK_TOLERANCE, OK_LAYER, OK_COMBINE, OK_RUN],
      defaultOption: OK_RUN.keyword,
    },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

function overkillRun(
  state: OverkillState,
  context: CadCommandContext,
): CadCommandStep<OverkillState> {
  const entities = resolve(context, state.targets);
  if (entities.length === 0) return message(state, "OVERKILL: no hay ningún objeto designado.");
  const plan = planCadOverkill(entities, state.options);
  if (plan.commands.length === 0)
    return message(
      state,
      `OVERKILL: examinados ${plan.examined} objeto(s), no hay duplicados ni tramos que fundir.`,
    );
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    // UN solo lote, y la spec lo afirma: es la diferencia entre un Ctrl+Z que
    // devuelve el dibujo y uno que devuelve el último objeto.
    result: {
      kind: "document",
      commands: plan.commands,
      label:
        `OVERKILL: ${plan.duplicatesRemoved} duplicado(s) borrado(s), ` +
        `${plan.segmentsMerged} tramo(s) fundido(s) de ${plan.examined} examinado(s)`,
    },
  };
}

const overkillCommand: CadCommandDescriptor<OverkillState> = {
  name: "OVERKILL",
  aliases: ["OV"],
  kind: "modify",
  transparent: false,
  selection: "required",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) =>
    context.selection.length > 0
      ? overkillOptionsStep({ ...EMPTY_OVERKILL, targets: context.selection })
      : pendingSelection(EMPTY_OVERKILL, "Designe los objetos que limpiar"),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cancelled(state);
    if (input.kind === "selection")
      return overkillOptionsStep({ ...state, targets: input.entityIds });
    if (input.kind === "entityPick")
      return overkillOptionsStep({ ...state, targets: [...state.targets, input.entityId] });

    if (state.askingTolerance) {
      if (input.kind === "distance")
        return overkillOptionsStep({
          ...state,
          askingTolerance: false,
          options: { ...state.options, tolerance: Math.max(0, input.value) },
        });
      return overkillOptionsStep({ ...state, askingTolerance: false });
    }

    if (input.kind === "keyword") {
      if (input.keyword === OK_TOLERANCE.keyword)
        return overkillOptionsStep({ ...state, askingTolerance: true });
      if (input.keyword === OK_LAYER.keyword)
        return overkillOptionsStep({
          ...state,
          options: { ...state.options, ignoreLayer: !state.options.ignoreLayer },
        });
      if (input.keyword === OK_COMBINE.keyword)
        return overkillOptionsStep({
          ...state,
          options: { ...state.options, combineCollinear: !state.options.combineCollinear },
        });
      return overkillRun(state, context);
    }

    if (input.kind === "enter") {
      if (state.targets.length === 0)
        return pendingSelection(state, "Designe los objetos que limpiar");
      return overkillRun(state, context);
    }
    return overkillOptionsStep(state);
  },
};

// ---------------------------------------------------------------------------
// DRAWORDER
// ---------------------------------------------------------------------------

const DO_FRONT = { keyword: "Frente", shortcut: "F" } as const;
const DO_BACK = { keyword: "fOndo", shortcut: "O" } as const;
const DO_ABOVE = { keyword: "Encima", shortcut: "E" } as const;
const DO_BELOW = { keyword: "Debajo", shortcut: "D" } as const;

type DrawOrderPlacement = "front" | "back" | "above" | "below";

interface DrawOrderState {
  targets: readonly string[];
  placement: DrawOrderPlacement | null;
}

function drawOrderPlacementStep(state: DrawOrderState): CadCommandStep<DrawOrderState> {
  return {
    state,
    prompt: {
      message: `Orden de objetos para ${state.targets.length} objeto(s)`,
      options: [DO_FRONT, DO_BACK, DO_ABOVE, DO_BELOW],
      defaultOption: DO_FRONT.keyword,
    },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

function drawOrderResult(
  state: DrawOrderState,
  placement: DrawOrderPlacement,
  referenceId: string | undefined,
): CadCommandStep<DrawOrderState> {
  const labels: Record<DrawOrderPlacement, string> = {
    front: "al frente",
    back: "al fondo",
    above: "encima del objeto de referencia",
    below: "debajo del objeto de referencia",
  };
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: {
      kind: "document",
      commands: [
        {
          type: "draw-order",
          entityIds: [...state.targets],
          placement,
          ...(referenceId ? { referenceId } : {}),
        },
      ],
      label: `DRAWORDER: ${state.targets.length} objeto(s) ${labels[placement]}`,
    },
  };
}

const drawOrderCommand: CadCommandDescriptor<DrawOrderState> = {
  name: "DRAWORDER",
  aliases: ["DR"],
  kind: "modify",
  transparent: false,
  selection: "required",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) =>
    context.selection.length > 0
      ? drawOrderPlacementStep({ targets: context.selection, placement: null })
      : pendingSelection({ targets: [], placement: null }, "Designe los objetos que reordenar"),
  step: (state, input) => {
    if (input.kind === "cancel") return cancelled(state);
    if (state.targets.length === 0) {
      if (input.kind === "selection")
        return drawOrderPlacementStep({ ...state, targets: input.entityIds });
      if (input.kind === "entityPick")
        return drawOrderPlacementStep({ ...state, targets: [input.entityId] });
      return pendingSelection(state, "Designe los objetos que reordenar");
    }

    if (state.placement === null) {
      const placement: DrawOrderPlacement =
        input.kind === "keyword" && input.keyword === DO_BACK.keyword
          ? "back"
          : input.kind === "keyword" && input.keyword === DO_ABOVE.keyword
            ? "above"
            : input.kind === "keyword" && input.keyword === DO_BELOW.keyword
              ? "below"
              : "front";
      if (placement === "front" || placement === "back")
        return drawOrderResult(state, placement, undefined);
      return {
        state: { ...state, placement },
        prompt: {
          message:
            placement === "above"
              ? "Designe el objeto de referencia: lo designado quedará ENCIMA de él"
              : "Designe el objeto de referencia: lo designado quedará DEBAJO de él",
          options: [],
        },
        accepts: CAD_ACCEPT_ENTITY_PICK,
      };
    }

    if (input.kind !== "entityPick") return cancelled(state);
    if (state.targets.includes(input.entityId))
      return message(
        state,
        "El objeto de referencia no puede estar entre los designados: nada se coloca respecto de sí mismo.",
      );
    return drawOrderResult(state, state.placement, input.entityId);
  },
};

export const CAD_MODIFY_CLEANUP_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(overkillCommand),
  asCadCommand(drawOrderCommand),
];
