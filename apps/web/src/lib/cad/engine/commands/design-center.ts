/**
 * ADCENTER: navegar por lo que aportan otros dibujos y traérselo.
 *
 * Tres pasos, que son los tres clics del DesignCenter de AutoCAD: elegir el
 * origen, ver qué tiene, copiar lo que interese. La diferencia es que aquí se
 * teclean, y que el origen de hoy son las referencias externas ya adjuntadas —
 * ver `blocks/design-center.ts`, donde está explicado por qué eso es un lector
 * completo y no un sucedáneo.
 *
 * ADCENTER es un LECTOR: nunca escribe en el dibujo de origen. Lo único que
 * emite son definiciones NUEVAS en el anfitrión.
 */
import type { CadEntityCommand } from "../../entity-commands";
import {
  cadDesignCenterCopyCommands,
  cadDesignCenterInventory,
  cadDesignCenterSources,
} from "../../blocks/design-center";
import {
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

const NO_PROMPT = { message: "", options: [] } as const;
const LIST = { keyword: "?", shortcut: "?" } as const;

function message<S>(state: S, text: string): CadCommandStep<S> {
  return { state, prompt: NO_PROMPT, accepts: 0, result: { kind: "message", text } };
}

function nothing<S>(state: S): CadCommandStep<S> {
  return { state, prompt: NO_PROMPT, accepts: 0, result: { kind: "none" } };
}

interface DesignCenterState {
  source: string | null;
}

function sourceList(context: CadCommandContext): string {
  const document = context.document?.();
  if (!document) return "El anfitrión no expone el documento.";
  const sources = cadDesignCenterSources(document);
  if (sources.length === 0)
    return "No hay ningún dibujo del que copiar: adjunte una referencia externa y sus definiciones aparecerán aquí.";
  return `Orígenes: ${sources
    .map((source) => `${source.name} (${source.blockCount} bloques, ${source.layerCount} capas)`)
    .join(", ")}.`;
}

function inventoryList(context: CadCommandContext, source: string): string {
  const document = context.document?.();
  if (!document) return "El anfitrión no expone el documento.";
  try {
    const items = cadDesignCenterInventory(document, source);
    if (items.length === 0) return `${source} no aporta definiciones que copiar.`;
    return `${source} → ${items.map((item) => `${item.name} [${item.kind}, ${item.detail}]`).join(", ")}.`;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const designCenterCommand: CadCommandDescriptor<DesignCenterState> = {
  name: "ADCENTER",
  aliases: ["AC", "ADC", "DC"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: true,
  cursor: "none",
  begin: (context) => {
    if (!context.document)
      return message({ source: null }, "El anfitrión no expone el documento: ADCENTER no puede navegar.");
    const sources = cadDesignCenterSources(context.document());
    if (sources.length === 0) return message({ source: null }, sourceList(context));
    return {
      state: { source: null },
      prompt: {
        message: `Indique el dibujo de origen (${sources.map((source) => source.name).join(", ")})`,
        options: [LIST],
      },
      accepts: CAD_ACCEPT_TEXT | CAD_ACCEPT_KEYWORD,
    };
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return nothing(state);
    if (input.kind === "keyword" && input.keyword === LIST.keyword)
      return message(state, state.source ? inventoryList(context, state.source) : sourceList(context));
    if (input.kind !== "text") return nothing(state);
    const value = input.value.trim();
    if (value === "?")
      return message(state, state.source ? inventoryList(context, state.source) : sourceList(context));

    if (state.source === null) {
      const document = context.document?.();
      if (!document) return message(state, "El anfitrión no expone el documento.");
      try {
        cadDesignCenterInventory(document, value);
      } catch (error) {
        return message(state, error instanceof Error ? error.message : String(error));
      }
      return {
        state: { source: value },
        prompt: {
          message: `${inventoryList(context, value)} Indique qué copiar, o * para todo`,
          options: [LIST],
        },
        accepts: CAD_ACCEPT_TEXT | CAD_ACCEPT_KEYWORD,
      };
    }

    const document = context.document?.();
    if (!document) return message(state, "El anfitrión no expone el documento.");
    try {
      const copy = cadDesignCenterCopyCommands(
        document,
        state.source,
        value.split(",").map((name) => name.trim()).filter(Boolean),
      );
      const renamed = copy.copied.filter((entry) => entry.renamed);
      const commands: readonly CadEntityCommand[] = copy.commands;
      if (commands.length === 0) return message(state, "No había nada que copiar.");
      return {
        state,
        // El resumen del renombrado va en la etiqueta de historia porque el
        // resultado sólo puede ser una cosa: o documento o mensaje. Copiar y
        // callarse qué nombre acabó teniendo el bloque sería peor.
        prompt: NO_PROMPT,
        accepts: 0,
        result: {
          kind: "document",
          commands,
          label: renamed.length
            ? `ADCENTER (renombrado: ${renamed.map((entry) => `${entry.from}→${entry.to}`).join(", ")})`
            : "ADCENTER",
        },
      };
    } catch (error) {
      return message(state, error instanceof Error ? error.message : String(error));
    }
  },
};

export const CAD_DESIGN_CENTER_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(designCenterCommand),
];
