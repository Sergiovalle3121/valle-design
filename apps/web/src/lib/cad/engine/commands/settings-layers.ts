/**
 * `-LAYER` y `LAYERSTATE`: la tabla de capas desde la línea de comandos.
 *
 * Viven aparte de las demás puertas a paletas por el trinquete de tamaño —un
 * archivo nuevo no pasa de 800 líneas— y porque de todas formas son otra cosa:
 * las demás sólo ABREN algo, y estas dos MUTAN el documento. Crear una capa,
 * ponerla actual, apagarla o restaurar un estado de cuarenta salen por la ruta
 * canónica, en UN lote, con un solo paso de deshacer.
 *
 * `-LAYER` es, además, la única forma en que un `.scr` puede tocar las capas:
 * `LAYER` a secas abre el gestor y dejaría el script esperando un clic.
 */
import type { CadLayerDef } from "../../cad-document";
import { captureCadLayerState, planCadLayerStateRestore } from "../../layer-states";
import {
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

function message<S>(state: S, text: string): CadCommandStep<S> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text } };
}

function cancelled<S>(state: S): CadCommandStep<S> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
}

// ---------------------------------------------------------------------------
// -LAYER
// ---------------------------------------------------------------------------

const LAYER_NEW = { keyword: "Nueva", shortcut: "N" } as const;
const LAYER_SET = { keyword: "definir", shortcut: "D" } as const;
const LAYER_COLOR = { keyword: "Color", shortcut: "C" } as const;
const LAYER_ON = { keyword: "activar", shortcut: "A" } as const;
const LAYER_OFF = { keyword: "desactivar", shortcut: "E" } as const;
const LAYER_LOCK = { keyword: "Bloquear", shortcut: "B" } as const;
const LAYER_UNLOCK = { keyword: "desbloquear", shortcut: "Q" } as const;
const LAYER_LIST = { keyword: "?", shortcut: "?" } as const;

type LayerAction =
  | "new"
  | "set"
  | "color"
  | "on"
  | "off"
  | "lock"
  | "unlock"
  | null;

interface LayerCliState {
  action: LayerAction;
  /** En COLOR se pide primero el color y luego la capa. */
  pendingColor: string | null;
}

const LAYER_OPTIONS = [
  LAYER_LIST,
  LAYER_NEW,
  LAYER_SET,
  LAYER_COLOR,
  LAYER_ON,
  LAYER_OFF,
  LAYER_LOCK,
  LAYER_UNLOCK,
];

function layerMenu(state: LayerCliState): CadCommandStep<LayerCliState> {
  return {
    state,
    prompt: { message: "Indique opción de capa", options: LAYER_OPTIONS },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

function layersOf(context: CadCommandContext): readonly CadLayerDef[] {
  return context.layers?.() ?? [];
}

function findLayer(context: CadCommandContext, name: string): CadLayerDef | undefined {
  const key = name.trim().toUpperCase();
  return layersOf(context).find((layer) => layer.name.toUpperCase() === key);
}

function layerPatch(
  state: LayerCliState,
  layer: CadLayerDef,
  label: string,
): CadCommandStep<LayerCliState> {
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "document", commands: [{ type: "layer", op: "upsert", layer }], label },
  };
}

const layerCliCommand: CadCommandDescriptor<LayerCliState> = {
  name: "-LAYER",
  aliases: ["-LA"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: true,
  cursor: "none",
  begin: () => layerMenu({ action: null, pendingColor: null }),
  step: (state, input, context) => {
    if (input.kind === "cancel" || input.kind === "enter") return cancelled(state);

    if (state.action === null) {
      if (input.kind !== "keyword") return layerMenu(state);
      if (input.keyword === LAYER_LIST.keyword) {
        const layers = layersOf(context);
        return message(
          state,
          layers.length === 0
            ? "El dibujo no declara ninguna capa."
            : layers
                .map(
                  (layer) =>
                    `${layer.name.padEnd(16)} ${layer.color}  ` +
                    `${layer.visible ? "activada" : "DESACTIVADA"}  ` +
                    `${layer.locked ? "BLOQUEADA" : "libre"}`,
                )
                .join("\n"),
        );
      }
      const action = (
        {
          [LAYER_NEW.keyword]: "new",
          [LAYER_SET.keyword]: "set",
          [LAYER_COLOR.keyword]: "color",
          [LAYER_ON.keyword]: "on",
          [LAYER_OFF.keyword]: "off",
          [LAYER_LOCK.keyword]: "lock",
          [LAYER_UNLOCK.keyword]: "unlock",
        } as Record<string, LayerAction>
      )[input.keyword];
      if (!action) return layerMenu(state);
      return {
        state: { ...state, action },
        prompt: {
          message:
            action === "color"
              ? "Color nuevo (índice ACI o #rrggbb)"
              : action === "new"
                ? "Nombre de la capa nueva"
                : "Nombre de la capa",
          options: [],
        },
        accepts: CAD_ACCEPT_TEXT,
      };
    }

    if (input.kind !== "text") return cancelled(state);
    const typed = input.value.trim();
    if (!typed) return cancelled(state);

    if (state.action === "color" && state.pendingColor === null)
      return {
        state: { ...state, pendingColor: typed },
        prompt: { message: `Capas a las que aplicar el color ${typed}`, options: [] },
        accepts: CAD_ACCEPT_TEXT,
      };

    if (state.action === "new") {
      if (findLayer(context, typed)) return message(state, `La capa "${typed}" ya existe.`);
      return layerPatch(
        state,
        { id: typed.toLowerCase(), name: typed, color: "#ffffff", visible: true, locked: false },
        `-LAYER: capa "${typed}" creada`,
      );
    }

    const layer = findLayer(context, typed);
    if (!layer) return message(state, `No existe la capa "${typed}".`);

    if (state.action === "set")
      // CLAYER es la capa actual también para AutoCAD. Escribirla aquí es lo
      // que hace que un `.scr` pueda dibujar en la capa que quiere.
      return {
        state,
        prompt: { message: "", options: [] },
        accepts: 0,
        result: { kind: "variables", patch: { CLAYER: layer.name }, text: `Capa actual: "${layer.name}".` },
      };
    if (state.action === "color")
      return layerPatch(
        state,
        { ...layer, color: state.pendingColor as string },
        `-LAYER: color de "${layer.name}"`,
      );
    if (state.action === "on" || state.action === "off")
      return layerPatch(
        state,
        { ...layer, visible: state.action === "on" },
        `-LAYER: "${layer.name}" ${state.action === "on" ? "activada" : "desactivada"}`,
      );
    return layerPatch(
      state,
      { ...layer, locked: state.action === "lock" },
      `-LAYER: "${layer.name}" ${state.action === "lock" ? "bloqueada" : "desbloqueada"}`,
    );
  },
};

// ---------------------------------------------------------------------------
// LAYERSTATE
// ---------------------------------------------------------------------------

const LS_SAVE = { keyword: "Guardar", shortcut: "G" } as const;
const LS_RESTORE = { keyword: "Restituir", shortcut: "R" } as const;
const LS_DELETE = { keyword: "Suprimir", shortcut: "S" } as const;
const LS_LIST = { keyword: "?", shortcut: "?" } as const;

interface LayerStateState {
  action: "save" | "restore" | "delete" | null;
}

const layerStateCommand: CadCommandDescriptor<LayerStateState> = {
  name: "LAYERSTATE",
  aliases: ["LAS", "LMAN"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: true,
  cursor: "none",
  begin: (context) => ({
    state: { action: null },
    prompt: {
      message: `Estados de capa guardados: ${context.catalogs?.layerStates?.list().length ?? 0}`,
      options: [LS_SAVE, LS_RESTORE, LS_DELETE, LS_LIST],
      defaultOption: LS_RESTORE.keyword,
    },
    accepts: CAD_ACCEPT_KEYWORD,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cancelled(state);
    const catalog = context.catalogs?.layerStates;
    if (!catalog)
      return message(
        state,
        "LAYERSTATE necesita el catálogo de estados de capa de la sesión y este espacio de trabajo no lo aporta.",
      );

    if (state.action === null) {
      const keyword = input.kind === "keyword" ? input.keyword : LS_RESTORE.keyword;
      if (keyword === LS_LIST.keyword) {
        const saved = catalog.list();
        return message(
          state,
          saved.length === 0
            ? "No hay ningún estado de capa guardado."
            : saved.map((entry) => `${entry.name} (${entry.entries.length} capa(s))`).join("\n"),
        );
      }
      const action =
        keyword === LS_SAVE.keyword ? "save" : keyword === LS_DELETE.keyword ? "delete" : "restore";
      return {
        state: { action },
        prompt: {
          message:
            action === "save"
              ? "Nombre del estado nuevo"
              : `Nombre del estado (${catalog.list().map((entry) => entry.name).join(", ")})`,
          options: [],
        },
        accepts: CAD_ACCEPT_TEXT,
      };
    }

    if (input.kind !== "text") return cancelled(state);
    const name = input.value.trim();
    if (!name) return cancelled(state);

    if (state.action === "save") {
      const layers = layersOf(context);
      if (layers.length === 0)
        return message(state, "No hay capas que fotografiar en este dibujo.");
      catalog.save(captureCadLayerState(name, layers));
      return message(
        state,
        `Estado "${name}" guardado con ${layers.length} capa(s). Vive en la SESIÓN: no sobrevive a una recarga.`,
      );
    }

    if (state.action === "delete")
      return message(
        state,
        catalog.remove(name) ? `Estado "${name}" suprimido.` : `No hay ningún estado llamado "${name}".`,
      );

    const saved = catalog.get(name);
    if (!saved) return message(state, `No hay ningún estado llamado "${name}".`);
    const plan = planCadLayerStateRestore(saved, layersOf(context));
    const notes = [
      ...(plan.missing.length > 0
        ? [`No están ya en el dibujo: ${plan.missing.join(", ")}.`]
        : []),
      ...(plan.untouched.length > 0
        ? [`El estado no menciona ${plan.untouched.length} capa(s); se dejan como estaban.`]
        : []),
    ];
    if (plan.commands.length === 0)
      return message(state, [`El estado "${name}" ya está puesto.`, ...notes].join("\n"));
    return {
      state,
      prompt: { message: "", options: [] },
      accepts: 0,
      // UN lote: restaurar cuarenta capas es un paso de deshacer.
      result: {
        kind: "document",
        commands: plan.commands,
        label: `LAYERSTATE "${name}": ${plan.changed} capa(s) restauradas`,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// RENAME / -RENAME
// ---------------------------------------------------------------------------

/**
 * Cambiar de nombre una capa desde la línea de comandos.
 *
 * ## Por qué esta orden y no otra
 *
 * El guión que más veces se escribe en un despacho con oficio es el que
 * normaliza la tabla de capas del archivo que acaba de llegar: `MURO` pasa a
 * `A-MURO`, `texto` a `A-ANOT-TEXT`. En AutoCAD eso es `-RENAME`, y sin él la
 * normalización se hace capa por capa a mano, que es media hora por archivo.
 *
 * No hace falta registrar el nombre con guion: el registro prueba primero el
 * nombre LITERAL y sólo después quita el prefijo, así que `-RENAME` llega aquí
 * mientras nadie reclame ese literal. Se registra sin guion porque esta orden
 * NO abre ningún cuadro: no hay dos variantes que distinguir.
 *
 * ## Renombrar es crear y absorber, en UN lote
 *
 * La tabla de capas ya sabe borrar reasignando (`op: "delete"` con
 * `reassignTo`). Renombrar es exactamente eso precedido de un alta con las
 * mismas propiedades: las entidades de la capa vieja pasan a la nueva y no hay
 * un instante intermedio en el que apunten a una capa que no existe. Las dos
 * órdenes viajan en el MISMO lote, así que deshacer devuelve el nombre viejo y
 * las entidades a la vez.
 */
const RENAME_LAYER = { keyword: "Capa", shortcut: "C" } as const;
const RENAME_BLOCK = { keyword: "Bloque", shortcut: "B" } as const;
const RENAME_STYLE = { keyword: "Estilo", shortcut: "E" } as const;

/** Caracteres que DXF prohíbe en el nombre de una capa. */
const FORBIDDEN_NAME = /[<>/\\":;?*|,='`]/;

interface RenameState {
  /** `null` mientras no se ha elegido el tipo de objeto. */
  kind: "layer" | null;
  from: string | null;
}

function renameMenu(state: RenameState): CadCommandStep<RenameState> {
  return {
    state,
    prompt: {
      message: "Tipo de objeto a cambiar de nombre",
      options: [RENAME_LAYER, RENAME_BLOCK, RENAME_STYLE],
      defaultOption: RENAME_LAYER.keyword,
    },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

const renameCommand: CadCommandDescriptor<RenameState> = {
  name: "RENAME",
  aliases: ["REN", "DDRENAME"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: true,
  cursor: "none",
  begin: () => renameMenu({ kind: null, from: null }),
  step: (state, input, context) => {
    if (input.kind === "cancel" || input.kind === "enter") return cancelled(state);

    if (state.kind === null) {
      if (input.kind !== "keyword") return renameMenu(state);
      // Las dos negativas son CONCRETAS a propósito. Un bloque y un estilo se
      // referencian por NOMBRE desde las entidades (`insert.block`,
      // `mtext.style`), así que renombrarlos es una migración sobre
      // `entities`: hacerla a medias —cambiar el nombre y no las referencias—
      // deja el dibujo apuntando a algo que no existe, y eso es peor que no
      // ofrecer la orden. Las capas SÍ se pueden porque la tabla de capas ya
      // sabe reasignar al borrar.
      if (input.keyword === RENAME_BLOCK.keyword)
        return message(
          state,
          "Todavía no se puede renombrar un bloque: las inserciones lo referencian por nombre y " +
            "reasignarlas es una migración del dibujo entero. Redefínalo con BLOCK usando el " +
            "nombre nuevo.",
        );
      if (input.keyword === RENAME_STYLE.keyword)
        return message(
          state,
          "Todavía no se puede renombrar un estilo: las entidades lo referencian por nombre. " +
            "Cree el estilo nuevo con STYLE y aplíquelo a lo que lo usaba.",
        );
      return {
        state: { kind: "layer", from: null },
        prompt: { message: "Nombre actual de la capa", options: [] },
        accepts: CAD_ACCEPT_TEXT,
      };
    }

    if (input.kind !== "text") return cancelled(state);
    const typed = input.value.trim();
    if (!typed) return cancelled(state);

    if (state.from === null) {
      const layer = findLayer(context, typed);
      if (!layer) return message(state, `No existe la capa "${typed}".`);
      if (layer.name === "0")
        return message(state, "La capa 0 no se puede renombrar: es la capa que define el formato.");
      // La capa ACTUAL tampoco, y por una razón mecánica: el resultado de un
      // comando es de UN tipo, así que este lote no puede escribir además
      // `CLAYER`. Renombrar la capa actual dejaría esa variable apuntando a un
      // nombre inexistente y los objetos nuevos irían a parar a la capa 0 sin
      // que nadie lo hubiera pedido. Se dice, y se dice qué hacer antes.
      if (layer.name === context.activeLayer)
        return message(
          state,
          `"${layer.name}" es la capa actual. Ponga otra actual con -LAYER definir y repita el ` +
            "cambio de nombre.",
        );
      return {
        state: { ...state, from: layer.name },
        prompt: { message: `Nombre nuevo para "${layer.name}"`, options: [] },
        accepts: CAD_ACCEPT_TEXT,
      };
    }

    if (FORBIDDEN_NAME.test(typed))
      return message(
        state,
        `"${typed}" no vale como nombre de capa: DXF prohíbe < > / \\ " : ; ? * | , = ' y la ` +
          "comilla inversa.",
      );
    const clash = findLayer(context, typed);
    if (clash && clash.name !== state.from)
      return message(state, `Ya existe una capa "${clash.name}"; fusionar dos capas no es renombrar.`);
    const source = findLayer(context, state.from);
    if (!source) return message(state, `La capa "${state.from}" ha dejado de existir.`);
    if (source.name === typed)
      return message(state, `La capa ya se llama "${typed}"; no hay nada que cambiar.`);

    return {
      state,
      prompt: { message: "", options: [] },
      accepts: 0,
      result: {
        kind: "document",
        commands: [
          { type: "layer", op: "upsert", layer: { ...source, id: typed.toLowerCase(), name: typed } },
          { type: "layer", op: "delete", name: source.name, reassignTo: typed },
        ],
        label: `RENAME: capa "${source.name}" → "${typed}"`,
      },
    };
  },
};

export const CAD_SETTINGS_LAYER_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(layerCliCommand),
  asCadCommand(layerStateCommand),
  asCadCommand(renameCommand),
];
