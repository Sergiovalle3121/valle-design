/**
 * STAIR: la escalera recta paramétrica (Ola E, 2026-09-02).
 *
 * Medido antes (`distancia-autocad-completo-20260901.md`, §4 1º
 * ARCHITECTURE): el producto tenía WALL, DOOR y WINDOW y ninguna escalera;
 * la fila `toolset-architecture.interiores` de la rúbrica decía «todavía
 * no». Una escalera se dibujaba a mano: N líneas, una flecha, un SUBE, y el
 * reparto de contrahuellas lo hacía el dibujante con la calculadora.
 *
 * ## Lo que la orden calcula, y de dónde salen los números
 *
 * Se teclea el arranque y un segundo punto que sólo fija la DIRECCIÓN de
 * subida; la longitud sale de la receta. Con la altura a salvar `H` y la
 * contrahuella máxima `cmax`:
 *
 *   - contrahuellas `N = ⌈H / cmax⌉` (al menos 2), contrahuella `c = H / N`;
 *   - huella `h = 630 − 2c` (Blondel, 2c + h = 630 mm) salvo que se teclee
 *     con `Huella`; desarrollo `(N − 1) · h`: hay una huella MENOS que
 *     contrahuellas, porque la última contrahuella es el canto del forjado.
 *
 * Los límites son los del reglamento que se aplica primero (Reglamento de
 * Construcciones de la Ciudad de México y sus NTC: contrahuella ≤ 180 mm,
 * huella ≥ 250 mm) y valen también en el CTE español (130–185 / ≥ 280 en
 * uso general, más exigente en la huella). La orden se NIEGA a fabricar una
 * escalera fuera de reglamento y lo dice con el número; Blondel es comodidad,
 * no reglamento: si el `2c + h` sale de 600–650 se dice, no se prohíbe.
 *
 * ## Lo que emite
 *
 * En un solo lote (una frontera de deshacer): la PLANTA —el contorno cerrado,
 * las N − 2 contrahuellas interiores como LINE (la primera y la última son
 * bordes del contorno), la línea de subida con su punta de flecha y el TEXT
 * «SUBE» girado con la escalera— y UN SOLID3D reeditable: un nodo `extrude`
 * cuyo perfil es el dentado de la escalera en el plano vertical de subida,
 * extruido a lo ancho —el mismo marco «de canto» que la cuña de WEDGE— con
 * el nombre que lleva la receta. Su volumen es exacto: `ancho · h · c ·
 * (N − 1) · N / 2`, y la spec lo contrasta contra esa fórmula en papel.
 *
 * ## Lo que NO hace, dicho aquí
 *
 *   - Sólo escaleras RECTAS de un tramo: sin descansos, sin tramos en L o U,
 *     sin compensadas ni de caracol.
 *   - El punto de arranque es la esquina IZQUIERDA del primer peldaño mirando
 *     hacia arriba; no hay Justificación.
 *   - El sólido es macizo (peldaños sobre el suelo), no una losa inclinada
 *     con su canto: la zanca vendrá con las escaleras de varios tramos.
 *   - No hay entidad `stair` persistida: la escalera se descompone en planta
 *     + sólido. Añadir un tipo de entidad es tocar el formato persistido,
 *     que es decisión del titular; hasta entonces la receta viaja en el
 *     nombre del sólido.
 */
import type { CadPoint2, CadPoint3 } from "../../cad-document";
import type { CadSolidNode } from "../../cad-entities-v5";
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
  type CadCommandInput,
  type CadCommandStep,
  type CadPreviewPath,
} from "../command-types";
import { cadLiftPoint } from "../spatial-point";
import { cadAlong, cadDirection, cadFromMillimetres, cadMillimetresLabel, cadToMillimetres, type CadDirection } from "./architecture-support";
import { finishedSolid, formatMagnitude, makeSolidEntity, solidCancelled, solidMessage } from "./solids-support";

/** Contrahuella máxima del reglamento, en mm. */
export const CAD_STAIR_MAX_RISER_MM = 180;
/** Huella mínima del reglamento, en mm. */
export const CAD_STAIR_MIN_TREAD_MM = 250;
/** Blondel: 2c + h, en mm. */
export const CAD_STAIR_BLONDEL_MM = 630;
/** Fuera de esta horquilla de 2c + h la escalera se dice incómoda (no se prohíbe). */
export const CAD_STAIR_COMFORT_MM: readonly [number, number] = [600, 650];
/** Altura de planta por defecto (la misma que WALL), en mm. */
export const CAD_STAIR_DEFAULT_RISE_MM = 2400;
/** Ancho por defecto (vivienda), en mm. */
export const CAD_STAIR_DEFAULT_WIDTH_MM = 1000;

const WIDTH = { keyword: "aNcho", shortcut: "N" } as const;
const RISE = { keyword: "Altura", shortcut: "A" } as const;
const TREAD = { keyword: "Huella", shortcut: "H" } as const;
const RISER = { keyword: "Contrahuella", shortcut: "C" } as const;

export interface CadStairRequest {
  /** Altura a salvar, en unidades del documento. */
  rise: number;
  width: number;
  /** Huella tecleada, o `null` para Blondel. */
  tread: number | null;
  /** Contrahuella máxima admitida. */
  maxRiser: number;
  unit: string | undefined;
}

export interface CadStairDesign {
  risers: number;
  riser: number;
  tread: number;
  /** `(risers − 1) · tread`. */
  run: number;
  width: number;
  rise: number;
  /** `2c + h`, en mm, para decirlo. */
  blondelMm: number;
  comfortable: boolean;
}

/** La receta, o el motivo por el que el reglamento la impide. */
export function cadStairDesign(request: CadStairRequest): CadStairDesign | { refused: string } {
  const mm = (value: number) => cadToMillimetres(value, request.unit);
  if (!(request.rise > 1e-9)) return { refused: "STAIR necesita una altura a salvar mayor que cero." };
  if (!(request.width > 1e-9)) return { refused: "STAIR necesita un ancho mayor que cero." };
  if (mm(request.maxRiser) > CAD_STAIR_MAX_RISER_MM + 1e-6)
    return { refused: `Contrahuella ${formatMagnitude(mm(request.maxRiser))} mm: el reglamento admite ${CAD_STAIR_MAX_RISER_MM} mm como máximo.` };
  if (!(request.maxRiser > 1e-9)) return { refused: "STAIR necesita una contrahuella mayor que cero." };
  if (request.tread !== null && mm(request.tread) < CAD_STAIR_MIN_TREAD_MM - 1e-6)
    return { refused: `Huella ${formatMagnitude(mm(request.tread))} mm: el reglamento pide ${CAD_STAIR_MIN_TREAD_MM} mm como mínimo.` };
  const risers = Math.max(2, Math.ceil(request.rise / request.maxRiser - 1e-9));
  const riser = request.rise / risers;
  const tread = request.tread ?? cadFromMillimetres(CAD_STAIR_BLONDEL_MM, request.unit) - 2 * riser;
  const blondelMm = 2 * mm(riser) + mm(tread);
  return {
    risers,
    riser,
    tread,
    run: (risers - 1) * tread,
    width: request.width,
    rise: request.rise,
    blondelMm,
    comfortable: blondelMm >= CAD_STAIR_COMFORT_MM[0] - 1e-6 && blondelMm <= CAD_STAIR_COMFORT_MM[1] + 1e-6,
  };
}

/** Lo que la orden dice al terminar: los números de la receta. */
export function cadStairSummary(design: CadStairDesign, unit: string | undefined): string {
  const mm = (value: number) => cadMillimetresLabel(value, unit);
  const comfort = design.comfortable ? "" : ` — fuera de la horquilla de comodidad ${CAD_STAIR_COMFORT_MM[0]}–${CAD_STAIR_COMFORT_MM[1]}`;
  return `${design.risers} contrahuellas de ${mm(design.riser)} mm y ${design.risers - 1} huellas de ${mm(design.tread)} mm; desarrollo ${mm(design.run)} mm, ancho ${mm(design.width)} mm; 2c + h = ${formatMagnitude(Math.round(design.blondelMm * 10) / 10)} mm${comfort}.`;
}

/** El dentado de la escalera en el plano vertical (x = avance, y = altura), antihorario. */
export function cadStairProfile(design: CadStairDesign): CadPoint2[] {
  const outer: CadPoint2[] = [{ x: 0, y: 0 }];
  for (let index = 1; index < design.risers; index += 1) {
    outer.push({ x: (index - 1) * design.tread, y: index * design.riser });
    outer.push({ x: index * design.tread, y: index * design.riser });
  }
  outer.push({ x: design.run, y: 0 });
  // (0,0) → sube → avanza → … → baja → vuelve por el suelo: es horario; el
  // kernel espera el perfil antihorario, como el de WEDGE.
  return outer.reverse();
}

/** Nodo `extrude` de canto: X del marco = avance, Y del marco = Z del mundo, extrusión a lo ancho. */
export function cadStairSolidNode(design: CadStairDesign, origin: CadPoint3, direction: CadDirection): CadSolidNode {
  return {
    id: "escalera",
    op: "extrude",
    profile: { outer: cadStairProfile(design) },
    // Y = Z × X: con Z = −izquierda y X = avance, Y sale (0, 0, 1). Desplazamiento
    // = altura · Z = −ancho · (−izquierda) = ancho hacia la izquierda.
    frame: {
      origin,
      xAxis: { x: direction.along.x, y: direction.along.y, z: 0 },
      zAxis: { x: -direction.left.x, y: -direction.left.y, z: 0 },
    },
    height: -design.width,
  };
}

export interface CadStairPlan {
  outline: CadPoint2[];
  /** Las contrahuellas INTERIORES, de borde a borde. */
  risers: [CadPoint2, CadPoint2][];
  travel: [CadPoint2, CadPoint2];
  arrow: [CadPoint2, CadPoint2, CadPoint2];
  label: { at: CadPoint2; height: number; degrees: number };
}

/** La planta: contorno, contrahuellas interiores, línea de subida, flecha y SUBE. */
export function cadStairPlan(design: CadStairDesign, origin: CadPoint2, direction: CadDirection): CadStairPlan {
  const at = (u: number, v: number) => cadAlong(origin, direction, u, v);
  const w = design.width;
  const risers: [CadPoint2, CadPoint2][] = [];
  for (let index = 1; index < design.risers - 1; index += 1)
    risers.push([at(index * design.tread, 0), at(index * design.tread, w)]);
  const barb = w / 5;
  return {
    outline: [at(0, 0), at(design.run, 0), at(design.run, w), at(0, w)],
    risers,
    travel: [at(0, w / 2), at(design.run, w / 2)],
    arrow: [at(design.run - barb, w / 2 + barb / 2), at(design.run, w / 2), at(design.run - barb, w / 2 - barb / 2)],
    label: { at: at(design.tread * 0.25, w / 2 + w * 0.06), height: w * 0.12, degrees: direction.degrees },
  };
}

interface StairState {
  start: CadPoint2 | null;
  width: number;
  rise: number;
  tread: number | null;
  maxRiser: number;
  pending: "none" | "width" | "rise" | "tread" | "riser";
}

function request(state: StairState, context: CadCommandContext): CadStairRequest {
  return { rise: state.rise, width: state.width, tread: state.tread, maxRiser: state.maxRiser, unit: context.unit };
}

function ask(state: StairState, message: string, options: readonly { keyword: string; shortcut: string }[], accepts: number, extra: { defaultValue?: string; preview?: CadPreviewPath[] } = {}): CadCommandStep<StairState> {
  return {
    state,
    prompt: { message, options: [...options], ...(extra.defaultValue ? { defaultValue: extra.defaultValue } : {}) },
    accepts,
    ...(extra.preview ? { preview: extra.preview } : {}),
  };
}

const PENDING_PROMPTS: Record<Exclude<StairState["pending"], "none">, string> = {
  width: "Precise el ancho de la escalera",
  rise: "Precise la altura a salvar",
  tread: "Precise la huella",
  riser: "Precise la contrahuella máxima",
};

function pendingValue(state: StairState): number {
  if (state.pending === "width") return state.width;
  if (state.pending === "rise") return state.rise;
  if (state.pending === "tread") return state.tread ?? 0;
  return state.maxRiser;
}

/** La planta bajo el cursor, con la receta vigente. */
function stairPreview(state: StairState, context: CadCommandContext): CadPreviewPath[] {
  if (!state.start || !context.cursor) return [];
  const direction = cadDirection(state.start, context.cursor);
  const design = cadStairDesign(request(state, context));
  if (!direction || "refused" in design) return [];
  const plan = cadStairPlan(design, state.start, direction);
  return [
    { points: plan.outline, closed: true },
    ...plan.risers.map((riser) => ({ points: riser, closed: false })),
    { points: plan.travel, closed: false },
    { points: plan.arrow, closed: false },
  ];
}

function stairStep(state: StairState, context: CadCommandContext): CadCommandStep<StairState> {
  if (state.pending !== "none") {
    const current = pendingValue(state);
    return ask(state, PENDING_PROMPTS[state.pending], [], CAD_ACCEPT_DISTANCE, current > 0 ? { defaultValue: String(current) } : {});
  }
  const options = [WIDTH, RISE, TREAD, RISER];
  if (!state.start)
    return ask(state, "Precise el punto de arranque de la escalera", options, CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD);
  return ask(state, "Precise la dirección de subida", options, CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD, { preview: stairPreview(state, context) });
}

function planEntities(plan: CadStairPlan, z: number, context: CadCommandContext): CadEntityCommand[] {
  const layer = context.activeLayer;
  const lift = (point: CadPoint2): CadPoint3 => ({ x: point.x, y: point.y, z });
  const entities: CadNativeEntity[] = [
    { id: context.newEntityId(), type: "polyline", vertices: plan.outline.map(lift), closed: true, layer },
    ...plan.risers.map(([a, b]): CadNativeEntity => ({ id: context.newEntityId(), type: "line", start: lift(a), end: lift(b), layer })),
    { id: context.newEntityId(), type: "polyline", vertices: plan.travel.map(lift), closed: false, layer },
    { id: context.newEntityId(), type: "polyline", vertices: plan.arrow.map(lift), closed: false, layer },
    {
      id: context.newEntityId(),
      type: "text",
      x: plan.label.at.x,
      y: plan.label.at.y,
      text: "SUBE",
      height: plan.label.height,
      ...(Math.abs(plan.label.degrees) > 1e-9 ? { rotation: plan.label.degrees } : {}),
      layer,
    },
  ];
  return entities.map((entity) => ({ type: "insert", entity }));
}

function finishStair(state: StairState, to: CadPoint2, context: CadCommandContext): CadCommandStep<StairState> {
  const start = state.start!;
  const direction = cadDirection(start, to);
  if (!direction) return solidMessage(state, "STAIR: el segundo punto coincide con el arranque y no da dirección de subida.");
  const design = cadStairDesign(request(state, context));
  if ("refused" in design) return solidMessage(state, design.refused);
  const origin = cadLiftPoint(start);
  const plan = cadStairPlan(design, start, direction);
  const summary = cadStairSummary(design, context.unit);
  const solid = makeSolidEntity(
    context.newEntityId(),
    [cadStairSolidNode(design, origin, direction)],
    "escalera",
    context.activeLayer,
    `Escalera ${design.risers} × ${cadMillimetresLabel(design.riser, context.unit)} / ${cadMillimetresLabel(design.tread, context.unit)} mm`,
  );
  return finishedSolid(solid, {
    state,
    label: "STAIR",
    before: planEntities(plan, origin.z, context),
    notice: `STAIR: ${summary}`,
  });
}

function readPending(state: StairState, input: CadCommandInput, context: CadCommandContext): CadCommandStep<StairState> {
  if (input.kind === "enter") return stairStep({ ...state, pending: "none" }, context);
  if (input.kind !== "distance") return stairStep(state, context);
  const value = Math.abs(input.value);
  if (!(value > 1e-9)) return solidMessage(state, `STAIR: ${PENDING_PROMPTS[state.pending as Exclude<StairState["pending"], "none">].toLowerCase().replace("precise ", "")} tiene que ser mayor que cero.`);
  const next: StairState = { ...state, pending: "none" };
  if (state.pending === "width") next.width = value;
  else if (state.pending === "rise") next.rise = value;
  else if (state.pending === "tread") next.tread = value;
  else next.maxRiser = value;
  // Un límite fuera de reglamento se rechaza al teclearlo, no al final, para
  // que el dibujante no coloque dos puntos y descubra entonces que no hay
  // escalera.
  const checked = cadStairDesign(request(next, context));
  if ("refused" in checked) return solidMessage(state, checked.refused);
  return stairStep(next, context);
}

const stairCommand: CadCommandDescriptor<StairState> = {
  name: "STAIR",
  aliases: ["STAIRADD", "ESCALERA"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  // La planta y el sólido toman la cota del arranque: sobre la planta elevada
  // a +3000 la escalera arranca a +3000. Su plano es el horizontal.
  spatial: "elevation",
  cursor: "crosshair",
  begin: (context) =>
    stairStep(
      {
        start: null,
        width: cadFromMillimetres(CAD_STAIR_DEFAULT_WIDTH_MM, context.unit),
        rise: cadFromMillimetres(CAD_STAIR_DEFAULT_RISE_MM, context.unit),
        tread: null,
        maxRiser: cadFromMillimetres(CAD_STAIR_MAX_RISER_MM, context.unit),
        pending: "none",
      },
      context,
    ),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidCancelled(state);
    if (state.pending !== "none") return readPending(state, input, context);
    if (input.kind === "keyword") {
      if (input.keyword === WIDTH.keyword) return stairStep({ ...state, pending: "width" }, context);
      if (input.keyword === RISE.keyword) return stairStep({ ...state, pending: "rise" }, context);
      if (input.keyword === TREAD.keyword) return stairStep({ ...state, pending: "tread" }, context);
      if (input.keyword === RISER.keyword) return stairStep({ ...state, pending: "riser" }, context);
      return stairStep(state, context);
    }
    if (input.kind === "enter") return solidMessage(state, state.start ? "STAIR necesita la dirección de subida." : "STAIR necesita un punto de arranque.");
    if (input.kind !== "point") return stairStep(state, context);
    if (!state.start) return stairStep({ ...state, start: input.point }, context);
    return finishStair(state, input.point, context);
  },
};

export const CAD_ARCHITECTURE_STAIR_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(stairCommand)];
