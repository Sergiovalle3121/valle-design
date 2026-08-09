/**
 * LINE y CIRCLE como descriptores del motor.
 *
 * Sustituyen al reductor de siete comandos de
 * `components/line-engineering/cad-command.ts`, que emitía «acciones de dibujo»
 * y no entidades, no tenía opciones y encadenaba a mano. Aquí cada comando es
 * una máquina de estados que emite `CadEntityCommand[]` y termina en UN lote,
 * así que deshacer una polilínea de treinta vértices es un solo Ctrl+Z.
 *
 * De paso llegan opciones que antes no existían y que un dibujante espera:
 * `Cerrar` y `desHacer` en LINE, `Diámetro`, `2P` y `3P` en CIRCLE.
 *
 * PLINE y RECTANG vivían aquí y se han mudado a `draw-pline.ts` y
 * `draw-rectang.ts`: al ganar sus opciones (arco, grosor, chaflán, empalme,
 * área…) dejaron de ser casos triviales y cada uno pesa ya más que este
 * archivo entero.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadNativeEntity } from "../../entity-runtime";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
  type CadPreviewPath,
} from "../command-types";

const UNDO = { keyword: "desHacer", shortcut: "H" } as const;
const CLOSE = { keyword: "Cerrar", shortcut: "C" } as const;

function flat(point: CadPoint2) {
  return { x: point.x, y: point.y, z: 0 };
}

function lineEntity(id: string, a: CadPoint2, b: CadPoint2, layer: string): CadNativeEntity {
  return { id, type: "line", start: flat(a), end: flat(b), layer };
}

function circleEntity(id: string, center: CadPoint2, radius: number, layer: string): CadNativeEntity {
  return { id, type: "circle", center: flat(center), radius, layer };
}

function rubberBand(from: CadPoint2, cursor?: CadPoint2): CadPreviewPath[] {
  return cursor ? [{ points: [from, cursor] }] : [];
}

function distance(a: CadPoint2, b: CadPoint2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// ---------------------------------------------------------------------------
// LINE
// ---------------------------------------------------------------------------

interface LineState {
  /** Vértices fijados. El motor lee `points` para `@relativo`. */
  points: CadPoint2[];
  commands: CadEntityCommand[];
}

function lineStep(state: LineState, context: CadCommandContext): CadCommandStep<LineState> {
  if (state.points.length === 0)
    return {
      state,
      prompt: { message: "Precise el primer punto", options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  const options = state.points.length >= 3 ? [CLOSE, UNDO] : [UNDO];
  return {
    state,
    prompt: { message: "Precise el punto siguiente", options },
    // Sin `CAD_ACCEPT_DISTANCE` a propósito: en LINE un número suelto NO es una
    // distancia abstracta, es entrada directa sobre la dirección del cursor, y
    // de eso se encarga el pipeline. Declararla aquí se la comería antes.
    accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    preview: rubberBand(state.points[state.points.length - 1], context.cursor),
  };
}

function finishLine(state: LineState): CadCommandStep<LineState> {
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result:
      state.commands.length > 0
        ? { kind: "document", commands: state.commands, label: "LINE" }
        : { kind: "none" },
  };
}

const lineCommand: CadCommandDescriptor<LineState> = {
  name: "LINE",
  aliases: ["L"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => lineStep({ points: [], commands: [] }, context),
  step: (state, input, context) => {
    if (input.kind === "enter") return finishLine(state);

    if (input.kind === "keyword" && input.keyword === UNDO.keyword) {
      // Deshacer dentro del comando retira el último vértice Y el segmento que
      // creó. Sin retirar ambos, el segmento quedaría huérfano en el lote.
      const points = state.points.slice(0, -1);
      const commands = state.commands.slice(0, Math.max(0, state.commands.length - 1));
      return lineStep({ points, commands }, context);
    }

    if (input.kind === "keyword" && input.keyword === CLOSE.keyword) {
      if (state.points.length < 3) return lineStep(state, context);
      const last = state.points[state.points.length - 1];
      const first = state.points[0];
      return finishLine({
        points: state.points,
        commands: [
          ...state.commands,
          { type: "insert", entity: lineEntity(context.newEntityId(), last, first, context.activeLayer) },
        ],
      });
    }

    if (input.kind !== "point") return lineStep(state, context);

    const points = [...state.points, input.point];
    if (points.length === 1) return lineStep({ ...state, points }, context);
    const previous = points[points.length - 2];
    // Un clic repetido en el mismo sitio no debe crear una línea de longitud
    // cero: se ignora el vértice en vez de ensuciar el documento.
    if (distance(previous, input.point) < 1e-9) return lineStep(state, context);
    return lineStep(
      {
        points,
        commands: [
          ...state.commands,
          {
            type: "insert",
            entity: lineEntity(context.newEntityId(), previous, input.point, context.activeLayer),
          },
        ],
      },
      context,
    );
  },
};

// ---------------------------------------------------------------------------
// CIRCLE
// ---------------------------------------------------------------------------

const CIRCLE_3P = { keyword: "3P", shortcut: "3" } as const;
const CIRCLE_2P = { keyword: "2P", shortcut: "2" } as const;
const CIRCLE_DIAMETER = { keyword: "Diámetro", shortcut: "D" } as const;

type CircleMode = "center" | "two-point" | "three-point";

interface CircleState {
  mode: CircleMode;
  points: CadPoint2[];
  diameter: boolean;
}

function circleResult(
  state: CircleState,
  center: CadPoint2,
  radius: number,
  context: CadCommandContext,
): CadCommandStep<CircleState> {
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result:
      radius > 1e-9
        ? {
            kind: "document",
            commands: [
              {
                type: "insert",
                entity: circleEntity(context.newEntityId(), center, radius, context.activeLayer),
              },
            ],
            label: "CIRCLE",
          }
        : { kind: "none" },
  };
}

/** Circunferencia por tres puntos. Devuelve `null` si están alineados. */
function circleThroughThree(
  a: CadPoint2,
  b: CadPoint2,
  c: CadPoint2,
): { center: CadPoint2; radius: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const center = {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  };
  return { center, radius: distance(center, a) };
}

function circleStep(state: CircleState, context: CadCommandContext): CadCommandStep<CircleState> {
  if (state.mode === "center") {
    if (state.points.length === 0)
      return {
        state,
        prompt: { message: "Precise el centro", options: [CIRCLE_3P, CIRCLE_2P] },
        accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
      };
    return {
      state,
      prompt: {
        message: state.diameter ? "Precise el diámetro" : "Precise el radio",
        options: state.diameter ? [] : [CIRCLE_DIAMETER],
      },
      accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_DISTANCE | CAD_ACCEPT_KEYWORD,
      preview: rubberBand(state.points[0], context.cursor),
    };
  }
  const needed = state.mode === "two-point" ? 2 : 3;
  const ordinal = ["primer", "segundo", "tercer"][state.points.length] ?? "siguiente";
  return {
    state,
    prompt: {
      message:
        state.mode === "two-point"
          ? `Precise el ${ordinal} extremo del diámetro`
          : `Precise el ${ordinal} punto de la circunferencia`,
      options: [],
    },
    accepts: CAD_ACCEPT_POINT,
    preview:
      state.points.length > 0 && needed > state.points.length
        ? rubberBand(state.points[state.points.length - 1], context.cursor)
        : [],
  };
}

const circleCommand: CadCommandDescriptor<CircleState> = {
  name: "CIRCLE",
  aliases: ["C"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => circleStep({ mode: "center", points: [], diameter: false }, context),
  step: (state, input, context) => {
    if (input.kind === "enter")
      return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };

    if (input.kind === "keyword") {
      if (input.keyword === CIRCLE_3P.keyword)
        return circleStep({ mode: "three-point", points: [], diameter: false }, context);
      if (input.keyword === CIRCLE_2P.keyword)
        return circleStep({ mode: "two-point", points: [], diameter: false }, context);
      if (input.keyword === CIRCLE_DIAMETER.keyword)
        return circleStep({ ...state, diameter: true }, context);
      return circleStep(state, context);
    }

    if (state.mode === "center") {
      if (input.kind === "distance" && state.points.length === 1) {
        const size = Math.abs(input.value);
        return circleResult(state, state.points[0], state.diameter ? size / 2 : size, context);
      }
      if (input.kind !== "point") return circleStep(state, context);
      if (state.points.length === 0) return circleStep({ ...state, points: [input.point] }, context);
      const radius = distance(state.points[0], input.point);
      // Con la opción Diámetro activa, el punto marca el borde opuesto: la
      // distancia al centro ya ES el radio, no hay que dividir otra vez.
      return circleResult(state, state.points[0], radius, context);
    }

    if (input.kind !== "point") return circleStep(state, context);
    const points = [...state.points, input.point];
    if (state.mode === "two-point" && points.length === 2) {
      const center = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
      return circleResult(state, center, distance(points[0], points[1]) / 2, context);
    }
    if (state.mode === "three-point" && points.length === 3) {
      const solved = circleThroughThree(points[0], points[1], points[2]);
      if (!solved)
        return {
          state,
          prompt: { message: "", options: [] },
          accepts: 0,
          result: { kind: "message", text: "Los tres puntos están alineados: no definen una circunferencia." },
        };
      return circleResult(state, solved.center, solved.radius, context);
    }
    return circleStep({ ...state, points }, context);
  },
};

export const CAD_DRAW_BASIC_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(lineCommand),
  asCadCommand(circleCommand),
];

export const __testables = { circleThroughThree };
