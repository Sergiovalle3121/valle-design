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
 *
 * ## Dos familias más, y ningún nombre de orden nuevo (2026-09-04)
 *
 * STDPART pasa de tres familias a cinco: RODAMIENTO y CHAVETA entran como
 * opciones del primer prompt, no como órdenes propias. No es una comodidad: un
 * nombre de orden nuevo obliga a tocar `command-summaries.ts`, `command-icons.ts`
 * y la cinta, que son fail-closed y están fuera de este territorio, y dejaría
 * la rama roja hasta la ventana de integración. Como opciones, la capacidad
 * llega hoy y la suite sigue verde.
 *
 * `Tornillo` sigue siendo la opción por defecto, así que STDPART se sigue
 * completando a golpe de Intro exactamente como antes.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import { cadInsertBlockCommands } from "../../blocks/block-workflow";
import {
  CAD_METRIC_LIST,
  CAD_STEEL_SHAPES,
  cadMechanicalBearing,
  cadMechanicalBlockDefinition,
  cadMechanicalBolt,
  cadMechanicalKey,
  cadMechanicalNumber,
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
  CAD_BEARING_LIST,
  CAD_KEY_SHAFT_MAX,
  CAD_KEY_SHAFT_MIN,
  cadKeyIsStandardLength,
  cadKeyNearestLengths,
  cadKeySizeFor,
} from "../../mechanical-parts-catalog";
import {
  CAD_ACCEPT_ANGLE,
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_TEXT,
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

/**
 * Las cinco familias del catálogo. El ORDEN manda dos veces: `Tornillo` va
 * primero porque es lo que Intro toma —y lo que el golden 84 teclea— y porque
 * es lo que pide el 90 % de los planos; el resto sigue el orden en que se
 * montan sobre la mesa. Las letras de acceso no se repiten dentro del prompt
 * (T, R, O, D, C), que es lo que `matchCadKeyword` necesita para no quedarse
 * mudo ante una letra ambigua.
 */
const FAMILIES: readonly { family: CadMechanicalFamily; keyword: { keyword: string; shortcut: string } }[] = [
  { family: "tornillo", keyword: { keyword: "Tornillo", shortcut: "T" } },
  { family: "tuerca", keyword: { keyword: "tueRca", shortcut: "R" } },
  { family: "rondana", keyword: { keyword: "rOndana", shortcut: "O" } },
  { family: "rodamiento", keyword: { keyword: "roDamiento", shortcut: "D" } },
  { family: "chaveta", keyword: { keyword: "Chaveta", shortcut: "C" } },
];
const FAMILY_OPTIONS = FAMILIES.map((entry) => entry.keyword);
/** Las tres que se piden por su métrica ISO; las otras dos tienen su propia pregunta. */
const METRIC_FAMILIES = new Set<CadMechanicalFamily>(["tornillo", "tuerca", "rondana"]);
const DEFAULT_METRIC = 10;
const DEFAULT_LENGTH = 40;
/** 6204 (20 × 47 × 14) es el rodamiento más corriente de la serie ligera. */
const DEFAULT_BEARING = "6204";
/** Un eje de Ø25 cae de lleno en la fila de 22 a 30: chaveta 8 × 7. */
const DEFAULT_SHAFT = 25;
const DEFAULT_KEY_LENGTH = 40;

interface PartState {
  family: CadMechanicalFamily | null;
  /** Métrica de la tornillería (M6…M24). */
  metric: number | null;
  /** Designación del rodamiento («6204»). */
  designation: string | null;
  /** Diámetro del eje, que es quien manda la sección de la chaveta (mm). */
  shaft: number | null;
  /** Longitud del tornillo o de la chaveta (mm). */
  length: number | null;
  point: CadPoint2 | null;
}

const EMPTY_PART: PartState = { family: null, metric: null, designation: null, shaft: null, length: null, point: null };

function buildPart(state: PartState): CadMechanicalPart | null {
  if (state.family === "tornillo") return cadMechanicalBolt(state.metric!, state.length ?? DEFAULT_LENGTH);
  if (state.family === "tuerca") return cadMechanicalNut(state.metric!);
  if (state.family === "rondana") return cadMechanicalWasher(state.metric!);
  if (state.family === "rodamiento") return cadMechanicalBearing(state.designation!);
  return cadMechanicalKey(state.shaft!, state.length ?? DEFAULT_KEY_LENGTH);
}

const n = cadMechanicalNumber;

/**
 * Lo que la orden añade al aviso según la familia.
 *
 * El rodamiento DICE con qué está dibujado. Un bloque que enseña un rectángulo
 * con una cruz y no lo explica parece un rodamiento a medio dibujar; diciendo
 * «representación simplificada ISO 8826-1» queda claro que está terminado y
 * que el detalle de pistas y bolas no le corresponde a un plano de conjunto.
 *
 * La chaveta dice de qué intervalo de eje salió su sección —el dibujante
 * tecleó Ø25 y se llevó una 8 × 7 que también sirve para Ø28— y, si la
 * longitud no es de la serie de ISO 773, lo AVISA con las dos vecinas sin
 * cambiarla: una chaveta se corta a la medida del cuñero, y decidir por el
 * proyectista sería el error contrario.
 */
function detailFor(state: PartState): string {
  if (state.family === "rodamiento")
    return ", representación simplificada ISO 8826-1 (el conjunto no dibuja pistas ni bolas)";
  if (state.family !== "chaveta") return "";
  const size = cadKeySizeFor(state.shaft!)!;
  const length = state.length ?? DEFAULT_KEY_LENGTH;
  const base = `, para eje Ø${n(state.shaft!)} (ISO 773 da esta sección de más de ${n(size.overShaft)} y hasta ${n(size.upToShaft)} mm)`;
  if (cadKeyIsStandardLength(length)) return base;
  const { below, above } = cadKeyNearestLengths(length);
  const vecinas = [below, above].filter((value): value is number => value !== null).map(n).join(" y ");
  return `${base}; aviso: la longitud ${n(length)} no es de la serie de ISO 773, cuyas vecinas son ${vecinas}`;
}

function askPart(state: PartState): CadCommandStep<PartState> {
  if (!state.family)
    return { state, prompt: { message: "Indique el normalizado", options: FAMILY_OPTIONS, defaultOption: FAMILY_OPTIONS[0].keyword }, accepts: CAD_ACCEPT_KEYWORD };
  if (METRIC_FAMILIES.has(state.family) && state.metric === null)
    return { state, prompt: { message: `Precise la métrica (${CAD_METRIC_LIST.map((metric) => `M${metric}`).join(", ")})`, options: [], defaultValue: String(DEFAULT_METRIC) }, accepts: CAD_ACCEPT_DISTANCE };
  if (state.family === "tornillo" && state.length === null)
    return { state, prompt: { message: "Precise la longitud del tornillo (mm)", options: [], defaultValue: String(DEFAULT_LENGTH) }, accepts: CAD_ACCEPT_DISTANCE };
  if (state.family === "rodamiento" && state.designation === null)
    return { state, prompt: { message: "Precise la designación del rodamiento (ISO 15: 6200 a 6212, 6300 a 6312)", options: [], defaultValue: DEFAULT_BEARING }, accepts: CAD_ACCEPT_TEXT };
  if (state.family === "chaveta" && state.shaft === null)
    return { state, prompt: { message: "Precise el diámetro del eje (mm); él manda la sección de la chaveta", options: [], defaultValue: String(DEFAULT_SHAFT) }, accepts: CAD_ACCEPT_DISTANCE };
  if (state.family === "chaveta" && state.length === null)
    return { state, prompt: { message: "Precise la longitud de la chaveta (mm)", options: [], defaultValue: String(DEFAULT_KEY_LENGTH) }, accepts: CAD_ACCEPT_DISTANCE };
  if (!state.point) {
    // Aquí la pieza ya se construye: cada medida se validó al teclearse, así
    // que el `!` no esconde un caso posible sino uno ya descartado.
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
  begin: () => askPart(EMPTY_PART),
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
    if (METRIC_FAMILIES.has(state.family) && state.metric === null) {
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
    if (state.family === "rodamiento" && state.designation === null) {
      if (input.kind === "enter") return askPart({ ...state, designation: DEFAULT_BEARING });
      if (input.kind !== "text") return askPart(state);
      const designation = input.value.trim().toUpperCase();
      // Se ENUMERA, como con M11: quien teclea 6404 no necesita saber que no
      // existe, necesita saber cuál de las que hay se parece a la que buscaba.
      if (!cadMechanicalBearing(designation))
        return cadCommandRefused(state, `El rodamiento ${designation} no está en el catálogo, que son las series 6200 y 6300 de ISO 15: ${CAD_BEARING_LIST.join(", ")}.`);
      return askPart({ ...state, designation });
    }
    if (state.family === "chaveta" && state.shaft === null) {
      if (input.kind === "enter") return askPart({ ...state, shaft: DEFAULT_SHAFT });
      if (input.kind !== "distance") return askPart(state);
      if (!cadKeySizeFor(input.value))
        return cadCommandRefused(state, `Un eje de Ø${n(input.value)} queda fuera de la tabla de chavetas de ISO 773, que cubre ejes de más de ${n(CAD_KEY_SHAFT_MIN)} mm y hasta ${n(CAD_KEY_SHAFT_MAX)} mm.`);
      return askPart({ ...state, shaft: input.value });
    }
    if (state.family === "chaveta" && state.length === null) {
      if (input.kind === "enter") return askPart({ ...state, length: DEFAULT_KEY_LENGTH });
      if (input.kind !== "distance") return askPart(state);
      const size = cadKeySizeFor(state.shaft!)!;
      if (!(input.value > size.b))
        return cadCommandRefused(state, `Un eje de Ø${n(state.shaft!)} lleva chaveta ${n(size.b)} × ${n(size.h)}: una longitud de ${n(input.value)} no pasa del ancho b = ${n(size.b)}, y la forma A gasta b/2 en cada extremo redondeado.`);
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
    return finishPart(state, part, state.point, degrees, context, "STDPART", detailFor(state));
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
