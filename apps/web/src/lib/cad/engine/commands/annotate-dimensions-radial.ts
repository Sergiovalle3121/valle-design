/**
 * DIMRADIUS, DIMDIAMETER y DIMORDINATE.
 *
 * ## Radio y diámetro no piden dónde va el texto
 *
 * Podrían, y AutoCAD lo pregunta. Aquí no, y es una decisión: el campo que
 * guardaría esa respuesta es `textPosition`, y `regenerateAssociativeDimensions`
 * NO lo mueve al regenerar. Una cota de radio con el texto clavado en
 * coordenadas absolutas se queda atrás en cuanto el círculo se mueve, así que la
 * orden deja el texto derivado de la geometría —que sí sigue al círculo— y quien
 * quiera colocarlo a mano tiene el grip «Texto» del adaptador para eso.
 *
 * Lo que sí se lee del ratón es POR QUÉ LADO se pinchó: se toma el anclaje del
 * arco más cercano al punto designado, de modo que la flecha sale por donde se
 * señaló y la cota sigue siendo asociativa.
 *
 * ## DIMORDINATE necesita un datum explícito
 *
 * En AutoCAD el origen de una cota de coordenadas es el del SCP. Este producto
 * no tiene todavía un SCP que se pueda mover, así que inventarse el origen del
 * dibujo daría cotas de coordenadas correctas sólo por casualidad. La orden lo
 * PREGUNTA. Cuando llegue el SCP, este primer paso podrá proponerlo por defecto.
 *
 * El eje lo decide la directriz, como en AutoCAD: si sale hacia arriba o abajo
 * se está acotando la X; si sale de lado, la Y.
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
  cadDistance,
  cadEntityAnchorCandidates,
  type CadAssociationReference,
} from "./annotate-support";
import { cadDimensionEntity, cadDimensionPick, type CadDimensionPick } from "./dimension-support";

// ---------------------------------------------------------------------------
// DIMRADIUS y DIMDIAMETER
// ---------------------------------------------------------------------------

interface RadialState {
  diameter: boolean;
}

function radialStep(state: RadialState): CadCommandStep<RadialState> {
  return {
    state,
    prompt: {
      message: state.diameter
        ? "Designe el círculo o arco cuyo diámetro se acota"
        : "Designe el círculo o arco cuyo radio se acota",
      options: [],
    },
    accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
  };
}

function radialFinish(
  state: RadialState,
  entityId: string,
  at: CadPoint2 | null,
  context: CadCommandContext,
): CadCommandStep<RadialState> {
  const entity = context.entity?.(entityId);
  if (!entity) return cadCommandRefused(state, `No encuentro el objeto ${entityId} en este dibujo.`);
  if (entity.type !== "circle" && entity.type !== "arc")
    return cadCommandRefused(
      state,
      `${state.diameter ? "DIMDIAMETER" : "DIMRADIUS"} acota CIRCLE y ARC; ` +
        `${entity.type.toUpperCase()} no tiene radio.`,
    );
  if (!(entity.radius > 1e-9))
    return cadCommandRefused(state, "El radio es cero: no hay nada que acotar.");

  const candidates = cadEntityAnchorCandidates(entity);
  const center = candidates.find((candidate) => candidate.anchor === "center");
  const edges = candidates.filter(
    (candidate) => candidate.anchor === "arc-start" || candidate.anchor === "arc-end",
  );
  if (!center || edges.length === 0)
    return cadCommandRefused(state, "No se pueden resolver los anclajes de ese objeto.");
  // Por dónde se pinchó decide por dónde sale la flecha.
  const edge = at
    ? edges.reduce((best, candidate) =>
        cadDistance(candidate.point, at) < cadDistance(best.point, at) ? candidate : best,
      )
    : edges[0];

  return cadCommandWrites(
    state,
    [
      {
        type: "insert",
        entity: cadDimensionEntity(
          {
            kind: state.diameter ? "diameter" : "radius",
            a: center.point,
            b: edge.point,
            radius: entity.radius,
            references: [
              { entityId, anchor: "center" },
              { entityId, anchor: edge.anchor },
            ],
          },
          context,
        ),
      },
    ],
    state.diameter ? "DIMDIAMETER" : "DIMRADIUS",
  );
}

function radialDescriptor(diameter: boolean): CadCommandDescriptor<RadialState> {
  const empty: RadialState = { diameter };
  return {
    name: diameter ? "DIMDIAMETER" : "DIMRADIUS",
    aliases: diameter ? ["DDI"] : ["DRA"],
    kind: "annotate",
    transparent: false,
    selection: "optional",
    repeatable: true,
    mutates: true,
    cursor: "pick",
    begin: (context) => {
      const [first] = context.selection;
      return first ? radialFinish(empty, first, null, context) : radialStep(empty);
    },
    step: (state, input, context) => {
      if (input.kind === "cancel") return cadCommandCancelled(state);
      if (input.kind === "entityPick") return radialFinish(state, input.entityId, input.point, context);
      if (input.kind === "selection") {
        const [first] = input.entityIds;
        return first ? radialFinish(state, first, null, context) : radialStep(state);
      }
      if (input.kind === "enter") return cadCommandCancelled(state);
      return radialStep(state);
    },
  };
}

// ---------------------------------------------------------------------------
// DIMORDINATE
// ---------------------------------------------------------------------------

const XDATUM = { keyword: "Xdatum", shortcut: "X" } as const;
const YDATUM = { keyword: "Ydatum", shortcut: "Y" } as const;

type OrdinatePending = "datum" | "feature" | "leader";

interface OrdinateState {
  datum: CadDimensionPick | null;
  feature: CadDimensionPick | null;
  forcedAxis: "x" | "y" | null;
  pending: OrdinatePending;
}

const ORDINATE_PROMPTS: Readonly<Record<OrdinatePending, string>> = {
  datum: "Precise el origen de referencia (datum)",
  feature: "Precise el punto a acotar",
  leader: "Precise el extremo de la línea directriz",
};

function ordinateStep(state: OrdinateState, context: CadCommandContext): CadCommandStep<OrdinateState> {
  return {
    state,
    prompt: {
      message: ORDINATE_PROMPTS[state.pending],
      options: state.pending === "leader" ? [XDATUM, YDATUM] : [],
    },
    accepts:
      CAD_ACCEPT_POINT |
      CAD_ACCEPT_ENTITY_PICK |
      (state.pending === "leader" ? CAD_ACCEPT_KEYWORD : 0),
    preview:
      state.feature && context.cursor ? [{ points: [state.feature.point, context.cursor] }] : [],
  };
}

function ordinateFinish(
  state: OrdinateState,
  leader: CadPoint2,
  context: CadCommandContext,
): CadCommandStep<OrdinateState> {
  const datum = state.datum!;
  const feature = state.feature!;
  // Directriz vertical → se está acotando la X; horizontal → la Y. Es la regla
  // de AutoCAD y evita un paso: el gesto ya lo dijo.
  const dx = Math.abs(leader.x - feature.point.x);
  const dy = Math.abs(leader.y - feature.point.y);
  const axis = state.forcedAxis ?? (dy >= dx ? "x" : "y");
  const references: readonly (CadAssociationReference | undefined)[] = [
    datum.reference,
    feature.reference,
  ];
  return cadCommandWrites(
    state,
    [
      {
        type: "insert",
        entity: cadDimensionEntity(
          { kind: "ordinate", a: datum.point, b: feature.point, c: leader, axis, references },
          context,
        ),
      },
    ],
    "DIMORDINATE",
  );
}

const ordinateCommand: CadCommandDescriptor<OrdinateState> = {
  name: "DIMORDINATE",
  aliases: ["DOR"],
  kind: "annotate",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) =>
    ordinateStep({ datum: null, feature: null, forcedAxis: null, pending: "datum" }, context),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);

    if (input.kind === "keyword") {
      if (input.keyword === XDATUM.keyword) return ordinateStep({ ...state, forcedAxis: "x" }, context);
      if (input.keyword === YDATUM.keyword) return ordinateStep({ ...state, forcedAxis: "y" }, context);
      return ordinateStep(state, context);
    }

    if (input.kind === "point" || input.kind === "entityPick") {
      if (state.pending === "leader") return ordinateFinish(state, input.point, context);
      const pick = cadDimensionPick(input, context);
      if (!pick) return ordinateStep(state, context);
      if (state.pending === "datum") return ordinateStep({ ...state, datum: pick, pending: "feature" }, context);
      return ordinateStep({ ...state, feature: pick, pending: "leader" }, context);
    }

    if (input.kind === "enter") return cadCommandCancelled(state);
    return ordinateStep(state, context);
  },
};

export const CAD_DIMENSION_RADIAL_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(radialDescriptor(false)),
  asCadCommand(radialDescriptor(true)),
  asCadCommand(ordinateCommand),
];
