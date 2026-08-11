/**
 * QSELECT y FILTER: designar por lo que las cosas SON, no por dónde están.
 *
 * Seleccionar con ventana funciona hasta que el dibujo tiene diez mil objetos
 * mezclados. A partir de ahí, «todas las líneas de la capa MUROS con grosor
 * mayor que 0,3» no se puede pedir con el ratón, y la alternativa —ir
 * pinchando— es donde se va la tarde.
 *
 * ## Por qué esto envejece solo
 *
 * La propiedad por la que se filtra sale de `properties.read` del registro de
 * adaptadores (ver `lib/cad/selection/selection-filter.ts`). No hay lista
 * escrita a mano: cuando T7 registre sus tipos, QSELECT filtrará por sus
 * propiedades sin que nadie toque este archivo.
 *
 * ## La diferencia entre los dos
 *
 * QSELECT es de usar y tirar: una pregunta, una designación. FILTER GUARDA la
 * pregunta con un nombre y la vuelve a aplicar cuando haga falta. Comparten el
 * mismo motor y el mismo lenguaje de reglas, así que un filtro guardado y una
 * consulta rápida no pueden dar resultados distintos.
 */
import type { CadEntity } from "../../cad-document";
import {
  applyCadSelectionFilter,
  cadFilterableProperties,
  CAD_FILTER_OPERATORS,
  type CadFilterOperator,
  type CadFilterRule,
  type CadNamedSelectionFilter,
  type CadSelectionFilter,
  type CadSelectionMode,
} from "../../selection/selection-filter";
import {
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

const SCOPE_DRAWING = { keyword: "Dibujo", shortcut: "D" } as const;
const SCOPE_SELECTION = { keyword: "Selección", shortcut: "S" } as const;
const MODE_REPLACE = { keyword: "Reemplazar", shortcut: "R" } as const;
const MODE_APPEND = { keyword: "Añadir", shortcut: "A" } as const;
const MODE_EXCLUDE = { keyword: "Excluir", shortcut: "E" } as const;
const MORE_YES = { keyword: "Sí", shortcut: "S" } as const;
const MORE_NO = { keyword: "No", shortcut: "N" } as const;

function entitiesOf(context: CadCommandContext): CadEntity[] {
  return context.entityIds
    .map((entityId) => context.entity?.(entityId))
    .filter((entity): entity is CadEntity => entity !== undefined);
}

function message<S>(state: S, text: string): CadCommandStep<S> {
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "message", text },
  };
}

function cancelled<S>(state: S): CadCommandStep<S> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
}

/**
 * Aplica un filtro y devuelve el paso final.
 *
 * El texto dice SIEMPRE cuántos se examinaron y cuántos casaron. Un «0 objetos
 * designados» a secas no distingue entre «el filtro no encuentra nada» y «el
 * filtro está mal escrito», y el usuario prueba a ciegas.
 */
function applyAndFinish<S>(
  state: S,
  filter: CadSelectionFilter,
  mode: CadSelectionMode,
  scope: "drawing" | "selection",
  context: CadCommandContext,
  label: string,
): CadCommandStep<S> {
  const entities = entitiesOf(context);
  const outcome = applyCadSelectionFilter(entities, filter, {
    mode,
    current: context.selection,
    ...(scope === "selection" ? { scope: context.selection } : {}),
  });
  const summary =
    `${label}: ${outcome.matched.length} de ${outcome.examined} objeto(s) examinados casan; ` +
    `quedan ${outcome.selection.length} designado(s).`;
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "selection", entityIds: outcome.selection, text: summary },
  };
}

function describeRules(filter: CadSelectionFilter): string {
  const type = filter.entityType ? `tipo=${filter.entityType}` : "cualquier tipo";
  if (filter.rules.length === 0) return type;
  const glue = filter.combine === "or" ? " O " : " Y ";
  return `${type}${glue}${filter.rules
    .map((rule) => `${rule.property}${rule.operator}${rule.value}`)
    .join(glue)}`;
}

// ---------------------------------------------------------------------------
// QSELECT
// ---------------------------------------------------------------------------

type QSelectStage =
  | "scope"
  | "type"
  | "property"
  | "operator"
  | "value"
  | "more"
  | "mode";

interface QSelectState {
  stage: QSelectStage;
  scope: "drawing" | "selection";
  filter: CadSelectionFilter;
  /** Regla a medias mientras se rellena. */
  draft: Partial<CadFilterRule>;
}

const EMPTY_QSELECT: QSelectState = {
  stage: "scope",
  scope: "drawing",
  filter: { entityType: null, rules: [], combine: "and" },
  draft: {},
};

function qselectStep(state: QSelectState, context: CadCommandContext): CadCommandStep<QSelectState> {
  switch (state.stage) {
    case "scope":
      return {
        state,
        prompt: {
          message: "Aplicar a",
          options: [SCOPE_DRAWING, SCOPE_SELECTION],
          defaultOption: SCOPE_DRAWING.keyword,
        },
        accepts: CAD_ACCEPT_KEYWORD,
      };
    case "type": {
      const present = [...new Set(entitiesOf(context).map((entity) => entity.type))].sort();
      return {
        state,
        prompt: {
          message: `Tipo de objeto (${present.join(", ") || "el dibujo está vacío"}) o * para todos`,
          options: [],
          defaultValue: "*",
        },
        accepts: CAD_ACCEPT_TEXT,
      };
    }
    case "property": {
      const names = cadFilterableProperties(entitiesOf(context))
        .filter((property) => !state.filter.entityType || property.universal || property.types.includes(state.filter.entityType))
        .map((property) => property.name);
      return {
        state,
        prompt: { message: `Propiedad (${names.join(", ")})`, options: [] },
        accepts: CAD_ACCEPT_TEXT,
      };
    }
    case "operator":
      return {
        state,
        prompt: {
          message: `Operador (${CAD_FILTER_OPERATORS.join(" ")}; ~ compara con comodines)`,
          options: [],
          defaultValue: "=",
        },
        accepts: CAD_ACCEPT_TEXT,
      };
    case "value":
      return {
        state,
        prompt: { message: `Valor de ${state.draft.property}`, options: [] },
        accepts: CAD_ACCEPT_TEXT,
      };
    case "more":
      return {
        state,
        prompt: {
          message: `Filtro: ${describeRules(state.filter)}. ¿Añadir otra condición?`,
          options: [MORE_YES, MORE_NO],
          defaultOption: MORE_NO.keyword,
        },
        accepts: CAD_ACCEPT_KEYWORD,
      };
    case "mode":
      return {
        state,
        prompt: {
          message: "Cómo aplicar el resultado",
          options: [MODE_REPLACE, MODE_APPEND, MODE_EXCLUDE],
          defaultOption: MODE_REPLACE.keyword,
        },
        accepts: CAD_ACCEPT_KEYWORD,
      };
  }
}

function isOperator(value: string): value is CadFilterOperator {
  return (CAD_FILTER_OPERATORS as readonly string[]).includes(value);
}

const qselectCommand: CadCommandDescriptor<QSelectState> = {
  name: "QSELECT",
  aliases: [],
  kind: "manage",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: false,
  cursor: "none",
  begin: (context) => qselectStep(EMPTY_QSELECT, context),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cancelled(state);

    if (state.stage === "scope") {
      const selection =
        input.kind === "keyword" && input.keyword === SCOPE_SELECTION.keyword
          ? "selection"
          : "drawing";
      if (selection === "selection" && context.selection.length === 0)
        return message(state, "QSELECT: no hay ninguna selección actual a la que aplicar el filtro.");
      return qselectStep({ ...state, scope: selection, stage: "type" }, context);
    }

    if (state.stage === "type") {
      const raw = input.kind === "text" ? input.value.trim() : "";
      const entityType = raw === "" || raw === "*" ? null : raw.toLowerCase();
      return qselectStep({ ...state, filter: { ...state.filter, entityType }, stage: "property" }, context);
    }

    if (state.stage === "property") {
      const property = input.kind === "text" ? input.value.trim() : "";
      if (!property)
        return message(state, "QSELECT: hace falta una propiedad por la que filtrar.");
      return qselectStep({ ...state, draft: { property }, stage: "operator" }, context);
    }

    if (state.stage === "operator") {
      const raw = input.kind === "text" && input.value.trim() ? input.value.trim() : "=";
      if (!isOperator(raw))
        return message(
          state,
          `QSELECT: "${raw}" no es un operador. Los válidos son ${CAD_FILTER_OPERATORS.join(" ")}.`,
        );
      return qselectStep({ ...state, draft: { ...state.draft, operator: raw }, stage: "value" }, context);
    }

    if (state.stage === "value") {
      const value = input.kind === "text" ? input.value.trim() : "";
      const rule: CadFilterRule = {
        property: state.draft.property as string,
        operator: (state.draft.operator ?? "=") as CadFilterOperator,
        value,
      };
      return qselectStep(
        {
          ...state,
          filter: { ...state.filter, rules: [...state.filter.rules, rule] },
          draft: {},
          stage: "more",
        },
        context,
      );
    }

    if (state.stage === "more") {
      if (input.kind === "keyword" && input.keyword === MORE_YES.keyword)
        return qselectStep({ ...state, stage: "property" }, context);
      return qselectStep({ ...state, stage: "mode" }, context);
    }

    const mode: CadSelectionMode =
      input.kind === "keyword" && input.keyword === MODE_APPEND.keyword
        ? "append"
        : input.kind === "keyword" && input.keyword === MODE_EXCLUDE.keyword
          ? "exclude"
          : "replace";
    return applyAndFinish(state, state.filter, mode, state.scope, context, "QSELECT");
  },
};

// ---------------------------------------------------------------------------
// FILTER
// ---------------------------------------------------------------------------

const FILTER_APPLY = { keyword: "Aplicar", shortcut: "A" } as const;
const FILTER_NEW = { keyword: "Nuevo", shortcut: "N" } as const;
const FILTER_DELETE = { keyword: "Borrar", shortcut: "B" } as const;
const FILTER_LIST = { keyword: "Listar", shortcut: "L" } as const;

type FilterStage = "action" | "apply-name" | "new-name" | "new-rules" | "delete-name";

interface FilterState {
  stage: FilterStage;
  draftName: string;
}

const NO_CATALOG =
  "FILTER necesita el catálogo de filtros de la sesión y este espacio de trabajo no lo aporta.";

function filterStep(state: FilterState, context: CadCommandContext): CadCommandStep<FilterState> {
  const saved = context.catalogs?.filters?.list() ?? [];
  switch (state.stage) {
    case "action":
      return {
        state,
        prompt: {
          message: `Filtros guardados: ${saved.length}`,
          options: [FILTER_APPLY, FILTER_NEW, FILTER_DELETE, FILTER_LIST],
          defaultOption: FILTER_APPLY.keyword,
        },
        accepts: CAD_ACCEPT_KEYWORD,
      };
    case "apply-name":
      return {
        state,
        prompt: { message: `Nombre del filtro (${saved.map((f) => f.name).join(", ")})`, options: [] },
        accepts: CAD_ACCEPT_TEXT,
      };
    case "new-name":
      return {
        state,
        prompt: { message: "Nombre para el filtro nuevo", options: [] },
        accepts: CAD_ACCEPT_TEXT,
      };
    case "new-rules":
      return {
        state,
        prompt: {
          message:
            `Condiciones de "${state.draftName}" separadas por comas ` +
            "(p. ej. type=line, layer~MURO*, radius>5)",
          options: [],
        },
        accepts: CAD_ACCEPT_TEXT,
      };
    case "delete-name":
      return {
        state,
        prompt: { message: `Filtro que borrar (${saved.map((f) => f.name).join(", ")})`, options: [] },
        accepts: CAD_ACCEPT_TEXT,
      };
  }
}

/**
 * Analiza `layer~MURO*, radius>5` en reglas.
 *
 * Se prueban los operadores de DOS caracteres antes que los de uno: sin ese
 * orden, `>=` se leería como `>` seguido de un valor `=5`, que compara contra
 * la cadena literal y no casa nunca — un fallo silencioso.
 */
export function parseCadFilterRules(source: string): {
  rules: CadFilterRule[];
  errors: string[];
} {
  const rules: CadFilterRule[] = [];
  const errors: string[] = [];
  for (const chunk of source.split(",").map((piece) => piece.trim()).filter(Boolean)) {
    const operator = [">=", "<=", "!=", "=", ">", "<", "~"].find((candidate) =>
      chunk.includes(candidate),
    );
    if (!operator) {
      errors.push(`"${chunk}" no lleva operador.`);
      continue;
    }
    const at = chunk.indexOf(operator);
    const property = chunk.slice(0, at).trim();
    const value = chunk.slice(at + operator.length).trim();
    if (!property) {
      errors.push(`"${chunk}" no nombra ninguna propiedad.`);
      continue;
    }
    rules.push({ property, operator: operator as CadFilterOperator, value });
  }
  return { rules, errors };
}

const filterCommand: CadCommandDescriptor<FilterState> = {
  name: "FILTER",
  aliases: ["FI"],
  kind: "manage",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: false,
  cursor: "none",
  begin: (context) => filterStep({ stage: "action", draftName: "" }, context),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cancelled(state);
    const catalog = context.catalogs?.filters;

    if (state.stage === "action") {
      if (!catalog) return message(state, NO_CATALOG);
      const keyword = input.kind === "keyword" ? input.keyword : FILTER_APPLY.keyword;
      if (keyword === FILTER_LIST.keyword) {
        const saved = catalog.list();
        return message(
          state,
          saved.length === 0
            ? "No hay ningún filtro guardado. Use la opción Nuevo."
            : saved
                .map((entry) => `${entry.name}: ${describeRules(entry)}`)
                .join("\n"),
        );
      }
      if (keyword === FILTER_NEW.keyword) return filterStep({ ...state, stage: "new-name" }, context);
      if (keyword === FILTER_DELETE.keyword)
        return filterStep({ ...state, stage: "delete-name" }, context);
      return filterStep({ ...state, stage: "apply-name" }, context);
    }

    if (!catalog) return message(state, NO_CATALOG);
    const typed = input.kind === "text" ? input.value.trim() : "";

    if (state.stage === "apply-name") {
      const found = catalog.get(typed);
      if (!found) return message(state, `No hay ningún filtro guardado con el nombre "${typed}".`);
      return applyAndFinish(state, found, "replace", "drawing", context, `FILTER "${found.name}"`);
    }

    if (state.stage === "new-name") {
      if (!typed) return message(state, "Un filtro necesita un nombre para poder guardarse.");
      return filterStep({ ...state, stage: "new-rules", draftName: typed }, context);
    }

    if (state.stage === "delete-name") {
      const removed = catalog.remove(typed);
      return message(
        state,
        removed ? `Filtro "${typed}" borrado.` : `No hay ningún filtro llamado "${typed}".`,
      );
    }

    const parsed = parseCadFilterRules(typed);
    if (parsed.rules.length === 0)
      return message(
        state,
        [`El filtro "${state.draftName}" no se ha guardado: no tiene ninguna condición válida.`, ...parsed.errors].join("\n"),
      );
    const typeRule = parsed.rules.find((rule) => rule.property === "type" && rule.operator === "=");
    const saved: CadNamedSelectionFilter = {
      name: state.draftName,
      entityType: typeRule ? typeRule.value.toLowerCase() : null,
      rules: parsed.rules.filter((rule) => rule !== typeRule),
      combine: "and",
    };
    catalog.save(saved);
    return applyAndFinish(
      state,
      saved,
      "replace",
      "drawing",
      context,
      `FILTER "${saved.name}" guardado${parsed.errors.length > 0 ? ` (${parsed.errors.join(" ")})` : ""}`,
    );
  },
};

export const CAD_SELECT_QUERY_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(qselectCommand),
  asCadCommand(filterCommand),
];
