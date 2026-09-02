/**
 * COPYCLIP, CUTCLIP, COPYBASE, PASTECLIP y PASTEORIG (Ola D, 2026-09-02).
 *
 * El portapapeles de geometría canónica: lo que faltaba para llevar una LINE,
 * una COTA o un INSERT de un dibujo a otro (ver la cabecera de
 * `lib/cad/clipboard.ts`, con la medición del 2026-09-01).
 *
 * ## El reparto
 *
 * Copiar y cortar ESCRIBEN en un almacén, y escribir es un efecto: el comando
 * designa, decide el punto base y emite una petición `clipboard` que el
 * anfitrión atiende (lee las entidades, las guarda y, en `cut`, borra los
 * originales como UN lote). Pegar sólo LEE: `context.clipboard` trae el
 * contenido y el comando devuelve el lote de inserciones, que es un resultado
 * `document` como el de cualquier otra orden. Así las cinco se prueban en
 * Node sin anfitrión, y el anfitrión se prueba aparte comprobando el almacén.
 *
 * ## Lo que se dice
 *
 * PASTECLIP anuncia en su prompt cuántos objetos se pegan y cuántos se
 * DESLIGAN (cotas, sombreados y directrices asociativos que no tienen a qué
 * apuntar en el destino). Un portapapeles vacío no es un error silencioso: se
 * dice qué tecla lo llena.
 */
import type { CadPoint2 } from "../../cad-document";
import {
  cadPasteCommands,
  cadPasteDetachedCount,
  cadPastePreview,
  type CadClipboardContent,
} from "../../clipboard";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_SELECTION,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import { cadCommandCancelled, cadCommandRefused, cadCommandWrites } from "./annotate-support";

const SILENT = { message: "", options: [] } as const;

// ---------------------------------------------------------------------------
// COPYCLIP · CUTCLIP · COPYBASE — designar y pedir al anfitrión que guarde
// ---------------------------------------------------------------------------

interface ClipState {
  targets: string[];
  /** COPYBASE: el punto base tecleado; `null` = la envolvente decide. */
  basePoint: CadPoint2 | null;
  /** COPYBASE pide el punto ANTES de designar. */
  askingBase: boolean;
}

function toClipboard(
  name: "COPYCLIP" | "CUTCLIP" | "COPYBASE",
  state: ClipState,
): CadCommandStep<ClipState> {
  if (state.targets.length === 0) return cadCommandRefused(state, `${name}: no se designó nada.`);
  return {
    state,
    prompt: SILENT,
    accepts: 0,
    result: {
      kind: "host",
      request: {
        kind: "clipboard",
        op: name === "CUTCLIP" ? "cut" : "copy",
        entityIds: [...state.targets],
        basePoint: state.basePoint,
      },
      label: name,
    },
  };
}

function askingTargets(state: ClipState, verb: string): CadCommandStep<ClipState> {
  return {
    state,
    prompt: { message: `Designe los objetos a ${verb}`, options: [] },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  };
}

function askingBase(state: ClipState): CadCommandStep<ClipState> {
  return {
    state,
    prompt: { message: "Precise el punto base", options: [] },
    accepts: CAD_ACCEPT_POINT,
  };
}

function clipCommand(
  name: "COPYCLIP" | "CUTCLIP" | "COPYBASE",
  verb: string,
): CadCommandDescriptor<ClipState> {
  const withBase = name === "COPYBASE";
  return {
    name,
    aliases: [],
    kind: "modify",
    transparent: false,
    selection: "optional",
    repeatable: true,
    // CUTCLIP borra; COPYCLIP y COPYBASE sólo leen el dibujo.
    mutates: name === "CUTCLIP",
    cursor: "pick",
    begin: (context) => {
      const state: ClipState = { targets: [...context.selection], basePoint: null, askingBase: withBase };
      if (withBase) return askingBase(state);
      // Con selección previa (Ctrl+C sobre lo designado) no se pregunta nada:
      // es el gesto de todos los programas y el que la gente hace sin mirar.
      return state.targets.length > 0 ? toClipboard(name, state) : askingTargets(state, verb);
    },
    step: (state, input) => {
      if (input.kind === "cancel") return cadCommandCancelled(state);
      if (state.askingBase) {
        if (input.kind !== "point") return askingBase(state);
        const next = { ...state, basePoint: { x: input.point.x, y: input.point.y }, askingBase: false };
        return next.targets.length > 0 ? toClipboard(name, next) : askingTargets(next, verb);
      }
      if (input.kind === "entityPick")
        return askingTargets({ ...state, targets: [...new Set([...state.targets, input.entityId])] }, verb);
      if (input.kind === "selection")
        return askingTargets({ ...state, targets: [...new Set([...state.targets, ...input.entityIds])] }, verb);
      if (input.kind === "enter") return toClipboard(name, state);
      return askingTargets(state, verb);
    },
  };
}

// ---------------------------------------------------------------------------
// PASTECLIP · PASTEORIG — leer el portapapeles y escribir el lote
// ---------------------------------------------------------------------------

interface PasteState {
  content: CadClipboardContent | null;
}

const EMPTY_CLIPBOARD =
  "El portapapeles de geometría está vacío: copie primero con COPYCLIP (Ctrl+C) o CUTCLIP (Ctrl+X).";

function pasteSummary(content: CadClipboardContent): string {
  const detached = cadPasteDetachedCount(content);
  const objects = `${content.entities.length} objeto(s)`;
  return detached > 0 ? `${objects}, ${detached} se pega(n) desligado(s)` : objects;
}

function existingBlocks(context: CadCommandContext): ReadonlySet<string> {
  return new Set((context.blocks?.() ?? []).map((block) => block.id));
}

function askingInsertion(state: PasteState, context: CadCommandContext): CadCommandStep<PasteState> {
  const content = state.content!;
  return {
    state,
    prompt: {
      message: `Precise el punto de inserción (${pasteSummary(content)})`,
      options: [],
    },
    accepts: CAD_ACCEPT_POINT,
    // La silueta bajo el cursor, como al insertar un bloque: se ve DÓNDE va a
    // caer antes de soltarlo.
    preview: context.cursor ? cadPastePreview(content, context.cursor) : [],
  };
}

const pasteclipCommand: CadCommandDescriptor<PasteState> = {
  name: "PASTECLIP",
  aliases: [],
  kind: "modify",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => {
    const content = context.clipboard?.read() ?? null;
    if (!content) return cadCommandRefused({ content: null }, EMPTY_CLIPBOARD);
    return askingInsertion({ content }, context);
  },
  step: (state, input, context) => {
    if (input.kind === "cancel" || !state.content) return cadCommandCancelled(state);
    if (input.kind !== "point") return askingInsertion(state, context);
    return cadCommandWrites(
      state,
      cadPasteCommands(state.content, input.point, context.newEntityId, existingBlocks(context)),
      "PASTECLIP",
    );
  },
};

/** Pega donde estaba: el mismo lote con el punto base como destino. */
const pasteorigCommand: CadCommandDescriptor<PasteState> = {
  name: "PASTEORIG",
  aliases: [],
  kind: "modify",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "none",
  begin: (context) => {
    const content = context.clipboard?.read() ?? null;
    if (!content) return cadCommandRefused({ content: null }, EMPTY_CLIPBOARD);
    return cadCommandWrites(
      { content },
      cadPasteCommands(content, content.basePoint, context.newEntityId, existingBlocks(context)),
      "PASTEORIG",
    );
  },
  step: (state) => cadCommandCancelled(state),
};

export const CAD_CLIPBOARD_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(clipCommand("COPYCLIP", "copiar")),
  asCadCommand(clipCommand("CUTCLIP", "cortar")),
  asCadCommand(clipCommand("COPYBASE", "copiar")),
  asCadCommand(pasteclipCommand),
  asCadCommand(pasteorigCommand),
];
