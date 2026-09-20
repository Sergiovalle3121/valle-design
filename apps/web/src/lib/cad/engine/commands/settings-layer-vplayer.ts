/**
 * VPLAYER — capas por VENTANA de presentación, tecleado.
 *
 * Salió de `settings-layer-tools.ts` por el trinquete de tamaño
 * (`check-monolith-budget`): ese archivo ya rozaba las 800 líneas con sólo
 * congelar/descongelar, y esta ola le añade tres verbos más. La separación de
 * responsabilidad es real además de forzada por el presupuesto: aquello es la
 * familia LAY* —capas del DOCUMENTO, iguales en todas las ventanas—; esto es
 * lo que sólo existe DENTRO de una ventana de presentación.
 *
 * ## Lo que esta ola añade: Color, LTipo y Grosor
 *
 * `CadPaperViewport.layerOverrides` llevaba sitio en el esquema 8 para
 * `{color, linetype, lineweight}` desde que se guardaba —la paleta de capas ya
 * escribía los tres campos—, pero VPLAYER, la vía TECLEADA que un `.scr` de
 * montaje de láminas necesita, sólo sabía Inutilizar/Reutilizar. Sin esto, «la
 * MEP en gris en la lámina de coordinación, en su color en la de instalaciones»
 * exigía abrir la paleta cuarenta veces; con AutoCAD de verdad se teclea
 * `VPLAYER Color MEP <ventana>` y se sigue dibujando.
 *
 * De paso quedó al descubierto que `paper-space-style.ts` guardaba el tipo de
 * línea de la anulación y no lo leía nunca — coloreaba y engrosaba por
 * ventana, pero el eje seguía saliendo continuo. Se corrige ahí mismo (no
 * aquí: ese archivo no está en el presupuesto de esta ola).
 *
 * Los tres verbos SIEMPRE fijan un valor — no hay «Bpredeterminado» que borre
 * la anulación de estilo. Es la misma asimetría que ya tenía Inutilizar/
 * Reutilizar: apagar borra la clave para volver a heredar, pero fijar un color
 * concreto es una decisión explícita que no tiene un «heredar» razonable
 * cuando lo que se está diciendo es «en ESTA lámina, la MEP va en gris»
 * — quitarlo es un rojo distinto que no mide ninguna spec de esta ola.
 */
import type { CadLayerDef, CadPaperSpace } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import { findCadLayout } from "../../layout/layout-operations";
import { CAD_VIEWPORT_ON_KEY, freezeCadLayerInViewport } from "../../layout/viewport-operations";
import { setCadViewportLayerOverride } from "../../cad-layout-manager";
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

function findLayer(context: CadCommandContext, name: string): CadLayerDef | undefined {
  const key = name.trim().toUpperCase();
  return (context.layers?.() ?? []).find(
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

const VP_LIST = { keyword: "?", shortcut: "?" } as const;
const VP_FREEZE = { keyword: "Inutilizar", shortcut: "I" } as const;
const VP_THAW = { keyword: "Reutilizar", shortcut: "R" } as const;
const VP_COLOR = { keyword: "Color", shortcut: "C" } as const;
const VP_LTYPE = { keyword: "LTipo", shortcut: "LT" } as const;
const VP_WEIGHT = { keyword: "Grosor", shortcut: "G" } as const;
const VP_ALL = { keyword: "Todas", shortcut: "T" } as const;

type VplayerAction = "freeze" | "thaw" | "color" | "linetype" | "lineweight";

/** Los tres verbos que fijan un ESTILO de capa en la ventana, no su visibilidad. */
function needsValue(action: VplayerAction): boolean {
  return action === "color" || action === "linetype" || action === "lineweight";
}

interface VplayerState {
  action: VplayerAction | null;
  /** Capas ya resueltas contra la tabla; `null` mientras no se han pedido. */
  layerIds: readonly string[] | null;
  /** Color/tipo de línea/grosor ya validado; `null` mientras no se ha pedido. */
  value: string | null;
}

const EMPTY_VPLAYER_STATE: VplayerState = { action: null, layerIds: null, value: null };

function layerPromptFor(action: VplayerAction): string {
  if (action === "freeze") return "Capa(s) a inutilizar en la ventana (separadas por comas)";
  if (action === "thaw") return "Capa(s) a reutilizar en la ventana (separadas por comas)";
  return "Capa(s) cuyo estilo se fija en la ventana (separadas por comas)";
}

function valuePromptFor(action: VplayerAction): string {
  if (action === "color") return "Color para esa(s) capa(s) en la ventana (#rrggbb)";
  if (action === "linetype") return "Tipo de línea para esa(s) capa(s) en la ventana";
  return "Grosor para esa(s) capa(s) en la ventana, en milímetros";
}

/** El siguiente prompt, derivado ENTERO del estado — nunca de dónde vino. */
function vplayerStep(state: VplayerState): CadCommandStep<VplayerState> {
  if (state.action === null)
    return {
      state,
      prompt: {
        message: "Indique una opción de capa por ventana",
        options: [VP_LIST, VP_FREEZE, VP_THAW, VP_COLOR, VP_LTYPE, VP_WEIGHT],
        defaultOption: VP_FREEZE.keyword,
      },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  if (state.layerIds === null)
    return { state, prompt: { message: layerPromptFor(state.action), options: [] }, accepts: CAD_ACCEPT_TEXT };
  if (needsValue(state.action) && state.value === null)
    return { state, prompt: { message: valuePromptFor(state.action), options: [] }, accepts: CAD_ACCEPT_TEXT };
  return {
    state,
    prompt: { message: "Ventana a la que aplicar", options: [VP_ALL], defaultOption: VP_ALL.keyword },
    accepts: CAD_ACCEPT_TEXT | CAD_ACCEPT_KEYWORD,
  };
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * `VPLAYER`: la misma escritura que hace la paleta de capas con la columna «VP
 * freeze» y con el estilo por ventana, pero tecleable — lo que un `.scr` de
 * montaje de láminas necesita. `Inutilizar` escribe `layerVisibility[capa] =
 * false`; `Reutilizar` BORRA la anulación, con lo que la capa vuelve a heredar
 * del documento — que no es lo mismo que forzarla visible cuando está apagada
 * o congelada globalmente. `Color`/`LTipo`/`Grosor` escriben en
 * `layerOverrides[capa]` SIN tocar los otros dos campos que ya tuviera. `?`
 * enseña qué ventana inutiliza qué.
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
        EMPTY_VPLAYER_STATE,
        "VPLAYER trabaja sobre una presentación y este dibujo no tiene ninguna. Cree una con LAYOUT.",
      );
    return vplayerStep(EMPTY_VPLAYER_STATE);
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
      const action: VplayerAction | null =
        keyword === VP_FREEZE.keyword ? "freeze"
        : keyword === VP_THAW.keyword ? "thaw"
        : keyword === VP_COLOR.keyword ? "color"
        : keyword === VP_LTYPE.keyword ? "linetype"
        : keyword === VP_WEIGHT.keyword ? "lineweight"
        : null;
      if (!action) return vplayerStep(state);
      return vplayerStep({ ...state, action });
    }

    if (state.layerIds === null) {
      if (input.kind !== "text") return cancelled(state);
      const typed = input.value.trim();
      if (!typed) return cancelled(state);
      const names = typed.split(",").map((value) => value.trim()).filter(Boolean);
      const unknown = names.filter((name) => !findLayer(context, name));
      // Se rechaza NOMBRANDO lo que no existe: aplicar a ciegas un estilo a una
      // capa mal escrita dejaría la lámina igual y al usuario esperando el cambio.
      if (unknown.length > 0)
        return say(state, `No existe(n) la(s) capa(s): ${unknown.join(", ")}.`);
      const layerIds = names.map((name) => findLayer(context, name)!.id);
      return vplayerStep({ ...state, layerIds });
    }

    if (needsValue(state.action!) && state.value === null) {
      if (input.kind !== "text") return vplayerStep(state);
      const raw = input.value.trim();
      if (!raw) return cancelled(state);
      if (state.action === "color") {
        if (!HEX_COLOR.test(raw))
          return say(state, `«${raw}» no es un color válido. Escriba seis dígitos hexadecimales: #rrggbb.`);
        return vplayerStep({ ...state, value: raw.toLowerCase() });
      }
      if (state.action === "linetype") return vplayerStep({ ...state, value: raw.toUpperCase() });
      // Grosor: milímetros, admite coma decimal como el resto de la línea de comandos.
      const weight = Number(raw.replace(",", "."));
      if (!Number.isFinite(weight) || weight < 0)
        return say(state, `«${raw}» no es un grosor válido. Escriba un número en milímetros, por ejemplo 0.5.`);
      return vplayerStep({ ...state, value: String(weight) });
    }

    // Enter en el paso de la ventana toma el valor por defecto: Todas.
    const typed =
      input.kind === "text"
        ? input.value.trim()
        : input.kind === "keyword"
          ? input.keyword
          : input.kind === "enter"
            ? VP_ALL.keyword
            : "";
    if (!typed) return cancelled(state);

    const targets =
      typed.toUpperCase() === VP_ALL.keyword.toUpperCase() || typed === VP_ALL.shortcut
        ? (space.viewports ?? [])
        : (() => {
            const viewport = findViewport(space, typed);
            return viewport ? [viewport] : [];
          })();
    if (targets.length === 0)
      return say(state, `No existe la ventana «${typed}» en esta presentación.`);

    if (state.action === "freeze" || state.action === "thaw") {
      const frozen = state.action === "freeze";
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
        `VPLAYER: ${state.layerIds!.length} capa(s) ${frozen ? "inutilizada(s)" : "reutilizada(s)"} en ${targets.length} ventana(s)`,
      );
    }

    // Color / LTipo / Grosor: se fusiona con lo que ya hubiera en la ventana
    // para esa capa — fijar el color no debe borrar un tipo de línea que ya
    // se hubiera fijado antes, ni al revés.
    const field = state.action === "color" ? "color" : state.action === "linetype" ? "linetype" : "lineweight";
    const value: string | number = field === "lineweight" ? Number(state.value) : state.value!;
    let next = space;
    for (const viewport of targets)
      for (const layerId of state.layerIds!) {
        const current = next.viewports!.find((candidate) => candidate.id === viewport.id)!;
        next = setCadViewportLayerOverride(next, viewport.id, layerId, {
          ...(current.layerOverrides?.[layerId] ?? {}),
          [field]: value,
        });
      }
    const fieldLabel = field === "color" ? "color" : field === "linetype" ? "tipo de línea" : "grosor";
    return documentResult(
      state,
      [{ type: "paper-space", op: "upsert", space: next }],
      `VPLAYER: ${fieldLabel} de ${state.layerIds!.length} capa(s) fijado en ${targets.length} ventana(s)`,
    );
  },
};

export const CAD_LAYER_VPLAYER_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(vplayerCommand),
];
