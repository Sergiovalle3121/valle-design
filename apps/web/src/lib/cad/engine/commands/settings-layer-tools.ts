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
import {
  captureCadLayerState,
  planCadLayerStateRestore,
  type CadLayerStateScope,
} from "../../layer-states";
import { findCadLayout } from "../../layout/layout-operations";
import {
  CAD_VIEWPORT_ON_KEY,
  freezeCadLayerInViewport,
} from "../../layout/viewport-operations";
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

// ---------------------------------------------------------------------------
// Familia LAY*: los atajos de aislamiento y congelado
// ---------------------------------------------------------------------------

/**
 * MEMORIA del aislamiento, en el catálogo de estados de capa de la SESIÓN.
 *
 * LAYISO y LAYWALK apagan capas de verdad —por la ruta canónica, deshacer
 * incluido— y LAYUNISO tiene que saber a qué visibilidad volver. Esa memoria
 * es de la sesión, no del documento: dos personas con el mismo plano abierto
 * aíslan cada una lo suyo. Se guarda bajo un nombre reservado con caracteres
 * que DXF prohíbe en un nombre de capa, así que no colisiona con ningún estado
 * que un usuario pueda teclear.
 */
export const CAD_LAYER_ISOLATION_MEMORY = "<aislamiento>";

/** LAYUNISO restituye SÓLO la visibilidad: lo demás no lo tocó LAYISO. */
const VISIBILITY_SCOPE: CadLayerStateScope = {
  visibility: true,
  locking: false,
  color: false,
  linetype: false,
  lineweight: false,
  plot: false,
};

function isolationMemory(context: CadCommandContext) {
  return context.catalogs?.layerStates;
}

/** Guarda la foto previa al PRIMER aislamiento; encadenar no la pisa. */
function rememberIsolation(context: CadCommandContext): boolean {
  const catalog = isolationMemory(context);
  if (!catalog) return false;
  if (!catalog.get(CAD_LAYER_ISOLATION_MEMORY))
    catalog.save(captureCadLayerState(CAD_LAYER_ISOLATION_MEMORY, layersOf(context)));
  return true;
}

/** La capa de una entidad designada, resuelta contra la tabla. */
function pickedLayer(
  context: CadCommandContext,
  entityId: string,
): CadLayerDef | undefined {
  const entity = context.entity?.(entityId);
  if (!entity || !("layer" in entity)) return undefined;
  return findLayer(context, entity.layer);
}

const isActiveLayer = (context: CadCommandContext, layer: CadLayerDef) =>
  layer.name === context.activeLayer || layer.id === context.activeLayer;

/** Upsert que DESCONGELA: borra la clave en vez de escribir `false`. */
function thawedLayer(layer: CadLayerDef): CadLayerDef {
  const { frozen: _thawed, ...rest } = layer;
  return rest;
}

/**
 * Órdenes que dejan visibles SÓLO las capas de `keep` (las congeladas no se
 * tocan: congelar y aislar son ejes distintos y LAYUNISO sólo devuelve el
 * suyo). Devuelve únicamente lo que CAMBIA, para no ensuciar el deshacer.
 */
function isolateCommands(
  context: CadCommandContext,
  keep: ReadonlySet<string>,
): CadEntityCommand[] {
  return layersOf(context)
    .filter((layer) => !keep.has(layer.id) && layer.visible)
    .map((layer) => ({ type: "layer", op: "upsert", layer: { ...layer, visible: false } }));
}

interface PickLayersState {
  layerIds: readonly string[];
}

/** LAYISO: apaga todas las capas menos las de los objetos designados. */
const layisoCommand: CadCommandDescriptor<PickLayersState> = {
  name: "LAYISO",
  aliases: [],
  kind: "manage",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => {
    const preselected = [
      ...new Set(
        context.selection
          .map((entityId) => pickedLayer(context, entityId)?.id)
          .filter((id): id is string => !!id),
      ),
    ];
    if (preselected.length > 0) return finishIsolation({ layerIds: preselected }, context);
    return askIsolationPick({ layerIds: [] });
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return cancelled(state);
    if (input.kind === "entityPick") {
      const layer = pickedLayer(context, input.entityId);
      if (!layer) return askIsolationPick(state, "No se pudo leer el objeto designado.");
      return askIsolationPick(
        { layerIds: [...new Set([...state.layerIds, layer.id])] },
        `Capa "${layer.name}" añadida al aislamiento.`,
      );
    }
    if (input.kind === "selection") {
      const ids = input.entityIds
        .map((entityId) => pickedLayer(context, entityId)?.id)
        .filter((id): id is string => !!id);
      return askIsolationPick({ layerIds: [...new Set([...state.layerIds, ...ids])] });
    }
    if (input.kind === "enter") {
      if (state.layerIds.length === 0) return cancelled(state);
      return finishIsolation(state, context);
    }
    return askIsolationPick(state);
  },
};

function askIsolationPick(
  state: PickLayersState,
  note?: string,
): CadCommandStep<PickLayersState> {
  return {
    state,
    prompt: {
      message:
        (note ? `${note} ` : "") +
        `Designe objetos de las capas a aislar (${state.layerIds.length} capa(s); Enter para terminar)`,
      options: [],
    },
    accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
  };
}

function finishIsolation(
  state: PickLayersState,
  context: CadCommandContext,
): CadCommandStep<PickLayersState> {
  const commands = isolateCommands(context, new Set(state.layerIds));
  if (commands.length === 0)
    return say(state, "No hay ninguna otra capa encendida: el aislamiento ya está hecho.");
  const remembered = rememberIsolation(context);
  return documentResult(
    state,
    commands,
    `LAYISO: ${commands.length} capa(s) apagadas` +
      (remembered ? "; LAYUNISO restituye" : " (sin catálogo de sesión: LAYUNISO no podrá restituir)"),
  );
}

/** LAYUNISO: deshace el aislamiento restituyendo la visibilidad guardada. */
const layunisoCommand: CadCommandDescriptor<never> = {
  name: "LAYUNISO",
  aliases: [],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: true,
  cursor: "none",
  begin: (context) => {
    const catalog = isolationMemory(context);
    if (!catalog)
      return say(
        undefined as never,
        "LAYUNISO necesita el catálogo de estados de capa de la sesión y este espacio de trabajo no lo aporta.",
      );
    const memory = catalog.get(CAD_LAYER_ISOLATION_MEMORY);
    if (!memory)
      return say(undefined as never, "No hay ningún aislamiento de LAYISO o LAYWALK que deshacer.");
    const plan = planCadLayerStateRestore(memory, layersOf(context), VISIBILITY_SCOPE);
    catalog.remove(CAD_LAYER_ISOLATION_MEMORY);
    if (plan.commands.length === 0)
      return say(undefined as never, "Las capas ya están como antes del aislamiento.");
    return documentResult(
      undefined as never,
      plan.commands,
      `LAYUNISO: ${plan.changed} capa(s) restituidas`,
    );
  },
  step: (state) => cancelled(state),
};

/** Descriptor común de LAYFRZ y LAYOFF: designar un objeto y tocar su capa. */
function pickLayerCommand(
  name: string,
  prompt: string,
  apply: (
    layer: CadLayerDef,
    context: CadCommandContext,
  ) => CadCommandStep<never> | { layer: CadLayerDef; label: string },
): CadCommandDescriptor<never> {
  return {
    name,
    aliases: [],
    kind: "manage",
    transparent: false,
    selection: "none",
    repeatable: true,
    mutates: true,
    cursor: "pick",
    begin: () => ({
      state: undefined as never,
      prompt: { message: prompt, options: [] },
      accepts: CAD_ACCEPT_ENTITY_PICK,
    }),
    step: (state, input, context) => {
      if (input.kind !== "entityPick") return cancelled(state);
      const layer = pickedLayer(context, input.entityId);
      if (!layer) return say(state, "No se pudo leer el objeto designado.");
      const outcome = apply(layer, context);
      if ("prompt" in outcome) return outcome;
      return documentResult(
        state,
        [{ type: "layer", op: "upsert", layer: outcome.layer }],
        outcome.label,
      );
    },
  };
}

/** LAYFRZ congela la capa del objeto designado; la actual se niega, como en AutoCAD. */
const layfrzCommand = pickLayerCommand(
  "LAYFRZ",
  "Designe un objeto de la capa a congelar",
  (layer, context) => {
    if (isActiveLayer(context, layer))
      return say(
        undefined as never,
        `"${layer.name}" es la capa actual y no se puede congelar. Ponga otra actual con -LAYER definir.`,
      );
    if (layer.frozen === true)
      return say(undefined as never, `La capa "${layer.name}" ya está congelada.`);
    return { layer: { ...layer, frozen: true }, label: `LAYFRZ: capa "${layer.name}" congelada` };
  },
);

/** LAYOFF apaga la capa del objeto designado. */
const layoffCommand = pickLayerCommand(
  "LAYOFF",
  "Designe un objeto de la capa a desactivar",
  (layer) => {
    if (!layer.visible)
      return say(undefined as never, `La capa "${layer.name}" ya está desactivada.`);
    return {
      layer: { ...layer, visible: false },
      label: `LAYOFF: capa "${layer.name}" desactivada`,
    };
  },
);

/** LAYTHW descongela TODAS las capas, que es exactamente lo que hace en AutoCAD. */
const laythwCommand: CadCommandDescriptor<never> = {
  name: "LAYTHW",
  aliases: [],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: true,
  cursor: "none",
  begin: (context) => {
    const frozen = layersOf(context).filter((layer) => layer.frozen === true);
    if (frozen.length === 0) return say(undefined as never, "No hay ninguna capa congelada.");
    return documentResult(
      undefined as never,
      frozen.map((layer) => ({ type: "layer", op: "upsert", layer: thawedLayer(layer) })),
      `LAYTHW: ${frozen.length} capa(s) descongeladas`,
    );
  },
  step: (state) => cancelled(state),
};

/**
 * LAYON activa TODAS las capas apagadas — la semántica de AutoCAD, no una
 * designación: un objeto de una capa apagada no se ve, así que no se puede
 * designar, y pedir un clic sobre lo invisible sería un comando de adorno.
 */
const layonCommand: CadCommandDescriptor<never> = {
  name: "LAYON",
  aliases: [],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: true,
  cursor: "none",
  begin: (context) => {
    const off = layersOf(context).filter((layer) => !layer.visible);
    if (off.length === 0) return say(undefined as never, "Todas las capas ya están activadas.");
    return documentResult(
      undefined as never,
      off.map((layer) => ({ type: "layer", op: "upsert", layer: { ...layer, visible: true } })),
      `LAYON: ${off.length} capa(s) activadas`,
    );
  },
  step: (state) => cancelled(state),
};

interface LaymchState {
  /** Objetos a cambiar; se acumulan hasta Enter. */
  entityIds: readonly string[];
  /** `true` cuando ya se cerró la selección y falta el objeto de destino. */
  awaitingTarget: boolean;
}

function laymchPick(state: LaymchState): CadCommandStep<LaymchState> {
  return {
    state,
    prompt: {
      message: state.awaitingTarget
        ? "Designe el objeto de la capa de DESTINO"
        : `Designe los objetos a cambiar de capa (${state.entityIds.length}; Enter para terminar)`,
      options: [],
    },
    accepts: CAD_ACCEPT_ENTITY_PICK | (state.awaitingTarget ? 0 : CAD_ACCEPT_SELECTION),
  };
}

/** LAYMCH: iguala la capa de los objetos designados a la de un objeto de destino. */
const laymchCommand: CadCommandDescriptor<LaymchState> = {
  name: "LAYMCH",
  aliases: [],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => {
    if (context.selection.length > 0)
      return laymchPick({ entityIds: [...context.selection], awaitingTarget: true });
    return laymchPick({ entityIds: [], awaitingTarget: false });
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return cancelled(state);
    if (!state.awaitingTarget) {
      if (input.kind === "entityPick")
        return laymchPick({
          ...state,
          entityIds: [...new Set([...state.entityIds, input.entityId])],
        });
      if (input.kind === "selection")
        return laymchPick({
          ...state,
          entityIds: [...new Set([...state.entityIds, ...input.entityIds])],
        });
      if (input.kind === "enter") {
        if (state.entityIds.length === 0) return cancelled(state);
        return laymchPick({ ...state, awaitingTarget: true });
      }
      return laymchPick(state);
    }
    if (input.kind !== "entityPick") return laymchPick(state);
    const target = context.entity?.(input.entityId);
    if (!target || !("layer" in target))
      return say(state, "No se pudo leer el objeto de destino.");
    const commands: CadEntityCommand[] = state.entityIds
      .filter((entityId) => {
        const entity = context.entity?.(entityId);
        return entity && "layer" in entity && entity.layer !== target.layer && entityId !== input.entityId;
      })
      .map((entityId) => ({ type: "properties", entityId, patch: { layer: target.layer } }));
    if (commands.length === 0)
      return say(state, "Los objetos designados ya están en esa capa.");
    return documentResult(
      state,
      commands,
      `LAYMCH: ${commands.length} objeto(s) a la capa "${target.layer}"`,
    );
  },
};

const WALK_NEXT = { keyword: "Siguiente", shortcut: "S" } as const;
const WALK_RESTORE = { keyword: "Restituir", shortcut: "R" } as const;

interface LaywalkState {
  /** Capas por las que se camina (las congeladas quedan fuera del ciclo). */
  order: readonly string[];
  next: number;
}

/**
 * LAYWALK, versión mínima y honesta: cada paso ENSEÑA una sola capa de verdad
 * —un lote por la ruta canónica, un paso de deshacer, dicho en la etiqueta— y
 * Espacio repite el comando avanzando el ciclo. No hay vista efímera que se
 * esfume al soltar la tecla, porque el motor no tiene esa maquinaria y
 * fingirla con parches sin deshacer sería peor. LAYUNISO (o la opción
 * Restituir) devuelve la visibilidad previa. Las capas CONGELADAS no entran en
 * el paseo: congelar es otro eje, y LAYTHW existe.
 */
const laywalkCommand: CadCommandDescriptor<LaywalkState> = {
  name: "LAYWALK",
  aliases: [],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "none",
  begin: (context) => {
    const walkable = layersOf(context).filter((layer) => layer.frozen !== true);
    if (walkable.length === 0)
      return say({ order: [], next: 0 }, "No hay ninguna capa descongelada por la que caminar.");
    const order = [...walkable].map((layer) => layer.id).sort((a, b) => a.localeCompare(b));
    const shown = walkable.filter((layer) => layer.visible);
    // Si ya se está mostrando UNA sola capa, el paseo continúa en la siguiente.
    const next =
      shown.length === 1 ? (order.indexOf(shown[0].id) + 1) % order.length : 0;
    const nextName = layersOf(context).find((layer) => layer.id === order[next])?.name ?? order[next];
    return {
      state: { order, next },
      prompt: {
        message: `Capa a mostrar en solitario (Espacio repite y avanza)`,
        options: [WALK_NEXT, WALK_RESTORE],
        defaultOption: WALK_NEXT.keyword,
        defaultValue: nextName,
      },
      accepts: CAD_ACCEPT_KEYWORD | CAD_ACCEPT_TEXT,
    };
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return cancelled(state);
    if (input.kind === "keyword" && input.keyword === WALK_RESTORE.keyword)
      return layunisoCommand.begin(context) as CadCommandStep<LaywalkState>;
    let target: CadLayerDef | undefined;
    if (input.kind === "text") {
      target = findLayer(context, input.value);
      if (!target) return say(state, `No existe la capa "${input.value.trim()}".`);
      if (target.frozen === true)
        return say(state, `La capa "${target.name}" está congelada; descongélela con LAYTHW antes de pasear.`);
    } else {
      const id = state.order[state.next];
      target = layersOf(context).find((layer) => layer.id === id);
      if (!target) return cancelled(state);
    }
    const remembered = rememberIsolation(context);
    const commands: CadEntityCommand[] = layersOf(context)
      .filter((layer) => layer.frozen !== true && layer.visible !== (layer.id === target!.id))
      .map((layer) => ({
        type: "layer",
        op: "upsert",
        layer: { ...layer, visible: layer.id === target!.id },
      }));
    if (commands.length === 0)
      return say(state, `Ya se está mostrando sólo la capa "${target.name}".`);
    return documentResult(
      state,
      commands,
      `LAYWALK: sólo la capa "${target.name}"` +
        (remembered ? " (LAYUNISO restituye)" : " (sin catálogo de sesión: LAYUNISO no podrá restituir)"),
    );
  },
};

interface LaymrgState {
  source: string | null;
}

/** LAYMRG: fusiona la capa A en la B — reasigna las entidades y purga A, en UN lote. */
const laymrgCommand: CadCommandDescriptor<LaymrgState> = {
  name: "LAYMRG",
  aliases: [],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: true,
  cursor: "none",
  begin: () => ({
    state: { source: null },
    prompt: { message: "Capa a fusionar (desaparecerá)", options: [] },
    accepts: CAD_ACCEPT_TEXT,
  }),
  step: (state, input, context) => {
    if (input.kind !== "text") return cancelled(state);
    const typed = input.value.trim();
    if (!typed) return cancelled(state);
    const layer = findLayer(context, typed);
    if (!layer) return say(state, `No existe la capa "${typed}".`);

    if (state.source === null) {
      if (layer.name === "0")
        return say(state, "La capa 0 no se puede fusionar: es la capa que define el formato.");
      // La ACTUAL tampoco: fusionarla dejaría CLAYER apuntando a un nombre
      // inexistente, la misma razón por la que RENAME se niega.
      if (isActiveLayer(context, layer))
        return say(
          state,
          `"${layer.name}" es la capa actual. Ponga otra actual con -LAYER definir y repita.`,
        );
      return {
        state: { source: layer.name },
        prompt: { message: `Capa de destino para lo que hay en "${layer.name}"`, options: [] },
        accepts: CAD_ACCEPT_TEXT,
      };
    }

    if (layer.name.toUpperCase() === state.source.toUpperCase())
      return say(state, "Origen y destino son la misma capa; no hay nada que fusionar.");
    return documentResult(
      state,
      // La tabla de capas ya sabe borrar REASIGNANDO: las entidades pasan al
      // destino y la capa origen desaparece en la misma transacción.
      [{ type: "layer", op: "delete", name: state.source, reassignTo: layer.name }],
      `LAYMRG: capa "${state.source}" fusionada en "${layer.name}"`,
    );
  },
};

export const CAD_LAYER_TOOL_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(vplayerCommand),
  asCadCommand(layisoCommand),
  asCadCommand(layunisoCommand),
  asCadCommand(layfrzCommand),
  asCadCommand(laythwCommand),
  asCadCommand(layoffCommand),
  asCadCommand(layonCommand),
  asCadCommand(laymchCommand),
  asCadCommand(laywalkCommand),
  asCadCommand(laymrgCommand),
];
