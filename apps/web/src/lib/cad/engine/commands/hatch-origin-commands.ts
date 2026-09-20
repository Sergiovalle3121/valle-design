/**
 * HATCHORIGIN: el origen del patrón de sombreado, expuesto al fin como orden.
 *
 * El esquema y el generador de trazos (`hatch-pattern-strokes.ts`) YA
 * calculan cada familia de líneas desde `entity.origin` — «la fase de los
 * trazos se calcula desde el origen de la familia», dice su propio
 * comentario — pero hasta hoy ningún comando dejaba TOCARLO: un HATCH nacía
 * siempre en (0,0) y ahí se quedaba. Es la misma clase de hueco que
 * `ANNOSCALE`: el motor sabía hacerlo, nadie se lo pedía.
 *
 * ## Por qué importa para que dos sombreados «queden en fase»
 *
 * Dos HATCH con el MISMO patrón, ángulo, escala y origen dibujan sus líneas
 * de barrido sobre las MISMAS rectas del plano — lo garantiza la fórmula de
 * `cadHatchPatternStrokes` (`familyOrigin = origin + normal·perp`), no algo
 * que dependa de qué contorno rellenan. Cuando dos regiones vecinas de una
 * misma trama (un suelo partido en dos LWPOLYLINE, por ejemplo) tienen
 * orígenes DISTINTOS, sus rayas quedan a destiempo aunque el patrón sea
 * idéntico — la costura entre ambas se ve. `HATCHORIGIN` iguala el origen de
 * los sombreados designados a un mismo punto para que no vuelva a pasar.
 *
 * ## Alcance de esta orden, con precisión
 *
 * Reescribe `origin` de cada HATCH designado — vía `originX`/`originY`, las
 * claves PLANAS que `hatch-entity-adapter.ts` sabe escribir; un
 * `patch.origin` anidado no las alcanzaría, exactamente el desliz que
 * `properties.write` de COTA comete con `extensionGap` y que aquí no se
 * repite. No recalcula la geometría del contorno ni el asociativo — eso ya
 * lo hace `regenerateAssociativeHatches` en el siguiente lote si el contorno
 * se mueve.
 */
import type { CadEntityCommand } from "../../entity-commands";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_SELECTION,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
  type CadKeyword,
} from "../command-types";

const DEFAULT_ORIGIN_OPTION: CadKeyword = { keyword: "Predeterminado", shortcut: "P" };

type HatchOriginPhase = "select" | "origin";

interface HatchOriginState {
  phase: HatchOriginPhase;
  targets: readonly string[];
}
const IDLE: HatchOriginState = { phase: "select", targets: [] };

const SELECT_PROMPT = { message: "Designe los HATCH cuyo origen se iguala", options: [] };
const SELECT_ACCEPTS = CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK;

function selectStep(state: HatchOriginState): CadCommandStep<HatchOriginState> {
  return { state: { ...state, phase: "select" }, prompt: SELECT_PROMPT, accepts: SELECT_ACCEPTS };
}

function originStep(state: HatchOriginState): CadCommandStep<HatchOriginState> {
  return {
    state: { ...state, phase: "origin" },
    prompt: {
      message: "Nuevo punto de origen del patrón",
      options: [DEFAULT_ORIGIN_OPTION],
    },
    accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
  };
}

function finish(
  targets: readonly string[],
  origin: { x: number; y: number },
  context: CadCommandContext,
): CadCommandStep<HatchOriginState> {
  const commands: CadEntityCommand[] = [];
  const skipped: string[] = [];
  for (const id of targets) {
    const entity = context.entity?.(id);
    if (!entity || entity.type !== "hatch") {
      skipped.push(id);
      continue;
    }
    commands.push({
      type: "properties",
      entityId: id,
      patch: { originX: origin.x, originY: origin.y },
    });
  }
  const empty = { state: IDLE, prompt: { message: "", options: [] }, accepts: 0 } as const;
  if (commands.length === 0)
    return {
      ...empty,
      result: { kind: "message", text: "HATCHORIGIN: los objetos designados no son un HATCH." },
    };
  const suffix = skipped.length > 0 ? ` (${skipped.length} designado(s) ignorado(s): no son HATCH)` : "";
  return {
    ...empty,
    result: {
      kind: "document",
      commands,
      label: "HATCHORIGIN",
      notice: `HATCHORIGIN: origen fijado en (${origin.x}, ${origin.y}) para ${commands.length} sombreado(s)${suffix}.`,
    },
  };
}

const hatchOriginCommand: CadCommandDescriptor<HatchOriginState> = {
  name: "HATCHORIGIN",
  aliases: ["ORIGENSOMBREADO"],
  kind: "annotate",
  transparent: false,
  selection: "required",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) =>
    context.selection.length > 0
      ? originStep({ phase: "select", targets: context.selection })
      : selectStep(IDLE),
  step: (state, input, context) => {
    if (input.kind === "cancel") return { state: IDLE, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };

    if (state.phase === "select") {
      // Una selección por ventana llega COMPLETA en un solo input: no hace
      // falta Intro para confirmarla. Un clic por objeto (`entityPick`) va
      // ACUMULANDO uno a uno — por eso el fase se queda en «select» y no en
      // `targets.length === 0`, que sólo era cierto en el PRIMER clic y
      // perdía cualquier clic siguiente en cuanto `targets` dejaba de estar
      // vacío. Sólo Intro con algo ya designado cierra la selección.
      if (input.kind === "selection") return originStep({ ...state, targets: input.entityIds });
      if (input.kind === "entityPick") return selectStep({ ...state, targets: [...state.targets, input.entityId] });
      if (input.kind === "enter" && state.targets.length > 0) return originStep(state);
      return selectStep(state);
    }

    if (input.kind === "point") return finish(state.targets, input.point, context);
    if (input.kind === "keyword") {
      const word = input.keyword.trim().toUpperCase();
      if (word === DEFAULT_ORIGIN_OPTION.keyword.toUpperCase() || word === DEFAULT_ORIGIN_OPTION.shortcut.toUpperCase())
        return finish(state.targets, { x: 0, y: 0 }, context);
    }
    return originStep(state);
  },
};

export const CAD_HATCH_ORIGIN_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(hatchOriginCommand)];
