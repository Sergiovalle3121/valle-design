/**
 * VPORTS — divide el visor de espacio MODELO en varias ventanas.
 *
 * Es un comando de VISTA, como MSPACE/PSPACE (`layout-commands.ts`): no
 * escribe nada en el documento, así que no ensucia el deshacer ni deja paso de
 * historia. Lo único que decide es el REPARTO (`CadModelViewportLayoutId`,
 * `../../model-viewports.ts`); el anfitrión construye cada ventana a partir de
 * la cámara que tenga puesta ahora mismo y las dibuja — el mismo reparto de
 * trabajo que ya usa `ucs-plan` para SCU o `visual-style` para SHADEMODE:
 * estado del VISOR, no del dibujo.
 */
import { CAD_MODEL_VIEWPORT_LAYOUTS, type CadModelViewportLayoutId } from "../../model-viewports";
import {
  CAD_ACCEPT_KEYWORD,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

const LAYOUT_OPTIONS = [
  { keyword: "Unica", shortcut: "U" },
  { keyword: "Columnas", shortcut: "C" },
  { keyword: "Filas", shortcut: "F" },
  { keyword: "Cuatro", shortcut: "4" },
] as const;

const KEYWORD_TO_LAYOUT: Record<string, CadModelViewportLayoutId> = {
  Unica: "1",
  Columnas: "2-cols",
  Filas: "2-rows",
  Cuatro: "4",
};

function cancelled(): CadCommandStep<never> {
  return { state: undefined as never, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
}

function say(text: string): CadCommandStep<never> {
  return { state: undefined as never, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text } };
}

function menu(): CadCommandStep<never> {
  return {
    state: undefined as never,
    prompt: { message: "Indique el reparto de ventanas", options: LAYOUT_OPTIONS, defaultOption: "Unica" },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

function applyLayout(layout: CadModelViewportLayoutId): CadCommandStep<never> {
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "host", request: { kind: "viewport-split", layout }, label: "VPORTS" },
  };
}

const vportsCommand: CadCommandDescriptor<never> = {
  name: "VPORTS",
  aliases: ["VPORT"],
  kind: "view",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: false,
  cursor: "none",
  begin: () => menu(),
  step: (_state, input) => {
    if (input.kind === "cancel") return cancelled();
    const keyword = input.kind === "keyword" ? input.keyword : input.kind === "enter" ? "Unica" : null;
    if (!keyword) return menu();
    const layout = KEYWORD_TO_LAYOUT[keyword];
    if (!layout) return say(`«${keyword}» no es un reparto de VPORTS. Opciones: ${CAD_MODEL_VIEWPORT_LAYOUTS.join(", ")}.`);
    return applyLayout(layout);
  },
};

export const CAD_VPORTS_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(vportsCommand)];
