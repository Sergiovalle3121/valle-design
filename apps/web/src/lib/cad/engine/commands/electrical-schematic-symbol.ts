/**
 * AESYMBOL: colocar un símbolo de esquema eléctrico IEC 60617 (T16).
 *
 * Igual que MEPSYMBOL: se elige el símbolo por palabra clave, se precisa el
 * punto y el giro, y la orden emite UN lote: la definición del bloque si el
 * documento no la tiene, el alta de la capa IE-ESQ si falta, y el INSERT.
 *
 * El campo `family` del símbolo permite que `AETAG` deduzca el prefijo
 * automáticamente (K para contactores, F para fusibles, M para motores, etc.).
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import { cadInsertBlockCommands } from "../../blocks/block-workflow";
import {
  CAD_SCHEMATIC_SYMBOLS,
  cadSchematicBlockDefinition,
  cadSchematicSymbolFor,
  type CadSchematicSymbol,
} from "../../electrical/schematic-symbols";
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

interface SymbolState {
  symbol: CadSchematicSymbol | null;
  point: CadPoint2 | null;
}

const OPTIONS = CAD_SCHEMATIC_SYMBOLS.map((symbol) => symbol.keyword);

function ask(state: SymbolState): CadCommandStep<SymbolState> {
  if (!state.symbol)
    return { state, prompt: { message: "Indique el símbolo de esquema", options: OPTIONS, defaultOption: OPTIONS[0].keyword }, accepts: CAD_ACCEPT_KEYWORD };
  if (!state.point)
    return { state, prompt: { message: `${state.symbol.name}. Precise el punto de inserción`, options: OPTIONS }, accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD };
  return { state, prompt: { message: "Ángulo de rotación", options: [], defaultValue: "0" }, accepts: CAD_ACCEPT_ANGLE | CAD_ACCEPT_DISTANCE };
}

function finish(state: SymbolState, rotation: number, context: CadCommandContext): CadCommandStep<SymbolState> {
  const symbol = state.symbol!;
  const commands: CadEntityCommand[] = [];
  const existing = context.blocks?.().find((block) => block.id === symbol.id);
  const definition = existing ?? cadSchematicBlockDefinition(symbol);
  if (!existing) commands.push({ type: "block", op: "define", definition });
  // Alta de capa IE-ESQ si falta.
  const layers = context.layers?.();
  if (layers && !layers.some((l) => l.name.toUpperCase() === symbol.layer.toUpperCase() || l.id.toUpperCase() === symbol.layer.toUpperCase()))
    commands.push({ type: "layer", op: "upsert", layer: { id: symbol.layer, name: symbol.layer, color: "#3b82f6", visible: true, locked: false } });
  commands.push(...cadInsertBlockCommands({ id: context.newEntityId(), block: definition, insertion: { x: state.point!.x, y: state.point!.y, z: 0 }, rotation, layer: symbol.layer }));
  const defined = commands.some((c) => c.type === "block");
  return {
    state: { symbol: null, point: null },
    prompt: { message: "", options: [] },
    accepts: 0,
    result: {
      kind: "document",
      commands,
      label: "AESYMBOL",
      notice: `AESYMBOL: ${symbol.name} (${symbol.family})${defined ? `; bloque ${symbol.id} definido en el dibujo` : ""}.`,
    },
  };
}

const aesymbolCommand: CadCommandDescriptor<SymbolState> = {
  name: "AESYMBOL",
  aliases: ["SIMBOLOESQUEMA"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: () => ask({ symbol: null, point: null }),
  step: (state, input, context) => {
    if (input.kind === "cancel")
      return { state: { symbol: null, point: null }, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
    if (!state.symbol) {
      if (input.kind === "keyword") return ask({ ...state, symbol: cadSchematicSymbolFor(input.keyword) ?? null });
      if (input.kind === "enter") return ask({ ...state, symbol: CAD_SCHEMATIC_SYMBOLS[0] });
      return ask(state);
    }
    if (!state.point) {
      if (input.kind === "keyword") return ask({ ...state, symbol: cadSchematicSymbolFor(input.keyword) ?? state.symbol });
      if (input.kind === "point") return ask({ ...state, point: input.point });
      if (input.kind === "enter") return { state: { symbol: null, point: null }, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text: "AESYMBOL necesita un punto de inserción." } };
      return ask(state);
    }
    const degrees = input.kind === "enter" ? 0 : input.kind === "angle" ? input.degrees : input.kind === "distance" ? input.value : null;
    if (degrees === null) return ask(state);
    return finish(state, degrees, context);
  },
};

export const CAD_SCHEMATIC_SYMBOL_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(aesymbolCommand),
];
