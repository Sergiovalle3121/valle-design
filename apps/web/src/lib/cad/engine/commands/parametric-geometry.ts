/**
 * GEOMCONSTRAINT, sus atajos por tipo, AUTOCONSTRAIN y DELCONSTRAINT.
 *
 * Las restricciones geométricas son la diferencia entre dibujar una pieza y
 * dibujar UNA FAMILIA de piezas: en cuanto el perfil dice «estos dos lados son
 * iguales» y «esta esquina es recta», cambiar una medida reajusta el conjunto en
 * vez de dejar el dibujo roto.
 *
 * Los tres verbos siguen el patrón del motor: máquinas de estado puras que
 * terminan emitiendo UN lote. Ese lote lleva comandos de SECCIÓN
 * (`{type:"constraint"}`), y el ejecutor por lotes resuelve el sistema dentro de
 * la misma transacción — así poner una restricción y ver moverse la geometría
 * son un solo paso de deshacer.
 *
 * `AUTOCONSTRAIN` es el que más se usa de los tres. Nadie dibuja restringiendo
 * desde el primer trazo: se dibuja el perfil y después se le pide al programa
 * que reconozca lo que uno ya quería decir.
 */
import type { CadEntity } from "../../cad-document";
import type { CadConstraint, CadConstraintKind } from "../../constraints/constraint-schema";
import { autoConstrainCadEntities } from "../../constraints/auto-constrain";
import type { CadEntityCommand } from "../../entity-commands";
import {
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

/**
 * Catálogo de restricciones geométricas tecleables.
 *
 * `arity` es cuántos objetos hay que designar. `IGual` es la única que decide su
 * tipo al vuelo: entre dos círculos significa radio igual y entre dos rectas,
 * longitud igual — es lo que hace GCEQUAL en AutoCAD y lo que espera quien la
 * usa sin pararse a pensar qué está designando.
 */
interface GeometricKindSpec {
  kind: CadConstraintKind;
  keyword: string;
  shortcut: string;
  arity: 1 | 2 | 3;
  /** Nombre canónico del atajo (`GCHORIZONTAL`). */
  command: string;
  aliases: readonly string[];
}

export const CAD_GEOMETRIC_CONSTRAINT_KINDS: readonly GeometricKindSpec[] = [
  { kind: "horizontal", keyword: "Horizontal", shortcut: "H", arity: 1, command: "GCHORIZONTAL", aliases: [] },
  { kind: "vertical", keyword: "Vertical", shortcut: "V", arity: 1, command: "GCVERTICAL", aliases: [] },
  { kind: "fix", keyword: "Fija", shortcut: "F", arity: 1, command: "GCFIX", aliases: [] },
  { kind: "coincident", keyword: "COIncidente", shortcut: "COI", arity: 2, command: "GCCOINCIDENT", aliases: [] },
  { kind: "collinear", keyword: "COLineal", shortcut: "COL", arity: 2, command: "GCCOLLINEAR", aliases: [] },
  { kind: "concentric", keyword: "CONcentrica", shortcut: "CON", arity: 2, command: "GCCONCENTRIC", aliases: [] },
  { kind: "parallel", keyword: "PAralela", shortcut: "PA", arity: 2, command: "GCPARALLEL", aliases: [] },
  { kind: "perpendicular", keyword: "PErpendicular", shortcut: "PE", arity: 2, command: "GCPERPENDICULAR", aliases: [] },
  { kind: "tangent", keyword: "Tangente", shortcut: "T", arity: 2, command: "GCTANGENT", aliases: [] },
  { kind: "equalLength", keyword: "IGual", shortcut: "IG", arity: 2, command: "GCEQUAL", aliases: [] },
  { kind: "smooth", keyword: "SUave", shortcut: "SU", arity: 2, command: "GCSMOOTH", aliases: [] },
  { kind: "symmetric", keyword: "SImetrica", shortcut: "SI", arity: 3, command: "GCSYMMETRIC", aliases: [] },
];

const KEYWORDS: readonly CadKeyword[] = CAD_GEOMETRIC_CONSTRAINT_KINDS.map((spec) => ({
  keyword: spec.keyword,
  shortcut: spec.shortcut,
}));

const specOf = (keyword: string) =>
  CAD_GEOMETRIC_CONSTRAINT_KINDS.find((entry) => entry.keyword === keyword) ?? null;

const done = <S>(state: S, result: CadCommandStep<S>["result"]): CadCommandStep<S> => ({
  state,
  prompt: { message: "", options: [] },
  accepts: 0,
  result,
});

/**
 * Id determinista. Que dependa sólo del tipo y de los objetos es lo que hace
 * que repetir la orden no acumule copias: la segunda vez SUSTITUYE a la primera
 * en vez de dejar dos restricciones idénticas peleándose.
 */
export function cadConstraintId(kind: CadConstraintKind, entityIds: readonly string[]): string {
  return `gc:${kind}:${entityIds.join("+")}`;
}

/** `IGual` entre dos entidades con radio es radio igual, no longitud igual. */
function resolveEqualKind(entityIds: readonly string[], context: CadCommandContext): CadConstraintKind {
  const round = entityIds.every((entityId) => {
    const entity = context.entity?.(entityId);
    return entity?.type === "circle" || entity?.type === "arc" || entity?.type === "ellipse";
  });
  return round ? "equalRadius" : "equalLength";
}

// ---------------------------------------------------------------------------
// GEOMCONSTRAINT y sus atajos
// ---------------------------------------------------------------------------

interface GeometricState {
  spec: GeometricKindSpec | null;
  targets: string[];
}

function geometricStep(state: GeometricState, context: CadCommandContext): CadCommandStep<GeometricState> {
  if (!state.spec)
    return {
      state,
      prompt: { message: "Precise el tipo de restricción", options: KEYWORDS },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  if (state.targets.length < state.spec.arity)
    return {
      state,
      prompt: {
        message:
          state.spec.arity === 3 && state.targets.length === 2
            ? "Designe el eje de simetría"
            : state.targets.length === 0
              ? "Designe el primer objeto"
              : "Designe el segundo objeto",
        options: [],
      },
      accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
    };
  return done(state, emit(state.spec, state.targets, context));
}

function emit(
  spec: GeometricKindSpec,
  targets: readonly string[],
  context: CadCommandContext,
): CadCommandStep<GeometricState>["result"] {
  const missing = targets.filter((entityId) => context.entity && !context.entity(entityId));
  if (missing.length > 0)
    return { kind: "message", text: `La entidad ${missing[0]} ya no existe.` };
  const kind = spec.kind === "equalLength" ? resolveEqualKind(targets, context) : spec.kind;
  const constraint: CadConstraint = {
    id: cadConstraintId(kind, targets),
    kind,
    entityIds: [...targets],
    enabled: true,
  };
  return {
    kind: "document",
    commands: [{ type: "constraint", op: "upsert", constraint }],
    label: spec.command,
  };
}

function makeGeometric(
  name: string,
  aliases: readonly string[],
  fixed: GeometricKindSpec | null,
): CadCommandDescriptor<GeometricState> {
  return {
    name,
    aliases,
    kind: "manage",
    transparent: false,
    selection: "optional",
    repeatable: true,
    mutates: true,
    cursor: "pick",
    begin: (context) => {
      // Con los objetos ya designados, la orden actúa de inmediato: es el gesto
      // de seleccionar dos muros y pedir «paralelos».
      const preselected = fixed && context.selection.length === fixed.arity ? [...context.selection] : [];
      return geometricStep({ spec: fixed, targets: preselected }, context);
    },
    step: (state, input, context) => {
      if (input.kind === "keyword" && !state.spec) {
        const spec = specOf(input.keyword);
        if (!spec) return geometricStep(state, context);
        const preselected = context.selection.length === spec.arity ? [...context.selection] : [];
        return geometricStep({ spec, targets: preselected }, context);
      }
      if (input.kind === "entityPick")
        return geometricStep({ ...state, targets: [...state.targets, input.entityId] }, context);
      if (input.kind === "selection")
        return geometricStep({ ...state, targets: [...state.targets, ...input.entityIds] }, context);
      if (input.kind === "enter" && state.spec && state.targets.length === state.spec.arity)
        return done(state, emit(state.spec, state.targets, context));
      if (input.kind === "enter")
        return done(state, { kind: "message", text: "Faltan objetos por designar." });
      return geometricStep(state, context);
    },
  };
}

// ---------------------------------------------------------------------------
// AUTOCONSTRAIN
// ---------------------------------------------------------------------------

interface AutoState {
  targets: readonly string[];
}

function autoResult(targets: readonly string[], context: CadCommandContext): CadCommandStep<AutoState> {
  const entities: CadEntity[] = [];
  for (const entityId of context.entityIds) {
    const entity = context.entity?.(entityId);
    if (entity) entities.push(entity);
  }
  const inferred = autoConstrainCadEntities(entities, targets, context.constraints ?? [], {
    idPrefix: "gc",
  });
  if (inferred.added.length === 0)
    return done({ targets }, {
      kind: "message",
      text: "No se dedujo ninguna restricción nueva de la geometría designada.",
    });
  return done({ targets }, {
    kind: "document",
    commands: inferred.added.map(
      (constraint): CadEntityCommand => ({ type: "constraint", op: "upsert", constraint }),
    ),
    label: `AUTOCONSTRAIN (${inferred.added.length})`,
  });
}

const autoConstrainCommand: CadCommandDescriptor<AutoState> = {
  name: "AUTOCONSTRAIN",
  aliases: [],
  kind: "manage",
  transparent: false,
  selection: "required",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) =>
    context.selection.length > 0
      ? autoResult(context.selection, context)
      : {
          state: { targets: [] },
          prompt: { message: "Designe objetos", options: [] },
          accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
        },
  step: (state, input, context) => {
    if (input.kind === "selection") return autoResult(input.entityIds, context);
    if (input.kind === "entityPick") return autoResult([...state.targets, input.entityId], context);
    if (input.kind === "enter") return autoResult(state.targets, context);
    return {
      state,
      prompt: { message: "Designe objetos", options: [] },
      accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
    };
  },
};

// ---------------------------------------------------------------------------
// DELCONSTRAINT
// ---------------------------------------------------------------------------

interface DeleteState {
  targets: readonly string[];
}

function deleteResult(targets: readonly string[]): CadCommandStep<DeleteState> {
  if (targets.length === 0) return done({ targets }, { kind: "none" });
  // Se borra POR ENTIDAD y no por id de restricción: quien teclea DELCONSTRAINT
  // está señalando un objeto, no recordando el identificador de la relación. El
  // ejecutor, que sí ve el documento, resuelve cuáles caen.
  return done({ targets }, {
    kind: "document",
    commands: [{ type: "constraint", op: "clear", entityIds: [...targets] }],
    label: "DELCONSTRAINT",
  });
}

const delConstraintCommand: CadCommandDescriptor<DeleteState> = {
  name: "DELCONSTRAINT",
  aliases: [],
  kind: "manage",
  transparent: false,
  selection: "required",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) =>
    context.selection.length > 0
      ? deleteResult(context.selection)
      : {
          state: { targets: [] },
          prompt: { message: "Designe los objetos cuyas restricciones se eliminan", options: [] },
          accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
        },
  step: (state, input) => {
    if (input.kind === "selection") return deleteResult(input.entityIds);
    if (input.kind === "entityPick") return deleteResult([...state.targets, input.entityId]);
    if (input.kind === "enter") return deleteResult(state.targets);
    return {
      state,
      prompt: { message: "Designe los objetos cuyas restricciones se eliminan", options: [] },
      accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
    };
  },
};

export const CAD_PARAMETRIC_GEOMETRY_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(makeGeometric("GEOMCONSTRAINT", ["GCON"], null)),
  ...CAD_GEOMETRIC_CONSTRAINT_KINDS.map((spec) =>
    asCadCommand(makeGeometric(spec.command, spec.aliases, spec)),
  ),
  asCadCommand(autoConstrainCommand),
  asCadCommand(delConstraintCommand),
];
