/**
 * MEPSYMBOL: colocar un símbolo MEP como bloque (Ola F, 2026-09-02).
 *
 * Se elige el símbolo por palabra clave, se precisa el punto y el giro, y la
 * orden emite UN lote: la definición del bloque si el documento no la tiene
 * (`{ type: "block", op: "define" }`, el mismo camino que PASTECLIP para el
 * bloque que falta), el alta de la capa del servicio si falta, y el INSERT.
 * Un bloque ya definido —del propio catálogo o redefinido por el despacho—
 * no se pisa: manda el del documento.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import { cadInsertBlockCommands } from "../../blocks/block-workflow";
import { CAD_MEP_SYMBOLS, cadMepBlockDefinition, cadMepSymbolFor, type CadMepSymbol } from "../../mep-symbols";
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
import { cadMepServiceFor } from "./mep-support";

interface SymbolState {
  symbol: CadMepSymbol | null;
  point: CadPoint2 | null;
}

const OPTIONS = CAD_MEP_SYMBOLS.map((symbol) => symbol.keyword);

function ask(state: SymbolState): CadCommandStep<SymbolState> {
  if (!state.symbol)
    return { state, prompt: { message: "Indique el símbolo", options: OPTIONS, defaultOption: OPTIONS[0].keyword }, accepts: CAD_ACCEPT_KEYWORD };
  if (!state.point)
    return { state, prompt: { message: `${state.symbol.name}. Precise el punto de inserción`, options: OPTIONS }, accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD };
  return { state, prompt: { message: "Ángulo de rotación", options: [], defaultValue: "0" }, accepts: CAD_ACCEPT_ANGLE | CAD_ACCEPT_DISTANCE };
}

/** El lote: bloque (si falta), capa (si falta) e inserción. */
export function cadMepSymbolCommands(symbol: CadMepSymbol, point: CadPoint2, rotation: number, context: CadCommandContext): CadEntityCommand[] {
  const commands: CadEntityCommand[] = [];
  const existing = context.blocks?.().find((block) => block.id === symbol.id);
  const definition = existing ?? cadMepBlockDefinition(symbol);
  if (!existing) commands.push({ type: "block", op: "define", definition });
  const service = cadMepServiceFor(symbol.layer);
  const layers = context.layers?.();
  if (layers && !layers.some((layer) => layer.name.toUpperCase() === symbol.layer.toUpperCase() || layer.id.toUpperCase() === symbol.layer.toUpperCase()))
    commands.push({ type: "layer", op: "upsert", layer: { id: symbol.layer, name: symbol.layer, color: service?.color ?? "#eab308", visible: true, locked: false, ...(service?.linetype ? { linetype: service.linetype } : {}) } });
  commands.push(...cadInsertBlockCommands({ id: context.newEntityId(), block: definition, insertion: { x: point.x, y: point.y, z: 0 }, rotation, layer: symbol.layer }));
  return commands;
}

function finish(state: SymbolState, rotation: number, context: CadCommandContext): CadCommandStep<SymbolState> {
  const commands = cadMepSymbolCommands(state.symbol!, state.point!, rotation, context);
  const defined = commands.some((command) => command.type === "block");
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: {
      kind: "document",
      commands,
      label: "MEPSYMBOL",
      notice: `MEPSYMBOL: ${state.symbol!.name} en (${Math.round(state.point!.x)}, ${Math.round(state.point!.y)}), capa ${state.symbol!.layer}${defined ? `; bloque ${state.symbol!.id} definido en el dibujo` : ""}.`,
    },
  };
}

const mepSymbolCommand: CadCommandDescriptor<SymbolState> = {
  name: "MEPSYMBOL",
  aliases: ["DEVICEADD", "SIMBOLOMEP"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: () => ask({ symbol: null, point: null }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
    if (input.kind === "keyword") {
      const symbol = cadMepSymbolFor(input.keyword);
      return symbol ? ask({ ...state, symbol }) : ask(state);
    }
    if (!state.symbol) {
      if (input.kind === "enter") return ask({ ...state, symbol: CAD_MEP_SYMBOLS[0] });
      return ask(state);
    }
    if (!state.point) {
      if (input.kind === "point") return ask({ ...state, point: input.point });
      if (input.kind === "enter") return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text: "MEPSYMBOL necesita un punto de inserción." } };
      return ask(state);
    }
    if (input.kind === "enter") return finish(state, 0, context);
    const degrees = input.kind === "angle" ? input.degrees : input.kind === "distance" ? input.value : null;
    if (degrees === null) return ask(state);
    return finish(state, degrees, context);
  },
};

export const CAD_MEP_SYMBOL_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(mepSymbolCommand)];
