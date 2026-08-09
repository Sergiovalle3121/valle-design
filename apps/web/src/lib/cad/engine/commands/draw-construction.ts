/**
 * XLINE y RAY — la geometría de construcción.
 *
 * Son las dos entidades SIN COTA del modelo: una recta infinita en los dos
 * sentidos y una semirrecta. No se dibujan para que se vean, se dibujan para
 * apoyarse en ellas — ejes de simetría, prolongaciones, alineaciones entre
 * plantas.
 *
 * ## Las dos órdenes son la misma máquina
 *
 * XLINE y RAY piden lo mismo: un punto raíz y luego tantos puntos de paso como
 * se quiera, emitiendo una entidad por cada uno. La única diferencia es el tipo
 * emitido, así que comparten descriptor parametrizado en vez de duplicarse.
 *
 * ## Bisectriz, que es la que se equivoca
 *
 * La bisectriz de un ángulo se toma sumando los vectores UNITARIOS de los dos
 * lados, no los vectores crudos. Con vectores crudos la «bisectriz» se inclina
 * hacia el lado más largo: para dos lados de 100 y 1.000 el error es de casi
 * 40°, y el resultado sigue siendo una recta que pasa por el vértice y parece
 * plausible.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import { CAD_ENTITY_REGISTRY, type CadNativeEntity } from "../../entity-runtime";
import {
  CAD_ACCEPT_ANGLE,
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

const HORIZONTAL = { keyword: "Hor", shortcut: "H" } as const;
const VERTICAL = { keyword: "Ver", shortcut: "V" } as const;
const ANGLE = { keyword: "Áng", shortcut: "A" } as const;
const BISECT = { keyword: "Bisectriz", shortcut: "B" } as const;
const OFFSET = { keyword: "Desfase", shortcut: "D" } as const;

type ConstructionMode = "through" | "horizontal" | "vertical" | "angle" | "bisect" | "offset";

interface ConstructionState {
  mode: ConstructionMode;
  /** Punto raíz, vértice de la bisectriz, o punto base según el modo. */
  points: CadPoint2[];
  angleDeg: number;
  offset: number;
  /** Entidad designada en modo Desfase. */
  entityId: string | null;
  pending: "none" | "angle" | "offset";
  commands: CadEntityCommand[];
}

function initialState(): ConstructionState {
  return {
    mode: "through",
    points: [],
    angleDeg: 0,
    offset: 0,
    entityId: null,
    pending: "none",
    commands: [],
  };
}

function constructionEntity(
  type: "xline" | "ray",
  id: string,
  basePoint: CadPoint2,
  direction: CadPoint2,
  layer: string,
): CadNativeEntity {
  return {
    id,
    type,
    basePoint: { x: basePoint.x, y: basePoint.y, z: 0 },
    direction: { x: direction.x, y: direction.y, z: 0 },
    layer,
  } as CadNativeEntity;
}

/** Bisectriz del ángulo `a`–vértice–`b`, con vectores UNITARIOS. */
export function bisectorDirection(
  vertex: CadPoint2,
  a: CadPoint2,
  b: CadPoint2,
): CadPoint2 | null {
  const first = { x: a.x - vertex.x, y: a.y - vertex.y };
  const second = { x: b.x - vertex.x, y: b.y - vertex.y };
  const firstLength = Math.hypot(first.x, first.y);
  const secondLength = Math.hypot(second.x, second.y);
  if (!(firstLength > 1e-12) || !(secondLength > 1e-12)) return null;
  const direction = {
    x: first.x / firstLength + second.x / secondLength,
    y: first.y / firstLength + second.y / secondLength,
  };
  // Lados opuestos: la suma se anula y no hay una bisectriz, hay infinitas.
  return Math.hypot(direction.x, direction.y) > 1e-9 ? direction : null;
}

/** Dirección y punto base de la entidad designada, para el modo Desfase. */
function referenceAxis(
  entityId: string,
  context: CadCommandContext,
): { basePoint: CadPoint2; direction: CadPoint2 } | null {
  const entity = context.entity?.(entityId);
  if (!entity || !CAD_ENTITY_REGISTRY.supports(entity)) return null;
  if (entity.type === "line")
    return {
      basePoint: { x: entity.start.x, y: entity.start.y },
      direction: { x: entity.end.x - entity.start.x, y: entity.end.y - entity.start.y },
    };
  if (entity.type === "xline" || entity.type === "ray")
    return {
      basePoint: { x: entity.basePoint.x, y: entity.basePoint.y },
      direction: { x: entity.direction.x, y: entity.direction.y },
    };
  return null;
}

function constructionStep(
  state: ConstructionState,
  type: "xline" | "ray",
  context: CadCommandContext,
): CadCommandStep<ConstructionState> {
  if (state.pending === "angle")
    return {
      state,
      prompt: { message: "Precise el ángulo de la recta", options: [], defaultValue: "0" },
      accepts: CAD_ACCEPT_ANGLE | CAD_ACCEPT_DISTANCE,
    };
  if (state.pending === "offset")
    return {
      state,
      prompt: { message: "Precise la distancia de desfase", options: [] },
      accepts: CAD_ACCEPT_DISTANCE,
    };
  if (state.mode === "offset") {
    if (!state.entityId)
      return {
        state,
        prompt: { message: "Designe la recta de referencia", options: [] },
        accepts: CAD_ACCEPT_ENTITY_PICK,
      };
    return {
      state,
      prompt: { message: "Precise el lado del desfase", options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  }
  if (state.mode === "bisect") {
    const messages = [
      "Precise el vértice del ángulo",
      "Precise el punto del primer lado",
      "Precise el punto del segundo lado",
    ];
    return {
      state,
      prompt: { message: messages[Math.min(state.points.length, 2)], options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  }
  if (state.points.length === 0)
    return {
      state,
      prompt: {
        message:
          state.mode === "angle"
            ? "Precise el punto de paso"
            : type === "ray"
              ? "Precise el punto inicial de la semirrecta"
              : "Precise un punto de la recta",
        options:
          state.mode === "through"
            ? [HORIZONTAL, VERTICAL, ANGLE, BISECT, OFFSET]
            : [],
      },
      accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    };
  return {
    state,
    prompt: { message: "Precise el punto de paso", options: [] },
    accepts: CAD_ACCEPT_POINT,
    preview: context.cursor ? [{ points: [state.points[0], context.cursor] }] : [],
  };
}

function constructionFinish(
  state: ConstructionState,
  type: "xline" | "ray",
): CadCommandStep<ConstructionState> {
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: state.commands.length
      ? { kind: "document", commands: state.commands, label: type.toUpperCase() }
      : { kind: "none" },
  };
}

function emit(
  state: ConstructionState,
  type: "xline" | "ray",
  basePoint: CadPoint2,
  direction: CadPoint2,
  context: CadCommandContext,
): ConstructionState {
  if (!(Math.hypot(direction.x, direction.y) > 1e-12)) return state;
  return {
    ...state,
    commands: [
      ...state.commands,
      {
        type: "insert",
        entity: constructionEntity(
          type,
          context.newEntityId(),
          basePoint,
          direction,
          context.activeLayer,
        ),
      },
    ],
  };
}

function constructionCommand(type: "xline" | "ray"): CadCommandDescriptor<ConstructionState> {
  return {
    name: type === "xline" ? "XLINE" : "RAY",
    aliases: type === "xline" ? ["XL"] : [],
    kind: "draw",
    transparent: false,
    selection: "none",
    repeatable: true,
    mutates: true,
    cursor: "crosshair",
    begin: (context) => constructionStep(initialState(), type, context),
    step: (state, input, context) => {
      if (input.kind === "cancel") return constructionFinish(state, type);
      if (input.kind === "enter") {
        if (state.pending !== "none")
          return constructionStep({ ...state, pending: "none" }, type, context);
        return constructionFinish(state, type);
      }

      if (input.kind === "keyword") {
        if (input.keyword === HORIZONTAL.keyword)
          return constructionStep({ ...state, mode: "horizontal" }, type, context);
        if (input.keyword === VERTICAL.keyword)
          return constructionStep({ ...state, mode: "vertical" }, type, context);
        if (input.keyword === ANGLE.keyword)
          return constructionStep({ ...state, mode: "angle", pending: "angle" }, type, context);
        if (input.keyword === BISECT.keyword)
          return constructionStep({ ...state, mode: "bisect", points: [] }, type, context);
        if (input.keyword === OFFSET.keyword)
          return constructionStep({ ...state, mode: "offset", pending: "offset" }, type, context);
        return constructionStep(state, type, context);
      }

      if (input.kind === "angle" && state.pending === "angle")
        return constructionStep({ ...state, angleDeg: input.degrees, pending: "none" }, type, context);
      if (input.kind === "distance") {
        if (state.pending === "angle")
          return constructionStep({ ...state, angleDeg: input.value, pending: "none" }, type, context);
        if (state.pending === "offset")
          return constructionStep(
            { ...state, offset: Math.abs(input.value), pending: "none" },
            type,
            context,
          );
        return constructionStep(state, type, context);
      }

      if (input.kind === "entityPick" && state.mode === "offset")
        return constructionStep({ ...state, entityId: input.entityId }, type, context);

      if (input.kind !== "point") return constructionStep(state, type, context);

      if (state.mode === "horizontal")
        return constructionStep(emit(state, type, input.point, { x: 1, y: 0 }, context), type, context);
      if (state.mode === "vertical")
        return constructionStep(emit(state, type, input.point, { x: 0, y: 1 }, context), type, context);
      if (state.mode === "angle") {
        const radians = (state.angleDeg * Math.PI) / 180;
        return constructionStep(
          emit(state, type, input.point, { x: Math.cos(radians), y: Math.sin(radians) }, context),
          type,
          context,
        );
      }
      if (state.mode === "bisect") {
        const points = [...state.points, input.point];
        if (points.length < 3) return constructionStep({ ...state, points }, type, context);
        const direction = bisectorDirection(points[0], points[1], points[2]);
        if (!direction)
          return {
            state,
            prompt: { message: "", options: [] },
            accepts: 0,
            result: {
              kind: "message",
              text: "Esos tres puntos no definen un ángulo con bisectriz única.",
            },
          };
        return constructionFinish(emit(state, type, points[0], direction, context), type);
      }
      if (state.mode === "offset") {
        const axis = state.entityId ? referenceAxis(state.entityId, context) : null;
        if (!axis)
          return {
            state,
            prompt: { message: "", options: [] },
            accepts: 0,
            result: {
              kind: "message",
              text: "El desfase necesita una LÍNEA, una XLINE o un RAY como referencia.",
            },
          };
        const length = Math.hypot(axis.direction.x, axis.direction.y);
        if (!(length > 1e-12)) return constructionFinish(state, type);
        // Normal unitaria a la recta de referencia; el punto designado decide
        // de qué lado cae el desfase.
        const normal = { x: -axis.direction.y / length, y: axis.direction.x / length };
        const side =
          (input.point.x - axis.basePoint.x) * normal.x +
            (input.point.y - axis.basePoint.y) * normal.y >=
          0
            ? 1
            : -1;
        const basePoint = {
          x: axis.basePoint.x + normal.x * state.offset * side,
          y: axis.basePoint.y + normal.y * state.offset * side,
        };
        return constructionFinish(emit(state, type, basePoint, axis.direction, context), type);
      }

      // Modo por defecto: raíz y luego tantos puntos de paso como se quiera.
      if (state.points.length === 0)
        return constructionStep({ ...state, points: [input.point] }, type, context);
      const root = state.points[0];
      const direction = { x: input.point.x - root.x, y: input.point.y - root.y };
      return constructionStep(emit(state, type, root, direction, context), type, context);
    },
  };
}

export const CAD_DRAW_CONSTRUCTION_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(constructionCommand("xline")),
  asCadCommand(constructionCommand("ray")),
];
