/**
 * GROUP, UNGROUP y PURGE.
 *
 * ## GROUP
 *
 * Un grupo es un conjunto con nombre que se designa de una pieza. Es lo que
 * separa «he movido la mesa» de «he movido cuatro patas y un tablero y me he
 * dejado una». La pertenencia vive en los metadatos de cada entidad; ver
 * `blocks/cad-groups.ts`.
 *
 * ## PURGE
 *
 * PURGE se pide con miedo, y con razón: es la orden que puede borrar lo que sí
 * se usa. Por eso aquí NO borra a la primera. Muestra qué se iría y pide
 * confirmación, con la lista delante. Quien quiera saltársela tiene la palabra
 * clave `Todo`, que es una decisión explícita y no un descuido.
 *
 * OVERKILL —quitar duplicados de geometría— es otra orden y la trae otra
 * sesión; aquí no se toca.
 */
import type { CadEntity } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import {
  cadCreateGroupCommands,
  cadDocumentGroups,
  cadGroupsOf,
  cadUngroupCommands,
} from "../../blocks/cad-groups";
import { cadPurgeCommands, cadPurgePreview, type CadPurgeCandidate } from "../../blocks/cad-purge";
import {
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

const NO_PROMPT = { message: "", options: [] } as const;

function message<S>(state: S, text: string): CadCommandStep<S> {
  return { state, prompt: NO_PROMPT, accepts: 0, result: { kind: "message", text } };
}

function nothing<S>(state: S): CadCommandStep<S> {
  return { state, prompt: NO_PROMPT, accepts: 0, result: { kind: "none" } };
}

function attempt<S>(state: S, label: string, build: () => readonly CadEntityCommand[]): CadCommandStep<S> {
  try {
    const commands = build();
    return {
      state,
      prompt: NO_PROMPT,
      accepts: 0,
      result: commands.length > 0 ? { kind: "document", commands, label } : { kind: "none" },
    };
  } catch (error) {
    return message(state, error instanceof Error ? error.message : String(error));
  }
}

/** Todas las entidades del documento tal y como el motor las puede leer. */
function readEntities(context: CadCommandContext, ids: readonly string[]): CadEntity[] {
  return ids.map((id) => context.entity?.(id)).filter((entity): entity is CadEntity => !!entity);
}

const documentEntities = (context: CadCommandContext): CadEntity[] =>
  readEntities(context, context.entityIds);

// ---------------------------------------------------------------------------
// GROUP
// ---------------------------------------------------------------------------

interface GroupState {
  name: string | null;
  selection: readonly string[];
}

const LIST = { keyword: "?", shortcut: "?" } as const;

function groupStep(state: GroupState): CadCommandStep<GroupState> {
  if (state.name === null)
    return {
      state,
      prompt: { message: "Indique el nombre del grupo", options: [LIST] },
      accepts: CAD_ACCEPT_TEXT,
    };
  return {
    state,
    prompt: { message: "Designe los objetos del grupo", options: [] },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  };
}

function groupList(context: CadCommandContext): string {
  const groups = cadDocumentGroups(documentEntities(context));
  return groups.length
    ? `Grupos: ${groups.map((group) => `${group.name} (${group.entityIds.length})`).join(", ")}.`
    : "El dibujo no tiene grupos.";
}

const groupCommand: CadCommandDescriptor<GroupState> = {
  name: "GROUP",
  aliases: ["G"],
  kind: "manage",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => groupStep({ name: null, selection: context.selection }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return nothing(state);
    if (state.name === null) {
      if (input.kind === "keyword" && input.keyword === LIST.keyword)
        return message(state, groupList(context));
      if (input.kind !== "text") return groupStep(state);
      const name = input.value.trim();
      if (name === "?") return message(state, groupList(context));
      if (cadDocumentGroups(documentEntities(context)).some((group) => group.name === name))
        return message(state, `Ya hay un grupo llamado ${name}.`);
      const next = { ...state, name };
      // Con objetos ya designados antes de teclear, GROUP no vuelve a pedirlos.
      return next.selection.length > 0
        ? attempt(next, "GROUP", () => cadCreateGroupCommands(name, readEntities(context, next.selection)))
        : groupStep(next);
    }
    if (input.kind === "entityPick")
      return groupStep({ ...state, selection: [...new Set([...state.selection, input.entityId])] });
    if (input.kind === "selection") {
      if (input.entityIds.length === 0) return groupStep({ ...state, selection: [] });
      return attempt(state, "GROUP", () =>
        cadCreateGroupCommands(state.name!, readEntities(context, input.entityIds)),
      );
    }
    if (input.kind === "enter") {
      if (state.selection.length === 0) return message(state, "No hay ningún objeto designado.");
      return attempt(state, "GROUP", () =>
        cadCreateGroupCommands(state.name!, readEntities(context, state.selection)),
      );
    }
    return groupStep(state);
  },
};

// ---------------------------------------------------------------------------
// UNGROUP
// ---------------------------------------------------------------------------

/**
 * UNGROUP acepta el nombre del grupo o un objeto que pertenezca a él, que es
 * como se usa de verdad: se ve el conjunto en pantalla, no su nombre.
 */
const ungroupCommand: CadCommandDescriptor<null> = {
  name: "UNGROUP",
  aliases: ["UNG"],
  kind: "manage",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => {
    const selected = readEntities(context, context.selection);
    const names = [...new Set(selected.flatMap(cadGroupsOf))];
    if (names.length === 1)
      return attempt(null, "UNGROUP", () => cadUngroupCommands(names[0], documentEntities(context)));
    return {
      state: null,
      prompt: {
        message:
          names.length > 1
            ? `Lo designado está en varios grupos (${names.join(", ")}): indique cuál deshacer`
            : "Indique el nombre del grupo, o designe un objeto suyo",
        options: [LIST],
      },
      accepts: CAD_ACCEPT_TEXT | CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_KEYWORD,
    };
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return nothing(state);
    if (input.kind === "keyword" && input.keyword === LIST.keyword)
      return message(state, groupList(context));
    if (input.kind === "entityPick") {
      const entity = context.entity?.(input.entityId);
      const names = entity ? cadGroupsOf(entity) : [];
      if (names.length !== 1)
        return message(
          state,
          names.length === 0
            ? "Ese objeto no pertenece a ningún grupo."
            : `Ese objeto está en varios grupos (${names.join(", ")}): indique cuál.`,
        );
      return attempt(state, "UNGROUP", () => cadUngroupCommands(names[0], documentEntities(context)));
    }
    if (input.kind !== "text") return nothing(state);
    if (input.value.trim() === "?") return message(state, groupList(context));
    return attempt(state, "UNGROUP", () =>
      cadUngroupCommands(input.value, documentEntities(context)),
    );
  },
};

// ---------------------------------------------------------------------------
// PURGE
// ---------------------------------------------------------------------------

interface PurgeState {
  candidates: readonly CadPurgeCandidate[];
}

const PURGE_ALL = { keyword: "Todo", shortcut: "T" } as const;
const PURGE_YES = { keyword: "Sí", shortcut: "S" } as const;
const PURGE_NO = { keyword: "No", shortcut: "N" } as const;

/** Una línea por candidato: es la PREVISUALIZACIÓN, y es lo que evita el desastre. */
function purgeSummary(candidates: readonly CadPurgeCandidate[]): string {
  const byKind = new Map<string, string[]>();
  for (const candidate of candidates)
    byKind.set(candidate.kind, [...(byKind.get(candidate.kind) ?? []), candidate.label]);
  const label: Record<string, string> = { block: "bloques", layer: "capas", style: "estilos" };
  return [...byKind.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, names]) => `${label[kind] ?? kind}: ${names.sort().join(", ")}`)
    .join(" · ");
}

/**
 * PURGE necesita el documento entero —bloques, capas, estilos y referencias—,
 * y el contexto del motor sólo ofrece entidades y bloques. Lo que falta entra
 * por `context.document`, que el estudio ya aporta.
 */
function purgeCandidates(context: CadCommandContext): CadPurgeCandidate[] {
  const document = context.document?.();
  if (!document) return [];
  return cadPurgePreview(document, { activeLayer: context.activeLayer });
}

const purgeCommand: CadCommandDescriptor<PurgeState> = {
  name: "PURGE",
  aliases: ["PU"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: true,
  cursor: "none",
  begin: (context) => {
    if (!context.document)
      return message({ candidates: [] }, "El anfitrión no expone el documento: PURGE no puede analizarlo.");
    const candidates = purgeCandidates(context);
    if (candidates.length === 0)
      return message({ candidates }, "No hay nada que purgar: todo lo definido se usa.");
    return {
      state: { candidates },
      prompt: {
        message: `Se van a eliminar — ${purgeSummary(candidates)}. ¿Continuar?`,
        options: [PURGE_YES, PURGE_NO, PURGE_ALL],
        defaultOption: PURGE_NO.keyword,
      },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  },
  step: (state, input, context) => {
    if (input.kind === "cancel" || input.kind === "enter") return nothing(state);
    if (input.kind !== "keyword") return nothing(state);
    if (input.keyword === PURGE_NO.keyword)
      return message(state, "Purgado cancelado: no se ha borrado nada.");
    return attempt(state, "PURGE", () => cadPurgeCommands(state.candidates, context.layers?.() ?? []));
  },
};

export const CAD_GROUP_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(groupCommand),
  asCadCommand(ungroupCommand),
  asCadCommand(purgeCommand),
];
