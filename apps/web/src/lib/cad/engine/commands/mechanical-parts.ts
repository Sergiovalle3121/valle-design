/**
 * STDPART y STEELSHAPE: colocar un normalizado como bloque (Ola I, 2026-09-02).
 *
 * El mismo reparto que MEPSYMBOL: se elige la pieza, se teclean sus medidas,
 * se precisa el punto y el giro, y la orden emite UN lote —la definición del
 * bloque si el documento no la tiene y el INSERT—. Un bloque ya definido (del
 * propio catálogo o redefinido por el despacho) no se pisa: manda el del
 * documento.
 *
 * La geometría del catálogo está en milímetros; la inserción se escala con
 * los milímetros por unidad del documento, así que un M10 mide diez
 * milímetros en un dibujo en metros. (MEPSYMBOL no lo hace: sus símbolos son
 * de planta arquitectónica, que se dibuja en mm; aquí se dice.)
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import { cadInsertBlockCommands } from "../../blocks/block-workflow";
import {
  CAD_METRIC_LIST,
  CAD_STEEL_SHAPES,
  cadMechanicalBlockDefinition,
  cadMechanicalBolt,
  cadMechanicalNut,
  cadMechanicalSteelShape,
  cadMechanicalWasher,
  cadSteelKgPerMetre,
  cadSteelShapeFor,
  type CadMechanicalFamily,
  type CadMechanicalPart,
  type CadSteelShape,
} from "../../mechanical-parts";
import {
  CAD_ACCEPT_ANGLE,
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import { cadCommandCancelled, cadCommandRefused } from "./annotate-support";
import { cadMillimetresPerUnit } from "./architecture-support";

/** El lote: bloque (si falta) e inserción escalada a la unidad del documento. */
export function cadMechanicalInsertCommands(part: CadMechanicalPart, point: CadPoint2, rotation: number, context: CadCommandContext): { commands: CadEntityCommand[]; defined: boolean } {
  const commands: CadEntityCommand[] = [];
  const existing = context.blocks?.().find((block) => block.id === part.id);
  const definition = existing ?? cadMechanicalBlockDefinition(part);
  if (!existing) commands.push({ type: "block", op: "define", definition });
  const scale = 1 / cadMillimetresPerUnit(context.unit);
  commands.push(
    ...cadInsertBlockCommands({
      id: context.newEntityId(),
      block: definition,
      insertion: { x: point.x, y: point.y, z: 0 },
      scale: { x: scale, y: scale, z: scale },
      rotation,
      layer: context.activeLayer,
    }),
  );
  return { commands, defined: !existing };
}

const at = (point: CadPoint2) => `(${Math.round(point.x)}, ${Math.round(point.y)})`;
const SILENT = { message: "", options: [] as never[] };

function finishPart<S>(state: S, part: CadMechanicalPart, point: CadPoint2, rotation: number, context: CadCommandContext, label: string, detail: string): CadCommandStep<S> {
  const { commands, defined } = cadMechanicalInsertCommands(part, point, rotation, context);
  return {
    state,
    prompt: SILENT,
    accepts: 0,
    result: {
      kind: "document",
      commands,
      label,
      notice: `${label}: ${part.name} (${part.standard})${detail} en ${at(point)}${defined ? `; bloque ${part.id} definido en el dibujo` : ""}.`,
    },
  };
}

/* ───────────────────────────── STDPART ───────────────────────────────── */

const FAMILIES: readonly { family: CadMechanicalFamily; keyword: { keyword: string; shortcut: string } }[] = [
  { family: "tornillo", keyword: { keyword: "Tornillo", shortcut: "T" } },
  { family: "tuerca", keyword: { keyword: "tueRca", shortcut: "R" } },
  { family: "rondana", keyword: { keyword: "rOndana", shortcut: "O" } },
];
const FAMILY_OPTIONS = FAMILIES.map((entry) => entry.keyword);
const DEFAULT_METRIC = 10;
const DEFAULT_LENGTH = 40;

interface PartState {
  family: CadMechanicalFamily | null;
  metric: number | null;
  length: number | null;
  point: CadPoint2 | null;
}

function buildPart(state: PartState): CadMechanicalPart | null {
  if (state.family === "tornillo") return cadMechanicalBolt(state.metric!, state.length ?? DEFAULT_LENGTH);
  if (state.family === "tuerca") return cadMechanicalNut(state.metric!);
  return cadMechanicalWasher(state.metric!);
}

function askPart(state: PartState): CadCommandStep<PartState> {
  if (!state.family)
    return { state, prompt: { message: "Indique el normalizado", options: FAMILY_OPTIONS, defaultOption: FAMILY_OPTIONS[0].keyword }, accepts: CAD_ACCEPT_KEYWORD };
  if (state.metric === null)
    return { state, prompt: { message: `Precise la métrica (${CAD_METRIC_LIST.map((metric) => `M${metric}`).join(", ")})`, options: [], defaultValue: String(DEFAULT_METRIC) }, accepts: CAD_ACCEPT_DISTANCE };
  if (state.family === "tornillo" && state.length === null)
    return { state, prompt: { message: "Precise la longitud del tornillo (mm)", options: [], defaultValue: String(DEFAULT_LENGTH) }, accepts: CAD_ACCEPT_DISTANCE };
  if (!state.point) {
    const part = buildPart(state)!;
    return { state, prompt: { message: `${part.name} (${part.standard}). Precise el punto de inserción`, options: [] }, accepts: CAD_ACCEPT_POINT };
  }
  return { state, prompt: { message: "Ángulo de rotación", options: [], defaultValue: "0" }, accepts: CAD_ACCEPT_ANGLE | CAD_ACCEPT_DISTANCE };
}

const stdPartCommand: CadCommandDescriptor<PartState> = {
  name: "STDPART",
  aliases: ["AMCONTENTLIB", "NORMALIZADO", "TORNILLO"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: () => askPart({ family: null, metric: null, length: null, point: null }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);
    if (!state.family) {
      if (input.kind === "keyword") {
        const entry = FAMILIES.find((candidate) => candidate.keyword.keyword.toUpperCase() === input.keyword.toUpperCase());
        return askPart({ ...state, family: entry?.family ?? null });
      }
      if (input.kind === "enter") return askPart({ ...state, family: "tornillo" });
      return askPart(state);
    }
    if (state.metric === null) {
      if (input.kind === "enter") return askPart({ ...state, metric: DEFAULT_METRIC });
      if (input.kind !== "distance") return askPart(state);
      const metric = Math.round(input.value);
      if (!CAD_METRIC_LIST.includes(metric))
        return cadCommandRefused(state, `M${input.value} no está en el catálogo: admite ${CAD_METRIC_LIST.map((value) => `M${value}`).join(", ")}.`);
      return askPart({ ...state, metric });
    }
    if (state.family === "tornillo" && state.length === null) {
      if (input.kind === "enter") return askPart({ ...state, length: DEFAULT_LENGTH });
      if (input.kind !== "distance") return askPart(state);
      if (!(input.value > 0)) return cadCommandRefused(state, "La longitud del tornillo debe ser mayor que cero.");
      return askPart({ ...state, length: input.value });
    }
    if (!state.point) {
      if (input.kind === "point") return askPart({ ...state, point: input.point });
      if (input.kind === "enter") return cadCommandRefused(state, "STDPART necesita un punto de inserción.");
      return askPart(state);
    }
    const degrees = input.kind === "enter" ? 0 : input.kind === "angle" ? input.degrees : input.kind === "distance" ? input.value : null;
    if (degrees === null) return askPart(state);
    const part = buildPart(state);
    if (!part) return cadCommandRefused(state, "No se pudo construir el normalizado.");
    return finishPart(state, part, state.point, degrees, context, "STDPART", "");
  },
};

/* ───────────────────────────── STEELSHAPE ────────────────────────────── */

const SHAPE_OPTIONS = CAD_STEEL_SHAPES.map((shape) => shape.keyword);

interface ShapeState {
  shape: CadSteelShape | null;
  values: Record<string, number>;
  index: number;
  point: CadPoint2 | null;
}

function askShape(state: ShapeState): CadCommandStep<ShapeState> {
  if (!state.shape)
    return { state, prompt: { message: "Indique el perfil", options: SHAPE_OPTIONS, defaultOption: SHAPE_OPTIONS[0].keyword }, accepts: CAD_ACCEPT_KEYWORD };
  const parameter = state.shape.parameters[state.index];
  if (parameter)
    return { state, prompt: { message: parameter.prompt, options: [], defaultValue: String(parameter.fallback) }, accepts: CAD_ACCEPT_DISTANCE };
  if (!state.point)
    return { state, prompt: { message: `${state.shape.label}. Precise el punto de inserción`, options: [] }, accepts: CAD_ACCEPT_POINT };
  return { state, prompt: { message: "Ángulo de rotación", options: [], defaultValue: "0" }, accepts: CAD_ACCEPT_ANGLE | CAD_ACCEPT_DISTANCE };
}

const steelShapeCommand: CadCommandDescriptor<ShapeState> = {
  name: "STEELSHAPE",
  aliases: ["AMSTLSHAP2D", "PERFIL", "PERFILACERO"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: () => askShape({ shape: null, values: {}, index: 0, point: null }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);
    if (!state.shape) {
      if (input.kind === "keyword") return askShape({ ...state, shape: cadSteelShapeFor(input.keyword) ?? null });
      if (input.kind === "enter") return askShape({ ...state, shape: CAD_STEEL_SHAPES[0] });
      return askShape(state);
    }
    const parameter = state.shape.parameters[state.index];
    if (parameter) {
      if (input.kind === "enter") return askShape({ ...state, values: { ...state.values, [parameter.key]: parameter.fallback }, index: state.index + 1 });
      if (input.kind !== "distance") return askShape(state);
      if (!(input.value > 0)) return cadCommandRefused(state, `${parameter.prompt}: debe ser mayor que cero.`);
      return askShape({ ...state, values: { ...state.values, [parameter.key]: input.value }, index: state.index + 1 });
    }
    if (!state.point) {
      if (input.kind === "point") return askShape({ ...state, point: input.point });
      if (input.kind === "enter") return cadCommandRefused(state, "STEELSHAPE necesita un punto de inserción.");
      return askShape(state);
    }
    const degrees = input.kind === "enter" ? 0 : input.kind === "angle" ? input.degrees : input.kind === "distance" ? input.value : null;
    if (degrees === null) return askShape(state);
    const part = cadMechanicalSteelShape(state.shape.kind, state.values);
    if (typeof part === "string") return cadCommandRefused(state, part);
    const area = part.areaMm2 ?? 0;
    return finishPart(state, part, state.point, degrees, context, "STEELSHAPE", `, sección ${(area / 100).toFixed(2)} cm², ${cadSteelKgPerMetre(area).toFixed(2)} kg/m`);
  },
};

export const CAD_MECHANICAL_PART_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(stdPartCommand), asCadCommand(steelShapeCommand)];
