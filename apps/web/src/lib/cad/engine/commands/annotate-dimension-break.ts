/**
 * DIMBREAK — corta la línea de cota donde la cruza otro objeto.
 *
 * ## El problema que resuelve
 *
 * Una cota que atraviesa un muro, una línea de cambio de nivel o una
 * directriz se lee mal: la línea de cota y la del objeto se confunden en el
 * cruce. AutoCAD corta un hueco ahí — DIMBREAK — y lo VUELVE A CERRAR solo si
 * el objeto que lo abrió desaparece; nadie va cota por cota deshaciendo cortes
 * que ya no hacen falta.
 *
 * ## Cómo se guarda, y por qué así
 *
 * El hueco vive en `entity.breaks`: una fracción `[start, end]` de la línea
 * de cota (de `a` a `b`) por cada objeto que la cruza, con su `entityId`
 * colgado (`cad-dimension-day-to-day-fields.ts`). Es una FRACCIÓN y no una
 * coordenada absoluta porque la línea de cota se recalcula cada vez que algo
 * asociado se mueve; una fracción viaja con ella, una coordenada se quedaría
 * atrás.
 *
 * La restitución («se restituye al quitarlo») NO vive aquí: vive en
 * `restoreCadDimensionBreaks` (`associative-dimension.ts`), que quita de
 * `breaks` cualquier entrada cuyo `entityId` ya no exista en el documento. Es
 * la misma familia de regla que `regenerateAssociativeDimensions` — una
 * referencia que deja de señalar algo deja de tener efecto—, sólo que el
 * efecto que cae aquí es el hueco y no la cota entera.
 *
 * ## Alcance: cruces con LINE y WALL
 *
 * El hueco se calcula de una intersección segmento-segmento de verdad, y sólo
 * para objetos cuyo eje es un segmento recto — LINE y WALL, que comparten
 * forma (`start`/`end`) por diseño desde el esquema 6. Un círculo, un arco o
 * una polilínea curva piden resolver la intersección contra un arco o contra
 * varios tramos, que es trabajo de otra ola; aquí se DICE, no se finge.
 */
import type { CadEntity, CadPoint2 } from "../../cad-document";
import type { CadDimensionEntity } from "../../associative-dimension";
import { cadDimensionLineEnds } from "../../associative-dimension";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_SELECTION,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import { cadCommandCancelled, cadCommandRefused, cadCommandWrites } from "./annotate-support";

/** Medio ancho del hueco, en unidades de dibujo: el mismo tamaño de flecha del que ya deriva el resto de la familia. */
const DEFAULT_HALF_GAP = 180;

function asDimension(entity: CadEntity | undefined): CadDimensionEntity | null {
  return entity?.type === "dimension" ? entity : null;
}

/** El eje recto de un objeto que puede cruzar una línea de cota, o `null` si no tiene uno. */
function straightAxisOf(entity: CadEntity | undefined): { a: CadPoint2; b: CadPoint2 } | null {
  if (entity?.type === "line" || entity?.type === "wall")
    return { a: { x: entity.start.x, y: entity.start.y }, b: { x: entity.end.x, y: entity.end.y } };
  return null;
}

/**
 * Intersección de dos SEGMENTOS (no de las rectas que los contienen): el
 * cruce tiene que caer estrictamente DENTRO de los dos, o no es un cruce que
 * DIMBREAK deba abrir — un objeto que sólo toca la línea de cota por su
 * extremo no la «cruza».
 *
 * Devuelve la fracción `t` a lo largo de `p1`→`p2` donde ocurre, o `null` si
 * no cruzan.
 */
function segmentCrossingFraction(p1: CadPoint2, p2: CadPoint2, q1: CadPoint2, q2: CadPoint2): number | null {
  const rX = p2.x - p1.x;
  const rY = p2.y - p1.y;
  const sX = q2.x - q1.x;
  const sY = q2.y - q1.y;
  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) < 1e-9) return null; // paralelas o degeneradas: no cruzan de verdad
  const qpX = q1.x - p1.x;
  const qpY = q1.y - p1.y;
  const t = (qpX * sY - qpY * sX) / denom;
  const u = (qpX * rY - qpY * rX) / denom;
  const eps = 1e-6;
  if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null;
  return t;
}

interface BreakState {
  mode: "target" | "crossers";
  dimensionId: string | null;
  crosserIds: string[];
}

const EMPTY: BreakState = { mode: "target", dimensionId: null, crosserIds: [] };

function breakStep(state: BreakState): CadCommandStep<BreakState> {
  if (state.mode === "target")
    return {
      state,
      prompt: { message: "Designe la cota a cortar", options: [] },
      accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
    };
  return {
    state,
    prompt: {
      message: "Designe el objeto que la cruza",
      options: [],
      defaultValue: "Enter para aplicar",
    },
    accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
  };
}

function selectTarget(state: BreakState, entityId: string, context: CadCommandContext): CadCommandStep<BreakState> {
  const dimension = asDimension(context.entity?.(entityId));
  if (!dimension)
    return cadCommandRefused(
      state,
      `DIMBREAK corta la línea de una cota; ${(context.entity?.(entityId)?.type ?? "ese objeto").toUpperCase()} no lo es.`,
    );
  const kind = dimension.dimensionKind ?? "aligned";
  if (kind !== "linear" && kind !== "aligned")
    return cadCommandRefused(
      state,
      `DIMBREAK sólo corta la línea recta de una cota lineal o alineada; una cota de tipo ${kind} no tiene una que partir.`,
    );
  return breakStep({ ...state, mode: "crossers", dimensionId: entityId });
}

function apply(state: BreakState, context: CadCommandContext): CadCommandStep<BreakState> {
  const dimension = state.dimensionId ? asDimension(context.entity?.(state.dimensionId)) : null;
  if (!dimension) return cadCommandRefused(state, "La cota designada ya no existe en el dibujo.");
  const ends = cadDimensionLineEnds(dimension);
  if (!ends) return cadCommandRefused(state, "Esa cota no tiene una línea de cota recta que partir.");
  const length = Math.hypot(ends.b.x - ends.a.x, ends.b.y - ends.a.y);
  if (!(length > 1e-6)) return cadCommandRefused(state, "La línea de cota mide cero: no hay nada que cortar.");

  const halfGapFraction = Math.min(0.45, (dimension.arrowSize ?? DEFAULT_HALF_GAP) / length);
  const fresh: { entityId: string; start: number; end: number }[] = [];
  for (const crosserId of state.crosserIds) {
    const axis = straightAxisOf(context.entity?.(crosserId));
    if (!axis) continue; // tipo no soportado o entidad borrada: se ignora, no se finge un hueco
    const t = segmentCrossingFraction(ends.a, ends.b, axis.a, axis.b);
    if (t === null) continue; // no cruza de verdad
    fresh.push({ entityId: crosserId, start: Math.max(0, t - halfGapFraction), end: Math.min(1, t + halfGapFraction) });
  }
  if (fresh.length === 0)
    return cadCommandRefused(state, "Ninguno de los objetos designados cruza la línea de cota.");

  const kept = (dimension.breaks ?? []).filter((gap) => !fresh.some((next) => next.entityId === gap.entityId));
  const breaks = [...kept, ...fresh];

  return cadCommandWrites(
    state,
    [{ type: "replace", entityId: dimension.id, entity: { ...dimension, breaks } }],
    "DIMBREAK",
  );
}

const breakCommand: CadCommandDescriptor<BreakState> = {
  name: "DIMBREAK",
  aliases: [],
  kind: "annotate",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => {
    const [first] = context.selection;
    return first ? selectTarget(EMPTY, first, context) : breakStep(EMPTY);
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);

    if (state.mode === "target") {
      if (input.kind === "entityPick") return selectTarget(state, input.entityId, context);
      if (input.kind === "selection") {
        const [first] = input.entityIds;
        return first ? selectTarget(state, first, context) : breakStep(state);
      }
      if (input.kind === "enter") return cadCommandCancelled(state);
      return breakStep(state);
    }

    // state.mode === "crossers"
    if (input.kind === "entityPick")
      return breakStep({ ...state, crosserIds: [...new Set([...state.crosserIds, input.entityId])] });
    if (input.kind === "selection")
      return breakStep({ ...state, crosserIds: [...new Set([...state.crosserIds, ...input.entityIds])] });
    if (input.kind === "enter")
      return state.crosserIds.length > 0 ? apply(state, context) : cadCommandCancelled(state);
    return breakStep(state);
  },
};

export const CAD_DIMENSION_BREAK_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(breakCommand)];
