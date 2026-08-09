/**
 * SOLID, WIPEOUT e IMAGE — las tres órdenes que cubren una región.
 *
 * ## SOLID y el orden en corbatín
 *
 * DXF guarda los cuatro vértices de un SOLID en el orden 1-2-4-3, y AutoCAD los
 * PIDE en ese mismo orden: designar las cuatro esquinas «dando la vuelta»
 * produce el famoso relleno en forma de pajarita. Ese orden es una rareza del
 * formato, no del dibujo, así que aquí se pide el orden natural del CONTORNO y
 * se guarda así en el modelo. Quien exporte a DXF hará el intercambio; el
 * modelo no arrastra la trampa.
 *
 * ## WIPEOUT nace ARRIBA
 *
 * Un wipeout tapa lo que hay debajo, y qué tapa lo decide su sitio en
 * `modelSpace.entityIds`. Nace con `drawOrder: "front"`: uno que naciera al
 * fondo no ocultaría nada y parecería que la orden no ha hecho nada.
 *
 * ## IMAGE, y lo que este motor NO puede saber
 *
 * El motor de comandos es puro: no abre archivos, no mide imágenes, no toca la
 * red. Así que IMAGE no puede averiguar cuántos píxeles tiene el archivo que se
 * adjunta. La definición nace declarando `1 × 1` píxel y `loaded: false`, con
 * los vectores U y V midiendo el rectángulo COMPLETO — que es exactamente
 * coherente con el modelo (`esquina = inserción + u·ancho + v·alto`) y deja el
 * rectángulo donde el usuario lo puso. Cuando alguien cargue el archivo de
 * verdad, reescribirá `pixelWidth`/`pixelHeight` y dividirá U y V por ellos
 * para conservar el mismo rectángulo. Ese contrato está aquí escrito en vez de
 * descubrirse comparando dibujos.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadNativeEntity } from "../../entity-runtime";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

const flat = (point: CadPoint2) => ({ x: point.x, y: point.y, z: 0 });

// ---------------------------------------------------------------------------
// SOLID
// ---------------------------------------------------------------------------

interface SolidState {
  points: CadPoint2[];
}

const SOLID_ORDINALS = ["primer", "segundo", "tercer", "cuarto"];

function solidStep(state: SolidState, context: CadCommandContext): CadCommandStep<SolidState> {
  const ordinal = SOLID_ORDINALS[state.points.length] ?? "siguiente";
  return {
    state,
    prompt: {
      message: `Precise el ${ordinal} punto del contorno`,
      options: [],
      ...(state.points.length >= 3 ? { defaultValue: "Enter para cerrar con tres puntos" } : {}),
    },
    accepts: CAD_ACCEPT_POINT,
    preview: [{ points: context.cursor ? [...state.points, context.cursor] : state.points, closed: true }],
  };
}

function solidFinish(state: SolidState, context: CadCommandContext): CadCommandStep<SolidState> {
  // Tres o cuatro vértices: un SOLID de dos es un segmento sin área.
  if (state.points.length < 3)
    return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: {
      kind: "document",
      commands: [
        {
          type: "insert",
          entity: {
            id: context.newEntityId(),
            type: "solid",
            points: state.points.slice(0, 4).map(flat),
            layer: context.activeLayer,
          },
        },
      ],
      label: "SOLID",
    },
  };
}

const solidCommand: CadCommandDescriptor<SolidState> = {
  name: "SOLID",
  aliases: ["SO"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => solidStep({ points: [] }, context),
  step: (state, input, context) => {
    if (input.kind === "cancel")
      return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
    if (input.kind === "enter") return solidFinish(state, context);
    if (input.kind !== "point") return solidStep(state, context);
    const points = [...state.points, input.point];
    // El cuarto punto cierra la orden: un SOLID no tiene más de cuatro
    // vértices, y seguir pidiendo puntos haría creer que sí.
    return points.length >= 4 ? solidFinish({ points }, context) : solidStep({ points }, context);
  },
};

// ---------------------------------------------------------------------------
// WIPEOUT
// ---------------------------------------------------------------------------

const WIPEOUT_FRAMES = { keyword: "Marcos", shortcut: "M" } as const;
const WIPEOUT_ON = { keyword: "Activado", shortcut: "A" } as const;
const WIPEOUT_OFF = { keyword: "Desactivado", shortcut: "D" } as const;

interface WipeoutState {
  points: CadPoint2[];
  frame: boolean;
  pending: "none" | "frame";
}

function wipeoutStep(state: WipeoutState, context: CadCommandContext): CadCommandStep<WipeoutState> {
  if (state.pending === "frame")
    return {
      state,
      prompt: {
        message: "Muestre u oculte los marcos de los wipeout",
        options: [WIPEOUT_ON, WIPEOUT_OFF],
        defaultOption: WIPEOUT_ON.keyword,
      },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  if (state.points.length === 0)
    return {
      state,
      prompt: { message: "Precise el primer punto del contorno", options: [WIPEOUT_FRAMES] },
      accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    };
  return {
    state,
    prompt: { message: "Precise el punto siguiente", options: [] },
    accepts: CAD_ACCEPT_POINT,
    preview: [{ points: context.cursor ? [...state.points, context.cursor] : state.points, closed: true }],
  };
}

const wipeoutCommand: CadCommandDescriptor<WipeoutState> = {
  name: "WIPEOUT",
  aliases: ["WIPE"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => wipeoutStep({ points: [], frame: true, pending: "none" }, context),
  step: (state, input, context) => {
    if (input.kind === "cancel")
      return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
    if (input.kind === "keyword") {
      if (input.keyword === WIPEOUT_FRAMES.keyword)
        return wipeoutStep({ ...state, pending: "frame" }, context);
      if (input.keyword === WIPEOUT_ON.keyword)
        return wipeoutStep({ ...state, frame: true, pending: "none" }, context);
      if (input.keyword === WIPEOUT_OFF.keyword)
        return wipeoutStep({ ...state, frame: false, pending: "none" }, context);
      return wipeoutStep(state, context);
    }
    if (input.kind === "enter") {
      if (state.pending === "frame") return wipeoutStep({ ...state, pending: "none" }, context);
      if (state.points.length < 3)
        return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
      return {
        state,
        prompt: { message: "", options: [] },
        accepts: 0,
        result: {
          kind: "document",
          commands: [
            {
              type: "insert",
              entity: {
                id: context.newEntityId(),
                type: "wipeout",
                boundary: state.points.map(flat),
                frame: state.frame,
                layer: context.activeLayer,
              },
              // Al FRENTE: un wipeout que naciera al fondo no taparía nada y
              // parecería que la orden no ha hecho nada.
              drawOrder: "front",
            },
          ],
          label: "WIPEOUT",
        },
      };
    }
    if (input.kind !== "point") return wipeoutStep(state, context);
    const last = state.points[state.points.length - 1];
    if (last && Math.hypot(input.point.x - last.x, input.point.y - last.y) < 1e-9)
      return wipeoutStep(state, context);
    return wipeoutStep({ ...state, points: [...state.points, input.point] }, context);
  },
};

// ---------------------------------------------------------------------------
// IMAGE (adjuntar)
// ---------------------------------------------------------------------------

type ImagePending = "uri" | "insertion" | "width" | "height";

interface ImageState {
  uri: string;
  insertion: CadPoint2 | null;
  width: number;
  pending: ImagePending;
}

/** Id determinista de la definición a partir de su URI. */
export function imageDefinitionId(uri: string): string {
  return `image:${uri.replace(/[^a-zA-Z0-9._:/-]+/g, "_").slice(0, 96)}`;
}

function imageStep(state: ImageState, context: CadCommandContext): CadCommandStep<ImageState> {
  const prompts: Record<ImagePending, string> = {
    uri: "Precise el URI del asset de la imagen",
    insertion: "Precise el punto de inserción (esquina inferior izquierda)",
    width: "Precise el ancho de la imagen en unidades de dibujo",
    height: "Precise el alto de la imagen en unidades de dibujo",
  };
  return {
    state,
    prompt: { message: prompts[state.pending], options: [] },
    accepts:
      state.pending === "uri"
        ? CAD_ACCEPT_TEXT
        : state.pending === "insertion"
          ? CAD_ACCEPT_POINT
          : CAD_ACCEPT_DISTANCE,
    preview:
      state.insertion && context.cursor
        ? [{ points: [state.insertion, context.cursor] }]
        : [],
  };
}

function imageFinish(
  state: ImageState,
  height: number,
  context: CadCommandContext,
): CadCommandStep<ImageState> {
  const insertion = state.insertion!;
  const definitionId = imageDefinitionId(state.uri);
  const commands: CadEntityCommand[] = [
    {
      type: "image-definition",
      definition: {
        id: definitionId,
        name: state.uri.split("/").pop() || state.uri,
        uri: state.uri,
        // El motor es puro y no puede abrir el archivo: la definición nace
        // declarando un solo píxel y `loaded: false`. Ver la cabecera.
        pixelWidth: 1,
        pixelHeight: 1,
        loaded: false,
      },
    },
    {
      type: "insert",
      entity: {
        id: context.newEntityId(),
        type: "image",
        definition: definitionId,
        insertion: flat(insertion),
        uVector: { x: state.width, y: 0, z: 0 },
        vVector: { x: 0, y: height, z: 0 },
        size: { width: 1, height: 1 },
        showImage: true,
        layer: context.activeLayer,
      } as CadNativeEntity,
      // Al FONDO: una imagen adjunta es un calco sobre el que se dibuja, no
      // algo que deba tapar la geometría existente.
      drawOrder: "back",
    },
  ];
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "document", commands, label: "IMAGE" },
  };
}

const imageCommand: CadCommandDescriptor<ImageState> = {
  name: "IMAGE",
  // `XATTACH` ya NO es alias de IMAGE. En AutoCAD esa orden adjunta una
  // referencia a un DIBUJO, no una imagen: la imagen se adjunta con
  // IMAGEATTACH, que sigue aquí. Tener XATTACH apuntando a IMAGE hacía que
  // teclear lo que todo el mundo teclea para referenciar un plano abriera el
  // diálogo equivocado.
  aliases: ["IM", "IMAGEATTACH"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => imageStep({ uri: "", insertion: null, width: 0, pending: "uri" }, context),
  step: (state, input, context) => {
    if (input.kind === "cancel" || input.kind === "enter")
      return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
    if (input.kind === "text" && state.pending === "uri") {
      const uri = input.value.trim();
      // Una ruta local del navegador NO se persiste: el documento viaja al
      // servidor y a otros usuarios, y `C:\...` es a la vez una filtración y
      // una referencia rota. Se exige un URI de asset del tenant.
      if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(uri))
        return {
          state,
          prompt: { message: "", options: [] },
          accepts: 0,
          result: {
            kind: "message",
            text: "La imagen necesita un URI de asset (por ejemplo asset://…); una ruta local no se persiste.",
          },
        };
      return imageStep({ ...state, uri, pending: "insertion" }, context);
    }
    if (input.kind === "point" && state.pending === "insertion")
      return imageStep({ ...state, insertion: input.point, pending: "width" }, context);
    if (input.kind === "distance") {
      const value = Math.abs(input.value);
      if (!(value > 1e-9))
        return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
      if (state.pending === "width") return imageStep({ ...state, width: value, pending: "height" }, context);
      if (state.pending === "height" && state.insertion) return imageFinish(state, value, context);
    }
    return imageStep(state, context);
  },
};

export const CAD_DRAW_FILL_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(solidCommand),
  asCadCommand(wipeoutCommand),
  asCadCommand(imageCommand),
];
