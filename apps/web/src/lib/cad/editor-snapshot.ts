/**
 * Adaptador snapshot del editor ↔ CadDocument (CAD-NEXT-011 pieza 2).
 *
 * El undo/redo del editor captura un snapshot ad-hoc (colocaciones de
 * estación, assets, anotaciones, conectores, capas asignadas y tags). Este
 * módulo lo expresa como el `CadDocument` canónico y lo reconstruye SIN
 * pérdida, de modo que la pila de undo puede almacenar documentos canónicos:
 * el primer sistema del editor cuya fuente de verdad es el documento.
 *
 * Convenciones de mapeo (invertibles):
 *  - Asset → entidad `box`; su capa asignada viaja en `box.layer` (ausente =
 *    `DEFAULT_LAYER_ID`, que NO es una capa del editor, así no colisiona) y
 *    sus tags como arreglo (`splitTags`/`joinTags` normalizan "a,b" ↔ "a, b").
 *  - Colocación de estación → entidad `station` (capa asignada / tags igual;
 *    ausente = `STATIONS_LAYER`).
 *  - Anotación text/dim → entidad `text`/`dimension`; capa asignada en
 *    `entity.layer` (ausente = "Text"/"Measurements").
 *  - Conector → entidad `connector` (id determinista `conn:from->to`).
 *
 * Puro (sin three/DOM): el spec prueba el golden round-trip completo.
 */

import {
  DEFAULT_LAYER_ID,
  layoutToCadDocument,
  STATIONS_LAYER,
  type CadDocument,
  type LayoutAnnotationInput,
  type LayoutAssetInput,
  type LayoutStationPlacementInput,
} from "./cad-document";

export interface CadEditorPlacement {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}
export interface CadEditorAsset {
  id: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  label?: string;
  shape?: "rect" | "circle";
}
export interface CadEditorAnnotation {
  id: string;
  type: "text" | "dim";
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  text?: string;
  color?: string;
}
export interface CadEditorConnector {
  from: string;
  to: string;
  kind?: string;
}
/**
 * Forma estructural del snapshot de undo del editor. `L` es el tipo de id de
 * capa del editor (unión literal); el adaptador lo conserva tal cual.
 */
export interface CadEditorSnapshot<L extends string = string> {
  placements: [string, CadEditorPlacement][];
  assets: CadEditorAsset[];
  annotations: CadEditorAnnotation[];
  connectors: CadEditorConnector[];
  layers: Record<string, L>;
  tags: Record<string, string>;
}

const TEXT_LAYER = "Text";
const DIM_LAYER = "Measurements";

/** "a, b,c" → ["a","b","c"] (sin vacíos). */
export function splitTags(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
}
/** ["a","b"] → "a, b" (la forma que escribe el propio editor). */
export function joinTags(tags: string[]): string {
  return tags.join(", ");
}

/** Snapshot del editor → documento canónico (versión 1, sin historial). */
export function editorSnapshotToCadDocument(
  snap: CadEditorSnapshot,
  options: { unit?: string } = {},
): CadDocument {
  const assets: LayoutAssetInput[] = snap.assets.map((a) => {
    const asset: LayoutAssetInput = {
      id: a.id,
      kind: a.kind,
      x: a.x,
      y: a.y,
      w: a.w,
      h: a.h,
      rotation: a.rotation,
    };
    if (a.label !== undefined) asset.label = a.label;
    if (a.shape !== undefined) asset.shape = a.shape;
    const layer = snap.layers[a.id];
    if (layer !== undefined) asset.layer = layer;
    const tags = splitTags(snap.tags[a.id]);
    if (tags.length) asset.tags = tags;
    return asset;
  });

  const stations: LayoutStationPlacementInput[] = snap.placements.map(([id, p]) => {
    const station: LayoutStationPlacementInput = {
      id,
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      rotation: p.rotation,
    };
    const layer = snap.layers[id];
    if (layer !== undefined) station.layer = layer;
    const tags = splitTags(snap.tags[id]);
    if (tags.length) station.tags = tags;
    return station;
  });

  const annotations: LayoutAnnotationInput[] = snap.annotations.map((an) => {
    const annotation: LayoutAnnotationInput = { id: an.id, type: an.type, x: an.x, y: an.y };
    if (an.x2 !== undefined) annotation.x2 = an.x2;
    if (an.y2 !== undefined) annotation.y2 = an.y2;
    if (an.text !== undefined) annotation.text = an.text;
    if (an.color !== undefined) annotation.color = an.color;
    const layer = snap.layers[an.id];
    if (layer !== undefined) annotation.layer = layer;
    return annotation;
  });

  return layoutToCadDocument(
    { assets, stations, annotations, connectors: snap.connectors },
    { unit: options.unit },
  );
}

/**
 * Documento canónico → snapshot del editor. Inversa exacta del anterior para
 * documentos producidos por él (el spec lo prueba). `L` la instancia el editor
 * con su unión de capas; el invariante es que los valores del documento
 * provienen de ese mismo conjunto.
 */
export function cadDocumentToEditorSnapshot<L extends string = string>(
  doc: CadDocument,
): CadEditorSnapshot<L> {
  const snap: CadEditorSnapshot<L> = {
    placements: [],
    assets: [],
    annotations: [],
    connectors: [],
    layers: {},
    tags: {},
  };

  for (const e of doc.entities) {
    if (e.type === "box") {
      const asset: CadEditorAsset = {
        id: e.id,
        kind: e.kind,
        x: e.x,
        y: e.y,
        w: e.w,
        h: e.h,
        rotation: e.rotation,
      };
      if (e.label !== undefined) asset.label = e.label;
      if (e.shape === "circle") asset.shape = "circle";
      snap.assets.push(asset);
      if (e.layer !== DEFAULT_LAYER_ID) snap.layers[e.id] = e.layer as L;
      if (e.tags?.length) snap.tags[e.id] = joinTags(e.tags);
    } else if (e.type === "circle" && e.legacy) {
      const asset: CadEditorAsset = {
        id: e.id,
        kind: e.legacy.kind,
        x: e.center.x - e.radius,
        y: e.center.y - e.radius,
        w: e.radius * 2,
        h: e.radius * 2,
        rotation: e.legacy.rotation,
        shape: "circle",
      };
      if (e.legacy.label !== undefined) asset.label = e.legacy.label;
      snap.assets.push(asset);
      if (e.layer !== DEFAULT_LAYER_ID) snap.layers[e.id] = e.layer as L;
      if (e.legacy.tags?.length) snap.tags[e.id] = joinTags(e.legacy.tags);
    } else if (e.type === "station") {
      snap.placements.push([e.id, { x: e.x, y: e.y, w: e.w, h: e.h, rotation: e.rotation }]);
      if (e.layer !== STATIONS_LAYER) snap.layers[e.id] = e.layer as L;
      if (e.tags?.length) snap.tags[e.id] = joinTags(e.tags);
    } else if (e.type === "text") {
      const annotation: CadEditorAnnotation = { id: e.id, type: "text", x: e.x, y: e.y, text: e.text };
      if (e.color !== undefined) annotation.color = e.color;
      snap.annotations.push(annotation);
      if (e.layer !== TEXT_LAYER) snap.layers[e.id] = e.layer as L;
    } else if (e.type === "dimension" && !e.dimensionKind) {
      const annotation: CadEditorAnnotation = {
        id: e.id,
        type: "dim",
        x: e.a.x,
        y: e.a.y,
        x2: e.b.x,
        y2: e.b.y,
      };
      if (e.text !== undefined) annotation.text = e.text;
      if (e.color !== undefined) annotation.color = e.color;
      snap.annotations.push(annotation);
      if (e.layer !== DIM_LAYER) snap.layers[e.id] = e.layer as L;
    } else if (e.type === "connector") {
      const connector: CadEditorConnector = { from: e.from, to: e.to };
      if (e.kind !== "flow") connector.kind = e.kind;
      snap.connectors.push(connector);
    }
  }

  return snap;
}
