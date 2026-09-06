"use client";

/**
 * Las acciones de la paleta Ctrl+K, fuera del monolito.
 *
 * ## Qué hace cada familia de entrada, dicho en un solo sitio
 *
 * · `tool`   → la acción de barra correspondiente (modo, panel, dibujo).
 * · `engine` → invoca el comando en el motor V2; el prompt aparece en la línea
 *              de comandos y el puntero/teclado siguen desde ahí.
 * · `command`→ (retirada el 2026-09-06) previsualizaba en el registro de
 *              FRASES heredado y anunciaba un panel que ya no existe; la
 *              paleta ya no produce entradas de esta familia y si llegara una
 *              se declara en vez de fingir. Ver `command-palette.ts`.
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
    // Sin panel que pinte el preview ni «Aplicar» que lo ejecute, la familia
    // de frases se retiró de la paleta (2026-09-06). Si una entrada llegara
    // igualmente, se dice en vez de dejar un estado que nadie ve.
    host.toastError("Las frases ya no se ejecutan desde la paleta.", "Cmd-K CAD");
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
