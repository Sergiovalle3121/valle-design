/**
 * VECTORIZE: el escaneo se convierte en trazos del dibujo (Ola I, 2026-09-04).
 *
 * Medido antes (`distancia-autocad-completo-20260903.md`, §4 4º RASTER): la
 * fila `toolset-raster.vectorizacion` estaba en ⬜ con la evidencia «No hay
 * vectorización», y no existía ningún VECTORIZE en los doscientos archivos de
 * `engine/commands/`. Con la Ola H el plano escaneado ya entraba, se recortaba
 * y se atenuaba; calcarlo seguía siendo trabajo a mano.
 *
 * El comando designa una IMAGE **ya adjunta** —no abre archivos: para eso está
 * IMAGEATTACH, que ya mete la imagen DENTRO del dibujo como `data:`—, la
 * decodifica en el motor (`raster-decode.ts`), la vectoriza
 * (`raster-vectorize.ts`) y coloca cada trazo con la escala y el giro que la
 * propia imagen lleva en `uVector`/`vVector`. Así el calco cae encima del
 * escaneo esté como esté puesto, sin repetir la colocación en ningún sitio.
 *
 * ## Enseña el plan y sólo escribe al confirmar, como MAPIMPORT
 *
 * Vectorizar un escaneo sucio puede soltar miles de polilíneas. El plan dice
 * ANTES de tocar el dibujo con qué umbral se separó la tinta, cuántas manchas
 * se descartaron y con cuántos píxeles, con qué tolerancia se ajustó y cuántos
 * trazos salen. Tres opciones —Tolerancia, Mancha y Umbral— rehacen el plan
 * sin escribir, que es como se afina un escaneo de verdad: mirando el número
 * de trazos, no adivinando.
 *
 * ## Todavía no, dicho en el propio aviso
 *
 * Arcos, círculos y sombreados. Todo sale como polilínea de tramos rectos; una
 * zona maciza sale como su contorno y no como HATCH; las letras salen como
 * trazos y no como TEXT. Va escrito en el plan y en el aviso que queda
 * registrado, para que nadie lo descubra midiendo.
 */
import type { CadLayerDef } from "../../cad-document";
import type { CadImageEntity } from "../../cad-entities-v4";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadNativeEntity } from "../../entity-runtime";
import { cadImagePixelToWorld, cadImageFileName, cadImageUnitsPerPixel } from "../../image-geometry";
import { cadRasterDecodeDataUri, isCadRasterDecodeError, type CadRasterImage } from "../../raster-decode";
import { cadRasterVectorize, type CadRasterVectorizeOptions, type CadRasterVectorizeResult } from "../../raster-vectorize";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_SELECTION,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandInput,
  type CadCommandStep,
} from "../command-types";

const YES_KEYWORD = { keyword: "Sí", shortcut: "S" } as const;
const NO_KEYWORD = { keyword: "No", shortcut: "N" } as const;
const TOLERANCE_KEYWORD = { keyword: "Tolerancia", shortcut: "T" } as const;
const BLOB_KEYWORD = { keyword: "Mancha", shortcut: "M" } as const;
const THRESHOLD_KEYWORD = { keyword: "Umbral", shortcut: "U" } as const;

/** Color de la capa del calco: distinto del escaneo, para apagarlo de un golpe. */
const VECTORIZE_LAYER_COLOR = "#f59e0b";

export interface CadVectorizePlan {
  imageId: string;
  imageName: string;
  layer: string;
  commands: CadEntityCommand[];
  strokeCount: number;
  result: CadRasterVectorizeResult;
  /** Lo que se enseña antes de escribir: una línea por hecho. */
  lines: string[];
  /** Lo que se registra al aplicar. */
  notice: string;
}

interface VectorizeState {
  phase: "target" | "confirm" | "value";
  image: CadImageEntity | null;
  name: string;
  pixels: CadRasterImage | null;
  options: CadRasterVectorizeOptions;
  pending: "tolerance" | "blob" | "threshold" | null;
  plan: CadVectorizePlan | null;
}

const EMPTY: VectorizeState = { phase: "target", image: null, name: "", pixels: null, options: {}, pending: null, plan: null };

function say(state: VectorizeState, text: string): CadCommandStep<VectorizeState> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text } };
}

/**
 * El plan: decodificar ya está hecho, aquí sólo se vectoriza y se coloca. Se
 * separa del paso del comando para que cambiar una opción NO vuelva a inflar
 * el PNG entero, que en un A1 escaneado son varios megas.
 */
export function planCadVectorize(
  image: CadImageEntity,
  imageName: string,
  pixels: CadRasterImage,
  options: CadRasterVectorizeOptions,
  context: CadCommandContext,
): CadVectorizePlan {
  const result = cadRasterVectorize(pixels, options);
  const layer = layerNameFor(imageName);
  const commands: CadEntityCommand[] = [];
  const existing = context.layers?.() ?? [];
  if (!existing.some((candidate) => candidate.name.toUpperCase() === layer || candidate.id.toUpperCase() === layer))
    commands.push({ type: "layer", op: "upsert", layer: { id: layer, name: layer, color: VECTORIZE_LAYER_COLOR, visible: true, locked: false } as CadLayerDef });
  const metadata = {
    origen: "VECTORIZE",
    imagen: imageName,
    umbral: result.threshold,
    tolerancia: result.tolerancePx,
  };
  for (const stroke of result.strokes) {
    const vertices = stroke.points.map((point) => {
      const world = cadImagePixelToWorld(image, point.x, point.y);
      return { x: world.x, y: world.y, z: 0 };
    });
    commands.push({
      type: "insert",
      entity: {
        id: context.newEntityId(),
        type: "polyline",
        vertices,
        closed: stroke.closed,
        layer,
        context: { metadata },
      } as CadNativeEntity,
    });
  }

  const unit = context.unit ?? "mm";
  const unitsPerPixel = cadImageUnitsPerPixel(image);
  const despeckle =
    result.removedBlobs > 0
      ? `${result.removedBlobs} mancha(s) de menos de ${result.minBlobPixels} px fuera (${result.removedPixels} píxel(es) descartados)`
      : `ninguna mancha por debajo de ${result.minBlobPixels} px que descartar`;
  const lines = [
    `«${imageName}»: ${pixels.width} × ${pixels.height} px (${pixels.description})`,
    `  · umbral ${result.threshold}${result.thresholdAuto ? " (Otsu, automático)" : " (fijado a mano)"}: ${result.inkPixels} píxel(es) de tinta`,
    `  · despeckle: ${despeckle}`,
    `  · esqueleto de ${result.skeletonPixels} px → ${result.strokes.length} trazo(s), ajustados con tolerancia ${formatNumber(result.tolerancePx)} px`,
    `  · a la capa ${layer}; 1 px = ${formatNumber(unitsPerPixel)} ${unit}`,
    ...result.notYet.map((line) => `  · todavía no: ${line}`),
  ];
  const notice =
    `VECTORIZE: ${result.strokes.length} polilínea(s) de «${imageName}» en la capa ${layer}; umbral ${result.threshold}` +
    `${result.thresholdAuto ? " (Otsu)" : ""}, ${result.removedBlobs} mancha(s) descartada(s) (${result.removedPixels} px), tolerancia ` +
    `${formatNumber(result.tolerancePx)} px. Todavía no: arcos, círculos, sombreados ni texto — todo sale como polilínea de tramos rectos.`;

  return { imageId: image.id, imageName, layer, commands, strokeCount: result.strokes.length, result, lines, notice };
}

function confirmStep(state: VectorizeState): CadCommandStep<VectorizeState> {
  const plan = state.plan!;
  return {
    state,
    prompt: {
      message: `${plan.lines.join("\n")}\n¿Vectorizar?`,
      options: [YES_KEYWORD, NO_KEYWORD, TOLERANCE_KEYWORD, BLOB_KEYWORD, THRESHOLD_KEYWORD],
      defaultOption: YES_KEYWORD.keyword,
    },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

function valueStep(state: VectorizeState): CadCommandStep<VectorizeState> {
  const message =
    state.pending === "tolerance"
      ? "Precise la tolerancia de ajuste, en píxeles del escaneo"
      : state.pending === "blob"
        ? "Precise el área mínima de mancha, en píxeles (por debajo es polvo)"
        : "Precise el umbral de tinta, de 0 a 255 (0 devuelve el automático de Otsu)";
  const value =
    state.pending === "tolerance"
      ? formatNumber(state.plan!.result.tolerancePx)
      : state.pending === "blob"
        ? String(state.plan!.result.minBlobPixels)
        : String(state.plan!.result.thresholdAuto ? 0 : state.plan!.result.threshold);
  return { state, prompt: { message, options: [], defaultValue: value }, accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_KEYWORD };
}

const targetStep: CadCommandStep<VectorizeState> = {
  state: EMPTY,
  prompt: { message: "Designe la imagen que vectorizar", options: [] },
  accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
};

/** La imagen designada, o el motivo por el que no vale. */
function pickImage(input: CadCommandInput, context: CadCommandContext): { entity: CadImageEntity } | { reason: string } | null {
  const id = input.kind === "entityPick" ? input.entityId : input.kind === "selection" ? input.entityIds[0] : null;
  if (!id) return null;
  const entity = context.entity?.(id);
  if (!entity) return { reason: `${id} ya no existe.` };
  if (entity.type !== "image") return { reason: `se designó ${entity.type.toUpperCase()}; hace falta una IMAGE adjunta con IMAGEATTACH.` };
  return { entity };
}

/** La que ya estaba designada al teclear la orden, si es UNA y es una IMAGE. */
function preselectedImage(context: CadCommandContext): CadImageEntity | null {
  if (context.selection.length !== 1) return null;
  const entity = context.entity?.(context.selection[0]);
  return entity && entity.type === "image" ? entity : null;
}

/** Decodifica y planifica; devuelve el paso a enseñar (plan o motivo). */
function beginWith(entity: CadImageEntity, context: CadCommandContext, options: CadRasterVectorizeOptions): CadCommandStep<VectorizeState> {
  const definition = context.document?.()?.imageDefinitions?.find((candidate) => candidate.id === entity.definition);
  if (!definition) return say(EMPTY, `VECTORIZE: la imagen designada apunta a la definición «${entity.definition}», que el dibujo no tiene. Vuelve a adjuntarla con IMAGEATTACH.`);
  const name = cadImageFileName(definition);
  let pixels: CadRasterImage;
  try {
    pixels = cadRasterDecodeDataUri(definition.uri);
  } catch (error) {
    const detail = isCadRasterDecodeError(error) ? error.message : error instanceof Error ? error.message : String(error);
    return say(EMPTY, `VECTORIZE: «${name}» no se pudo leer. ${detail}`);
  }
  const plan = planCadVectorize(entity, name, pixels, options, context);
  const state: VectorizeState = { phase: "confirm", image: entity, name, pixels, options, pending: null, plan };
  return confirmStep(state);
}

/** Rehace el plan con las opciones nuevas, sin volver a inflar el archivo. */
function replan(state: VectorizeState, context: CadCommandContext, options: CadRasterVectorizeOptions): CadCommandStep<VectorizeState> {
  const plan = planCadVectorize(state.image!, state.name, state.pixels!, options, context);
  return confirmStep({ ...state, phase: "confirm", pending: null, options, plan });
}

const vectorizeCommand: CadCommandDescriptor<VectorizeState> = {
  name: "VECTORIZE",
  aliases: ["VECTORIZAR", "VEC"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: () => targetStep,
  step: (state, input, context) => {
    if (input.kind === "cancel") return say(state, "VECTORIZE cancelado. El dibujo no ha cambiado.");

    if (state.phase === "target") {
      if (input.kind === "enter") {
        const preselected = preselectedImage(context);
        return preselected ? beginWith(preselected, context, state.options) : say(state, "VECTORIZE necesita una imagen designada. Adjunta el escaneo con IMAGEATTACH y vuelve a intentarlo.");
      }
      const picked = pickImage(input, context);
      if (!picked) return targetStep;
      if ("reason" in picked) return say(state, `VECTORIZE: ${picked.reason}`);
      return beginWith(picked.entity, context, state.options);
    }

    if (state.phase === "value") {
      if (input.kind !== "distance") return confirmStep({ ...state, phase: "confirm", pending: null });
      const value = input.value;
      if (state.pending === "tolerance") {
        if (!(value >= 0)) return say(state, "VECTORIZE: la tolerancia no puede ser negativa.");
        return replan(state, context, { ...state.options, tolerancePx: value });
      }
      if (state.pending === "blob") {
        if (!(value >= 1)) return say(state, "VECTORIZE: el área mínima de mancha es de un píxel para arriba.");
        return replan(state, context, { ...state.options, minBlobPixels: Math.round(value) });
      }
      // Umbral 0 significa «vuelve al automático»: es el único valor que no
      // puede querer decir otra cosa, porque a 0 nada sería tinta.
      const threshold = Math.round(Math.min(255, Math.max(0, value)));
      const next = { ...state.options };
      if (threshold === 0) delete next.threshold;
      else next.threshold = threshold;
      return replan(state, context, next);
    }

    if (input.kind !== "keyword" && input.kind !== "enter") return confirmStep(state);
    const keyword = input.kind === "keyword" ? input.keyword : YES_KEYWORD.keyword;
    if (keyword === NO_KEYWORD.keyword) return say(state, "VECTORIZE cancelado. El dibujo no ha cambiado.");
    if (keyword === TOLERANCE_KEYWORD.keyword) return valueStep({ ...state, phase: "value", pending: "tolerance" });
    if (keyword === BLOB_KEYWORD.keyword) return valueStep({ ...state, phase: "value", pending: "blob" });
    if (keyword === THRESHOLD_KEYWORD.keyword) return valueStep({ ...state, phase: "value", pending: "threshold" });

    const plan = state.plan!;
    if (plan.strokeCount === 0)
      return say(
        state,
        `VECTORIZE: «${plan.imageName}» no dejó ni un trazo con este umbral (${plan.result.threshold}) y esta área mínima (${plan.result.minBlobPixels} px). ` +
          "El dibujo no ha cambiado; prueba con Umbral o con Mancha.",
      );
    return {
      state,
      prompt: { message: "", options: [] },
      accepts: 0,
      result: { kind: "document", commands: plan.commands, label: `VECTORIZE (${plan.strokeCount} polilíneas)`, notice: plan.notice },
    };
  },
};

/** `VECTORIZADO-PLANO` para «plano.png»: la capa dice de dónde salió el calco. */
export function layerNameFor(imageName: string): string {
  const base = imageName
    .replace(/\.[^.]+$/, "")
    .toUpperCase()
    .replace(/[^A-Z0-9ÁÉÍÓÚÑ_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/, "");
  return base ? `VECTORIZADO-${base}` : "VECTORIZADO";
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

export const CAD_VECTORIZE_RASTER_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(vectorizeCommand)];
