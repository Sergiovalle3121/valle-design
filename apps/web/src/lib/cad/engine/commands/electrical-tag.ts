/**
 * AETAG: la etiqueta del componente, puesta por el dibujo (Ola 5).
 *
 * ## Qué resuelve
 *
 * En un proyecto eléctrico cada componente lleva su etiqueta —`-M1`, `-PB2`,
 * `-LT3`— y es por lo que el electricista pregunta cuando llama por teléfono.
 * Ponerlas a mano en un plano de sesenta luminarias es una tarde entera, y basta
 * un despiste para tener dos `-LT12`.
 *
 * Dos formas de usarla, y la segunda es la que quita la tarde:
 *
 *  · **Una**: se designa el componente y se elige su familia.
 *  · **Todos**: se etiquetan de una vez TODOS los componentes eléctricos que no
 *    tengan etiqueta legible, cada uno con la familia que le toca por su
 *    símbolo. Un solo lote y un solo paso de deshacer.
 *
 * ## Dónde va la etiqueta, y por qué no en metadatos
 *
 * En los ATRIBUTOS del bloque. Un atributo se DIBUJA junto al símbolo —es lo
 * que se lee en el plano impreso—, viaja al DXF como `ATTRIB` dentro del
 * `INSERT`, sale en las extracciones de datos y `ATTSYNC` ya lo mantiene al
 * redefinir el bloque. Un metadato no se ve, y una etiqueta de componente
 * existe para verse.
 *
 * ## El número sale del dibujo
 *
 * Como el del conductor y por la misma razón: un contador de sesión daría a dos
 * personas del mismo despacho dos `-M1`. Y los huecos no se rellenan: el `-M3`
 * de un plano entregado y un `-M3` nuevo serían componentes distintos con el
 * mismo nombre.
 */
import type { CadEntity } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadNativeEntity } from "../../entity-runtime";
import {
  CAD_IE_FAMILIES,
  CAD_IE_TAG,
  cadDeviceTagClashes,
  cadFormatDeviceTag,
  cadIsElectricalInsert,
  cadNextDeviceNumber,
  cadUntaggedDevices,
} from "../../electrical/device-tags";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

type CadInsert = Extract<CadEntity, { type: "insert" }>;

const say = (text: string): CadCommandStep<never> => ({
  state: undefined as never,
  prompt: { message: "", options: [] },
  accepts: 0,
  result: { kind: "message", text },
});

function entitiesOf(context: CadCommandContext): CadEntity[] | null {
  if (!context.entity) return null;
  return context.entityIds
    .map((id) => context.entity!(id))
    .filter((entity): entity is CadEntity => !!entity);
}

/**
 * La familia que le toca a un símbolo por su bloque.
 *
 * `null` cuando el símbolo no es de los que el catálogo conoce: entonces se
 * pregunta, en vez de suponer. Un componente etiquetado con la familia
 * equivocada es peor que uno sin etiquetar — el sin etiquetar se ve.
 */
function familyForBlock(block: string): string | null {
  const nombre = block.toUpperCase();
  if (nombre.includes("LUMINARIA")) return "LT";
  if (nombre.includes("CONTACTO")) return "CT";
  if (nombre.includes("APAGADOR")) return "SW";
  if (nombre.includes("TABLERO")) return "TB";
  return null;
}

const FAMILY_OPTIONS = CAD_IE_FAMILIES.map((familia) => ({
  keyword: `${familia.prefix} · ${familia.label}`,
  shortcut: familia.prefix,
}));

const ALL_OPTION = { keyword: "Todos", shortcut: "T" } as const;

interface TagState {
  target: string | null;
}

/** Escribe la etiqueta en los atributos, conservando lo demás de la entidad. */
function tagCommand(insert: CadInsert, tag: string): CadEntityCommand {
  return {
    type: "replace",
    entityId: insert.id,
    entity: {
      ...insert,
      attributes: { ...(insert.attributes ?? {}), [CAD_IE_TAG]: tag },
    } as CadNativeEntity,
  };
}

function finishOne(
  insert: CadInsert,
  prefix: string,
  entities: readonly CadEntity[],
): CadCommandStep<never> {
  const number = cadNextDeviceNumber({ entities: [...entities] }, prefix);
  const tag = cadFormatDeviceTag(prefix, number);
  const previa = insert.attributes?.[CAD_IE_TAG];
  const dicho = `AETAG: ${tag}${previa ? ` (antes «${previa}»)` : ""} en ${insert.block}`;
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "document", commands: [tagCommand(insert, tag)], label: "AETAG", notice: dicho },
  };
}

/**
 * Etiqueta de una vez todo lo que no tenga etiqueta legible.
 *
 * Los componentes se recorren ordenados por id para que dos ejecuciones sobre
 * el mismo documento repartan los mismos números: un reparto que cambia según
 * el orden de dibujo haría irrepetible cualquier informe.
 */
function finishAll(entities: readonly CadEntity[]): CadCommandStep<never> {
  const pelados = cadUntaggedDevices({ entities: [...entities] }, cadIsElectricalInsert).sort();
  if (pelados.length === 0)
    return say("Todos los componentes eléctricos del dibujo ya llevan etiqueta.");

  const porId = new Map(entities.map((entity) => [entity.id, entity]));
  // El contador arranca de lo que hay en el dibujo y sigue subiendo dentro del
  // lote: si no, los sesenta saldrían con el mismo número.
  const siguiente = new Map<string, number>();
  const commands: CadEntityCommand[] = [];
  const sinFamilia: string[] = [];
  const puestas: string[] = [];
  for (const id of pelados) {
    const insert = porId.get(id) as CadInsert | undefined;
    if (!insert) continue;
    const prefix = familyForBlock(insert.block);
    if (!prefix) {
      // No se supone la familia: un componente etiquetado como lo que no es se
      // queda mal para siempre, y el sin etiquetar al menos se ve.
      sinFamilia.push(id);
      continue;
    }
    const number = siguiente.get(prefix) ?? cadNextDeviceNumber({ entities: [...entities] }, prefix);
    siguiente.set(prefix, number + 1);
    const tag = cadFormatDeviceTag(prefix, number);
    commands.push(tagCommand(insert, tag));
    puestas.push(tag);
  }
  if (commands.length === 0)
    return say(
      `Ninguno de los ${sinFamilia.length} componente(s) sin etiqueta dice de qué familia es: etiquételos uno a uno con AETAG.`,
    );

  const fuera =
    sinFamilia.length > 0
      ? ` · ${sinFamilia.length} sin familia reconocible, sin tocar: ${sinFamilia.slice(0, 3).join(", ")}`
      : "";
  const dicho = `AETAG Todos: ${commands.length} componente(s) etiquetado(s) — ${puestas.slice(0, 6).join(", ")}${
    puestas.length > 6 ? "…" : ""
  }${fuera}`;
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    // Un lote: etiquetar el plano es un acto, no sesenta pasos de deshacer.
    result: { kind: "document", commands, label: "AETAG Todos", notice: dicho },
  };
}

const tagCommandDescriptor: CadCommandDescriptor<TagState> = {
  name: "AETAG",
  aliases: ["ETIQUETA", "AECOMPONENT"],
  kind: "modify",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: () => ({
    state: { target: null },
    prompt: {
      message: "Designe el componente a etiquetar, o Todos para los que falten",
      options: [ALL_OPTION],
    },
    accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_KEYWORD,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return say("AETAG cancelado.");
    const entities = entitiesOf(context);
    if (!entities)
      return say("AETAG necesita leer el dibujo: este anfitrión no lo expone.");

    if (input.kind === "keyword" && input.keyword === "Todos") return finishAll(entities);

    if (!state.target) {
      if (input.kind !== "entityPick") return { state, prompt: { message: "Designe el componente a etiquetar, o Todos", options: [ALL_OPTION] }, accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_KEYWORD };
      const insert = entities.find((entity) => entity.id === input.entityId);
      if (!insert || insert.type !== "insert")
        return say("AETAG etiqueta la inserción de un símbolo: eso no lo es.");
      const prefix = familyForBlock(insert.block);
      // Si el símbolo dice de qué familia es, no se pregunta: preguntar lo
      // obvio es el peaje que hace que nadie use una orden.
      if (prefix) return finishOne(insert, prefix, entities);
      return {
        state: { target: insert.id },
        prompt: { message: `«${insert.block}» no dice su familia. Elíjala`, options: FAMILY_OPTIONS },
        accepts: CAD_ACCEPT_KEYWORD,
      };
    }

    if (input.kind !== "keyword") return { state, prompt: { message: "Elija la familia", options: FAMILY_OPTIONS }, accepts: CAD_ACCEPT_KEYWORD };
    const prefix = input.keyword.split(" ")[0];
    const insert = entities.find((entity) => entity.id === state.target);
    if (!insert || insert.type !== "insert")
      return say("El componente designado ya no está en el dibujo.");
    return finishOne(insert, prefix, entities);
  },
};

const tagListCommand: CadCommandDescriptor<never> = {
  name: "AETAGLIST",
  aliases: ["LISTAETIQUETAS"],
  kind: "inquiry",
  transparent: true,
  selection: "none",
  repeatable: true,
  mutates: false,
  cursor: "none",
  begin: (context) => {
    const entities = entitiesOf(context);
    if (!entities)
      return say("AETAGLIST necesita leer el dibujo: este anfitrión no lo expone.");
    const choques = cadDeviceTagClashes({ entities });
    const pelados = cadUntaggedDevices({ entities }, cadIsElectricalInsert);
    const partes: string[] = [];
    if (choques.length > 0)
      partes.push(
        `REPETIDAS: ${choques.map((c) => `${c.tag} en ${c.entityIds.join(" y ")}`).join("; ")}`,
      );
    if (pelados.length > 0)
      partes.push(`${pelados.length} componente(s) sin etiqueta: ${pelados.slice(0, 5).join(", ")}`);
    if (partes.length === 0)
      return say("AETAGLIST — todos los componentes eléctricos llevan etiqueta y ninguna se repite.");
    return say(`AETAGLIST — ${partes.join(" · ")}.`);
  },
  step: (state) => ({
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "none" },
  }),
};

export const CAD_ELECTRICAL_TAG_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(tagCommandDescriptor),
  asCadCommand(tagListCommand),
];
