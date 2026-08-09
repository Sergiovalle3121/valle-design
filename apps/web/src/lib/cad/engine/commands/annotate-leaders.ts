/**
 * LEADER y MLEADER.
 *
 * La flecha con nota que señala un detalle: «muro cortafuego 2 h», «ver detalle
 * 3», «pendiente 2%». `mleader.ts` calculaba su geometría desde la ola 1 y
 * `associative-mleader.ts` sabía seguir a la pieza señalada; no había forma de
 * teclearlas.
 *
 * ## Qué separa las dos órdenes
 *
 * `MLEADER` es la moderna: una punta, un codo, y se pueden AÑADIR más
 * directrices a la misma nota —tres flechas apuntando a tres columnas iguales,
 * un solo rótulo—. `LEADER` es la clásica: una polilínea directriz con los
 * vértices intermedios que hagan falta, para rodear geometría antes de llegar al
 * texto. No son la misma orden con distinto nombre.
 *
 * ## La punta se engancha, el codo no
 *
 * `regenerateAssociativeMleaders` mueve la PUNTA de cada directriz al anclaje de
 * su referencia y deja el resto de la línea como está. Así que la punta se
 * resuelve contra los anclajes del dibujo —igual que hacen las cotas— y el codo
 * es lo que el dibujante colocó: si el codo también siguiera a la pieza, mover
 * un tornillo arrastraría el rótulo por medio del plano.
 *
 * Hace falta UNA referencia por directriz o la regeneración marca la nota como
 * rota, así que se cuelgan sólo cuando TODAS las puntas cayeron sobre un
 * anclaje.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadNativeEntity } from "../../entity-runtime";
import { DEFAULT_MLEADER_STYLE, buildMleader } from "../../mleader";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import {
  cadAnchorReference,
  cadCommandCancelled,
  cadCommandWrites,
  cadResolveAnchorAt,
  flat,
  type CadAssociationReference,
} from "./annotate-support";

const ADD_LEADER = { keyword: "Directriz", shortcut: "D" } as const;
const STYLE_OPTION = { keyword: "Estilo", shortcut: "E" } as const;
const ARROW_OPTION = { keyword: "Flecha", shortcut: "F" } as const;
const NO_LANDING = { keyword: "sinCodo", shortcut: "C" } as const;

const MAX_TEXT_LENGTH = 2_048;
const MAX_LEADERS = 8;
const DEFAULT_TEXT_HEIGHT = 120;

type Arrowhead = NonNullable<Extract<CadNativeEntity, { type: "mleader" }>["arrowhead"]>;

const ARROWHEADS: Readonly<Record<string, Arrowhead>> = {
  llena: "closed-filled",
  abierta: "open",
  marca: "architectural-tick",
  punto: "dot",
  ninguna: "none",
};

type Pending = "tip" | "elbow" | "vertex" | "text" | "arrow" | "style" | "height";

interface LeaderState {
  /** `true` en LEADER: la directriz admite vértices intermedios. */
  polyline: boolean;
  /** Directrices ya cerradas, de la punta al codo. */
  lines: CadPoint2[][];
  /** Referencias de cada punta, en el mismo orden. */
  references: (CadAssociationReference | undefined)[];
  /** Directriz en construcción. */
  current: CadPoint2[];
  currentReference?: CadAssociationReference;
  arrowhead: Arrowhead;
  landing: boolean;
  textHeight: number;
  style: string;
  text: string;
  pending: Pending;
}

const PROMPTS: Readonly<Record<Pending, string>> = {
  tip: "Precise la punta de la directriz",
  elbow: "Precise el codo de la directriz",
  vertex: "Precise el vértice siguiente de la directriz",
  text: "Escriba la nota",
  arrow: "Escriba el tipo de punta (llena, abierta, marca, punto, ninguna)",
  style: "Escriba el nombre del estilo de directriz",
  height: "Precise la altura del texto",
};

function leaderStep(state: LeaderState, context: CadCommandContext): CadCommandStep<LeaderState> {
  const options =
    state.pending === "tip"
      ? [ARROW_OPTION, STYLE_OPTION, NO_LANDING]
      : state.pending === "vertex"
        ? []
        : state.pending === "text" && !state.polyline && state.lines.length < MAX_LEADERS
          ? [ADD_LEADER]
          : [];
  return {
    state,
    prompt: {
      message: PROMPTS[state.pending],
      options,
      ...(state.pending === "vertex" ? { defaultValue: "Enter para terminar la directriz" } : {}),
    },
    accepts:
      state.pending === "tip" || state.pending === "elbow" || state.pending === "vertex"
        ? CAD_ACCEPT_POINT | CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_KEYWORD
        : state.pending === "height"
          ? CAD_ACCEPT_DISTANCE
          : CAD_ACCEPT_TEXT | CAD_ACCEPT_KEYWORD,
    preview:
      state.current.length > 0 && context.cursor
        ? [{ points: [...state.current, context.cursor] }]
        : [],
  };
}

function leaderFinish(
  state: LeaderState,
  value: string,
  context: CadCommandContext,
): CadCommandStep<LeaderState> {
  const text = value.slice(0, MAX_TEXT_LENGTH);
  if (!text.trim() || state.lines.length === 0) return cadCommandCancelled(state);

  const primary = state.lines[0];
  const tip = primary[0];
  const elbow = primary[primary.length - 1];
  // El texto se ancla donde `mleader.ts` dice: el codo se extiende ALEJÁNDOSE de
  // la punta, de modo que la nota nunca pisa la línea directriz.
  const geometry = buildMleader(tip, elbow, {
    arrowSize: DEFAULT_MLEADER_STYLE.arrowSize,
    doglegLength: state.landing ? DEFAULT_MLEADER_STYLE.doglegLength : 0,
  });

  const associative =
    state.references.length === state.lines.length && state.references.every(Boolean);
  const entity: CadNativeEntity = {
    id: context.newEntityId(),
    type: "mleader",
    vertices: primary.map((point) => flat(point)),
    leaderLines: state.lines.map((line) => line.map((point) => flat(point))),
    text,
    textPosition: flat(geometry.textAnchor),
    textHeight: state.textHeight,
    arrowhead: state.arrowhead,
    landing: state.landing,
    ...(state.landing ? { doglegLength: DEFAULT_MLEADER_STYLE.doglegLength } : {}),
    ...(state.style !== "Standard" ? { style: state.style } : {}),
    ...(associative
      ? {
          associative: true,
          associationStatus: "associated" as const,
          references: state.references.map((reference) => ({ ...reference! })),
        }
      : {}),
    layer: context.activeLayer,
  };
  return cadCommandWrites(
    state,
    [{ type: "insert", entity }],
    state.polyline ? "LEADER" : "MLEADER",
  );
}

/** Cierra la directriz en construcción y la guarda. */
function closeLeader(state: LeaderState): LeaderState {
  if (state.current.length < 2) return state;
  return {
    ...state,
    lines: [...state.lines, state.current],
    references: [...state.references, state.currentReference],
    current: [],
    currentReference: undefined,
  };
}

function descriptor(polyline: boolean): CadCommandDescriptor<LeaderState> {
  const empty: LeaderState = {
    polyline,
    lines: [],
    references: [],
    current: [],
    arrowhead: "closed-filled",
    landing: true,
    textHeight: DEFAULT_TEXT_HEIGHT,
    style: "Standard",
    text: "",
    pending: "tip",
  };
  return {
    name: polyline ? "LEADER" : "MLEADER",
    aliases: polyline ? ["LE"] : ["MLD"],
    kind: "annotate",
    transparent: false,
    selection: "none",
    repeatable: true,
    mutates: true,
    cursor: "crosshair",
    begin: (context) => leaderStep(empty, context),
    step: (state, input, context) => {
      if (input.kind === "cancel") return cadCommandCancelled(state);

      if (input.kind === "keyword") {
        if (input.keyword === ARROW_OPTION.keyword) return leaderStep({ ...state, pending: "arrow" }, context);
        if (input.keyword === STYLE_OPTION.keyword) return leaderStep({ ...state, pending: "style" }, context);
        if (input.keyword === NO_LANDING.keyword)
          return leaderStep({ ...state, landing: !state.landing, pending: "tip" }, context);
        if (input.keyword === ADD_LEADER.keyword && state.lines.length < MAX_LEADERS)
          return leaderStep({ ...state, pending: "tip" }, context);
        return leaderStep(state, context);
      }

      if (input.kind === "text") {
        if (state.pending === "arrow") {
          const arrowhead = ARROWHEADS[input.value.trim().toLowerCase()];
          return leaderStep({ ...state, arrowhead: arrowhead ?? state.arrowhead, pending: "tip" }, context);
        }
        if (state.pending === "style")
          return leaderStep(
            { ...state, style: input.value.trim().slice(0, 128) || "Standard", pending: "tip" },
            context,
          );
        if (state.pending === "text") return leaderFinish(state, input.value, context);
        return leaderStep(state, context);
      }

      if (input.kind === "distance" && state.pending === "height") {
        const height = Math.abs(input.value);
        return leaderStep(
          { ...state, textHeight: height > 1e-9 ? height : state.textHeight, pending: "tip" },
          context,
        );
      }

      if (input.kind === "point" || input.kind === "entityPick") {
        if (state.pending === "tip") {
          // La punta se engancha: es el único punto que la regeneración mueve.
          const anchor = cadResolveAnchorAt(input.point, context);
          return leaderStep(
            {
              ...state,
              current: [anchor?.point ?? input.point],
              currentReference: anchor ? cadAnchorReference(anchor) : undefined,
              pending: state.polyline ? "vertex" : "elbow",
            },
            context,
          );
        }
        if (state.pending === "elbow") {
          const closed = closeLeader({ ...state, current: [...state.current, input.point] });
          return leaderStep({ ...closed, pending: "text" }, context);
        }
        if (state.pending === "vertex")
          return leaderStep({ ...state, current: [...state.current, input.point] }, context);
      }

      if (input.kind === "enter") {
        // En LEADER, Enter cierra la polilínea directriz y pasa al texto.
        if (state.pending === "vertex" && state.current.length >= 2)
          return leaderStep({ ...closeLeader(state), pending: "text" }, context);
        if (state.pending === "text") return leaderFinish(state, state.text, context);
        return cadCommandCancelled(state);
      }

      return leaderStep(state, context);
    },
  };
}

export const CAD_LEADER_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(descriptor(false)),
  asCadCommand(descriptor(true)),
];
