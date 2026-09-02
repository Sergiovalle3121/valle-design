"use client";

/**
 * Las acciones de la paleta Ctrl+K, fuera del monolito.
 *
 * ## Qué hace cada familia de entrada, dicho en un solo sitio
 *
 * · `tool`   → la acción de barra correspondiente (modo, panel, dibujo).
 * · `engine` → invoca el comando en el motor V2; el prompt aparece en la línea
 *              de comandos y el puntero/teclado siguen desde ahí.
 * · `command`→ previsualiza en el registro de FRASES heredado, que NO ejecuta:
 *              deja el preview listo y lo cuenta en su historial. Es un parser
 *              LOCAL y determinista —no hay IA en este producto, ver
 *              `IDENTITY.md`—: la misma frase da siempre el mismo preview.
 * · `symbol` → inserta el símbolo y abre la biblioteca.
 *
 * ## Por qué recibe un anfitrión de callbacks y no el editor
 *
 * Estaba escrito en línea dentro del monolito (`Layout3DEditor.tsx`), cuyo
 * presupuesto sólo puede encoger. La lógica —qué familia hace qué, el parse y
 * preview de la frase, la etiqueta del historial— vive aquí y se prueba en
 * Node; el editor sólo aporta los efectos que de verdad son suyos (setters,
 * toasts, el contexto del registro), con el mismo patrón que `plot-host.ts`.
 *
 * ## El manejador de BEDIT también vive aquí
 *
 * `useCadPaletteActions` registra el destino `block-editor` del bus de
 * comandos: teclear BEDIT abre el panel de bloques del editor a través del
 * mismo anfitrión, sin sumarle un efecto más al monolito.
 */
import { useEffect, useMemo, useRef } from "react";
import { createHistoryItem } from "@/lib/cad/commands/history";
import { loadCadNlCommands } from "@/lib/cad/commands/lazy";
import type {
  CadCommandContext,
  CadCommandHistoryItem,
  CadCommandInput,
  CadCommandPreview,
} from "@/lib/cad/commands/types";
import type { CadPaletteEntry } from "@/lib/cad/command-palette";
import type { CadToolbarActionId } from "@/lib/cad/toolbar";
import { registerCadUiHandler } from "./palettes/palette-command-bus";

/** El preview de la frase tal y como lo sostiene el editor. */
export interface CadPalettePreviewState {
  input: CadCommandInput;
  preview: CadCommandPreview;
  chain?: CadCommandInput[];
  rawInput: string;
}

/** Lo que la paleta necesita del editor para que una entrada surta efecto. */
export interface CadPaletteActionsHost {
  isReadOnly(): boolean;
  notifyReadOnly(): void;
  closePalette(): void;
  /** Apunta `kind:id` en las acciones recientes. */
  rememberAction(key: string): void;
  runToolbarAction(id: CadToolbarActionId): void;
  /** Arranca un comando del motor V2 (la línea de comandos toma el relevo). */
  invokeEngineCommand(name: string): void;
  /** Contexto vivo del registro de frases heredado. */
  nlCommandContext(): CadCommandContext;
  /** Abre la barra de frases con el texto de ejemplo ya escrito. */
  openNlCommand(text: string): void;
  setNlCommandPreview(preview: CadPalettePreviewState | null): void;
  appendNlCommandHistory(item: CadCommandHistoryItem): void;
  /** Inserta el símbolo y enseña la biblioteca. */
  insertSymbol(id: string): void;
  /** Abre el panel de bloques (BEDIT); `block` viaja para prefiltrar. */
  openBlockPanel(block?: string): void;
  toastSuccess(message: string, title: string): void;
  toastError(message: string, title: string): void;
}

/**
 * Las acciones recientes con la nueva al frente, sin duplicados y a lo sumo
 * cinco: las que caben en la fila de la paleta.
 */
export function rememberCadPaletteAction(
  items: readonly string[],
  key: string,
): string[] {
  return [key, ...items.filter((item) => item !== key)].slice(0, 5);
}

export async function runCadPaletteEntry(
  entry: CadPaletteEntry,
  host: CadPaletteActionsHost,
): Promise<void> {
  if (host.isReadOnly() && entry.kind !== "tool") {
    host.notifyReadOnly();
    return;
  }
  host.closePalette();
  host.rememberAction(`${entry.kind}:${entry.id}`);
  if (entry.kind === "tool") {
    host.runToolbarAction(entry.id as CadToolbarActionId);
    return;
  }
  if (entry.kind === "engine") {
    host.invokeEngineCommand(entry.id);
    return;
  }
  if (entry.kind === "command") {
    // El copiloto NL no ejecuta desde la paleta: PREVISUALIZA. Ejecutar una
    // orden en lenguaje natural sin enseñar antes qué va a tocar es la clase
    // de sorpresa que el copiloto existe para evitar.
    const example = entry.keywords.find((kw) => kw.includes(" ")) ?? entry.label;
    host.openNlCommand(example);
    // El parser se carga al primer uso (`commands/lazy.ts`); la barra ya
    // muestra la frase mientras llega.
    const { parseCadCommand, previewCadCommand } = await loadCadNlCommands();
    const parsed = parseCadCommand(example);
    if (parsed.ok && parsed.input) {
      const preview = previewCadCommand(parsed.input, host.nlCommandContext());
      host.setNlCommandPreview({ input: parsed.input, preview, rawInput: example });
      host.appendNlCommandHistory(
        createHistoryItem(parsed.input, "previewed", preview.summary, preview, undefined, {
          rawInput: example,
          affectedObjectIds: preview.affectedObjectIds,
        }),
      );
      host.toastSuccess("Preview listo en el Copiloto CAD.", "Cmd-K CAD");
    } else {
      host.setNlCommandPreview(null);
      host.toastError(
        parsed.clarification || parsed.error || "El comando necesita más contexto.",
        "Cmd-K CAD",
      );
    }
    return;
  }
  host.insertSymbol(entry.id);
  host.toastSuccess(`${entry.label} insertado desde Cmd-K.`, "Cmd-K CAD");
}

/**
 * El ejecutor de entradas con su registro en el bus, listo para el editor.
 *
 * El anfitrión se lee a través de una ref —mismo patrón que
 * `use-command-engine.ts`— para que el ejecutor y el manejador de `block-editor`
 * sean estables entre renders sin capturar setters rancios.
 */
export function useCadPaletteActions(
  host: CadPaletteActionsHost,
): (entry: CadPaletteEntry) => void {
  const live = useRef(host);
  live.current = host;
  useEffect(
    () =>
      registerCadUiHandler("block-editor", (request) => {
        live.current.openBlockPanel(request.params?.block);
        return true;
      }),
    [],
  );
  return useMemo(() => (entry) => runCadPaletteEntry(entry, live.current), []);
}
