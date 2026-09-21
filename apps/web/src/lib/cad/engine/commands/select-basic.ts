/**
 * SELECT: arma el conjunto de selección para la ORDEN SIGUIENTE (T-Ola3, F1).
 *
 * ## Qué hace, y sobre todo qué NO hace
 *
 * SELECT no dibuja ni modifica nada — `mutates: false` — y no es un atajo de
 * ERASE ni de ningún otro comando. Es AutoCAD puro: reúne objetos con las
 * diez palabras clave de T-21 (Todo, Previo, Último, Ventana, Captura,
 * Valla, Vpolígono, Cpolígono, Borrar, Añadir) o con el ratón, cierra con
 * Intro, y deja lo reunido como la selección VIGENTE — la misma que
 * `Previo` recoge en la orden siguiente — sin tocar el documento.
 *
 * Es exactamente lo que hace falta antes de una orden que todavía no admite
 * designar objetos ella misma, o para separar «qué elijo» de «qué le hago»,
 * que es como se enseña a usar AutoCAD desde el primer día.
 *
 * ## Por qué reutiliza `cadDesignateStep`
 *
 * `selection-keywords.ts` (T-21) ya implementa las diez palabras clave sobre
 * un trío `(targets, pick, removing)`; es la MISMA aritmética que usan
 * ERASE/MOVE/COPY en `modify-basics.ts`. Un segundo analizador de «Designe
 * objetos» aquí sería la clase exacta de trampa que esta campaña persigue en
 * otros frentes: dos sitios que interpretan la misma palabra clave y pueden
 * desalinearse.
 *
 * Correr:  npx tsx src/lib/cad/engine/commands/select-basic.spec.ts
 */
import {
  CAD_DESIGNATE_IDLE,
  CAD_SELECT_KEYWORD_OPTIONS,
  cadDesignateStep,
  type CadDesignatePickState,
} from "../../selection/selection-keywords";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_SELECTION,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandInput,
  type CadCommandStep,
} from "../command-types";

interface SelectState {
  targets: readonly string[];
  /** Ventana/captura/valla/polígono a medio reunir (T-21). */
  pick: CadDesignatePickState;
  /** «Borrar» quita de `targets` en vez de sumar; «Añadir» lo devuelve a sumar. */
  removing: boolean;
}

const SELECT_IDLE_STATE: SelectState = { targets: [], pick: CAD_DESIGNATE_IDLE, removing: false };
const SELECT_PROMPT = { message: "Designe objetos", options: CAD_SELECT_KEYWORD_OPTIONS } as const;
const SELECT_ACCEPTS = CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_KEYWORD;

function pendingSelection(state: SelectState): CadCommandStep<SelectState> {
  return { state, prompt: SELECT_PROMPT, accepts: SELECT_ACCEPTS };
}

/** Ver `tryDesignateKeyword` de `modify-basics.ts`: mismo trato exacto. */
function tryDesignateKeyword(
  state: SelectState,
  input: CadCommandInput,
  context: CadCommandContext,
): CadCommandStep<SelectState> | null {
  const outcome = cadDesignateStep(state.targets, state.pick, state.removing, input, context, "Designe objetos");
  if (!outcome) return null;
  return {
    state: { targets: outcome.targets, pick: outcome.pick, removing: outcome.removing },
    prompt: outcome.prompt,
    accepts: outcome.accepts,
  };
}

/**
 * Termina SELECT: la selección reunida se PUBLICA como resultado —el
 * anfitrión la aplica y la recuerda como «la última», que es lo que `Previo`
 * lee en la orden que viene— y el documento no se toca en absoluto.
 */
function selectResult(targets: readonly string[]): CadCommandStep<SelectState> {
  const n = targets.length;
  return {
    state: { ...SELECT_IDLE_STATE, targets },
    prompt: { message: "", options: [] },
    accepts: 0,
    result: {
      kind: "selection",
      entityIds: targets,
      text: n === 0 ? "Nada designado." : `${n} objeto${n === 1 ? "" : "s"} designado${n === 1 ? "" : "s"}.`,
    },
  };
}

const selectCommand: CadCommandDescriptor<SelectState> = {
  name: "SELECT",
  aliases: [],
  kind: "inquiry",
  transparent: false,
  selection: "required",
  repeatable: false,
  mutates: false,
  cursor: "pick",
  // Con objetos ya designados al invocar (grips, un arrastre previo), SELECT
  // los adopta de inmediato — igual que ERASE — en vez de pedirlos otra vez.
  begin: (context) =>
    context.selection.length > 0 ? selectResult(context.selection) : pendingSelection(SELECT_IDLE_STATE),
  step: (state, input, context) => {
    const byKeyword = tryDesignateKeyword(state, input, context);
    if (byKeyword) return byKeyword;
    if (input.kind === "selection") return selectResult(input.entityIds);
    if (input.kind === "entityPick") return selectResult([input.entityId]);
    if (input.kind === "enter") return selectResult(state.targets);
    if (input.kind === "cancel")
      return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
    return pendingSelection(state);
  },
};

export const CAD_SELECT_BASIC_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(selectCommand)];
