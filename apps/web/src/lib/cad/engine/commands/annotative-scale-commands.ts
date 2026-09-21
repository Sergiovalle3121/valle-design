/**
 * ANNOSCALE, OBJECTSCALE y ANNORESET: la escala anotativa por fin con orden
 * propia.
 *
 * `layout/annotative-scale.ts` dejó escrito y probado TODO el cálculo — la
 * altura de modelo que hace medir sus milímetros de papel a un texto, una
 * cota o un sombreado, para la escala que sea — y ninguna orden se lo
 * ofrecía al dibujante: «un texto anotativo cambia de tamaño en papel al
 * cambiar la escala» era una propiedad del MÓDULO, no del PRODUCTO. Este
 * archivo es el envoltorio de comando que faltaba.
 *
 * ## Lo que hace cada una, y lo que NO
 *
 * - `ANNOSCALE <denominador>` reescala TODAS las anotativas del documento a
 *   1:denominador con `cadAnnotativeModelRescaleCommands`. No existe una
 *   variable de sesión «escala actual» aparte: el número tecleado ES la
 *   escala actual, aplicada de inmediato — el mismo trato que ya declara
 *   `cadApplyAnnotationScale`, del que esta orden es el envoltorio real.
 *   Guardar esa escala en la SESIÓN para que otras órdenes la recuerden
 *   queda fuera de esta ola: ninguna capacidad del motor la expone hoy
 *   (`system-variables.ts` es de otra ola en curso) y no hay dónde escribirla
 *   sin inventar un canal nuevo. Se dice aquí en vez de fingir un estado que
 *   no existe.
 * - `OBJECTSCALE` designa objetos y AGREGA o QUITA su condición anotativa. Al
 *   agregar pide el tamaño de papel (mm o mm de separación, según el tipo) y
 *   la escala, y dimensiona el objeto para esa escala en el mismo golpe: este
 *   esquema no guarda una representación por cada escala (eso es
 *   `CadDocumentMeta` de otra ola), así que «agregar una escala» y
 *   «dimensionar para ella ahora» son la MISMA operación, no dos, y se dice
 *   así en vez de prometer múltiples representaciones que el documento no
 *   guarda.
 * - `ANNORESET` designa cotas anotativas y les quita el texto de posición
 *   MANUAL (`textPosition`), devolviéndolas a la que calcula su propia
 *   geometría — la única «posición alternativa» que el esquema de hoy
 *   guarda. TEXT/MTEXT no tienen ese campo —su posición ES la entidad, no
 *   una anulación sobre un cálculo— así que ANNORESET no tiene nada que
 *   deshacerles y los cuenta aparte en vez de fingir que actuó.
 */
import type { CadEntity } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import {
  cadAnnotativeDimensionSizes,
  cadAnnotativeHatchScale,
  cadAnnotativeHatchSpacingMm,
  cadAnnotativeHeightMm,
  cadAnnotativeModelHeight,
  cadAnnotativeModelRescaleCommands,
  cadEntitySupportsAnnotativeHeight,
  clearCadAnnotativeCommand,
  clearCadAnnotativeHatchCommand,
  markCadAnnotativeCommand,
  markCadAnnotativeHatchCommand,
} from "../../layout/annotative-scale";
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
  type CadKeyword,
} from "../command-types";

function unitOf(context: CadCommandContext): string {
  return context.document?.().meta.unit ?? context.unit ?? "mm";
}

function matchesKeyword(word: string, option: CadKeyword): boolean {
  const upper = word.trim().toUpperCase();
  return upper === option.keyword.toUpperCase() || upper === option.shortcut.toUpperCase();
}

function emptyStep<S>(state: S, result: CadCommandStep<S>["result"]): CadCommandStep<S> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result };
}

// ---------------------------------------------------------------------------
// ANNOSCALE
// ---------------------------------------------------------------------------

type AnnoScaleState = Record<string, never>;
const ANNO_SCALE_IDLE: AnnoScaleState = {};

function annoScaleStep(): CadCommandStep<AnnoScaleState> {
  return {
    state: ANNO_SCALE_IDLE,
    prompt: {
      message: "Nueva escala de anotación (x de 1:x)",
      options: [],
      defaultValue: "100",
    },
    accepts: CAD_ACCEPT_DISTANCE,
  };
}

const annoScaleCommand: CadCommandDescriptor<AnnoScaleState> = {
  name: "ANNOSCALE",
  aliases: ["ESCANOTA"],
  kind: "annotate",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "none",
  begin: () => annoScaleStep(),
  step: (state, input, context) => {
    if (input.kind === "cancel") return emptyStep(state, { kind: "none" });
    if (input.kind !== "distance") return annoScaleStep();
    const denominator = input.value;
    if (!(denominator > 0))
      return emptyStep(state, { kind: "message", text: "ANNOSCALE: la escala no puede ser cero ni negativa." });
    const doc = context.document?.();
    if (!doc)
      return emptyStep(state, {
        kind: "message",
        text: "ANNOSCALE: el anfitrión no expone el documento completo; no puede reescalar sin él.",
      });
    const result = cadAnnotativeModelRescaleCommands({ entities: doc.entities, unit: doc.meta.unit }, denominator);
    if (result.commands.length === 0)
      return emptyStep(state, {
        kind: "message",
        text: `ANNOSCALE: no hay ninguna anotativa que ajustar a 1:${denominator}.`,
      });
    return emptyStep(state, {
      kind: "document",
      commands: result.commands,
      label: "ANNOSCALE",
      notice: `ANNOSCALE: ${result.rescaledEntityIds.length} anotativa(s) ajustada(s) a 1:${denominator}.`,
    });
  },
};

// ---------------------------------------------------------------------------
// OBJECTSCALE
// ---------------------------------------------------------------------------

const OBJECTSCALE_ADD: CadKeyword = { keyword: "Agregar", shortcut: "AG" };
const OBJECTSCALE_REMOVE: CadKeyword = { keyword: "Quitar", shortcut: "Q" };

type ObjectScalePhase = "select" | "action" | "paper" | "denominator";

interface ObjectScaleState {
  phase: ObjectScalePhase;
  targets: readonly string[];
  paperValue: number;
}

const OBJECT_SCALE_IDLE: ObjectScaleState = { phase: "select", targets: [], paperValue: 0 };

const SELECT_PROMPT = { message: "Designe los objetos anotativos", options: [] };
const SELECT_ACCEPTS = CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK;

function selectStep(state: ObjectScaleState): CadCommandStep<ObjectScaleState> {
  return { state: { ...state, phase: "select" }, prompt: SELECT_PROMPT, accepts: SELECT_ACCEPTS };
}

function actionStep(state: ObjectScaleState): CadCommandStep<ObjectScaleState> {
  return {
    state: { ...state, phase: "action" },
    prompt: { message: "Agregar o quitar una escala anotativa", options: [OBJECTSCALE_ADD, OBJECTSCALE_REMOVE] },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

function paperStep(state: ObjectScaleState): CadCommandStep<ObjectScaleState> {
  return {
    state: { ...state, phase: "paper" },
    prompt: { message: "Tamaño en el papel (mm)", options: [], defaultValue: "2.5" },
    accepts: CAD_ACCEPT_DISTANCE,
  };
}

function denominatorStep(state: ObjectScaleState): CadCommandStep<ObjectScaleState> {
  return {
    state: { ...state, phase: "denominator" },
    prompt: { message: "Escala de anotación (x de 1:x)", options: [], defaultValue: "100" },
    accepts: CAD_ACCEPT_DISTANCE,
  };
}

/** Comandos que agregan la condición anotativa a UN objeto, o `[]` si su tipo no la admite. */
function annotativeAddCommands(
  entity: CadEntity,
  paperValue: number,
  denominator: number,
  unit: string,
): CadEntityCommand[] {
  if (entity.type === "hatch") {
    const scale = cadAnnotativeHatchScale(paperValue, denominator, unit, entity.pattern, entity.angle);
    if (!(scale > 0)) return [];
    return [
      markCadAnnotativeHatchCommand(entity.id, paperValue),
      { type: "properties", entityId: entity.id, patch: { scale } },
    ];
  }
  if (!cadEntitySupportsAnnotativeHeight(entity)) return [];
  if (entity.type === "dimension") {
    const sizes = cadAnnotativeDimensionSizes(entity, paperValue, denominator, unit);
    return [
      markCadAnnotativeCommand(entity.id, paperValue),
      { type: "properties", entityId: entity.id, patch: { ...sizes } },
    ];
  }
  const height = cadAnnotativeModelHeight(paperValue, denominator, unit);
  if (!(height > 0)) return [];
  return [
    markCadAnnotativeCommand(entity.id, paperValue),
    { type: "properties", entityId: entity.id, patch: { height } },
  ];
}

/** Comandos que le quitan la condición anotativa a UN objeto, o `[]` si no la tenía. */
function annotativeRemoveCommands(entity: CadEntity): CadEntityCommand[] {
  if (entity.type === "hatch")
    return cadAnnotativeHatchSpacingMm(entity) !== null ? [clearCadAnnotativeHatchCommand(entity.id)] : [];
  return cadAnnotativeHeightMm(entity) !== null ? [clearCadAnnotativeCommand(entity.id)] : [];
}

function finalizeRemove(state: ObjectScaleState, context: CadCommandContext): CadCommandStep<ObjectScaleState> {
  const commands = state.targets.flatMap((id) => {
    const entity = context.entity?.(id);
    return entity ? annotativeRemoveCommands(entity) : [];
  });
  if (commands.length === 0)
    return emptyStep(OBJECT_SCALE_IDLE, {
      kind: "message",
      text: "OBJECTSCALE: los objetos designados no tienen escala anotativa que quitar.",
    });
  return emptyStep(OBJECT_SCALE_IDLE, {
    kind: "document",
    commands,
    label: "OBJECTSCALE",
    notice: `OBJECTSCALE: escala anotativa quitada de ${commands.length} objeto(s).`,
  });
}

function finalizeAdd(
  state: ObjectScaleState,
  denominator: number,
  context: CadCommandContext,
): CadCommandStep<ObjectScaleState> {
  const unit = unitOf(context);
  let added = 0;
  const commands = state.targets.flatMap((id) => {
    const entity = context.entity?.(id);
    if (!entity) return [];
    const forEntity = annotativeAddCommands(entity, state.paperValue, denominator, unit);
    if (forEntity.length > 0) added += 1;
    return forEntity;
  });
  if (commands.length === 0)
    return emptyStep(OBJECT_SCALE_IDLE, {
      kind: "message",
      text: "OBJECTSCALE: ninguno de los objetos designados admite escala anotativa.",
    });
  return emptyStep(OBJECT_SCALE_IDLE, {
    kind: "document",
    commands,
    label: "OBJECTSCALE",
    notice: `OBJECTSCALE: ${added} objeto(s) a 1:${denominator}, ${state.paperValue} mm de papel.`,
  });
}

const objectScaleCommand: CadCommandDescriptor<ObjectScaleState> = {
  name: "OBJECTSCALE",
  aliases: ["ESCALAOBJETO"],
  kind: "annotate",
  transparent: false,
  selection: "required",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) =>
    context.selection.length > 0
      ? actionStep({ ...OBJECT_SCALE_IDLE, targets: context.selection })
      : selectStep(OBJECT_SCALE_IDLE),
  step: (state, input, context) => {
    if (input.kind === "cancel") return emptyStep(OBJECT_SCALE_IDLE, { kind: "none" });

    if (state.phase === "select") {
      if (input.kind === "selection") return actionStep({ ...state, targets: input.entityIds });
      if (input.kind === "entityPick") return selectStep({ ...state, targets: [...state.targets, input.entityId] });
      if (input.kind === "enter" && state.targets.length > 0) return actionStep(state);
      return selectStep(state);
    }

    if (state.phase === "action") {
      if (input.kind === "keyword") {
        if (matchesKeyword(input.keyword, OBJECTSCALE_REMOVE)) return finalizeRemove(state, context);
        if (matchesKeyword(input.keyword, OBJECTSCALE_ADD)) return paperStep(state);
      }
      return actionStep(state);
    }

    if (state.phase === "paper") {
      if (input.kind === "distance" && input.value > 0) return denominatorStep({ ...state, paperValue: input.value });
      return paperStep(state);
    }

    // state.phase === "denominator"
    if (input.kind === "distance" && input.value > 0) return finalizeAdd(state, input.value, context);
    return denominatorStep(state);
  },
};

// ---------------------------------------------------------------------------
// ANNORESET
// ---------------------------------------------------------------------------

interface AnnoResetState {
  targets: readonly string[];
}
const ANNO_RESET_IDLE: AnnoResetState = { targets: [] };

function annoResetSelect(state: AnnoResetState): CadCommandStep<AnnoResetState> {
  return { state, prompt: SELECT_PROMPT, accepts: SELECT_ACCEPTS };
}

function annoResetFinish(targets: readonly string[], context: CadCommandContext): CadCommandStep<AnnoResetState> {
  const commands: CadEntityCommand[] = [];
  for (const id of targets) {
    const entity = context.entity?.(id);
    if (!entity || entity.type !== "dimension") continue;
    if (cadAnnotativeHeightMm(entity) === null) continue;
    if (entity.textPosition === undefined) continue;
    const { textPosition: _drop, ...withoutOverride } = entity;
    commands.push({ type: "replace", entityId: id, entity: withoutOverride as never });
  }
  if (commands.length === 0)
    return emptyStep(ANNO_RESET_IDLE, {
      kind: "message",
      text: "ANNORESET: ninguna cota anotativa designada tiene el texto movido a mano; no hay nada que reiniciar.",
    });
  return emptyStep(ANNO_RESET_IDLE, {
    kind: "document",
    commands,
    label: "ANNORESET",
    notice: `ANNORESET: ${commands.length} cota(s) devuelta(s) a su posición de la escala actual.`,
  });
}

const annoResetCommand: CadCommandDescriptor<AnnoResetState> = {
  name: "ANNORESET",
  aliases: ["REINICIOANOTA"],
  kind: "annotate",
  transparent: false,
  selection: "required",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) =>
    context.selection.length > 0 ? annoResetFinish(context.selection, context) : annoResetSelect(ANNO_RESET_IDLE),
  step: (state, input, context) => {
    if (input.kind === "cancel") return emptyStep(ANNO_RESET_IDLE, { kind: "none" });
    if (input.kind === "selection") return annoResetFinish(input.entityIds, context);
    if (input.kind === "entityPick") return annoResetSelect({ targets: [...state.targets, input.entityId] });
    if (input.kind === "enter" && state.targets.length > 0) return annoResetFinish(state.targets, context);
    return annoResetSelect(state);
  },
};

export const CAD_ANNOTATIVE_SCALE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(annoScaleCommand),
  asCadCommand(objectScaleCommand),
  asCadCommand(annoResetCommand),
];
