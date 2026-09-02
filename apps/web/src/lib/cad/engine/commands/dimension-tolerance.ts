/**
 * DIMTOLERANCE: la tolerancia de fabricación sobre cotas designadas (Ola I,
 * 2026-09-02).
 *
 * Toma las cotas de la designación previa (o las pide) y escribe en cada una
 * su tolerancia —simétrica, por desviaciones, por límites, o la de un ajuste
 * ISO 286 calculado sobre lo que ESA cota mide— con `replace` sobre la
 * entidad que ya existía y las claves de `dimension-tolerance.ts` en
 * `context.metadata`: sin campo nuevo, sin formato nuevo. `Quitar` las borra.
 *
 * Las desviaciones se teclean con signo («+0.025», «−0.010»); en la cota
 * angular valen grados. Un ajuste sobre una cota angular se rechaza: no hay
 * ajuste de ángulos en ISO 286.
 */
import { buildCadDimensionGeometry, type CadDimensionEntity } from "../../associative-dimension";
import {
  CAD_ISO_FIT_LETTERS,
  cadDecimalsOf,
  cadDimensionMetadataWithoutTolerance,
  cadDimensionToleranceFromFit,
  cadDimensionToleranceMetadata,
  cadIsoFit,
  type CadDimensionTolerance,
} from "../../dimension-tolerance";
import type { CadEntityCommand } from "../../entity-commands";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_SELECTION,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import { cadCommandCancelled, cadCommandRefused } from "./annotate-support";
import { cadMillimetresPerUnit } from "./architecture-support";

const SYMMETRIC = { keyword: "Simétrica", shortcut: "S" } as const;
const DEVIATION = { keyword: "Desviación", shortcut: "D" } as const;
const LIMITS = { keyword: "Límites", shortcut: "L" } as const;
const FIT = { keyword: "Ajuste", shortcut: "A" } as const;
const REMOVE = { keyword: "Quitar", shortcut: "Q" } as const;
const MODE_OPTIONS = [SYMMETRIC, DEVIATION, LIMITS, FIT, REMOVE];

type Mode = "symmetric" | "deviation" | "limits" | "fit" | "remove";
type Pending = "select" | "mode" | "symmetric" | "upper" | "lower" | "fit";

interface ToleranceState {
  targets: string[];
  mode: Mode | null;
  upper: number | null;
  pending: Pending;
}

/** Las cotas entre los ids dados, en orden. */
function dimensionsAmong(ids: readonly string[], context: CadCommandContext): string[] {
  return ids.filter((id) => context.entity?.(id)?.type === "dimension");
}

/** «+0.025», «−0.010», «0,05»: un número con signo, o `null`. */
export function cadParseSignedNumber(value: string): number | null {
  const normalized = value.trim().replace(/−/gu, "-").replace(/,/gu, ".").replace(/^\+/u, "");
  if (!/^-?\d*\.?\d+$/u.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function ask(state: ToleranceState): CadCommandStep<ToleranceState> {
  switch (state.pending) {
    case "select":
      return { state, prompt: { message: "Designe las cotas", options: [] }, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };
    case "mode":
      return { state, prompt: { message: `${state.targets.length} cota(s). Indique la tolerancia`, options: MODE_OPTIONS, defaultOption: SYMMETRIC.keyword }, accepts: CAD_ACCEPT_KEYWORD };
    case "symmetric":
      return { state, prompt: { message: "Precise la tolerancia ± (mm; grados en la angular)", options: [] }, accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT };
    case "upper":
      return { state, prompt: { message: `Escriba la desviación ${state.mode === "limits" ? "superior (el máximo menos la medida)" : "superior"}, con signo (p. ej. +0.025)`, options: [] }, accepts: CAD_ACCEPT_TEXT | CAD_ACCEPT_DISTANCE };
    case "lower":
      return { state, prompt: { message: `Escriba la desviación ${state.mode === "limits" ? "inferior (el mínimo menos la medida)" : "inferior"}, con signo (p. ej. −0.010)`, options: [] }, accepts: CAD_ACCEPT_TEXT | CAD_ACCEPT_DISTANCE };
    case "fit":
      return { state, prompt: { message: `Escriba el ajuste ISO 286 (${CAD_ISO_FIT_LETTERS}; IT5 a IT11)`, options: [], defaultValue: "H7" }, accepts: CAD_ACCEPT_TEXT };
  }
}

function numberOf(input: { kind: string; value?: unknown }): number | null {
  if (input.kind === "distance" && typeof input.value === "number") return input.value;
  if (input.kind === "text" && typeof input.value === "string") return cadParseSignedNumber(input.value);
  return null;
}

/** Lo que mide la cota en MILÍMETROS (el nominal de un ajuste), o `null` en la angular. */
export function cadDimensionNominalMm(entity: CadDimensionEntity): number | null {
  if (entity.dimensionKind === "angular") return null;
  const geometry = buildCadDimensionGeometry(entity);
  if (!geometry) return null;
  return geometry.measurement * cadMillimetresPerUnit(entity.sourceUnit ?? "mm");
}

type Resolver = (entity: CadDimensionEntity) => CadDimensionTolerance | null | string;

function apply(state: ToleranceState, resolve: Resolver, describe: string, context: CadCommandContext): CadCommandStep<ToleranceState> {
  const commands: CadEntityCommand[] = [];
  let firstLabel = "";
  for (const id of state.targets) {
    const entity = context.entity?.(id);
    if (!entity || entity.type !== "dimension") continue;
    const resolved = resolve(entity);
    if (typeof resolved === "string") return cadCommandRefused(state, resolved);
    const kept = cadDimensionMetadataWithoutTolerance(entity.context?.metadata);
    const metadata = resolved ? { ...(kept ?? {}), ...cadDimensionToleranceMetadata(resolved) } : kept;
    const next: CadDimensionEntity = { ...entity, context: { ...(entity.context ?? {}), ...(metadata ? { metadata } : {}) } };
    if (!metadata && next.context) delete next.context.metadata;
    commands.push({ type: "replace", entityId: id, entity: next });
    if (!firstLabel) firstLabel = buildCadDimensionGeometry(next)?.label ?? "";
  }
  if (commands.length === 0) return cadCommandRefused(state, "Ninguna de las cotas designadas sigue en el dibujo.");
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: {
      kind: "document",
      commands,
      label: "DIMTOLERANCE",
      notice: `DIMTOLERANCE: ${commands.length} cota(s) ${describe}${firstLabel ? `; la primera rotula «${firstLabel}»` : ""}.`,
    },
  };
}

const dimToleranceCommand: CadCommandDescriptor<ToleranceState> = {
  name: "DIMTOLERANCE",
  aliases: ["TOLERANCIA", "DTOL"],
  kind: "annotate",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => {
    const targets = dimensionsAmong(context.selection, context);
    return ask({ targets, mode: null, upper: null, pending: targets.length > 0 ? "mode" : "select" });
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);
    if (state.pending === "select") {
      const ids = input.kind === "selection" ? input.entityIds : input.kind === "entityPick" ? [input.entityId] : null;
      if (!ids) return input.kind === "enter" ? cadCommandRefused(state, "DIMTOLERANCE necesita cotas designadas.") : ask(state);
      const targets = dimensionsAmong(ids, context);
      if (targets.length === 0) return cadCommandRefused(state, "La designación no contiene cotas: DIMTOLERANCE sólo toca cotas.");
      return ask({ ...state, targets, pending: "mode" });
    }
    if (state.pending === "mode") {
      const keyword = input.kind === "enter" ? SYMMETRIC.keyword : input.kind === "keyword" ? input.keyword : null;
      if (!keyword) return ask(state);
      if (keyword === SYMMETRIC.keyword) return ask({ ...state, mode: "symmetric", pending: "symmetric" });
      if (keyword === DEVIATION.keyword) return ask({ ...state, mode: "deviation", pending: "upper" });
      if (keyword === LIMITS.keyword) return ask({ ...state, mode: "limits", pending: "upper" });
      if (keyword === FIT.keyword) return ask({ ...state, mode: "fit", pending: "fit" });
      if (keyword === REMOVE.keyword) return apply({ ...state, mode: "remove" }, () => null, "sin tolerancia", context);
      return ask(state);
    }
    if (state.pending === "symmetric") {
      const value = numberOf(input);
      if (value === null) return input.kind === "enter" ? cadCommandRefused(state, "Una tolerancia simétrica necesita su valor.") : ask(state);
      if (!(value > 0)) return cadCommandRefused(state, "La tolerancia simétrica debe ser mayor que cero.");
      const decimals = Math.max(1, cadDecimalsOf(value));
      return apply(state, () => ({ mode: "symmetric", upper: value, lower: -value, decimals }), `con ±${value}`, context);
    }
    if (state.pending === "upper") {
      const value = numberOf(input);
      if (value === null) return input.kind === "enter" ? cadCommandRefused(state, "La desviación superior necesita su valor con signo.") : ask(state);
      return ask({ ...state, upper: value, pending: "lower" });
    }
    if (state.pending === "lower") {
      const value = numberOf(input);
      if (value === null) return input.kind === "enter" ? cadCommandRefused(state, "La desviación inferior necesita su valor con signo.") : ask(state);
      const upper = state.upper!;
      if (value > upper) return cadCommandRefused(state, `La desviación inferior (${value}) no puede superar a la superior (${upper}).`);
      const mode = state.mode === "limits" ? "limits" : "deviation";
      const decimals = Math.max(1, cadDecimalsOf(upper, value));
      return apply(state, () => ({ mode, upper, lower: value, decimals }), `${mode === "limits" ? "por límites" : "por desviaciones"} ${upper >= 0 ? "+" : ""}${upper}/${value >= 0 ? "+" : ""}${value}`, context);
    }
    // fit
    const code = input.kind === "text" ? input.value.trim() : input.kind === "enter" ? "H7" : "";
    if (!code) return ask(state);
    return apply(
      state,
      (entity) => {
        const nominal = cadDimensionNominalMm(entity);
        if (nominal === null) return "Un ajuste ISO 286 es de longitud: la cota angular no lo admite.";
        const fit = cadIsoFit(nominal, code);
        return typeof fit === "string" ? fit : cadDimensionToleranceFromFit(fit);
      },
      `con el ajuste ${code}`,
      context,
    );
  },
};

export const CAD_DIMENSION_TOLERANCE_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(dimToleranceCommand)];
