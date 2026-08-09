/**
 * DIMANGULAR y DIMARC.
 *
 * ## DIMANGULAR admite las dos formas, y se niega cuando no hay ángulo
 *
 * Se puede designar dos rectas —lo habitual— o precisar vértice y dos extremos.
 * Con dos rectas, el vértice es su intersección y cada lado se toma del extremo
 * MÁS CERCANO al punto por el que se pinchó cada recta: es lo que distingue
 * medir 60° de medir los 120° suplementarios, y es información que sólo está en
 * dónde se pinchó.
 *
 * Dos rectas paralelas no forman ángulo. La orden lo DICE en vez de callarse:
 * `buildCadDimensionGeometry` devolvería `null` y en el dibujo aparecería una
 * cota invisible, que es la peor de las respuestas posibles.
 *
 * La forma de dos rectas nace NO asociativa a propósito: su punto de definición
 * es una intersección, y el vocabulario de anclajes del esquema no tiene
 * «intersección de estas dos entidades». Marcarla como asociada dejaría una cota
 * que dice estarlo y no se mueve. La forma de tres puntos sí se engancha cuando
 * los tres caen sobre anclajes.
 *
 * ## DIMARC mide el ARCO, no la cuerda
 *
 * La longitud de arco es `radio × barrido`, así que el radio de la cota tiene
 * que ser el del arco de verdad —no el sitio donde se suelte el ratón— o el
 * número sale mal. Por eso DIMARC no pide ubicación: designa el arco y ya.
 *
 * Y es asociativa entera: centro, arranque y final del arco son los tres
 * anclajes del arco. Al cambiarle el radio, `regenerateAssociativeDimensions`
 * mueve los tres puntos y RE-DERIVA el radio de los dos primeros, así que la
 * longitud se recalcula sola.
 */
import type { CadPoint2 } from "../../cad-document";
import {
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
import {
  cadCommandCancelled,
  cadCommandRefused,
  cadCommandWrites,
  cadDirection,
  cadDistance,
  type CadAssociationReference,
} from "./annotate-support";
import {
  cadDimensionEntity,
  cadDimensionPick,
  cadSweepDegrees,
  type CadDimensionPick,
} from "./dimension-support";

// ---------------------------------------------------------------------------
// DIMANGULAR
// ---------------------------------------------------------------------------

const VERTEX = { keyword: "Vértice", shortcut: "V" } as const;

type AngularPending = "first-line" | "second-line" | "vertex" | "ray-a" | "ray-b" | "location";

interface AngularState {
  /** Vértice y los dos extremos, ya resueltos. */
  vertex: CadDimensionPick | null;
  rayA: CadDimensionPick | null;
  rayB: CadDimensionPick | null;
  /** Primera recta designada, con el punto por el que se pinchó. */
  firstLine: { entityId: string; at: CadPoint2 } | null;
  pending: AngularPending;
}

const ANGULAR_PROMPTS: Readonly<Record<AngularPending, string>> = {
  "first-line": "Designe la primera recta o precise el vértice",
  "second-line": "Designe la segunda recta",
  vertex: "Precise el vértice del ángulo",
  "ray-a": "Precise el primer extremo del ángulo",
  "ray-b": "Precise el segundo extremo del ángulo",
  location: "Precise la ubicación del arco de cota",
};

function angularStep(state: AngularState, context: CadCommandContext): CadCommandStep<AngularState> {
  return {
    state,
    prompt: {
      message: ANGULAR_PROMPTS[state.pending],
      options: state.pending === "first-line" ? [VERTEX] : [],
    },
    accepts:
      state.pending === "first-line"
        ? CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD
        : state.pending === "second-line"
          ? CAD_ACCEPT_ENTITY_PICK
          : CAD_ACCEPT_POINT | CAD_ACCEPT_ENTITY_PICK,
    preview:
      state.vertex && context.cursor ? [{ points: [state.vertex.point, context.cursor] }] : [],
  };
}

/** Intersección de dos rectas infinitas. `null` si son paralelas. */
function intersect(
  a1: CadPoint2,
  a2: CadPoint2,
  b1: CadPoint2,
  b2: CadPoint2,
): CadPoint2 | null {
  const ax = a2.x - a1.x;
  const ay = a2.y - a1.y;
  const bx = b2.x - b1.x;
  const by = b2.y - b1.y;
  const denominator = ax * by - ay * bx;
  // El umbral es relativo a las longitudes: con uno absoluto, dos rectas de
  // 20.000 unidades casi paralelas darían un determinante grande y la
  // intersección saldría a kilómetros del dibujo.
  const scale = Math.hypot(ax, ay) * Math.hypot(bx, by);
  if (!(Math.abs(denominator) > scale * 1e-9)) return null;
  const t = ((b1.x - a1.x) * by - (b1.y - a1.y) * bx) / denominator;
  return { x: a1.x + ax * t, y: a1.y + ay * t };
}

function lineEnds(entity: { type: string } & Record<string, unknown>): [CadPoint2, CadPoint2] | null {
  if (entity.type !== "line") return null;
  const start = entity.start as CadPoint2;
  const end = entity.end as CadPoint2;
  return [
    { x: start.x, y: start.y },
    { x: end.x, y: end.y },
  ];
}

function fromTwoLines(
  state: AngularState,
  secondId: string,
  secondAt: CadPoint2,
  context: CadCommandContext,
): CadCommandStep<AngularState> {
  const first = state.firstLine!;
  const firstEntity = context.entity?.(first.entityId);
  const secondEntity = context.entity?.(secondId);
  const firstEnds = firstEntity ? lineEnds(firstEntity as never) : null;
  const secondEnds = secondEntity ? lineEnds(secondEntity as never) : null;
  if (!firstEnds || !secondEnds)
    return cadCommandRefused(state, "DIMANGULAR con dos objetos necesita dos LINE.");
  const vertex = intersect(firstEnds[0], firstEnds[1], secondEnds[0], secondEnds[1]);
  if (!vertex)
    return cadCommandRefused(
      state,
      "Las dos rectas son paralelas: no forman ángulo que medir. Usa DIMLINEAR para la separación.",
    );
  // El extremo más cercano al punto por el que se pinchó cada recta: es lo que
  // decide si se mide el ángulo o su suplementario.
  const nearest = (ends: [CadPoint2, CadPoint2], at: CadPoint2) =>
    cadDistance(ends[0], at) <= cadDistance(ends[1], at) ? ends[0] : ends[1];
  return angularFinishable(
    {
      ...state,
      vertex: { point: vertex },
      rayA: { point: nearest(firstEnds, first.at) },
      rayB: { point: nearest(secondEnds, secondAt) },
      pending: "location",
    },
    context,
  );
}

/** Comprueba que el ángulo existe ANTES de pedir dónde va el arco. */
function angularFinishable(
  state: AngularState,
  context: CadCommandContext,
): CadCommandStep<AngularState> {
  const first = cadDirection(state.vertex!.point, state.rayA!.point);
  const second = cadDirection(state.vertex!.point, state.rayB!.point);
  if (!first || !second)
    return cadCommandRefused(state, "Un lado del ángulo tiene longitud cero: no hay ángulo que medir.");
  const sweep = cadSweepDegrees(first, second);
  if (sweep < 1e-6 || sweep > 360 - 1e-6)
    return cadCommandRefused(
      state,
      `Los dos lados apuntan en la misma dirección (${sweep.toFixed(3)}°): no hay ángulo que medir.`,
    );
  return angularStep(state, context);
}

function angularFinish(
  state: AngularState,
  location: CadPoint2,
  context: CadCommandContext,
): CadCommandStep<AngularState> {
  const vertex = state.vertex!;
  const radius = Math.max(1e-6, cadDistance(vertex.point, location));
  const references: readonly (CadAssociationReference | undefined)[] = [
    vertex.reference,
    state.rayA!.reference,
    state.rayB!.reference,
  ];
  return cadCommandWrites(
    state,
    [
      {
        type: "insert",
        entity: cadDimensionEntity(
          {
            kind: "angular",
            a: vertex.point,
            b: state.rayA!.point,
            c: state.rayB!.point,
            radius,
            references,
          },
          context,
        ),
      },
    ],
    "DIMANGULAR",
  );
}

const angularCommand: CadCommandDescriptor<AngularState> = {
  name: "DIMANGULAR",
  aliases: ["DAN"],
  kind: "annotate",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) =>
    angularStep({ vertex: null, rayA: null, rayB: null, firstLine: null, pending: "first-line" }, context),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);

    if (input.kind === "keyword" && input.keyword === VERTEX.keyword)
      return angularStep({ ...state, pending: "vertex" }, context);

    if (input.kind === "entityPick") {
      if (state.pending === "first-line")
        return angularStep(
          { ...state, firstLine: { entityId: input.entityId, at: input.point }, pending: "second-line" },
          context,
        );
      if (state.pending === "second-line") return fromTwoLines(state, input.entityId, input.point, context);
    }

    if (input.kind === "point" || input.kind === "entityPick") {
      if (state.pending === "location") return angularFinish(state, input.point, context);
      const pick = cadDimensionPick(input, context);
      if (!pick) return angularStep(state, context);
      // Un punto en el primer paso significa «voy por vértice y dos extremos».
      if (state.pending === "first-line" || state.pending === "vertex")
        return angularStep({ ...state, vertex: pick, pending: "ray-a" }, context);
      if (state.pending === "ray-a") return angularStep({ ...state, rayA: pick, pending: "ray-b" }, context);
      if (state.pending === "ray-b")
        return angularFinishable({ ...state, rayB: pick, pending: "location" }, context);
    }

    if (input.kind === "enter") return cadCommandCancelled(state);
    return angularStep(state, context);
  },
};

// ---------------------------------------------------------------------------
// DIMARC
// ---------------------------------------------------------------------------

interface ArcState {
  picked: string | null;
}

function arcStep(state: ArcState): CadCommandStep<ArcState> {
  return {
    state,
    prompt: { message: "Designe el arco a acotar", options: [] },
    accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
  };
}

function arcFinish(
  state: ArcState,
  entityId: string,
  context: CadCommandContext,
): CadCommandStep<ArcState> {
  const entity = context.entity?.(entityId);
  if (!entity) return cadCommandRefused(state, `No encuentro el objeto ${entityId} en este dibujo.`);
  if (entity.type === "circle")
    return cadCommandRefused(
      state,
      "Un círculo completo no tiene longitud de arco que acotar. Usa DIMDIAMETER o DIMRADIUS.",
    );
  if (entity.type !== "arc")
    return cadCommandRefused(state, `DIMARC acota ARC; ${entity.type.toUpperCase()} no es un arco.`);

  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const center = { x: entity.center.x, y: entity.center.y };
  const start = {
    x: center.x + Math.cos(toRadians(entity.startAngle)) * entity.radius,
    y: center.y + Math.sin(toRadians(entity.startAngle)) * entity.radius,
  };
  const end = {
    x: center.x + Math.cos(toRadians(entity.endAngle)) * entity.radius,
    y: center.y + Math.sin(toRadians(entity.endAngle)) * entity.radius,
  };
  const sweep = cadSweepDegrees(
    { x: Math.cos(toRadians(entity.startAngle)), y: Math.sin(toRadians(entity.startAngle)) },
    { x: Math.cos(toRadians(entity.endAngle)), y: Math.sin(toRadians(entity.endAngle)) },
  );
  if (sweep < 1e-6)
    return cadCommandRefused(state, "El arco tiene barrido cero: no hay longitud que acotar.");

  return cadCommandWrites(
    state,
    [
      {
        type: "insert",
        entity: cadDimensionEntity(
          {
            kind: "arc-length",
            a: center,
            b: start,
            c: end,
            radius: entity.radius,
            references: [
              { entityId, anchor: "center" },
              { entityId, anchor: "arc-start" },
              { entityId, anchor: "arc-end" },
            ],
          },
          context,
        ),
      },
    ],
    "DIMARC",
  );
}

const arcCommand: CadCommandDescriptor<ArcState> = {
  name: "DIMARC",
  aliases: ["DAR"],
  kind: "annotate",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => {
    const [first] = context.selection;
    return first ? arcFinish({ picked: first }, first, context) : arcStep({ picked: null });
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);
    if (input.kind === "entityPick") return arcFinish(state, input.entityId, context);
    if (input.kind === "selection") {
      const [first] = input.entityIds;
      return first ? arcFinish(state, first, context) : arcStep(state);
    }
    if (input.kind === "enter") return cadCommandCancelled(state);
    return arcStep(state);
  },
};

export const CAD_DIMENSION_ANGULAR_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(angularCommand),
  asCadCommand(arcCommand),
];

export const __testables = { intersect };
