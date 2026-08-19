/**
 * Ventanas gráficas: MVIEW, escala bloqueable y congelado de capas por ventana.
 *
 * ## Lo que hace que una presentación sirva de verdad
 *
 * Una ventana no es un recorte: es una vista del modelo **a una escala
 * concreta**, con **su propia visibilidad de capas**. Sin lo primero, el plano
 * no se puede acotar en papel; sin lo segundo, hace falta un dibujo distinto
 * por cada disciplina en vez de una hoja por cada una sobre el mismo modelo.
 *
 * `cad-layout-manager.ts` ya sabía crear, duplicar y borrar ventanas y ya
 * modelaba `layerVisibility` por ventana. Lo que faltaba es lo de aquí: fijar
 * y BLOQUEAR la escala, apagar la ventana entera, y las dos formas de MVIEW
 * que no son un rectángulo — poligonal y a partir de un objeto.
 *
 * ## Dos convenciones que conviene conocer
 *
 * **Ventana apagada.** `MVIEW OFF` no borra la ventana: la deja sin dibujar,
 * conservando su encuadre y sus capas para volver a encenderla. Se modela con
 * la clave reservada `"*"` dentro de `layerVisibility`, que es el único
 * bolsillo por ventana que el esquema ofrece. Un id de capa nunca vale `"*"`,
 * así que no colisiona con ninguna capa real, y la publicación pregunta por
 * `cadViewportIsOn` antes de dibujar.
 *
 * **Recorte no rectangular.** El contorno de una ventana poligonal es una
 * POLILÍNEA del documento marcada con `context.metadata.viewportClipFor`. Es
 * el mismo mecanismo con el que una matriz asociativa recuerda de qué matriz
 * viene cada copia: geometría real, editable con grips, y localizable con una
 * consulta. La ventana guarda además el rectángulo envolvente, que es lo que
 * el esquema sabe guardar y lo que basta para colocarla.
 */
import type {
  CadDocument,
  CadEntity,
  CadPaperSpace,
  CadPaperViewport,
  CadPoint2,
  CadViewportView,
} from "../cad-document";
import { CAD_VIEWPORT_PLAN_VIEW } from "../cad-paper-viewport";
import type { CadEntityCommand } from "../entity-commands";
import type { CadNativeEntity } from "../entity-runtime";
import { CAD_SHEET_SCALES } from "../paper-space";
import {
  cadPrintableBounds,
  normalizeCadViewportPaperBounds,
  updateCadPaperViewport,
} from "../cad-layout-manager";

/** Clave reservada de `layerVisibility` que apaga la ventana entera. */
export const CAD_VIEWPORT_ON_KEY = "*";

/** Clave de metadatos que ata una polilínea de recorte a su ventana. */
export const CAD_VIEWPORT_CLIP_METADATA = "viewportClipFor";

export function cadViewportIsOn(viewport: CadPaperViewport): boolean {
  return viewport.layerVisibility?.[CAD_VIEWPORT_ON_KEY] !== false;
}

export function setCadViewportOn(
  space: CadPaperSpace,
  viewportId: string,
  on: boolean,
): CadPaperSpace {
  return updateCadPaperViewport(space, viewportId, (viewport) => {
    const visibility = { ...(viewport.layerVisibility ?? {}) };
    // Encendida es el estado normal: se BORRA la clave en vez de escribir
    // `true`, para que un documento que nunca apagó una ventana serialice
    // exactamente igual que antes y su hash no cambie.
    if (on) delete visibility[CAD_VIEWPORT_ON_KEY];
    else visibility[CAD_VIEWPORT_ON_KEY] = false;
    const empty = Object.keys(visibility).length === 0;
    const next = { ...viewport };
    if (empty) delete next.layerVisibility;
    else next.layerVisibility = visibility;
    return next;
  });
}

/** Ventanas que sí se dibujan. La publicación y la vista previa filtran con esto. */
export function activeCadViewports(space: CadPaperSpace): CadPaperViewport[] {
  return (space.viewports ?? []).filter(cadViewportIsOn);
}

// ---------------------------------------------------------------------------
// Escala bloqueable
// ---------------------------------------------------------------------------

/** Escalas normalizadas que ofrece el desplegable: 1:1, 1:2, 1:5, 1:10… */
export const CAD_VIEWPORT_STANDARD_SCALES = CAD_SHEET_SCALES;

export interface CadViewportScaleInput {
  /** Denominador de 1:n. `50` es 1:50. */
  denominator: number;
  /** Bloquea la escala tras fijarla. Es lo que impide que la rueda la mueva. */
  lock?: boolean;
  /**
   * Iguala la escala de anotación a la de la ventana. Es lo correcto salvo que
   * se esté haciendo algo deliberadamente raro, y por eso viene encendido.
   */
  matchAnnotationScale?: boolean;
}

export function setCadViewportScale(
  space: CadPaperSpace,
  viewportId: string,
  input: CadViewportScaleInput,
): CadPaperSpace {
  const denominator = input.denominator;
  if (!(denominator > 0) || !Number.isFinite(denominator)) return space;
  return updateCadPaperViewport(space, viewportId, (viewport) => ({
    ...viewport,
    scale: denominator,
    ...(input.matchAnnotationScale === false ? {} : { annotationScale: denominator }),
    locked: input.lock ?? viewport.locked,
  }));
}

export function setCadViewportLocked(
  space: CadPaperSpace,
  viewportId: string,
  locked: boolean,
): CadPaperSpace {
  return updateCadPaperViewport(space, viewportId, (viewport) => ({ ...viewport, locked }));
}

/**
 * Escala normalizada más cercana por encima de la mínima que hace falta.
 *
 * Se sube, nunca se baja: elegir la inmediatamente inferior dejaría el dibujo
 * fuera de la ventana, que es peor que dejarlo un poco pequeño.
 */
export function nearestCadViewportScale(minimum: number): number {
  return (
    CAD_VIEWPORT_STANDARD_SCALES.find((scale) => scale >= minimum) ??
    CAD_VIEWPORT_STANDARD_SCALES[CAD_VIEWPORT_STANDARD_SCALES.length - 1]
  );
}

// ---------------------------------------------------------------------------
// Congelado de capas por ventana
// ---------------------------------------------------------------------------

/**
 * Congela o descongela una capa SÓLO en esta ventana.
 *
 * Es lo que permite que la misma planta salga en dos ventanas de la misma
 * hoja, una con instalaciones y otra sin ellas. La paleta de capas ya escribe
 * `layerVisibility`; esto es la misma escritura desde un comando, con el
 * guardia que la paleta no puede tener: `"*"` está reservado.
 */
export function freezeCadLayerInViewport(
  space: CadPaperSpace,
  viewportId: string,
  layerIds: readonly string[],
  frozen: boolean,
): CadPaperSpace {
  const targets = layerIds.filter((layerId) => layerId && layerId !== CAD_VIEWPORT_ON_KEY);
  if (targets.length === 0) return space;
  return updateCadPaperViewport(space, viewportId, (viewport) => {
    const visibility = { ...(viewport.layerVisibility ?? {}) };
    for (const layerId of targets) {
      // Descongelar BORRA la anulación en vez de escribir `true`: así la capa
      // vuelve a heredar del documento, que es distinto de forzarla visible
      // cuando la capa está apagada globalmente.
      if (frozen) visibility[layerId] = false;
      else delete visibility[layerId];
    }
    const next = { ...viewport };
    if (Object.keys(visibility).length === 0) delete next.layerVisibility;
    else next.layerVisibility = visibility;
    return next;
  });
}

/** `true` si la capa se ve en esta ventana, contando lo global y lo de ventana. */
export function cadLayerVisibleInViewport(
  document: CadDocument,
  viewport: CadPaperViewport,
  layerId: string,
): boolean {
  const override = viewport.layerVisibility?.[layerId];
  if (override !== undefined) return override;
  return document.layers.find((layer) => layer.id === layerId)?.visible ?? true;
}

// ---------------------------------------------------------------------------
// MVIEW
// ---------------------------------------------------------------------------

function boundsOfPoints(points: readonly CadPoint2[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

export interface CadViewportCreateInput {
  space: CadPaperSpace;
  id: string;
  name?: string;
  /** Rectángulo en PAPEL, en milímetros. */
  paperBounds: { x: number; y: number; width: number; height: number };
  /** Trozo del modelo que se ve, en unidades de dibujo. */
  modelBounds: { x: number; y: number; width: number; height: number };
  scale?: number;
  lock?: boolean;
  /** Cámara de la ventana. Sin ella, planta: lo que MVIEW siempre significó. */
  view?: CadViewportView;
}

/**
 * Ventana rectangular — `MVIEW` a secas, dos esquinas sobre el papel.
 *
 * La escala sale de encajar el modelo en el rectángulo y subir a la escala
 * normalizada siguiente, salvo que se pida una explícita.
 */
export function createCadRectangularViewport(input: CadViewportCreateInput): CadPaperViewport {
  const paperBounds = normalizeCadViewportPaperBounds(input.space, input.paperBounds);
  const scale =
    input.scale ??
    nearestCadViewportScale(
      Math.max(
        (input.modelBounds.width || 1) / Math.max(1, paperBounds.width),
        (input.modelBounds.height || 1) / Math.max(1, paperBounds.height),
      ),
    );
  return {
    id: input.id,
    name: input.name ?? `Ventana ${(input.space.viewports?.length ?? 0) + 1}`,
    paperBounds,
    modelBounds: { ...input.modelBounds },
    scale,
    annotationScale: scale,
    locked: input.lock ?? false,
    // MVIEW crea ventanas de PLANTA, y desde el esquema 8 lo dice en vez de
    // dejarlo implícito. `view` lo sobreescribe quien crea otra cosa —SOLVIEW
    // fabrica alzados y cortes por esta misma puerta—, y así el invariante «no
    // hay ventana que no declare desde dónde mira» vale también para las
    // recién creadas, sin esperar a que el documento pase por el disco.
    view: input.view ? { ...input.view } : { ...CAD_VIEWPORT_PLAN_VIEW },
  };
}

export interface CadPolygonalViewportResult {
  viewport: CadPaperViewport;
  /** Polilínea de recorte que hay que dar de alta en el documento. */
  clip: CadNativeEntity;
  /** Órdenes listas: la polilínea, su marca y la hoja actualizada. */
  commands: CadEntityCommand[];
}

export interface CadPolygonalViewportInput {
  space: CadPaperSpace;
  id: string;
  clipEntityId: string;
  /** Contorno en PAPEL, en milímetros. Tres vértices como mínimo. */
  boundary: readonly CadPoint2[];
  modelBounds: { x: number; y: number; width: number; height: number };
  layer: string;
  name?: string;
  scale?: number;
  lock?: boolean;
}

/**
 * `MVIEW Poligonal`: una ventana con contorno libre.
 *
 * Devuelve TRES cosas porque son tres escrituras que tienen que ir en el mismo
 * lote: la polilínea del contorno, la marca que la ata a la ventana, y la hoja
 * con la ventana dentro. Separarlas dejaría documentos a medias —un contorno
 * sin ventana, o una ventana que dice tener recorte y no lo tiene— cada vez
 * que algo fallase entre medias.
 */
export function createCadPolygonalViewport(
  input: CadPolygonalViewportInput,
): CadPolygonalViewportResult | null {
  if (input.boundary.length < 3) return null;
  const bounds = boundsOfPoints(input.boundary);
  const viewport = createCadRectangularViewport({
    space: input.space,
    id: input.id,
    name: input.name ?? "Ventana poligonal",
    paperBounds: {
      x: bounds.minX,
      y: bounds.minY,
      width: bounds.maxX - bounds.minX,
      height: bounds.maxY - bounds.minY,
    },
    modelBounds: input.modelBounds,
    ...(input.scale !== undefined ? { scale: input.scale } : {}),
    ...(input.lock !== undefined ? { lock: input.lock } : {}),
  });
  const clip: CadNativeEntity = {
    id: input.clipEntityId,
    type: "polyline",
    layer: input.layer,
    closed: true,
    vertices: input.boundary.map((point) => ({ x: point.x, y: point.y, z: 0 })),
    context: { metadata: { [CAD_VIEWPORT_CLIP_METADATA]: viewport.id } },
  };
  const space: CadPaperSpace = {
    ...input.space,
    entityIds: [...input.space.entityIds, clip.id],
    viewports: [...(input.space.viewports ?? []), viewport],
  };
  return {
    viewport,
    clip,
    commands: [
      { type: "insert", entity: clip },
      { type: "paper-space", op: "upsert", space },
    ],
  };
}

/** Contorno de recorte de una ventana, si lo tiene. */
export function cadViewportClipEntity(
  document: CadDocument,
  viewportId: string,
): CadEntity | undefined {
  return document.entities.find(
    (entity) => entity.context?.metadata?.[CAD_VIEWPORT_CLIP_METADATA] === viewportId,
  );
}

/**
 * `MVIEW Objeto`: convierte una polilínea cerrada o un círculo YA DIBUJADO en
 * el contorno de una ventana.
 *
 * Devuelve el contorno como lista de puntos; el círculo se teseliza porque una
 * ventana circular con 64 lados es indistinguible a cualquier escala de
 * trazado y evita un caso especial en todo lo que viene después.
 */
export function cadBoundaryFromEntity(entity: CadEntity): CadPoint2[] | null {
  if (entity.type === "polyline" && entity.vertices.length >= 3)
    return entity.vertices.map((vertex) => ({ x: vertex.x, y: vertex.y }));
  if (entity.type === "circle") {
    const segments = 64;
    return Array.from({ length: segments }, (_unused, index) => {
      const angle = (index / segments) * Math.PI * 2;
      return {
        x: entity.center.x + Math.cos(angle) * entity.radius,
        y: entity.center.y + Math.sin(angle) * entity.radius,
      };
    });
  }
  return null;
}

/** Identificador determinista de la ventana n-ésima de una presentación. */
export function cadViewportId(space: CadPaperSpace): string {
  const used = new Set((space.viewports ?? []).map((viewport) => viewport.id));
  for (let index = (space.viewports?.length ?? 0) + 1; index < 10_000; index += 1) {
    const candidate = `${space.id}:viewport:${index}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${space.id}:viewport:${used.size + 1}`;
}

/**
 * Reparte `count` ventanas por la zona imprimible en una rejilla equilibrada.
 *
 * Es lo que hace `MVIEW 2`, `MVIEW 3` y `MVIEW 4` de AutoCAD, y ahorra colocar
 * a mano cuatro rectángulos que además quedan desalineados.
 */
export function tileCadViewportBounds(
  space: CadPaperSpace,
  count: number,
  gap = 4,
): Array<{ x: number; y: number; width: number; height: number }> {
  const printable = cadPrintableBounds(space);
  const columns = Math.ceil(Math.sqrt(Math.max(1, count)));
  const rows = Math.ceil(Math.max(1, count) / columns);
  const width = (printable.width - gap * (columns - 1)) / columns;
  const height = (printable.height - gap * (rows - 1)) / rows;
  return Array.from({ length: Math.max(1, count) }, (_unused, index) => ({
    x: printable.x + (index % columns) * (width + gap),
    y: printable.y + Math.floor(index / columns) * (height + gap),
    width,
    height,
  }));
}
