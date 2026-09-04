/**
 * STRETCH y LENGTHEN.
 *
 * ## STRETCH sin ventana de captura no es STRETCH
 *
 * Lo que hace útil a STRETCH no es mover objetos: eso ya lo hace MOVE. Es mover
 * los EXTREMOS que caen dentro de una ventana de captura dejando los de fuera
 * quietos — así se alarga una habitación entera arrastrando un muro y todo lo
 * que llega hasta él lo sigue. Un STRETCH que sólo aceptara «objetos
 * designados» sería MOVE con otro nombre.
 *
 * Por eso la ventana se pide como DOS PUNTOS del propio comando, y no como una
 * designación cualquiera. La entrada `selection` del motor lleva ids, no
 * rectángulo: si el comando se conformara con ella, no tendría forma de saber
 * qué vértices estaban dentro.
 *
 * ## Qué se estira y qué se mueve entero
 *
 * Un vértice dentro de la ventana se mueve; uno fuera, no. Eso vale para LINE,
 * POLYLINE y SPLINE (sus puntos de control). Lo demás —círculo, arco, elipse,
 * texto, bloque, cota— no tiene «medio objeto»: se mueve entero si su punto de
 * anclaje cae dentro, y se queda quieto si no. Es lo que hace AutoCAD, y
 * fingir que un círculo se puede estirar produciría elipses que nadie pidió.
 *
 * ## LENGTHEN
 *
 * Los cuatro modos de AutoCAD: Incremento, Porcentaje, Total y Dinámico. La
 * geometría vive en `curve-edit.ts` porque es la misma reparametrización que
 * usan TRIM y EXTEND; aquí sólo está el guion de preguntas.
 */
import type { CadEntity, CadPoint2, CadPoint3 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import {
  asCadEditableEntity,
  computeCadCurveLengthen,
  cadEntityLength,
  type CadLengthenMode,
} from "../../curve-edit";
import type { CadNativeEntity } from "../../entity-runtime";
import { cadStretchAnchorPoint } from "../../stretch-anchor";
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

interface Window {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function windowOf(a: CadPoint2, b: CadPoint2): Window {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  };
}

function inside(window: Window, point: { x: number; y: number }): boolean {
  return (
    point.x >= window.minX && point.x <= window.maxX && point.y >= window.minY && point.y <= window.maxY
  );
}

function shifted(point: CadPoint3, offset: CadPoint2): CadPoint3 {
  return { x: point.x + offset.x, y: point.y + offset.y, z: point.z };
}

/**
 * El cambio que le toca a una entidad, o `null` si la ventana no la roza.
 *
 * Cuando TODOS los puntos definitorios caen dentro se emite una traslación en
 * vez de un parche punto a punto: es el mismo resultado con menos datos, y
 * mantiene intacto lo que el adaptador sepa hacer con una traslación.
 */
function stretchEntityCommand(
  entity: CadEntity,
  window: Window,
  offset: CadPoint2,
): CadEntityCommand | null {
  const anchor = cadStretchAnchorPoint(entity);
  if (anchor)
    return inside(window, anchor)
      ? { type: "transform", entityId: entity.id, transform: { translation: offset } }
      : null;

  if (entity.type === "line") {
    const startIn = inside(window, entity.start);
    const endIn = inside(window, entity.end);
    if (!startIn && !endIn) return null;
    if (startIn && endIn)
      return { type: "transform", entityId: entity.id, transform: { translation: offset } };
    const start = startIn ? shifted(entity.start, offset) : entity.start;
    const end = endIn ? shifted(entity.end, offset) : entity.end;
    return {
      type: "properties",
      entityId: entity.id,
      patch: { startX: start.x, startY: start.y, endX: end.x, endY: end.y },
    };
  }

  if (entity.type === "polyline") {
    const flags = entity.vertices.map((vertex) => inside(window, vertex));
    if (flags.every((flag) => !flag)) return null;
    if (flags.every((flag) => flag))
      return { type: "transform", entityId: entity.id, transform: { translation: offset } };
    return {
      type: "replace",
      entityId: entity.id,
      entity: {
        ...entity,
        vertices: entity.vertices.map((vertex, index) =>
          flags[index] ? { ...vertex, ...shifted(vertex, offset) } : vertex,
        ),
      },
    };
  }

  if (entity.type === "spline") {
    const flags = entity.controlPoints.map((point) => inside(window, point));
    if (flags.every((flag) => !flag)) return null;
    if (flags.every((flag) => flag))
      return { type: "transform", entityId: entity.id, transform: { translation: offset } };
    return {
      type: "replace",
      entityId: entity.id,
      entity: {
        ...entity,
        controlPoints: entity.controlPoints.map((point, index) =>
          flags[index] ? shifted(point, offset) : point,
        ),
      } as CadNativeEntity,
    };
  }

  return null;
}

interface StretchState {
  corners: CadPoint2[];
  base: CadPoint2 | null;
}

const EMPTY_STRETCH: StretchState = { corners: [], base: null };

function stretchStep(state: StretchState): CadCommandStep<StretchState> {
  if (state.corners.length === 0)
    return {
      state,
      prompt: { message: "Precise la primera esquina de la ventana de captura", options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  if (state.corners.length === 1)
    return {
      state,
      prompt: { message: "Precise la esquina opuesta", options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  if (!state.base)
    return {
      state,
      prompt: { message: "Precise el punto base", options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  return {
    state,
    prompt: { message: "Precise el segundo punto de desplazamiento", options: [] },
    accepts: CAD_ACCEPT_POINT,
  };
}

const stretchCommand: CadCommandDescriptor<StretchState> = {
  name: "STRETCH",
  aliases: ["S"],
  kind: "modify",
  transparent: false,
  // La ventana la pide el comando: una selección previa no dice qué vértices
  // estaban dentro, que es justamente el dato del que vive STRETCH.
  selection: "command-first",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: () => stretchStep(EMPTY_STRETCH),
  step: (state, input, context) => {
    const done = (
      result: CadCommandStep<StretchState>["result"],
    ): CadCommandStep<StretchState> => ({
      state: EMPTY_STRETCH,
      prompt: { message: "", options: [] },
      accepts: 0,
      result,
    });
    if (input.kind === "cancel") return done({ kind: "none" });
    if (input.kind !== "point") return stretchStep(state);

    if (state.corners.length < 2)
      return stretchStep({ ...state, corners: [...state.corners, input.point] });
    if (!state.base) return stretchStep({ ...state, base: input.point });

    const offset = { x: input.point.x - state.base.x, y: input.point.y - state.base.y };
    if (Math.hypot(offset.x, offset.y) < 1e-12) return done({ kind: "none" });

    const window = windowOf(state.corners[0], state.corners[1]);
    const commands: CadEntityCommand[] = [];
    for (const entityId of context.entityIds) {
      const entity = context.entity?.(entityId);
      if (!entity) continue;
      const command = stretchEntityCommand(entity, window, offset);
      if (command) commands.push(command);
    }
    if (commands.length === 0)
      return done({
        kind: "message",
        text: "STRETCH: la ventana de captura no toca ningún objeto.",
      });
    return done({ kind: "document", commands, label: "STRETCH" });
  },
};

// ---------------------------------------------------------------------------
// LENGTHEN
// ---------------------------------------------------------------------------

const MODES: { keyword: string; shortcut: string; mode: CadLengthenMode }[] = [
  { keyword: "Incremento", shortcut: "I", mode: "delta" },
  { keyword: "Porcentaje", shortcut: "P", mode: "percent" },
  { keyword: "Total", shortcut: "T", mode: "total" },
  { keyword: "DInámico", shortcut: "DI", mode: "dynamic" },
];

const MODE_PROMPT: Record<CadLengthenMode, string> = {
  delta: "Precise el incremento de longitud",
  percent: "Precise el porcentaje de la longitud actual",
  total: "Precise la longitud total",
  dynamic: "Precise el nuevo extremo",
};

interface LengthenState {
  mode: CadLengthenMode | null;
  value: number | null;
  /** Objeto ya designado y punto de la designación, que elige el extremo. */
  targetId: string | null;
  pick: CadPoint2 | null;
}

const EMPTY_LENGTHEN: LengthenState = { mode: null, value: null, targetId: null, pick: null };

function lengthenStep(state: LengthenState): CadCommandStep<LengthenState> {
  if (!state.mode)
    return {
      state,
      // Sin modo, designar un objeto MIDE su longitud, como en AutoCAD. Es la
      // consulta que uno hace antes de decidir cuánto alargar.
      prompt: {
        message: "Designe un objeto para medirlo o indique el modo",
        options: MODES.map(({ keyword, shortcut }) => ({ keyword, shortcut })),
      },
      accepts: CAD_ACCEPT_KEYWORD | CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
    };
  if (state.mode !== "dynamic" && state.value === null)
    return {
      state,
      prompt: { message: MODE_PROMPT[state.mode], options: [] },
      accepts: CAD_ACCEPT_DISTANCE,
    };
  if (!state.targetId)
    return {
      state,
      prompt: { message: "Designe el objeto a modificar", options: [] },
      accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
    };
  return {
    state,
    prompt: { message: MODE_PROMPT.dynamic, options: [] },
    accepts: CAD_ACCEPT_POINT,
  };
}

function lengthenApply(
  state: LengthenState,
  context: CadCommandContext,
  toPoint?: CadPoint2,
): CadCommandStep<LengthenState> {
  const done = (
    result: CadCommandStep<LengthenState>["result"],
  ): CadCommandStep<LengthenState> => ({
    state: EMPTY_LENGTHEN,
    prompt: { message: "", options: [] },
    accepts: 0,
    result,
  });
  const target = asCadEditableEntity(context.entity?.(state.targetId ?? ""));
  if (!target) {
    const found = context.entity?.(state.targetId ?? "");
    return done({
      kind: "message",
      text: `LENGTHEN: ${found ? `${found.type.toUpperCase()} no tiene longitud editable.` : "el objeto ya no existe."}`,
    });
  }
  const outcome = computeCadCurveLengthen({
    target,
    pick: state.pick ?? { x: target.type === "line" ? target.start.x : 0, y: 0 },
    mode: state.mode!,
    value: state.value ?? 0,
    toPoint,
  });
  if ("error" in outcome) return done({ kind: "message", text: `LENGTHEN: ${outcome.error}` });
  const command: CadEntityCommand | null = outcome.replace
    ? { type: "replace", entityId: target.id, entity: outcome.replace }
    : outcome.patch
      ? { type: "properties", entityId: target.id, patch: outcome.patch }
      : null;
  if (!command) return done({ kind: "message", text: "LENGTHEN: no había nada que cambiar." });
  return done({ kind: "document", commands: [command], label: "LENGTHEN" });
}

const lengthenCommand: CadCommandDescriptor<LengthenState> = {
  name: "LENGTHEN",
  aliases: ["LEN"],
  kind: "modify",
  transparent: false,
  selection: "command-first",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: () => lengthenStep(EMPTY_LENGTHEN),
  step: (state, input, context) => {
    const done = (
      result: CadCommandStep<LengthenState>["result"],
    ): CadCommandStep<LengthenState> => ({
      state: EMPTY_LENGTHEN,
      prompt: { message: "", options: [] },
      accepts: 0,
      result,
    });
    if (input.kind === "cancel" || (input.kind === "enter" && !state.mode))
      return done({ kind: "none" });

    if (input.kind === "keyword") {
      const chosen = MODES.find((entry) => entry.keyword === input.keyword);
      return chosen ? lengthenStep({ ...state, mode: chosen.mode }) : lengthenStep(state);
    }

    const picked =
      input.kind === "entityPick"
        ? { id: input.entityId, point: input.point }
        : input.kind === "selection" && input.entityIds.length > 0
          ? { id: input.entityIds[0], point: null }
          : null;

    if (!state.mode) {
      // Consulta: designar sin modo devuelve la longitud medida.
      if (!picked) return lengthenStep(state);
      const entity = context.entity?.(picked.id);
      const length = entity ? cadEntityLength(entity) : null;
      return done({
        kind: "message",
        text:
          length === null
            ? `LENGTHEN: ${entity ? `${entity.type.toUpperCase()} no tiene longitud medible.` : "el objeto no existe."}`
            : `Longitud actual = ${length}`,
      });
    }

    if (state.mode !== "dynamic" && state.value === null) {
      if (input.kind !== "distance") return lengthenStep(state);
      return lengthenStep({ ...state, value: input.value });
    }

    if (!state.targetId) {
      if (!picked) return lengthenStep(state);
      const next = { ...state, targetId: picked.id, pick: picked.point };
      // En los modos de número, designar ya lo resuelve; el dinámico todavía
      // necesita saber a dónde se arrastra.
      return state.mode === "dynamic" ? lengthenStep(next) : lengthenApply(next, context);
    }

    if (input.kind !== "point") return lengthenStep(state);
    return lengthenApply(state, context, input.point);
  },
};

export const CAD_MODIFY_STRETCH_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(stretchCommand),
  asCadCommand(lengthenCommand),
];
