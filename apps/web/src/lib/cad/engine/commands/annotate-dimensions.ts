/**
 * DIMLINEAR y DIMALIGNED.
 *
 * Las dos cotas que sostienen un plano. Comparten máquina porque comparten
 * gesto —dos orígenes de línea de referencia y dónde cae la línea de cota— y se
 * separan sólo en cómo se convierte el punto de caída en desfase: la lineal mide
 * la PROYECCIÓN sobre un eje y la alineada la distancia REAL.
 *
 * ## Tres decisiones que se notan al usarlas
 *
 * **Enter en el primer paso designa un objeto.** Es como se acota de verdad: se
 * pulsa Enter, se señala la línea y ya está, en lugar de perseguir sus dos
 * extremos. Los extremos salen de `cadDimensionEnds`, con sus anclajes, así que
 * esa cota nace asociativa sin que haya que pedir nada.
 *
 * **Horizontal o vertical lo decide el arrastre.** Si la línea de cota se suelta
 * arriba o abajo, se mide la distancia horizontal; si se suelta a un lado, la
 * vertical. Preguntarlo sería un paso más para algo que el gesto ya dijo. Las
 * opciones `Horizontal` y `Vertical` siguen ahí para forzarlo.
 *
 * **Una proyección nula se rechaza diciéndolo.** Una cota horizontal entre dos
 * puntos que comparten X no mide nada; `linearDimension` devuelve `null` y sin
 * este guardia la orden escribiría una cota que no se dibuja.
 */
import type { CadPoint2 } from "../../cad-document";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_SELECTION,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import {
  cadCommandCancelled,
  cadCommandRefused,
  cadCommandWrites,
  type CadAssociationReference,
} from "./annotate-support";
import {
  cadAlignedOffset,
  cadDimensionEnds,
  cadDimensionEntity,
  cadDimensionPick,
  cadLinearAxis,
  cadLinearOffset,
  type CadDimensionPick,
} from "./dimension-support";

const OBJECT = { keyword: "Objeto", shortcut: "O" } as const;
const HORIZONTAL = { keyword: "Horizontal", shortcut: "H" } as const;
const VERTICAL = { keyword: "Vertical", shortcut: "V" } as const;
const TEXT_OPTION = { keyword: "Texto", shortcut: "T" } as const;

type Pending = "first" | "second" | "object" | "location" | "text";

interface LinearState {
  aligned: boolean;
  first: CadDimensionPick | null;
  second: CadDimensionPick | null;
  /** Eje forzado por opción. `null` = lo decide el arrastre. */
  forcedAxis: "x" | "y" | null;
  textOverride: string;
  pending: Pending;
}

function promptFor(state: LinearState): string {
  if (state.pending === "first") return "Precise el origen de la primera línea de referencia";
  if (state.pending === "second") return "Precise el origen de la segunda línea de referencia";
  if (state.pending === "object") return "Designe el objeto a acotar";
  if (state.pending === "text") return "Escriba el texto de la cota";
  return "Precise la ubicación de la línea de cota";
}

function linearStep(state: LinearState, context: CadCommandContext): CadCommandStep<LinearState> {
  const options =
    state.pending === "first"
      ? [OBJECT]
      : state.pending === "location"
        ? state.aligned
          ? [TEXT_OPTION]
          : [HORIZONTAL, VERTICAL, TEXT_OPTION]
        : [];
  return {
    state,
    prompt: {
      message: promptFor(state),
      options,
      ...(state.pending === "first" ? { defaultOption: OBJECT.keyword } : {}),
    },
    accepts:
      state.pending === "object"
        ? CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION
        : state.pending === "text"
          ? CAD_ACCEPT_TEXT
          : state.pending === "first"
            ? CAD_ACCEPT_POINT | CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_KEYWORD
            : state.pending === "second"
              ? CAD_ACCEPT_POINT | CAD_ACCEPT_ENTITY_PICK
              : CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    preview:
      state.first && state.second
        ? [{ points: [state.first.point, state.second.point] }]
        : state.first && context.cursor
          ? [{ points: [state.first.point, context.cursor] }]
          : [],
  };
}

function finish(
  state: LinearState,
  location: CadPoint2,
  context: CadCommandContext,
): CadCommandStep<LinearState> {
  const a = state.first!.point;
  const b = state.second!.point;
  const references: readonly (CadAssociationReference | undefined)[] = [
    state.first!.reference,
    state.second!.reference,
  ];

  if (state.aligned) {
    const offset = cadAlignedOffset(a, b, location);
    if (offset === null)
      return cadCommandRefused(
        state,
        "Los dos orígenes coinciden: una cota alineada necesita dos puntos distintos.",
      );
    return cadCommandWrites(
      state,
      [
        {
          type: "insert",
          entity: cadDimensionEntity(
            { kind: "aligned", a, b, offset, references, text: state.textOverride },
            context,
          ),
        },
      ],
      "DIMALIGNED",
    );
  }

  const axis = state.forcedAxis ?? cadLinearAxis(a, b, location);
  const projection = axis === "x" ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y);
  if (projection < 1e-9)
    return cadCommandRefused(
      state,
      `Una cota ${axis === "x" ? "horizontal" : "vertical"} entre esos dos puntos mide cero: ` +
        `comparten la coordenada ${axis === "x" ? "X" : "Y"}. Usa DIMALIGNED o suéltala del otro lado.`,
    );
  return cadCommandWrites(
    state,
    [
      {
        type: "insert",
        entity: cadDimensionEntity(
          {
            kind: "linear",
            a,
            b,
            axis,
            offset: cadLinearOffset(a, b, axis, location),
            references,
            text: state.textOverride,
          },
          context,
        ),
      },
    ],
    "DIMLINEAR",
  );
}

function selectObject(
  state: LinearState,
  entityId: string,
  context: CadCommandContext,
): CadCommandStep<LinearState> {
  const entity = context.entity?.(entityId);
  if (!entity) return cadCommandRefused(state, `No encuentro el objeto ${entityId} en este dibujo.`);
  const ends = cadDimensionEnds(entity);
  if (!ends)
    return cadCommandRefused(
      state,
      `No sé qué medir en un ${entity.type.toUpperCase()}. Precisa los dos orígenes a mano.`,
    );
  return linearStep({ ...state, first: ends[0], second: ends[1], pending: "location" }, context);
}

function descriptor(aligned: boolean): CadCommandDescriptor<LinearState> {
  const empty: LinearState = {
    aligned,
    first: null,
    second: null,
    forcedAxis: null,
    textOverride: "",
    pending: "first",
  };
  return {
    name: aligned ? "DIMALIGNED" : "DIMLINEAR",
    aliases: aligned ? ["DAL"] : ["DLI"],
    kind: "annotate",
    transparent: false,
    selection: "none",
    repeatable: true,
    mutates: true,
    cursor: "crosshair",
    begin: (context) => linearStep(empty, context),
    step: (state, input, context) => {
      if (input.kind === "cancel") return cadCommandCancelled(state);

      if (input.kind === "keyword") {
        if (input.keyword === OBJECT.keyword) return linearStep({ ...state, pending: "object" }, context);
        if (input.keyword === HORIZONTAL.keyword)
          return linearStep({ ...state, forcedAxis: "x" }, context);
        if (input.keyword === VERTICAL.keyword) return linearStep({ ...state, forcedAxis: "y" }, context);
        if (input.keyword === TEXT_OPTION.keyword) return linearStep({ ...state, pending: "text" }, context);
        return linearStep(state, context);
      }

      if (input.kind === "text" && state.pending === "text")
        return linearStep(
          { ...state, textOverride: input.value.slice(0, 256), pending: "location" },
          context,
        );

      if (input.kind === "selection" && state.pending === "object") {
        const [entityId] = input.entityIds;
        return entityId ? selectObject(state, entityId, context) : linearStep(state, context);
      }

      if (input.kind === "entityPick" && state.pending === "object")
        return selectObject(state, input.entityId, context);

      if (input.kind === "point" || input.kind === "entityPick") {
        if (state.pending === "location") return finish(state, input.point, context);
        const pick = cadDimensionPick(input, context);
        if (!pick) return linearStep(state, context);
        if (state.pending === "first")
          return linearStep({ ...state, first: pick, pending: "second" }, context);
        if (state.pending === "second")
          return linearStep({ ...state, second: pick, pending: "location" }, context);
      }

      // Enter en el primer paso es «designar objeto», el gesto de AutoCAD; en
      // cualquier otro sitio no hay nada que aceptar y termina sin escribir.
      if (input.kind === "enter")
        return state.pending === "first"
          ? linearStep({ ...state, pending: "object" }, context)
          : cadCommandCancelled(state);

      return linearStep(state, context);
    },
  };
}

export const CAD_DIMENSION_LINEAR_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(descriptor(false)),
  asCadCommand(descriptor(true)),
];
