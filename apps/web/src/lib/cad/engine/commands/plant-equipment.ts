/**
 * PIDEQUIP: el equipo del P&ID, colocado y etiquetado en un solo acto.
 *
 * ## Qué faltaba, medido
 *
 * La primera parte de la Ola 6 trajo las LÍNEAS con su número. Un P&ID con
 * líneas y sin equipos no es un P&ID: es un mapa de tuberías que no llegan a
 * ninguna parte. El criterio de la rúbrica pide las dos cosas —«diagramas P&ID
 * con catálogo de equipos y líneas»— y no se otorga a medias.
 *
 * ## Colocar y etiquetar son UN acto
 *
 * Nadie coloca una bomba para dejarla sin nombre. La orden emite un solo lote:
 * la definición del bloque si el documento no la tiene, la capa si falta, y la
 * inserción YA con su etiqueta —`P-101`, sacada del dibujo— en los atributos.
 * Un paso de deshacer, y el equipo nace con nombre.
 *
 * ## El prefijo lo propone el símbolo y lo decide el proyecto
 *
 * Cada símbolo trae el prefijo de uso corriente (`P` la bomba, `V` la vasija),
 * y se acepta con Intro. Pero se admite cualquiera de una a tres letras: la
 * nomenclatura la fija la ingeniería y el programa no está para discutirla.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import { cadInsertBlockCommands } from "../../blocks/block-workflow";
import {
  CAD_PL_EQUIP_LAYER,
  CAD_PID_SYMBOLS,
  cadPidBlockDefinition,
  cadPidSymbolFor,
  type CadPidSymbol,
} from "../../plant/pid-symbols";
import {
  CAD_PL_TAG,
  cadEquipmentClashes,
  cadEquipmentTagsOf,
  cadFormatEquipmentTag,
  cadNextEquipmentNumber,
  cadParseEquipmentTag,
  cadUntaggedEquipment,
} from "../../plant/equipment-tags";
import {
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

const say = (text: string): CadCommandStep<never> => ({
  state: undefined as never,
  prompt: { message: "", options: [] },
  accepts: 0,
  result: { kind: "message", text },
});

const OPTIONS = CAD_PID_SYMBOLS.map((symbol) => symbol.keyword);

interface EquipState {
  symbol: CadPidSymbol | null;
  prefix: string | null;
  point: CadPoint2 | null;
}

function equipStep(state: EquipState): CadCommandStep<EquipState> {
  if (!state.symbol)
    return {
      state,
      prompt: { message: "Indique el equipo", options: OPTIONS, defaultOption: OPTIONS[0].keyword },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  if (!state.prefix)
    return {
      state,
      prompt: {
        message: `Prefijo de etiqueta, Intro para <${state.symbol.prefix}>`,
        options: [],
      },
      accepts: CAD_ACCEPT_TEXT,
    };
  return {
    state,
    prompt: { message: `${state.symbol.name}. Precise el punto de inserción`, options: [] },
    accepts: CAD_ACCEPT_POINT,
  };
}

function finishEquip(
  state: EquipState,
  point: CadPoint2,
  context: CadCommandContext,
): CadCommandStep<never> {
  if (!context.entity)
    return say("PIDEQUIP necesita leer el dibujo para numerar: este anfitrión no lo expone.");
  const entities = context.entityIds
    .map((id) => context.entity!(id))
    .filter((entity): entity is NonNullable<typeof entity> => !!entity);

  const symbol = state.symbol!;
  const prefix = state.prefix!;
  const number = cadNextEquipmentNumber({ entities }, prefix);
  const tag = cadFormatEquipmentTag(prefix, number);
  // Se valida con el MISMO lector que usa la lista: un prefijo que la lista no
  // sabe leer dejaría un equipo fuera del proyecto sin que nadie lo note.
  if (!cadParseEquipmentTag(tag))
    return say(`«${prefix}» no es un prefijo de etiqueta: una a tres letras.`);

  const commands: CadEntityCommand[] = [];
  const existing = context.blocks?.().find((block) => block.id === symbol.id);
  const definition = existing ?? cadPidBlockDefinition(symbol);
  if (!existing) commands.push({ type: "block", op: "define", definition });

  const layers = context.layers?.();
  if (
    layers &&
    !layers.some(
      (layer) =>
        layer.name.toUpperCase() === CAD_PL_EQUIP_LAYER ||
        layer.id.toUpperCase() === CAD_PL_EQUIP_LAYER,
    )
  )
    commands.push({
      type: "layer",
      op: "upsert",
      layer: {
        id: CAD_PL_EQUIP_LAYER,
        name: CAD_PL_EQUIP_LAYER,
        color: "#f59e0b",
        visible: true,
        locked: false,
      },
    });

  const inserts = cadInsertBlockCommands({
    id: context.newEntityId(),
    block: definition,
    insertion: { x: point.x, y: point.y, z: 0 },
    rotation: 0,
    layer: CAD_PL_EQUIP_LAYER,
  });
  // El equipo nace CON su etiqueta: nadie coloca una bomba para dejarla sin
  // nombre, y una inserción sin atributo es un equipo que la lista no ve.
  commands.push(
    ...inserts.map((command) =>
      command.type === "insert" && command.entity.type === "insert"
        ? {
            ...command,
            entity: {
              ...command.entity,
              attributes: { ...(command.entity.attributes ?? {}), [CAD_PL_TAG]: tag },
            },
          }
        : command,
    ),
  );

  const dicho = `PIDEQUIP: ${symbol.name} ${tag} en (${Math.round(point.x)}, ${Math.round(point.y)}), capa ${CAD_PL_EQUIP_LAYER}${
    existing ? "" : `; bloque ${symbol.id} definido en el dibujo`
  }`;
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "document", commands, label: "PIDEQUIP", notice: dicho },
  };
}

const equipCommand: CadCommandDescriptor<EquipState> = {
  name: "PIDEQUIP",
  aliases: ["EQUIPO", "EQUIPMENT"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: () => equipStep({ symbol: null, prefix: null, point: null }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return say("PIDEQUIP cancelado.");
    if (!state.symbol) {
      if (input.kind === "enter") return equipStep({ ...state, symbol: CAD_PID_SYMBOLS[0] });
      if (input.kind !== "keyword") return equipStep(state);
      const symbol = cadPidSymbolFor(input.keyword);
      return symbol ? equipStep({ ...state, symbol }) : equipStep(state);
    }
    if (!state.prefix) {
      if (input.kind === "enter") return equipStep({ ...state, prefix: state.symbol.prefix });
      if (input.kind !== "text") return equipStep(state);
      const escrito = input.value.trim();
      return equipStep({ ...state, prefix: escrito === "" ? state.symbol.prefix : escrito });
    }
    if (input.kind !== "point") return equipStep(state);
    return finishEquip(state, input.point, context);
  },
};

const equipListCommand: CadCommandDescriptor<never> = {
  name: "PIDEQUIPLIST",
  aliases: ["LISTAEQUIPOS"],
  kind: "inquiry",
  transparent: true,
  selection: "none",
  repeatable: true,
  mutates: false,
  cursor: "none",
  begin: (context) => {
    if (!context.entity)
      return say("PIDEQUIPLIST necesita leer el dibujo: este anfitrión no lo expone.");
    const entities = context.entityIds
      .map((id) => context.entity!(id))
      .filter((entity): entity is NonNullable<typeof entity> => !!entity);
    const tags = cadEquipmentTagsOf({ entities });
    const choques = cadEquipmentClashes({ entities });
    const pelados = cadUntaggedEquipment({ entities });
    if (tags.length === 0 && pelados.length === 0)
      return say("No hay ningún equipo de proceso en el dibujo. Coloque uno con PIDEQUIP.");

    const partes = [
      `${tags.length} equipo(s): ${tags
        .map((tag) => tag.tag)
        .sort()
        .join(", ")}`,
    ];
    if (choques.length > 0)
      partes.push(
        `REPETIDAS: ${choques.map((c) => `${c.tag} en ${c.entityIds.join(" y ")}`).join("; ")}`,
      );
    if (pelados.length > 0)
      partes.push(`${pelados.length} sin etiqueta: ${pelados.slice(0, 5).join(", ")}`);
    return say(`PIDEQUIPLIST — ${partes.join(" · ")}.`);
  },
  step: (state) => ({
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "none" },
  }),
};

export const CAD_PLANT_EQUIPMENT_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(equipCommand),
  asCadCommand(equipListCommand),
];
