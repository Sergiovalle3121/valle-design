/**
 * DIMCONSTRAINT, DCLINEAR, DCRADIUS, DCDIAMETER, DCANGULAR y PARAMETERS.
 *
 * Una cota corriente MIDE; una cota paramétrica MANDA. La diferencia se nota al
 * teclear el valor: aquí no se escribe sólo `1200`, se puede escribir `ancho`
 * —el nombre de un parámetro— o incluso `ancho = 1200`, que crea el parámetro y
 * ata la cota a él en el mismo paso. A partir de ahí, cambiar `ancho` mueve todo
 * lo que dependa de él, y eso es el objeto entero del dibujo paramétrico.
 *
 * Las tres formas de teclear el valor están en `parseConstraintValue`, y se
 * distinguen sin ambigüedad: un número es un número, un identificador es un
 * parámetro, y con `=` en medio es una definición.
 */
import type { CadConstraint, CadConstraintKind } from "../../constraints/constraint-schema";
import { CAD_PARAMETER_NAME_PATTERN, evaluateCadParameters } from "../../constraints/parameters";
import type { CadEntityCommand } from "../../entity-commands";
import { cadConstraintId } from "./parametric-geometry";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_SELECTION,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
  type CadKeyword,
} from "../command-types";

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

export type CadConstraintValue =
  | { kind: "literal"; value: number }
  | { kind: "parameter"; name: string }
  | { kind: "definition"; name: string; expression: string }
  | { kind: "error"; message: string };

/**
 * Interpreta lo tecleado como valor de una cota paramétrica.
 *
 * `1200` es un literal; `ancho` una referencia; `ancho = largo / 2` define el
 * parámetro y lo referencia a la vez. Un nombre inválido se rechaza aquí y no
 * más adelante, para que el mensaje diga qué se tecleó mal y no «no converge».
 */
export function parseConstraintValue(raw: string): CadConstraintValue {
  const token = raw.trim();
  if (!token) return { kind: "error", message: "Falta el valor de la cota." };
  if (NUMBER.test(token)) return { kind: "literal", value: Number(token) };

  const equals = token.indexOf("=");
  if (equals > 0) {
    const name = token.slice(0, equals).trim();
    const expression = token.slice(equals + 1).trim();
    if (!CAD_PARAMETER_NAME_PATTERN.test(name))
      return { kind: "error", message: `«${name}» no es un nombre de parámetro válido.` };
    if (!expression) return { kind: "error", message: `Falta la expresión de «${name}».` };
    return { kind: "definition", name, expression };
  }
  if (CAD_PARAMETER_NAME_PATTERN.test(token)) return { kind: "parameter", name: token };
  return {
    kind: "error",
    message: `No entiendo «${token}»: escriba un número, el nombre de un parámetro o «nombre = expresión».`,
  };
}

interface DimensionalSpec {
  kind: CadConstraintKind;
  keyword: string;
  shortcut: string;
  arity: 1 | 2;
  command: string;
  prompt: string;
}

export const CAD_DIMENSIONAL_CONSTRAINT_KINDS: readonly DimensionalSpec[] = [
  { kind: "distance", keyword: "LIneal", shortcut: "LI", arity: 1, command: "DCLINEAR", prompt: "Longitud" },
  { kind: "radius", keyword: "Radio", shortcut: "R", arity: 1, command: "DCRADIUS", prompt: "Radio" },
  { kind: "diameter", keyword: "Diametro", shortcut: "D", arity: 1, command: "DCDIAMETER", prompt: "Diámetro" },
  { kind: "angle", keyword: "ANgular", shortcut: "AN", arity: 2, command: "DCANGULAR", prompt: "Ángulo en grados" },
];

const KEYWORDS: readonly CadKeyword[] = CAD_DIMENSIONAL_CONSTRAINT_KINDS.map((spec) => ({
  keyword: spec.keyword,
  shortcut: spec.shortcut,
}));

const specOf = (keyword: string) =>
  CAD_DIMENSIONAL_CONSTRAINT_KINDS.find((entry) => entry.keyword === keyword) ?? null;

const done = <S>(state: S, result: CadCommandStep<S>["result"]): CadCommandStep<S> => ({
  state,
  prompt: { message: "", options: [] },
  accepts: 0,
  result,
});

interface DimensionalState {
  spec: DimensionalSpec | null;
  targets: string[];
}

function dimensionalStep(state: DimensionalState): CadCommandStep<DimensionalState> {
  if (!state.spec)
    return {
      state,
      prompt: { message: "Precise el tipo de cota", options: KEYWORDS },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  if (state.targets.length < state.spec.arity)
    return {
      state,
      prompt: {
        message: state.targets.length === 0 ? "Designe el objeto a acotar" : "Designe el segundo objeto",
        options: [],
      },
      accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
    };
  return {
    state,
    prompt: { message: `${state.spec.prompt}, nombre de parámetro o «nombre = expresión»`, options: [] },
    accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT,
  };
}

function dimensionalResult(
  state: DimensionalState,
  raw: string,
): CadCommandStep<DimensionalState> {
  const spec = state.spec;
  if (!spec) return dimensionalStep(state);
  const parsed = parseConstraintValue(raw);
  if (parsed.kind === "error") return done(state, { kind: "message", text: parsed.message });

  const commands: CadEntityCommand[] = [];
  const constraint: CadConstraint = {
    id: cadConstraintId(spec.kind, state.targets),
    kind: spec.kind,
    entityIds: [...state.targets],
    enabled: true,
  };
  if (parsed.kind === "literal") {
    constraint.value = parsed.value;
  } else {
    // `nombre = expresión` define el parámetro ANTES de referenciarlo: los dos
    // comandos van en el mismo lote, así que el ejecutor ve el parámetro ya
    // puesto cuando resuelve la cota que lo usa.
    if (parsed.kind === "definition")
      commands.push({
        type: "parameter",
        op: "set",
        parameter: { name: parsed.name, expression: parsed.expression },
      });
    constraint.parameter = parsed.name;
  }
  commands.push({ type: "constraint", op: "upsert", constraint });
  return done(state, { kind: "document", commands, label: spec.command });
}

function makeDimensional(
  name: string,
  aliases: readonly string[],
  fixed: DimensionalSpec | null,
): CadCommandDescriptor<DimensionalState> {
  return {
    name,
    aliases,
    kind: "annotate",
    transparent: false,
    selection: "optional",
    repeatable: true,
    mutates: true,
    cursor: "pick",
    begin: (context) =>
      dimensionalStep({
        spec: fixed,
        targets: fixed && context.selection.length === fixed.arity ? [...context.selection] : [],
      }),
    step: (state, input, context) => {
      if (input.kind === "keyword" && !state.spec) {
        const spec = specOf(input.keyword);
        if (!spec) return dimensionalStep(state);
        return dimensionalStep({
          spec,
          targets: context.selection.length === spec.arity ? [...context.selection] : [],
        });
      }
      if (input.kind === "entityPick")
        return dimensionalStep({ ...state, targets: [...state.targets, input.entityId] });
      if (input.kind === "selection")
        return dimensionalStep({ ...state, targets: [...state.targets, ...input.entityIds] });
      if (state.spec && state.targets.length === state.spec.arity) {
        if (input.kind === "distance") return dimensionalResult(state, String(input.value));
        if (input.kind === "text") return dimensionalResult(state, input.value);
      }
      if (input.kind === "enter")
        return done(state, { kind: "message", text: "Faltan objetos o el valor de la cota." });
      return dimensionalStep(state);
    },
  };
}

// ---------------------------------------------------------------------------
// PARAMETERS, en su forma de línea de comandos
// ---------------------------------------------------------------------------

const PARAMETER_KEYWORDS: readonly CadKeyword[] = [
  { keyword: "Listar", shortcut: "L" },
  { keyword: "Fijar", shortcut: "F" },
  { keyword: "Borrar", shortcut: "B" },
];

interface ParametersState {
  mode: "menu" | "set" | "delete";
}

/**
 * Listado de la tabla. Si el anfitrión no aporta los parámetros al contexto, lo
 * dice: responder «no hay ninguno» sin poder mirar sería mentir, y la ventana de
 * gestión que monte esa lectura no llegará a existir si nadie sabe que falta.
 */
function listParameters(context: CadCommandContext): CadCommandStep<ParametersState> {
  const table = context.parameters;
  if (table === undefined)
    return done({ mode: "menu" }, {
      kind: "message",
      text:
        "PARAMETERS no puede listar: este montaje de la línea de comandos todavía no aporta " +
        "la tabla del documento al motor. Fijar y borrar sí funcionan.",
    });
  if (table.length === 0)
    return done({ mode: "menu" }, { kind: "message", text: "El dibujo no tiene parámetros." });
  const evaluated = evaluateCadParameters(table);
  const lines = [...table]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((parameter) => {
      const value = evaluated.values.get(parameter.name);
      const shown = value === undefined ? "—" : String(Number(value.toFixed(6)));
      const comment = parameter.comment ? `  · ${parameter.comment}` : "";
      return `${parameter.name} = ${parameter.expression}   (${shown})${comment}`;
    });
  const problems = evaluated.issues.map((issue) => `⚠ ${issue.message}`);
  return done({ mode: "menu" }, { kind: "message", text: [...lines, ...problems].join("\n") });
}

const parametersCommand: CadCommandDescriptor<ParametersState> = {
  name: "PARAMETERS",
  aliases: ["PARAM"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "none",
  begin: () => ({
    state: { mode: "menu" },
    prompt: {
      message: "Parámetros del dibujo",
      options: PARAMETER_KEYWORDS,
      defaultOption: "Listar",
    },
    accepts: CAD_ACCEPT_KEYWORD,
  }),
  step: (state, input, context) => {
    if (state.mode === "menu") {
      if (input.kind === "enter") return listParameters(context);
      if (input.kind !== "keyword")
        return {
          state,
          prompt: { message: "Parámetros del dibujo", options: PARAMETER_KEYWORDS, defaultOption: "Listar" },
          accepts: CAD_ACCEPT_KEYWORD,
        };
      if (input.keyword === "Listar") return listParameters(context);
      if (input.keyword === "Fijar")
        return {
          state: { mode: "set" },
          prompt: { message: "Escriba «nombre = expresión»", options: [] },
          accepts: CAD_ACCEPT_TEXT,
        };
      return {
        state: { mode: "delete" },
        prompt: { message: "Nombre del parámetro a borrar", options: [] },
        accepts: CAD_ACCEPT_TEXT,
      };
    }

    if (input.kind !== "text" && input.kind !== "distance")
      return done(state, { kind: "none" });
    const raw = input.kind === "text" ? input.value : String(input.value);

    if (state.mode === "delete") {
      const name = raw.trim();
      if (!CAD_PARAMETER_NAME_PATTERN.test(name))
        return done(state, { kind: "message", text: `«${name}» no es un nombre de parámetro válido.` });
      return done(state, {
        kind: "document",
        commands: [{ type: "parameter", op: "delete", name }],
        label: `PARAMETERS borrar ${name}`,
      });
    }

    const parsed = parseConstraintValue(raw);
    if (parsed.kind !== "definition")
      return done(state, {
        kind: "message",
        text:
          parsed.kind === "error"
            ? parsed.message
            : "Escriba «nombre = expresión»; un valor suelto no dice a qué parámetro pertenece.",
      });
    return done(state, {
      kind: "document",
      commands: [
        { type: "parameter", op: "set", parameter: { name: parsed.name, expression: parsed.expression } },
      ],
      label: `PARAMETERS ${parsed.name}`,
    });
  },
};

export const CAD_PARAMETRIC_DIMENSION_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(makeDimensional("DIMCONSTRAINT", ["DCON"], null)),
  ...CAD_DIMENSIONAL_CONSTRAINT_KINDS.map((spec) =>
    asCadCommand(makeDimensional(spec.command, [], spec)),
  ),
  asCadCommand(parametersCommand),
];
