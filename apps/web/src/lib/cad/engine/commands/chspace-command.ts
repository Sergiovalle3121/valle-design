/**
 * CHSPACE — cambia objetos de espacio MODELO a PAPEL o al revés, conservando
 * su tamaño APARENTE.
 *
 * ## Por qué hace falta, y no basta con cortar y pegar
 *
 * Cortar un objeto del modelo y pegarlo en la lámina lo deja con las
 * coordenadas de MODELO en un espacio que se mide en milímetros de PAPEL: un
 * muro de 8.000 unidades aparecería como una línea de 8 metros sobre una hoja
 * A1. CHSPACE aplica el factor de la ventana de referencia —el mismo que
 * `cadChspaceScaleFactor` (`../../cad-chspace.ts`) calcula y una spec mide en
 * milímetros— así que lo que se veía de tal tamaño en la ventana sigue
 * midiendo lo mismo ya convertido en geometría de papel.
 *
 * ## Qué decide el comando, y qué decide el cálculo puro
 *
 * Este archivo sólo teclea: designa objetos, pregunta la ventana de
 * referencia cuando hay más de una, y por cada objeto decide la DIRECCIÓN
 * mirando dónde está HOY (`cadChspaceDirectionFor`) — un objeto que ya vive en
 * el papel de esta presentación viaja al modelo, y cualquier otro viaja al
 * papel. Así un solo CHSPACE sobre una selección mixta hace lo correcto con
 * cada objeto sin preguntar dirección aparte.
 */
import type { CadPaperSpace } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import {
  cadChspaceAffine,
  cadChspaceDirectionFor,
  cadChspaceMembership,
} from "../../cad-chspace";
import { findCadLayout } from "../../layout/layout-operations";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_SELECTION,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

function say<S>(state: S, text: string): CadCommandStep<S> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text } };
}

function cancelled<S>(state: S): CadCommandStep<S> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
}

function documentResult<S>(
  state: S,
  commands: readonly CadEntityCommand[],
  label: string,
): CadCommandStep<S> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "document", commands, label } };
}

/** Presentación activa: la de la pestaña abierta, o la primera por orden. */
function activeSpace(context: CadCommandContext): CadPaperSpace | null {
  const spaces = context.paperSpaces?.();
  if (!spaces || spaces.length === 0) return null;
  const named = context.activeLayout ? findCadLayout(spaces, context.activeLayout) : undefined;
  return (
    named ??
    [...spaces].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id))[0]
  );
}

interface ChspaceState {
  entityIds: readonly string[];
  /** `null` mientras se designan objetos; se rellena al pasar a pedir ventana. */
  askingViewport: boolean;
}

function askPick(state: ChspaceState): CadCommandStep<ChspaceState> {
  return {
    state,
    prompt: {
      message: `Designe objetos a cambiar de espacio (${state.entityIds.length}; Enter para terminar)`,
      options: [],
    },
    accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
  };
}

function askViewport(state: ChspaceState, space: CadPaperSpace): CadCommandStep<ChspaceState> {
  const first = (space.viewports ?? [])[0];
  return {
    state: { ...state, askingViewport: true },
    prompt: {
      message: "Ventana de referencia para la escala",
      options: [],
      defaultValue: first?.name ?? first?.id,
    },
    accepts: CAD_ACCEPT_TEXT,
  };
}

function finish(
  entityIds: readonly string[],
  viewportToken: string,
  space: CadPaperSpace,
  context: CadCommandContext,
): CadCommandStep<ChspaceState> {
  const viewports = space.viewports ?? [];
  const needle = viewportToken.trim().toLowerCase();
  const viewport = viewports.find(
    (candidate) =>
      candidate.id.toLowerCase() === needle || (candidate.name ?? "").trim().toLowerCase() === needle,
  );
  if (!viewport)
    return say(
      { entityIds, askingViewport: true },
      `No existe la ventana «${viewportToken}» en esta presentación.`,
    );

  let nextSpace = space;
  const commands: CadEntityCommand[] = [];
  let toPaper = 0;
  let toModel = 0;
  for (const entityId of entityIds) {
    const direction = cadChspaceDirectionFor(nextSpace, entityId);
    const affine = cadChspaceAffine(viewport, context.unit ?? "mm", direction);
    commands.push({ type: "transform", entityId, transform: { affine } });
    nextSpace = cadChspaceMembership(nextSpace, entityId, direction);
    if (direction === "toPaper") toPaper += 1;
    else toModel += 1;
  }
  commands.push({ type: "paper-space", op: "upsert", space: nextSpace });

  const parts: string[] = [];
  if (toPaper) parts.push(`${toPaper} a papel`);
  if (toModel) parts.push(`${toModel} a modelo`);
  return documentResult(
    { entityIds: [], askingViewport: false },
    commands,
    `CHSPACE: ${parts.join(", ")} (ventana «${viewport.name ?? viewport.id}»)`,
  );
}

const chspaceCommand: CadCommandDescriptor<ChspaceState> = {
  name: "CHSPACE",
  aliases: [],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => {
    const space = activeSpace(context);
    if (!space)
      return say(
        { entityIds: [], askingViewport: false },
        "CHSPACE necesita una presentación abierta: ábrala con LAYOUT y entre con PSPACE o MSPACE.",
      );
    if (!(space.viewports ?? []).length)
      return say(
        { entityIds: [], askingViewport: false },
        "La presentación no tiene ninguna ventana de la que tomar la escala: cree una con MVIEW.",
      );
    if (context.selection.length > 0)
      return askViewport({ entityIds: [...context.selection], askingViewport: false }, space);
    return askPick({ entityIds: [], askingViewport: false });
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return cancelled(state);
    const space = activeSpace(context);
    if (!space) return say(state, "CHSPACE necesita una presentación abierta.");

    if (!state.askingViewport) {
      if (input.kind === "entityPick")
        return askPick({ ...state, entityIds: [...new Set([...state.entityIds, input.entityId])] });
      if (input.kind === "selection")
        return askPick({ ...state, entityIds: [...new Set([...state.entityIds, ...input.entityIds])] });
      if (input.kind === "enter") {
        if (state.entityIds.length === 0) return cancelled(state);
        return askViewport(state, space);
      }
      return askPick(state);
    }

    const viewports = space.viewports ?? [];
    const token =
      input.kind === "text"
        ? input.value.trim()
        : input.kind === "enter"
          ? (viewports[0]?.name ?? viewports[0]?.id ?? "")
          : "";
    if (!token) return cancelled(state);
    return finish(state.entityIds, token, space, context);
  },
};

export const CAD_CHSPACE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(chspaceCommand),
];
