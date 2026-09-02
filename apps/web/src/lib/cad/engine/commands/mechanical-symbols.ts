/**
 * WELDSYMBOL y SURFACESYMBOL: el símbolo de soldadura y el de acabado
 * superficial (Ola I, 2026-09-02), sobre la geometría de
 * `mechanical-symbols.ts`.
 *
 * Los dos preguntan lo que la norma pide y nada más: tipo, lado, tamaño,
 * longitud, «todo alrededor», «en obra» y cola para la soldadura (ISO 2553 /
 * AWS A2.4); tipo, Ra y dirección de estrías para el acabado (ISO 1302).
 * Intro toma el valor propuesto en cada paso. La altura de texto es la del
 * estilo de cota Standard, como el globo, y se cambia con `Altura`.
 */
import type { CadPoint2 } from "../../cad-document";
import {
  CAD_SURFACE_LAYS,
  CAD_SURFACE_TYPES,
  CAD_WELD_SIDES,
  CAD_WELD_TYPES,
  cadSurfaceSymbolEntities,
  cadWeldSymbolEntities,
  type CadSurfaceFinishType,
  type CadWeldSide,
  type CadWeldType,
} from "../../mechanical-symbols";
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
import { cadMechanicalTextHeight } from "./mechanical-annotate";

const HEIGHT_OPTION = { keyword: "Altura", shortcut: "A" } as const;
const YES = { keyword: "Sí", shortcut: "S" } as const;
const NO = { keyword: "No", shortcut: "N" } as const;
const at = (point: CadPoint2) => `(${Math.round(point.x)}, ${Math.round(point.y)})`;
const number = (value: number) => Number(value.toFixed(2)).toString();

/* ───────────────────────────── WELDSYMBOL ────────────────────────────── */

type WeldPending = "arrow" | "height" | "reference" | "type" | "side" | "size" | "length" | "allAround" | "field" | "tail";

interface WeldState {
  pending: WeldPending;
  arrow: CadPoint2 | null;
  reference: CadPoint2 | null;
  type: CadWeldType;
  side: CadWeldSide;
  size: number;
  length: number;
  allAround: boolean;
  field: boolean;
  tail: string;
  height: number | null;
}

const WELD_TYPE_OPTIONS = CAD_WELD_TYPES.map((entry) => entry.keyword);
const WELD_SIDE_OPTIONS = CAD_WELD_SIDES.map((entry) => entry.keyword);

function askWeld(state: WeldState): CadCommandStep<WeldState> {
  const ask = (message: string, options: readonly { keyword: string; shortcut: string }[], accepts: number, extra: { defaultOption?: string; defaultValue?: string } = {}): CadCommandStep<WeldState> => ({
    state,
    prompt: { message, options, ...extra },
    accepts,
  });
  switch (state.pending) {
    case "arrow":
      return ask("Precise la junta (punta de la flecha)", [HEIGHT_OPTION], CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD);
    case "height":
      return ask("Precise la altura del texto", [], CAD_ACCEPT_DISTANCE, { defaultValue: String(state.height ?? "") });
    case "reference":
      return ask("Precise el arranque de la línea de referencia", [], CAD_ACCEPT_POINT);
    case "type":
      return ask("Indique el tipo de soldadura", WELD_TYPE_OPTIONS, CAD_ACCEPT_KEYWORD, { defaultOption: WELD_TYPE_OPTIONS[0].keyword });
    case "side":
      return ask("Indique el lado", WELD_SIDE_OPTIONS, CAD_ACCEPT_KEYWORD, { defaultOption: WELD_SIDE_OPTIONS[0].keyword });
    case "size":
      return ask("Precise el tamaño (cateto o garganta; 0 = sin tamaño)", [], CAD_ACCEPT_DISTANCE, { defaultValue: "0" });
    case "length":
      return ask("Precise la longitud del cordón (0 = continuo)", [], CAD_ACCEPT_DISTANCE, { defaultValue: "0" });
    case "allAround":
      return ask("¿Todo alrededor?", [YES, NO], CAD_ACCEPT_KEYWORD, { defaultOption: NO.keyword });
    case "field":
      return ask("¿Soldadura en obra?", [YES, NO], CAD_ACCEPT_KEYWORD, { defaultOption: NO.keyword });
    case "tail":
      return ask("Escriba la nota de la cola (proceso o norma; Intro = sin cola)", [], CAD_ACCEPT_TEXT);
  }
}

function finishWeld(state: WeldState, context: CadCommandContext): CadCommandStep<WeldState> {
  const height = state.height ?? cadMechanicalTextHeight(context);
  const spec = { ...state, arrow: state.arrow!, reference: state.reference!, height, layer: context.activeLayer };
  const entities = cadWeldSymbolEntities(spec, context.newEntityId);
  if (typeof entities === "string") return cadCommandRefused(state, entities);
  const type = CAD_WELD_TYPES.find((entry) => entry.type === state.type)!;
  const side = CAD_WELD_SIDES.find((entry) => entry.side === state.side)!;
  const details = [
    state.size > 0 ? `tamaño ${number(state.size)}` : "",
    state.length > 0 ? `${number(state.length)} de largo` : "",
    state.allAround ? "todo alrededor" : "",
    state.field ? "en obra" : "",
    state.tail.trim() ? `cola «${state.tail.trim()}»` : "",
  ].filter(Boolean);
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: {
      kind: "document",
      commands: entities.map((entity) => ({ type: "insert" as const, entity })),
      label: "WELDSYMBOL",
      notice: `WELDSYMBOL: soldadura ${type.label} ${side.label}${details.length ? `, ${details.join(", ")}` : ""} en ${at(state.arrow!)}.`,
    },
  };
}

const weldCommand: CadCommandDescriptor<WeldState> = {
  name: "WELDSYMBOL",
  aliases: ["AMWELDSYM", "SOLDADURA"],
  kind: "annotate",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: () => askWeld({ pending: "arrow", arrow: null, reference: null, type: "fillet", side: "arrow", size: 0, length: 0, allAround: false, field: false, tail: "", height: null }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);
    const next = (patch: Partial<WeldState>, pending: WeldPending) => askWeld({ ...state, ...patch, pending });
    switch (state.pending) {
      case "arrow":
        if (input.kind === "keyword" && input.keyword === HEIGHT_OPTION.keyword) return next({}, "height");
        if (input.kind === "point") return next({ arrow: input.point }, "reference");
        if (input.kind === "enter") return cadCommandRefused(state, "WELDSYMBOL necesita el punto de la junta.");
        return askWeld(state);
      case "height":
        if (input.kind === "enter") return next({}, "arrow");
        if (input.kind !== "distance") return askWeld(state);
        if (!(input.value > 0)) return cadCommandRefused(state, "La altura del texto debe ser mayor que cero.");
        return next({ height: input.value }, "arrow");
      case "reference":
        if (input.kind === "point") return next({ reference: input.point }, "type");
        if (input.kind === "enter") return cadCommandRefused(state, "WELDSYMBOL necesita el arranque de la línea de referencia.");
        return askWeld(state);
      case "type": {
        if (input.kind === "enter") return next({}, "side");
        if (input.kind !== "keyword") return askWeld(state);
        const type = CAD_WELD_TYPES.find((entry) => entry.keyword.keyword.toUpperCase() === input.keyword.toUpperCase());
        return type ? next({ type: type.type }, "side") : askWeld(state);
      }
      case "side": {
        if (input.kind === "enter") return next({}, "size");
        if (input.kind !== "keyword") return askWeld(state);
        const side = CAD_WELD_SIDES.find((entry) => entry.keyword.keyword.toUpperCase() === input.keyword.toUpperCase());
        return side ? next({ side: side.side }, "size") : askWeld(state);
      }
      case "size":
        if (input.kind === "enter") return next({}, "length");
        if (input.kind !== "distance") return askWeld(state);
        return next({ size: Math.max(0, input.value) }, "length");
      case "length":
        if (input.kind === "enter") return next({}, "allAround");
        if (input.kind !== "distance") return askWeld(state);
        return next({ length: Math.max(0, input.value) }, "allAround");
      case "allAround":
        if (input.kind === "enter") return next({}, "field");
        if (input.kind !== "keyword") return askWeld(state);
        return next({ allAround: input.keyword === YES.keyword }, "field");
      case "field":
        if (input.kind === "enter") return next({}, "tail");
        if (input.kind !== "keyword") return askWeld(state);
        return next({ field: input.keyword === YES.keyword }, "tail");
      case "tail":
        if (input.kind === "enter") return finishWeld(state, context);
        if (input.kind !== "text") return askWeld(state);
        return finishWeld({ ...state, tail: input.value.trim().slice(0, 64) }, context);
    }
  },
};

/* ─────────────────────────── SURFACESYMBOL ───────────────────────────── */

type SurfacePending = "type" | "height" | "ra" | "lay" | "at" | "rotation";

interface SurfaceState {
  pending: SurfacePending;
  type: CadSurfaceFinishType;
  ra: number;
  lay: string;
  at: CadPoint2 | null;
  height: number | null;
}

const SURFACE_TYPE_OPTIONS = [...CAD_SURFACE_TYPES.map((entry) => entry.keyword), HEIGHT_OPTION];
const LAY_OPTIONS = CAD_SURFACE_LAYS.map((entry) => entry.keyword);
const DEFAULT_RA = 3.2;

function askSurface(state: SurfaceState): CadCommandStep<SurfaceState> {
  const ask = (message: string, options: readonly { keyword: string; shortcut: string }[], accepts: number, extra: { defaultOption?: string; defaultValue?: string } = {}): CadCommandStep<SurfaceState> => ({
    state,
    prompt: { message, options, ...extra },
    accepts,
  });
  switch (state.pending) {
    case "type":
      return ask("Indique el acabado", SURFACE_TYPE_OPTIONS, CAD_ACCEPT_KEYWORD, { defaultOption: SURFACE_TYPE_OPTIONS[0].keyword });
    case "height":
      return ask("Precise la altura del texto", [], CAD_ACCEPT_DISTANCE, { defaultValue: String(state.height ?? "") });
    case "ra":
      return ask("Precise la rugosidad Ra en µm (0 = sin valor)", [], CAD_ACCEPT_DISTANCE, { defaultValue: String(DEFAULT_RA) });
    case "lay":
      return ask("Indique la dirección de las estrías", LAY_OPTIONS, CAD_ACCEPT_KEYWORD, { defaultOption: LAY_OPTIONS[0].keyword });
    case "at":
      return ask("Precise el punto de apoyo sobre la superficie", [], CAD_ACCEPT_POINT);
    case "rotation":
      return ask("Ángulo de rotación", [], CAD_ACCEPT_ANGLE | CAD_ACCEPT_DISTANCE, { defaultValue: "0" });
  }
}

function finishSurface(state: SurfaceState, rotation: number, context: CadCommandContext): CadCommandStep<SurfaceState> {
  const height = state.height ?? cadMechanicalTextHeight(context);
  const entities = cadSurfaceSymbolEntities({ type: state.type, ra: state.ra, lay: state.lay, at: state.at!, rotation, height, layer: context.activeLayer }, context.newEntityId);
  const type = CAD_SURFACE_TYPES.find((entry) => entry.type === state.type)!;
  const lay = CAD_SURFACE_LAYS.find((entry) => entry.symbol === state.lay);
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: {
      kind: "document",
      commands: entities.map((entity) => ({ type: "insert" as const, entity })),
      label: "SURFACESYMBOL",
      notice: `SURFACESYMBOL: acabado ${type.label}${state.ra > 0 ? `, Ra ${number(state.ra)} µm` : ""}${state.lay ? `, estrías ${lay?.label ?? state.lay}` : ""} en ${at(state.at!)}.`,
    },
  };
}

const surfaceCommand: CadCommandDescriptor<SurfaceState> = {
  name: "SURFACESYMBOL",
  aliases: ["AMSURFSYM", "ACABADO"],
  kind: "annotate",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: () => askSurface({ pending: "type", type: "removal", ra: 0, lay: "", at: null, height: null }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);
    const next = (patch: Partial<SurfaceState>, pending: SurfacePending) => askSurface({ ...state, ...patch, pending });
    switch (state.pending) {
      case "type": {
        if (input.kind === "enter") return next({}, "ra");
        if (input.kind !== "keyword") return askSurface(state);
        if (input.keyword === HEIGHT_OPTION.keyword) return next({}, "height");
        const type = CAD_SURFACE_TYPES.find((entry) => entry.keyword.keyword.toUpperCase() === input.keyword.toUpperCase());
        return type ? next({ type: type.type }, "ra") : askSurface(state);
      }
      case "height":
        if (input.kind === "enter") return next({}, "type");
        if (input.kind !== "distance") return askSurface(state);
        if (!(input.value > 0)) return cadCommandRefused(state, "La altura del texto debe ser mayor que cero.");
        return next({ height: input.value }, "type");
      case "ra":
        if (input.kind === "enter") return next({ ra: DEFAULT_RA }, "lay");
        if (input.kind !== "distance") return askSurface(state);
        return next({ ra: Math.max(0, input.value) }, "lay");
      case "lay": {
        if (input.kind === "enter") return next({}, "at");
        if (input.kind !== "keyword") return askSurface(state);
        const lay = CAD_SURFACE_LAYS.find((entry) => entry.keyword.keyword.toUpperCase() === input.keyword.toUpperCase());
        return lay ? next({ lay: lay.symbol }, "at") : askSurface(state);
      }
      case "at":
        if (input.kind === "point") return next({ at: input.point }, "rotation");
        if (input.kind === "enter") return cadCommandRefused(state, "SURFACESYMBOL necesita el punto de apoyo sobre la superficie.");
        return askSurface(state);
      case "rotation": {
        const degrees = input.kind === "enter" ? 0 : input.kind === "angle" ? input.degrees : input.kind === "distance" ? input.value : null;
        if (degrees === null) return askSurface(state);
        return finishSurface(state, degrees, context);
      }
    }
  },
};

export const CAD_MECHANICAL_SYMBOL_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(weldCommand), asCadCommand(surfaceCommand)];
