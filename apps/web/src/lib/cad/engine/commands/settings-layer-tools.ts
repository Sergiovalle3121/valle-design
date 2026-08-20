/**
 * Las herramientas de capa tecleables: VPLAYER y la familia LAY*.
 *
 * Viven aparte de `settings-layers.ts` por el trinquete de tamaño y porque son
 * otra clase de orden: `-LAYER` edita la TABLA campo a campo; esto son los
 * atajos de oficio — congelar por ventana, aislar, congelar lo designado —
 * que en AutoCAD ahorran abrir el gestor cuarenta veces al día.
 *
 * Todo muta por la ruta canónica: cada comando termina en UN lote de órdenes
 * `layer` / `paper-space` / `properties`, así que cada orden es UN paso de
 * deshacer, igual que el resto del motor.
 */
import type { CadLayerDef, CadPaperSpace } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import { findCadLayout } from "../../layout/layout-operations";
import {
  CAD_VIEWPORT_ON_KEY,
  freezeCadLayerInViewport,
} from "../../layout/viewport-operations";
import {
  CAD_ACCEPT_KEYWORD,
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

function layersOf(context: CadCommandContext): readonly CadLayerDef[] {
  return context.layers?.() ?? [];
}

function findLayer(context: CadCommandContext, name: string): CadLayerDef | undefined {
  const key = name.trim().toUpperCase();
  return layersOf(context).find(
    (layer) => layer.name.toUpperCase() === key || layer.id.toUpperCase() === key,
  );
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

function findViewport(space: CadPaperSpace, token: string) {
  const needle = token.trim().toLowerCase();
  return (space.viewports ?? []).find(
    (viewport) =>
      viewport.id.toLowerCase() === needle ||
      (viewport.name ?? "").trim().toLowerCase() === needle,
  );
}

// ---------------------------------------------------------------------------
// VPLAYER — congelar capas POR VENTANA, desde la línea de comandos
// ---------------------------------------------------------------------------

const VP_LIST = { keyword: "?", shortcut: "?" } as const;
const VP_FREEZE = { keyword: "Inutilizar", shortcut: "I" } as const;
const VP_THAW = { keyword: "Reutilizar", shortcut: "R" } as const;
const VP_ALL = { keyword: "Todas", shortcut: "T" } as const;

interface VplayerState {
  action: "freeze" | "thaw" | null;
  /** Capas ya resueltas contra la tabla; `null` mientras no se han pedido. */
  layerIds: readonly string[] | null;
}

function vplayerMenu(state: VplayerState): CadCommandStep<VplayerState> {
  return {
    state,
    prompt: {
      message: "Indique una opción de capa por ventana",
      options: [VP_LIST, VP_FREEZE, VP_THAW],
      defaultOption: VP_FREEZE.keyword,
    },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

/**
 * `VPLAYER`: la misma escritura que hace la paleta de capas con la columna «VP
 * freeze», pero tecleable — que es lo que un `.scr` de montaje de láminas
 * necesita. `Inutilizar` escribe `layerVisibility[capa] = false` en la ventana
 * elegida; `Reutilizar` BORRA la anulación, con lo que la capa vuelve a
 * heredar del documento — que no es lo mismo que forzarla visible cuando está
 * apagada o congelada globalmente. `?` enseña qué ventana congela qué.
 */
const vplayerCommand: CadCommandDescriptor<VplayerState> = {
  name: "VPLAYER",
  aliases: [],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "none",
  begin: (context) => {
    if (!context.paperSpaces?.()?.length)
      return say(
        { action: null, layerIds: null },
        "VPLAYER trabaja sobre una presentación y este dibujo no tiene ninguna. Cree una con LAYOUT.",
      );
    return vplayerMenu({ action: null, layerIds: null });
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return cancelled(state);
    const space = activeSpace(context);
    if (!space) return say(state, "VPLAYER necesita una presentación abierta.");

    if (state.action === null) {
      const keyword = input.kind === "keyword" ? input.keyword : VP_FREEZE.keyword;
      if (keyword === VP_LIST.keyword) {
        const rows = (space.viewports ?? []).map((viewport) => {
          const frozen = Object.entries(viewport.layerVisibility ?? {})
            .filter(([layerId, shown]) => layerId !== CAD_VIEWPORT_ON_KEY && shown === false)
            .map(([layerId]) => layerId);
          return `${viewport.name ?? viewport.id}: ${frozen.length ? frozen.join(", ") : "ninguna capa inutilizada"}`;
        });
        return say(state, rows.length ? rows.join("\n") : "La presentación no tiene ventanas.");
      }
      const action =
        keyword === VP_FREEZE.keyword ? "freeze" : keyword === VP_THAW.keyword ? "thaw" : null;
      if (!action) return vplayerMenu(state);
      return {
        state: { ...state, action },
        prompt: {
          message:
            action === "freeze"
              ? "Capa(s) a inutilizar en la ventana (separadas por comas)"
              : "Capa(s) a reutilizar en la ventana (separadas por comas)",
          options: [],
        },
        accepts: CAD_ACCEPT_TEXT,
      };
    }

    // Enter en el paso de la ventana toma el valor por defecto: Todas.
    const typed =
      input.kind === "text"
        ? input.value.trim()
        : input.kind === "keyword"
          ? input.keyword
          : input.kind === "enter" && state.layerIds !== null
            ? VP_ALL.keyword
            : "";
    if (!typed) return cancelled(state);

    if (state.layerIds === null) {
      if (input.kind !== "text") return cancelled(state);
      const names = typed.split(",").map((value) => value.trim()).filter(Boolean);
      const unknown = names.filter((name) => !findLayer(context, name));
      // Se rechaza NOMBRANDO lo que no existe: congelar a ciegas una capa mal
      // escrita dejaría la lámina igual y al usuario esperando el cambio.
      if (unknown.length > 0)
        return say(state, `No existe(n) la(s) capa(s): ${unknown.join(", ")}.`);
      const layerIds = names.map((name) => findLayer(context, name)!.id);
      return {
        state: { ...state, layerIds },
        prompt: {
          message: "Ventana a la que aplicar",
          options: [VP_ALL],
          defaultOption: VP_ALL.keyword,
        },
        accepts: CAD_ACCEPT_TEXT | CAD_ACCEPT_KEYWORD,
      };
    }

    const frozen = state.action === "freeze";
    const targets =
      typed.toUpperCase() === VP_ALL.keyword.toUpperCase() || typed === VP_ALL.shortcut
        ? (space.viewports ?? [])
        : (() => {
            const viewport = findViewport(space, typed);
            return viewport ? [viewport] : [];
          })();
    if (targets.length === 0)
      return say(state, `No existe la ventana «${typed}» en esta presentación.`);
    // TODAS las ventanas elegidas en el MISMO upsert de la hoja: un paso de
    // deshacer devuelve la lámina entera, no ventana a ventana.
    const next = targets.reduce(
      (current, viewport) =>
        freezeCadLayerInViewport(current, viewport.id, state.layerIds!, frozen),
      space,
    );
    return documentResult(
      state,
      [{ type: "paper-space", op: "upsert", space: next }],
      `VPLAYER: ${state.layerIds.length} capa(s) ${frozen ? "inutilizada(s)" : "reutilizada(s)"} en ${targets.length} ventana(s)`,
    );
  },
};

export const CAD_LAYER_TOOL_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(vplayerCommand),
];
