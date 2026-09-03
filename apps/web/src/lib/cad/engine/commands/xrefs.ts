/**
 * XREF, XATTACH, XBIND y XCLIP.
 *
 * ## Lo que estas órdenes tienen que hacer bien
 *
 * **Decir por qué ruta se resolvió cada referencia.** Un proyecto abre en otra
 * máquina o no según qué ruta funcione, y cuando no abre, el dibujante necesita
 * saber cuál se intentó. El listado de `XREF ?` lo dice, referencia por
 * referencia; ver `xref/xref-paths.ts`.
 *
 * **No colgarse con un ciclo.** La comprobación está en
 * `cadXrefAttachCommands`, antes de emitir nada.
 *
 * **Distinguir enlazar de insertar.** XBIND pregunta cuál de las dos, porque
 * son resultados distintos y uno no se deshace en el otro.
 *
 * ## De dónde salen los dibujos que XATTACH referencia (Ola 2, 2026-09-03)
 *
 * Por DOS caminos, y el segundo es el que hacía falta.
 *
 * 1. `context.xrefCatalog`, una biblioteca ya cargada: el camino puro, que se
 *    prueba en Node sin red. Si el activo está ahí CON contenido, la orden
 *    adjunta sin salir del motor.
 * 2. Una PETICIÓN DE ANFITRIÓN (`{kind:"xref-attach"}`) cuando no hay
 *    biblioteca o el activo listado no trae contenido. Traerlo es I/O y este
 *    motor es síncrono; el estudio ya sabe hacerlo —es lo que el panel de
 *    referencias externas hace desde hace campañas— y ahora la orden se lo
 *    pide. Es el reparto de PLOT: el comando decide, el anfitrión ejecuta.
 *
 * Hasta esta ola el camino 2 no existía y XATTACH terminaba explicando que el
 * editor no le pasaba la biblioteca. Era honesto y era inútil: `P1-2` del
 * BACKLOG decía exactamente eso, «XATTACH por línea de comandos no puede
 * adjuntar».
 *
 * `XATTACH` era hasta ahora un alias de IMAGE. En AutoCAD esa orden referencia
 * un DIBUJO; las imágenes se adjuntan con IMAGEATTACH, que sigue existiendo.
 *
 * Lo que funciona entero sin biblioteca: listar con su resolución de rutas,
 * descargar, volver a cargar lo descargado (la proyección sigue en el
 * documento), desligar, enlazar y recortar.
 */
import type { CadEntity, CadExternalReference, CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadNativeEntity } from "../../entity-runtime";
import {
  cadFindXref,
  cadXrefAttachCommands,
  cadXrefBindCommands,
  cadXrefDetachCommands,
  cadXrefUnloadCommands,
} from "../../xref/xref-workflow";
import {
  cadXrefInsertId,
  cadXrefLayer,
  cadXrefRootBlockId,
} from "../../xref/xref-projection";
import {
  cadResolveXrefPath,
  cadXrefStoredPaths,
  cadXrefStrategyLabel,
  type CadXrefCatalogEntry,
} from "../../xref/xref-paths";
import {
  cadDeleteXclipCommands,
  cadSetXclipCommands,
  cadToggleXclipCommands,
  cadXclipOf,
  cadXclipRectangle,
} from "../../xref/xclip";
import {
  CAD_ACCEPT_ANGLE,
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
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

const NO_DOCUMENT = "El anfitrión no expone el documento: la orden no puede analizarlo.";

// ---------------------------------------------------------------------------
// XREF — el gestor por la línea de comandos
// ---------------------------------------------------------------------------

const XREF_LIST = { keyword: "?", shortcut: "?" } as const;
const XREF_UNLOAD = { keyword: "Descargar", shortcut: "D" } as const;
const XREF_RELOAD = { keyword: "Recargar", shortcut: "R" } as const;
const XREF_DETACH = { keyword: "Desligar", shortcut: "L" } as const;
const XREF_BIND = { keyword: "Enlazar", shortcut: "E" } as const;
const XREF_PATH = { keyword: "Ruta", shortcut: "U" } as const;

type XrefAction = "unload" | "reload" | "detach" | "bind" | "path";

interface XrefState {
  action: XrefAction | null;
}

/**
 * Una línea por referencia: nombre, modo, estado y —lo importante— por qué ruta
 * se resuelve hoy. Sin catálogo se enseñan las rutas GUARDADAS, que sigue
 * siendo la información que hace falta para arreglar una que falla.
 */
function xrefReport(context: CadCommandContext): string {
  const references = context.document?.().externalReferences ?? [];
  if (references.length === 0) return "El dibujo no tiene referencias externas.";
  const catalog = context.xrefCatalog?.();
  return references
    .map((reference) => {
      const head = `${reference.name} [${reference.mode ?? "attachment"}${reference.loaded ? "" : ", descargado"}]`;
      if (!catalog) {
        const paths = cadXrefStoredPaths(reference);
        return `${head} · rutas guardadas — relativa: ${paths.relative || "—"}; absoluta: ${paths.absolute || "—"}; nombre: ${paths.search || "—"}`;
      }
      const resolution = cadResolveXrefPath(reference, catalog);
      return resolution.found
        ? `${head} · ${cadXrefStrategyLabel(resolution.via)}: ${resolution.entry.assetId}@${resolution.entry.revision}`
        : `${head} · NO SE ENCUENTRA — ${resolution.detail}`;
    })
    .join(" | ");
}

/**
 * Volver a cargar una referencia DESCARGADA sin ir a la red.
 *
 * Descargar conserva la proyección en la tabla de bloques: sólo quita el
 * INSERT. Así que recargar es volver a crearlo, y eso no necesita I/O. Si la
 * proyección ya no está —porque se desligó— hace falta el contenido del activo,
 * y entonces se dice.
 */
function reloadCommands(context: CadCommandContext, reference: CadExternalReference): CadEntityCommand[] {
  const document = context.document?.();
  if (!document) throw new Error(NO_DOCUMENT);
  if (reference.loaded) throw new Error(`${reference.name} ya está cargada.`);
  const blockId = reference.blockId ?? cadXrefRootBlockId(reference.id);
  if (!document.blocks.some((block) => block.id === blockId))
    throw new Error(
      `La proyección de ${reference.name} ya no está en el dibujo: recargarla exige traer el activo, y eso todavía no se puede hacer desde la línea de comandos.`,
    );
  const insertId = reference.insertId ?? cadXrefInsertId(reference.id);
  const layer = cadXrefLayer(reference.id, reference.name);
  const insert: Extract<CadEntity, { type: "insert" }> = {
    id: insertId,
    type: "insert",
    block: blockId,
    insertion: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    rotation: 0,
    layer: layer.id,
  };
  return [
    ...(document.layers.some((candidate) => candidate.id === layer.id)
      ? []
      : [{ type: "layer", op: "upsert", layer } as CadEntityCommand]),
    { type: "insert", entity: insert as CadNativeEntity },
    { type: "xref", op: "upsert", reference: { ...reference, loaded: true, status: "loaded" } },
  ];
}

function xrefApply(
  state: XrefState,
  context: CadCommandContext,
  key: string,
): CadCommandStep<XrefState> {
  const document = context.document?.();
  if (!document) return message(state, NO_DOCUMENT);
  const reference = cadFindXref(document, key.trim());
  if (!reference) return message(state, `No hay ninguna referencia externa llamada ${key.trim()}.`);
  const action = state.action!;
  if (action === "path") {
    const catalog = context.xrefCatalog?.();
    if (!catalog)
      return message(state, "El anfitrión no expone la biblioteca del inquilino: no se pueden comprobar las rutas.");
    const resolution = cadResolveXrefPath(reference, catalog);
    return message(state, resolution.detail);
  }
  return attempt(state, `XREF ${action}`, () => {
    if (action === "unload") return cadXrefUnloadCommands(document, reference.id);
    if (action === "detach") return cadXrefDetachCommands(document, reference.id);
    if (action === "bind") return cadXrefBindCommands(document, reference.id, "bind");
    return reloadCommands(context, reference);
  });
}

const ACTIONS: Record<string, XrefAction> = {
  [XREF_UNLOAD.keyword]: "unload",
  [XREF_RELOAD.keyword]: "reload",
  [XREF_DETACH.keyword]: "detach",
  [XREF_BIND.keyword]: "bind",
  [XREF_PATH.keyword]: "path",
};

const xrefCommand: CadCommandDescriptor<XrefState> = {
  name: "XREF",
  aliases: ["XR", "EXTERNALREFERENCES"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: true,
  cursor: "none",
  begin: (context) => {
    if (!context.document) return message({ action: null }, NO_DOCUMENT);
    return {
      state: { action: null },
      prompt: {
        message: "Referencias externas",
        options: [XREF_LIST, XREF_RELOAD, XREF_UNLOAD, XREF_DETACH, XREF_BIND, XREF_PATH],
        defaultOption: XREF_LIST.keyword,
      },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return nothing(state);
    if (state.action === null) {
      if (input.kind === "enter" || (input.kind === "keyword" && input.keyword === XREF_LIST.keyword))
        return message(state, xrefReport(context));
      if (input.kind !== "keyword") return nothing(state);
      const action = ACTIONS[input.keyword];
      if (!action) return nothing(state);
      return {
        state: { action },
        prompt: { message: "Indique el nombre de la referencia", options: [XREF_LIST] },
        accepts: CAD_ACCEPT_TEXT | CAD_ACCEPT_KEYWORD,
      };
    }
    if (input.kind === "keyword" && input.keyword === XREF_LIST.keyword)
      return message(state, xrefReport(context));
    if (input.kind !== "text") return nothing(state);
    if (input.value.trim() === "?") return message(state, xrefReport(context));
    return xrefApply(state, context, input.value);
  },
};

// ---------------------------------------------------------------------------
// XATTACH
// ---------------------------------------------------------------------------

const XATTACH_ATTACH = { keyword: "Adjuntar", shortcut: "A" } as const;
const XATTACH_OVERLAY = { keyword: "Superponer", shortcut: "S" } as const;

interface XAttachState {
  entry: CadXrefCatalogEntry | null;
  /** Lo tecleado cuando no hay biblioteca: se resuelve en el anfitrión. */
  typed: string | null;
  mode: "attachment" | "overlay" | null;
  insertion: { x: number; y: number } | null;
  scale: number | null;
}

const EMPTY_XATTACH: XAttachState = {
  entry: null,
  typed: null,
  mode: null,
  insertion: null,
  scale: null,
};

/**
 * Lo que el usuario teclea cuando no hay biblioteca: `activo` o
 * `activo@revisión`. Sin revisión, la vigente — que es lo que el panel de
 * referencias externas llama `UNIVERSAL`.
 */
function splitAsset(typed: string): { assetId: string; revision: string } {
  const at = typed.lastIndexOf("@");
  if (at <= 0) return { assetId: typed, revision: "UNIVERSAL" };
  return { assetId: typed.slice(0, at), revision: typed.slice(at + 1) || "UNIVERSAL" };
}

function catalogList(catalog: readonly CadXrefCatalogEntry[]): string {
  return catalog
    .map((entry) => `${entry.name}${entry.snapshot ? "" : " (sin contenido cargado)"}`)
    .join(", ");
}

function xattachStep(state: XAttachState, catalog: readonly CadXrefCatalogEntry[]): CadCommandStep<XAttachState> {
  if (!state.entry && !state.typed)
    return {
      state,
      prompt: {
        message: catalog.length
          ? `Indique el dibujo a referenciar (${catalogList(catalog)})`
          : "Indique el dibujo a referenciar (activo o activo@revisión)",
        options: catalog.length ? [XREF_LIST] : [],
      },
      accepts: CAD_ACCEPT_TEXT | CAD_ACCEPT_KEYWORD,
    };
  if (!state.mode)
    return {
      state,
      prompt: {
        // Adjuntar y superponer NO son lo mismo al anidar: un attachment
        // arrastra los xrefs que lleve dentro y un overlay corta ahí.
        message: "¿Adjuntar o superponer?",
        options: [XATTACH_ATTACH, XATTACH_OVERLAY],
        defaultOption: XATTACH_ATTACH.keyword,
      },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  if (!state.insertion)
    return {
      state,
      prompt: { message: "Precise el punto de inserción", options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  if (state.scale === null)
    return {
      state,
      prompt: { message: "Factor de escala", options: [], defaultValue: "1" },
      accepts: CAD_ACCEPT_DISTANCE,
    };
  return {
    state,
    prompt: { message: "Ángulo de rotación", options: [], defaultValue: "0" },
    accepts: CAD_ACCEPT_ANGLE | CAD_ACCEPT_DISTANCE,
  };
}

/**
 * XATTACH: referenciar OTRO dibujo.
 *
 * La orden está entera; lo que depende del anfitrión es de dónde salen los
 * dibujos, porque traer su contenido es I/O y el motor es síncrono y puro. Con
 * `context.xrefCatalog` y contenido cargado adjunta sin salir del motor; sin
 * ellos termina en una petición `{kind:"xref-attach"}` con todo resuelto —qué
 * activo, qué revisión, cómo, dónde, a qué escala y con qué giro— y el estudio
 * la ejecuta. Ninguno de los dos caminos rechaza un nombre por su cuenta: quien
 * sabe si el activo existe es quien va a buscarlo.
 */
const xattachCommand: CadCommandDescriptor<XAttachState> = {
  name: "XATTACH",
  aliases: ["XA"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => xattachStep(EMPTY_XATTACH, context.xrefCatalog?.() ?? []),
  step: (state, input, context) => {
    if (input.kind === "cancel") return nothing(state);
    const catalog = context.xrefCatalog?.() ?? [];
    const document = context.document?.();
    if (!document) return message(state, NO_DOCUMENT);

    if (!state.entry && !state.typed) {
      if (input.kind === "keyword" && input.keyword === XREF_LIST.keyword)
        return message(
          state,
          catalog.length
            ? `Dibujos disponibles: ${catalogList(catalog)}.`
            : "El estudio no publica todavía la lista de dibujos del inquilino: escriba el activo (o activo@revisión) y se resolverá al adjuntar.",
        );
      if (input.kind !== "text") return xattachStep(state, catalog);
      const typed = input.value.trim();
      if (typed === "?")
        return message(
          state,
          catalog.length
            ? `Dibujos disponibles: ${catalogList(catalog)}.`
            : "El estudio no publica todavía la lista de dibujos del inquilino: escriba el activo (o activo@revisión) y se resolverá al adjuntar.",
        );
      const needle = typed.toLocaleLowerCase();
      const entry = catalog.find(
        (candidate) =>
          candidate.name.toLocaleLowerCase() === needle ||
          candidate.assetId.toLocaleLowerCase() === needle ||
          (candidate.relativePath ?? "").toLocaleLowerCase() === needle,
      );
      // Con contenido cargado se adjunta SIN salir del motor. Sin él —o sin
      // biblioteca— lo tecleado viaja al anfitrión, que es quien puede traerlo.
      if (entry?.snapshot) return xattachStep({ ...state, entry }, catalog);
      return xattachStep({ ...state, typed }, catalog);
    }

    if (!state.mode) {
      if (input.kind === "enter") return xattachStep({ ...state, mode: "attachment" }, catalog);
      if (input.kind !== "keyword") return xattachStep(state, catalog);
      const mode = input.keyword === XATTACH_OVERLAY.keyword ? "overlay" : "attachment";
      return xattachStep({ ...state, mode }, catalog);
    }

    if (!state.insertion) {
      if (input.kind !== "point") return xattachStep(state, catalog);
      return xattachStep({ ...state, insertion: input.point }, catalog);
    }

    if (state.scale === null) {
      if (input.kind === "enter") return xattachStep({ ...state, scale: 1 }, catalog);
      if (input.kind !== "distance") return xattachStep(state, catalog);
      // Un xref se escala UNIFORMEMENTE y en positivo: `attachCadXref` no
      // admite otra cosa, y aceptar aquí un valor que allí se ignora sería
      // mentir sobre lo que va a pasar.
      if (!(input.value > 0)) return message(state, "La escala de una referencia externa debe ser positiva.");
      return xattachStep({ ...state, scale: input.value }, catalog);
    }

    const rotation =
      input.kind === "enter"
        ? 0
        : input.kind === "angle"
          ? input.degrees
          : input.kind === "distance"
            ? input.value
            : null;
    if (rotation === null) return xattachStep(state, catalog);
    // Camino 2: sin contenido en la mano, se le pide al anfitrión. La orden ya
    // tiene TODO lo que hace falta —qué dibujo, cómo, dónde, a qué escala y con
    // qué giro—; lo único que no puede hacer es la red.
    if (!state.entry) {
      const { assetId, revision } = splitAsset(state.typed!);
      return {
        state,
        prompt: { message: "", options: [] },
        accepts: 0,
        result: {
          kind: "host",
          request: {
            kind: "xref-attach",
            assetId,
            revision,
            mode: state.mode!,
            insertion: { x: state.insertion!.x, y: state.insertion!.y },
            scale: state.scale!,
            rotation,
          },
          label: `XATTACH ${assetId}`,
        },
      };
    }
    return attempt(state, "XATTACH", () =>
      cadXrefAttachCommands(document, {
        id: context.newEntityId(),
        snapshot: state.entry!.snapshot!,
        mode: state.mode!,
        insertion: { x: state.insertion!.x, y: state.insertion!.y, z: 0 },
        scale: state.scale!,
        rotation,
        relativePath: state.entry!.relativePath,
      }),
    );
  },
};

// ---------------------------------------------------------------------------
// XBIND
// ---------------------------------------------------------------------------

const XBIND_BIND = { keyword: "Enlazar", shortcut: "E" } as const;
const XBIND_INSERT = { keyword: "Insertar", shortcut: "I" } as const;

interface XBindState {
  name: string | null;
}

const xbindCommand: CadCommandDescriptor<XBindState> = {
  name: "XBIND",
  aliases: ["XB"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: true,
  cursor: "none",
  begin: (context) => {
    if (!context.document) return message({ name: null }, NO_DOCUMENT);
    return {
      state: { name: null },
      prompt: { message: "Indique el nombre de la referencia a enlazar", options: [] },
      accepts: CAD_ACCEPT_TEXT,
    };
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return nothing(state);
    if (state.name === null) {
      if (input.kind !== "text") return nothing(state);
      const document = context.document?.();
      if (!document) return message(state, NO_DOCUMENT);
      if (!cadFindXref(document, input.value.trim()))
        return message(state, `No hay ninguna referencia externa llamada ${input.value.trim()}.`);
      return {
        state: { name: input.value.trim() },
        prompt: {
          // Las dos no son la misma cosa: `Enlazar` deja un BLOQUE local que
          // se sigue moviendo de una pieza; `Insertar` explota el contenido.
          message: "¿Enlazar como bloque o insertar el contenido?",
          options: [XBIND_BIND, XBIND_INSERT],
          defaultOption: XBIND_BIND.keyword,
        },
        accepts: CAD_ACCEPT_KEYWORD,
      };
    }
    if (input.kind !== "keyword") return nothing(state);
    const document = context.document?.();
    if (!document) return message(state, NO_DOCUMENT);
    const reference = cadFindXref(document, state.name)!;
    const mode = input.keyword === XBIND_INSERT.keyword ? "insert" : "bind";
    return attempt(state, `XBIND ${mode}`, () => cadXrefBindCommands(document, reference.id, mode));
  },
};

// ---------------------------------------------------------------------------
// XCLIP
// ---------------------------------------------------------------------------

const XCLIP_ON = { keyword: "actiVar", shortcut: "V" } as const;
const XCLIP_OFF = { keyword: "Desactivar", shortcut: "D" } as const;
const XCLIP_DELETE = { keyword: "suPrimir", shortcut: "P" } as const;
const XCLIP_RECTANGLE = { keyword: "Rectangular", shortcut: "R" } as const;
const XCLIP_POLYGON = { keyword: "Poligonal", shortcut: "G" } as const;
const XCLIP_INVERT = { keyword: "Invertir", shortcut: "I" } as const;

interface XClipState {
  entityId: string | null;
  mode: "rectangle" | "polygon" | null;
  inverted: boolean;
  points: CadPoint2[];
}

const EMPTY_XCLIP: XClipState = { entityId: null, mode: null, inverted: false, points: [] };

function xclipOptionsStep(state: XClipState, current: boolean): CadCommandStep<XClipState> {
  return {
    state,
    prompt: {
      message: current ? "Recorte actual" : "Contorno de recorte",
      options: current
        ? [XCLIP_RECTANGLE, XCLIP_POLYGON, XCLIP_INVERT, XCLIP_ON, XCLIP_OFF, XCLIP_DELETE]
        : [XCLIP_RECTANGLE, XCLIP_POLYGON, XCLIP_INVERT],
      defaultOption: XCLIP_RECTANGLE.keyword,
    },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

function xclipPointStep(state: XClipState): CadCommandStep<XClipState> {
  if (state.mode === "rectangle")
    return {
      state,
      prompt: {
        message: state.points.length === 0 ? "Precise la primera esquina" : "Precise la esquina opuesta",
        options: [],
      },
      accepts: CAD_ACCEPT_POINT,
    };
  return {
    state,
    prompt: {
      message:
        state.points.length < 3
          ? `Precise el vértice ${state.points.length + 1} del contorno`
          : "Precise el vértice siguiente, o pulse Intro para cerrar",
      options: [],
    },
    accepts: CAD_ACCEPT_POINT,
    preview: state.points.length > 1 ? [{ points: state.points, closed: false }] : [],
  };
}

const xclipCommand: CadCommandDescriptor<XClipState> = {
  name: "XCLIP",
  aliases: ["XC", "CLIP"],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => {
    if (context.selection.length === 1) {
      const entity = context.entity?.(context.selection[0]);
      if (entity?.type === "insert")
        return xclipOptionsStep(
          { ...EMPTY_XCLIP, entityId: entity.id },
          cadXclipOf(entity) !== null,
        );
    }
    return {
      state: EMPTY_XCLIP,
      prompt: { message: "Designe la inserción o referencia a recortar", options: [] },
      accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
    };
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return nothing(state);

    if (!state.entityId) {
      const id =
        input.kind === "entityPick"
          ? input.entityId
          : input.kind === "selection" && input.entityIds.length === 1
            ? input.entityIds[0]
            : null;
      if (!id)
        return message(
          state,
          input.kind === "selection"
            ? `XCLIP recorta UNA inserción por orden y llegaron ${input.entityIds.length} objetos: designe sólo la inserción o referencia a recortar.`
            : "XCLIP necesita designar la inserción o referencia a recortar.",
        );
      const entity = context.entity?.(id);
      if (entity?.type !== "insert")
        return message(state, "XCLIP recorta inserciones de bloque y referencias externas.");
      return xclipOptionsStep({ ...state, entityId: id }, cadXclipOf(entity) !== null);
    }

    if (state.mode === null) {
      if (input.kind !== "keyword") return nothing(state);
      const entity = context.entity?.(state.entityId);
      const current = entity ? cadXclipOf(entity) : null;
      if (input.keyword === XCLIP_DELETE.keyword)
        return attempt(state, "XCLIP", () => cadDeleteXclipCommands(state.entityId!));
      if (input.keyword === XCLIP_ON.keyword || input.keyword === XCLIP_OFF.keyword) {
        if (!current) return message(state, "Esta inserción no tiene ningún recorte definido.");
        return attempt(state, "XCLIP", () =>
          cadToggleXclipCommands(state.entityId!, current, input.keyword === XCLIP_ON.keyword),
        );
      }
      if (input.keyword === XCLIP_INVERT.keyword) {
        // Invertir sobre un recorte que ya existe se aplica al momento; sin
        // recorte previo es un modificador del contorno que se va a dibujar.
        if (current)
          return attempt(state, "XCLIP", () =>
            cadSetXclipCommands(state.entityId!, { ...current, inverted: !current.inverted }),
          );
        return xclipOptionsStep({ ...state, inverted: !state.inverted }, false);
      }
      const mode = input.keyword === XCLIP_POLYGON.keyword ? "polygon" : "rectangle";
      return xclipPointStep({ ...state, mode, points: [] });
    }

    if (input.kind === "enter") {
      if (state.mode !== "polygon" || state.points.length < 3)
        return message(state, "Un contorno poligonal necesita al menos tres vértices.");
      return attempt(state, "XCLIP", () =>
        cadSetXclipCommands(state.entityId!, { boundary: state.points, inverted: state.inverted }),
      );
    }
    if (input.kind !== "point") return xclipPointStep(state);
    const points = [...state.points, input.point];
    if (state.mode === "rectangle" && points.length === 2)
      return attempt(state, "XCLIP", () =>
        cadSetXclipCommands(state.entityId!, {
          boundary: cadXclipRectangle(points[0], points[1]),
          inverted: state.inverted,
        }),
      );
    return xclipPointStep({ ...state, points });
  },
};

export const CAD_XREF_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(xrefCommand),
  asCadCommand(xattachCommand),
  asCadCommand(xbindCommand),
  asCadCommand(xclipCommand),
];
