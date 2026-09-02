/**
 * IMAGEATTACH, IMAGECLIP e IMAGEADJUST: el plano escaneado que se calca
 * (Ola H, 2026-09-02).
 *
 * Medido antes (`distancia-autocad-completo-20260901.md`, §4 4º RASTER):
 * IMAGE insertaba una entidad que sólo se veía como marco, exigía un
 * `asset://` que nadie resolvía, y no había recorte ni ajuste. La mitad útil
 * del toolset es «insertar, escalar, atenuar, recortar, calcar encima»:
 *
 *   - IMAGEATTACH elige el archivo por el selector del navegador (canal de
 *     interfaz `image-file`, el mismo reparto que DXFIN y MAPIMPORT) y lo
 *     mete DENTRO del dibujo como `data:` (`image-attach-payload.ts` dice
 *     por qué y el tope); pide inserción, ancho en unidades y giro.
 *   - IMAGECLIP designa una imagen y recorta por polígono o rectángulo, o
 *     quita el recorte. El contorno se guarda en píxeles de la imagen, que
 *     es lo que el formato ya tiene (`clipBoundary`).
 *   - IMAGEADJUST designa una imagen y ajusta brillo, contraste y
 *     atenuación (0–100, como AutoCAD), o los restablece.
 *
 * Todo escribe con `replace` sobre la entidad `image` que ya existe: sin
 * campo nuevo, sin formato nuevo.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadImageEntity } from "../../cad-entities-v4";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadNativeEntity } from "../../entity-runtime";
import {
  CAD_IMAGE_BRIGHTNESS_NEUTRAL,
  CAD_IMAGE_CONTRAST_NEUTRAL,
  CAD_IMAGE_FADE_NONE,
  cadImageClipFromWorld,
  cadImageEmbeddedBytes,
  cadImageFileName,
  cadImagePolygonArea,
} from "../../image-geometry";
import { CAD_IMAGE_PAYLOAD_ERROR_KIND, cadImageDefinitionIdFor, decodeCadImagePayload, type CadImagePayload } from "../../image-attach-payload";
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
  type CadCommandInput,
  type CadCommandStep,
} from "../command-types";

const FILE_KEYWORD = { keyword: "Archivo", shortcut: "A" } as const;

function say<S>(state: S, text: string): CadCommandStep<S> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text } };
}

function written<S>(state: S, commands: CadEntityCommand[], label: string, notice: string): CadCommandStep<S> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "document", commands, label, notice } };
}

/** La imagen designada, o el motivo por el que no vale. */
function pickImage(input: CadCommandInput, context: CadCommandContext): { entity: CadImageEntity } | { reason: string } | null {
  const id = input.kind === "entityPick" ? input.entityId : input.kind === "selection" ? input.entityIds[0] : null;
  if (!id) return null;
  const entity = context.entity?.(id);
  if (!entity) return { reason: `${id} ya no existe.` };
  if (entity.type !== "image") return { reason: `se designó ${entity.type.toUpperCase()}; hace falta una IMAGE.` };
  return { entity };
}

/**
 * La imagen ya designada ANTES de teclear la orden (Ctrl+A, un clic): las
 * órdenes «command-first» la toman de `context.selection` al arrancar y en
 * Intro, como JOIN. Sólo si hay exactamente una y es una IMAGE.
 */
function preselectedImage(context: CadCommandContext): CadImageEntity | null {
  if (context.selection.length !== 1) return null;
  const entity = context.entity?.(context.selection[0]);
  return entity && entity.type === "image" ? entity : null;
}

function imageNameOf(entity: CadImageEntity, context: CadCommandContext): string {
  const definition = context.document?.()?.imageDefinitions?.find((candidate) => candidate.id === entity.definition);
  return definition ? cadImageFileName(definition) : entity.definition;
}

function replaceImage(entity: CadImageEntity): CadEntityCommand {
  return { type: "replace", entityId: entity.id, entity: entity as CadNativeEntity };
}

// ---------------------------------------------------------------------------
// IMAGEATTACH
// ---------------------------------------------------------------------------

interface AttachState {
  phase: "file" | "insertion" | "width" | "rotation";
  payload: CadImagePayload | null;
  insertion: CadPoint2 | null;
  width: number | null;
}

const ATTACH_UNAVAILABLE =
  "Este espacio de trabajo no sabe abrir un archivo. Usa IMAGE con un URI de imagen (data:image/… o https://…png).";

const attachAsk: CadCommandStep<AttachState> = {
  state: { phase: "file", payload: null, insertion: null, width: null },
  prompt: { message: "Elige el archivo de imagen (PNG, JPEG, GIF, WebP o BMP; hasta 8 MB): viaja dentro del dibujo", options: [FILE_KEYWORD], defaultOption: FILE_KEYWORD.keyword },
  accepts: CAD_ACCEPT_TEXT | CAD_ACCEPT_KEYWORD,
};

function attachStep(state: AttachState, context: CadCommandContext): CadCommandStep<AttachState> {
  if (state.phase === "insertion")
    return { state, prompt: { message: `«${state.payload!.name}» (${state.payload!.width} × ${state.payload!.height} px). Precise el punto de inserción (esquina inferior izquierda)`, options: [] }, accepts: CAD_ACCEPT_POINT };
  if (state.phase === "width")
    return {
      state,
      prompt: { message: `Precise el ancho de la imagen en unidades de dibujo`, options: [], defaultValue: String(state.payload!.width) },
      accepts: CAD_ACCEPT_DISTANCE,
      preview: state.insertion && context.cursor ? [{ points: [state.insertion, context.cursor] }] : [],
    };
  return { state, prompt: { message: "Precise el ángulo de rotación", options: [], defaultValue: "0" }, accepts: CAD_ACCEPT_ANGLE | CAD_ACCEPT_DISTANCE };
}

function attachFinish(state: AttachState, rotationDeg: number, context: CadCommandContext): CadCommandStep<AttachState> {
  const payload = state.payload!;
  const insertion = state.insertion!;
  const width = state.width!;
  const unitsPerPixel = width / payload.width;
  const radians = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const definitionId = cadImageDefinitionIdFor(payload);
  const definition = { id: definitionId, name: payload.name, uri: payload.dataUri, pixelWidth: payload.width, pixelHeight: payload.height, loaded: true };
  const entity: CadImageEntity = {
    id: context.newEntityId(),
    type: "image",
    definition: definitionId,
    insertion: { x: insertion.x, y: insertion.y, z: 0 },
    uVector: { x: cos * unitsPerPixel, y: sin * unitsPerPixel, z: 0 },
    vVector: { x: -sin * unitsPerPixel, y: cos * unitsPerPixel, z: 0 },
    size: { width: payload.width, height: payload.height },
    showImage: true,
    layer: context.activeLayer,
  };
  const kilobytes = Math.round(cadImageEmbeddedBytes(definition) / 1024);
  const commands: CadEntityCommand[] = [
    { type: "image-definition", definition },
    // Al FONDO: el escaneo es el calco, no algo que tape lo dibujado.
    { type: "insert", entity: entity as CadNativeEntity, drawOrder: "back" },
  ];
  return written(
    state,
    commands,
    "IMAGEATTACH",
    `IMAGEATTACH: «${payload.name}» (${payload.width} × ${payload.height} px, ${kilobytes} kB dentro del dibujo) en (${Math.round(insertion.x)}, ${Math.round(insertion.y)}); 1 px = ${formatNumber(unitsPerPixel)} ${context.unit ?? "mm"}${rotationDeg ? `, girada ${formatNumber(rotationDeg)}°` : ""}.`,
  );
}

const imageAttachCommand: CadCommandDescriptor<AttachState> = {
  name: "IMAGEATTACH",
  aliases: ["IAT"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: () => attachAsk,
  step: (state, input, context) => {
    if (input.kind === "cancel") return say(state, "IMAGEATTACH cancelado. El dibujo no ha cambiado.");
    if (state.phase === "file") {
      if (input.kind === "keyword" || input.kind === "enter")
        return {
          state,
          prompt: { message: "", options: [] },
          accepts: 0,
          result: { kind: "ui", request: { target: "image-file", params: { mode: "attach" }, unavailable: ATTACH_UNAVAILABLE }, text: "Elige la imagen que adjuntar." },
        };
      if (input.kind !== "text") return attachAsk;
      let payload;
      try {
        payload = decodeCadImagePayload(input.value);
      } catch (error) {
        return say(state, `IMAGEATTACH: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (!payload) return say(state, "IMAGEATTACH necesita el archivo elegido con Archivo; para un URI tecleado usa IMAGE.");
      if (payload.kind === CAD_IMAGE_PAYLOAD_ERROR_KIND) return say(state, `IMAGEATTACH: «${payload.name}» no se adjunta: ${payload.reason}`);
      return attachStep({ ...state, payload, phase: "insertion" }, context);
    }
    if (state.phase === "insertion") {
      if (input.kind !== "point") return input.kind === "enter" ? say(state, "IMAGEATTACH necesita el punto de inserción.") : attachStep(state, context);
      return attachStep({ ...state, insertion: input.point, phase: "width" }, context);
    }
    if (state.phase === "width") {
      if (input.kind === "enter") return attachStep({ ...state, width: state.payload!.width, phase: "rotation" }, context);
      if (input.kind !== "distance") return attachStep(state, context);
      const width = Math.abs(input.value);
      if (!(width > 1e-9)) return say(state, "IMAGEATTACH: el ancho debe ser mayor que cero.");
      return attachStep({ ...state, width, phase: "rotation" }, context);
    }
    if (input.kind === "enter") return attachFinish(state, 0, context);
    if (input.kind === "angle") return attachFinish(state, input.degrees, context);
    if (input.kind === "distance") return attachFinish(state, input.value, context);
    return attachStep(state, context);
  },
};

// ---------------------------------------------------------------------------
// IMAGECLIP
// ---------------------------------------------------------------------------

const NEW_KEYWORD = { keyword: "Nuevo", shortcut: "N" } as const;
const DELETE_KEYWORD = { keyword: "Eliminar", shortcut: "E" } as const;
const POLYGON_KEYWORD = { keyword: "Poligonal", shortcut: "P" } as const;
const RECTANGLE_KEYWORD = { keyword: "Rectangular", shortcut: "R" } as const;

interface ClipState {
  phase: "target" | "mode" | "shape" | "polygon" | "rectangle";
  targetId: string | null;
  points: CadPoint2[];
}

const CLIP_EMPTY: ClipState = { phase: "target", targetId: null, points: [] };

function clipStep(state: ClipState, context: CadCommandContext): CadCommandStep<ClipState> {
  if (state.phase === "target") return { state, prompt: { message: "Designe la imagen que recortar", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION };
  if (state.phase === "mode") return { state, prompt: { message: "Indique la opción de recorte", options: [NEW_KEYWORD, DELETE_KEYWORD], defaultOption: NEW_KEYWORD.keyword }, accepts: CAD_ACCEPT_KEYWORD };
  if (state.phase === "shape") return { state, prompt: { message: "Indique el tipo de contorno", options: [POLYGON_KEYWORD, RECTANGLE_KEYWORD], defaultOption: POLYGON_KEYWORD.keyword }, accepts: CAD_ACCEPT_KEYWORD };
  const preview = state.points.length > 0 && context.cursor ? [{ points: [...state.points, context.cursor] }] : [];
  if (state.phase === "rectangle")
    return { state, prompt: { message: state.points.length === 0 ? "Precise la primera esquina del recorte" : "Precise la esquina opuesta", options: [] }, accepts: CAD_ACCEPT_POINT, preview };
  return {
    state,
    prompt: { message: state.points.length === 0 ? "Precise el primer vértice del recorte" : `Precise el siguiente vértice o Intro para cerrar (${state.points.length} vértice(s))`, options: [] },
    accepts: CAD_ACCEPT_POINT,
    preview,
  };
}

function clipFinish(state: ClipState, points: CadPoint2[], context: CadCommandContext): CadCommandStep<ClipState> {
  const entity = context.entity?.(state.targetId ?? "");
  if (!entity || entity.type !== "image") return say(state, "IMAGECLIP: la imagen ya no existe.");
  if (points.length < 3) return say(state, "IMAGECLIP: un recorte necesita al menos tres vértices.");
  if (Math.abs(cadImagePolygonArea(points)) < 1e-9) return say(state, "IMAGECLIP: el contorno no cierra área.");
  const pixels = cadImageClipFromWorld(entity, points);
  if (!pixels) return say(state, "IMAGECLIP: la imagen no tiene área (sus vectores U y V son paralelos).");
  return written(state, [replaceImage({ ...entity, clipBoundary: pixels })], "IMAGECLIP", `IMAGECLIP: recorte de ${points.length} vértices en «${imageNameOf(entity, context)}».`);
}

const imageClipCommand: CadCommandDescriptor<ClipState> = {
  name: "IMAGECLIP",
  aliases: ["ICL"],
  kind: "modify",
  transparent: false,
  selection: "command-first",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => {
    const preselected = preselectedImage(context);
    return clipStep(preselected ? { ...CLIP_EMPTY, targetId: preselected.id, phase: "mode" } : CLIP_EMPTY, context);
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return say(state, "IMAGECLIP cancelado. El dibujo no ha cambiado.");
    if (state.phase === "target") {
      if (input.kind === "enter") {
        const preselected = preselectedImage(context);
        return preselected ? clipStep({ ...state, targetId: preselected.id, phase: "mode" }, context) : say(state, "IMAGECLIP necesita una imagen designada.");
      }
      const picked = pickImage(input, context);
      if (!picked) return clipStep(state, context);
      if ("reason" in picked) return say(state, `IMAGECLIP: ${picked.reason}`);
      return clipStep({ ...state, targetId: picked.entity.id, phase: "mode" }, context);
    }
    if (state.phase === "mode") {
      if (input.kind === "keyword" && input.keyword === DELETE_KEYWORD.keyword) {
        const entity = context.entity?.(state.targetId ?? "");
        if (!entity || entity.type !== "image") return say(state, "IMAGECLIP: la imagen ya no existe.");
        if (!entity.clipBoundary || entity.clipBoundary.length < 3) return say(state, `IMAGECLIP: «${imageNameOf(entity, context)}» no tiene recorte que eliminar.`);
        const { clipBoundary: _dropped, ...rest } = entity;
        return written(state, [replaceImage(rest)], "IMAGECLIP", `IMAGECLIP: recorte eliminado de «${imageNameOf(entity, context)}».`);
      }
      if (input.kind === "keyword" || input.kind === "enter") return clipStep({ ...state, phase: "shape" }, context);
      return clipStep(state, context);
    }
    if (state.phase === "shape") {
      if (input.kind === "keyword" && input.keyword === RECTANGLE_KEYWORD.keyword) return clipStep({ ...state, phase: "rectangle" }, context);
      if (input.kind === "keyword" || input.kind === "enter") return clipStep({ ...state, phase: "polygon" }, context);
      return clipStep(state, context);
    }
    if (state.phase === "rectangle") {
      if (input.kind !== "point") return clipStep(state, context);
      if (state.points.length === 0) return clipStep({ ...state, points: [input.point] }, context);
      const [a] = state.points;
      const b = input.point;
      return clipFinish(state, [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }], context);
    }
    if (input.kind === "point") return clipStep({ ...state, points: [...state.points, input.point] }, context);
    if (input.kind === "enter") return clipFinish(state, state.points, context);
    return clipStep(state, context);
  },
};

// ---------------------------------------------------------------------------
// IMAGEADJUST
// ---------------------------------------------------------------------------

const BRIGHTNESS_KEYWORD = { keyword: "Brillo", shortcut: "B" } as const;
const CONTRAST_KEYWORD = { keyword: "Contraste", shortcut: "C" } as const;
const FADE_KEYWORD = { keyword: "Atenuación", shortcut: "A" } as const;
const RESET_KEYWORD = { keyword: "Restablecer", shortcut: "R" } as const;
const DONE_KEYWORD = { keyword: "Listo", shortcut: "L" } as const;

type AdjustField = "brightness" | "contrast" | "fade";

interface AdjustState {
  phase: "target" | "options" | "value";
  targetId: string | null;
  pending: AdjustField | null;
  brightness: number;
  contrast: number;
  fade: number;
}

const ADJUST_EMPTY: AdjustState = { phase: "target", targetId: null, pending: null, brightness: CAD_IMAGE_BRIGHTNESS_NEUTRAL, contrast: CAD_IMAGE_CONTRAST_NEUTRAL, fade: CAD_IMAGE_FADE_NONE };
const FIELD_LABEL: Record<AdjustField, string> = { brightness: "el brillo", contrast: "el contraste", fade: "la atenuación" };

/** El estado de opciones para una imagen: sus valores actuales, o los neutros. */
function adjustOptionsFor(entity: CadImageEntity): AdjustState {
  return {
    ...ADJUST_EMPTY,
    targetId: entity.id,
    phase: "options",
    brightness: entity.brightness ?? CAD_IMAGE_BRIGHTNESS_NEUTRAL,
    contrast: entity.contrast ?? CAD_IMAGE_CONTRAST_NEUTRAL,
    fade: entity.fade ?? CAD_IMAGE_FADE_NONE,
  };
}

function adjustStep(state: AdjustState): CadCommandStep<AdjustState> {
  if (state.phase === "target") return { state, prompt: { message: "Designe la imagen que ajustar", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION };
  if (state.phase === "value")
    return { state, prompt: { message: `Precise ${FIELD_LABEL[state.pending!]} (0 a 100)`, options: [], defaultValue: String(state[state.pending!]) }, accepts: CAD_ACCEPT_DISTANCE };
  return {
    state,
    prompt: {
      message: `Brillo ${state.brightness} · Contraste ${state.contrast} · Atenuación ${state.fade}. Indique el ajuste`,
      options: [BRIGHTNESS_KEYWORD, CONTRAST_KEYWORD, FADE_KEYWORD, RESET_KEYWORD, DONE_KEYWORD],
      defaultOption: DONE_KEYWORD.keyword,
    },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

function adjustFinish(state: AdjustState, context: CadCommandContext): CadCommandStep<AdjustState> {
  const entity = context.entity?.(state.targetId ?? "");
  if (!entity || entity.type !== "image") return say(state, "IMAGEADJUST: la imagen ya no existe.");
  const current = { brightness: entity.brightness ?? CAD_IMAGE_BRIGHTNESS_NEUTRAL, contrast: entity.contrast ?? CAD_IMAGE_CONTRAST_NEUTRAL, fade: entity.fade ?? CAD_IMAGE_FADE_NONE };
  if (current.brightness === state.brightness && current.contrast === state.contrast && current.fade === state.fade)
    return say(state, `IMAGEADJUST: «${imageNameOf(entity, context)}» queda como estaba (brillo ${state.brightness}, contraste ${state.contrast}, atenuación ${state.fade}).`);
  const next: CadImageEntity = { ...entity, brightness: state.brightness, contrast: state.contrast, fade: state.fade };
  return written(state, [replaceImage(next)], "IMAGEADJUST", `IMAGEADJUST: «${imageNameOf(entity, context)}» brillo ${state.brightness}, contraste ${state.contrast}, atenuación ${state.fade}.`);
}

const imageAdjustCommand: CadCommandDescriptor<AdjustState> = {
  name: "IMAGEADJUST",
  aliases: ["IAD"],
  kind: "modify",
  transparent: false,
  selection: "command-first",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => {
    const preselected = preselectedImage(context);
    return preselected ? adjustStep(adjustOptionsFor(preselected)) : adjustStep(ADJUST_EMPTY);
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return say(state, "IMAGEADJUST cancelado. El dibujo no ha cambiado.");
    if (state.phase === "target") {
      if (input.kind === "enter") {
        const preselected = preselectedImage(context);
        return preselected ? adjustStep(adjustOptionsFor(preselected)) : say(state, "IMAGEADJUST necesita una imagen designada.");
      }
      const picked = pickImage(input, context);
      if (!picked) return adjustStep(state);
      if ("reason" in picked) return say(state, `IMAGEADJUST: ${picked.reason}`);
      return adjustStep(adjustOptionsFor(picked.entity));
    }
    if (state.phase === "value") {
      if (input.kind === "enter") return adjustStep({ ...state, phase: "options", pending: null });
      if (input.kind !== "distance") return adjustStep(state);
      const value = Math.round(Math.min(100, Math.max(0, input.value)));
      return adjustStep({ ...state, [state.pending!]: value, phase: "options", pending: null });
    }
    if (input.kind === "enter") return adjustFinish(state, context);
    if (input.kind !== "keyword") return adjustStep(state);
    if (input.keyword === BRIGHTNESS_KEYWORD.keyword) return adjustStep({ ...state, phase: "value", pending: "brightness" });
    if (input.keyword === CONTRAST_KEYWORD.keyword) return adjustStep({ ...state, phase: "value", pending: "contrast" });
    if (input.keyword === FADE_KEYWORD.keyword) return adjustStep({ ...state, phase: "value", pending: "fade" });
    if (input.keyword === RESET_KEYWORD.keyword) return adjustStep({ ...state, brightness: CAD_IMAGE_BRIGHTNESS_NEUTRAL, contrast: CAD_IMAGE_CONTRAST_NEUTRAL, fade: CAD_IMAGE_FADE_NONE });
    return adjustFinish(state, context);
  },
};

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "");
}

export const CAD_RASTER_IMAGE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(imageAttachCommand),
  asCadCommand(imageClipCommand),
  asCadCommand(imageAdjustCommand),
];
