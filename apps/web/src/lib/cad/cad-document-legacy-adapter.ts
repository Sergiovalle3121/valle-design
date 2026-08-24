/**
 * Adaptador bidireccional entre el modelo HISTÓRICO del editor (cajas alineadas
 * a ejes, anotaciones sueltas, conectores) y el documento canónico.
 *
 * Vivía dentro de `cad-document.ts`. Se muda aquí sin cambiar una línea de
 * comportamiento porque son dos cosas distintas: `cad-document.ts` define el
 * MODELO canónico —la fuente de verdad geométrica— y esto es una PROYECCIÓN
 * compatible hacia atrás, que existe sólo mientras el editor histórico siga
 * vivo y que desaparecerá con él.
 *
 * La propiedad que hay que preservar sigue siendo la misma: `layoutToCadDocument`
 * → `cadDocumentToLayout` reconstruye exactamente assets, anotaciones,
 * conectores, capas y estaciones de entrada, incluida la forma real
 * (`shape:"circle"`). El golden de ida y vuelta vive en `cad-document.spec.ts`.
 *
 * `cad-document.ts` reexporta todo lo público de este módulo, así que ningún
 * consumidor cambia su import. Por eso aquí sólo se importan TIPOS de
 * `cad-document.ts`: un import de valor cerraría el ciclo y rompería la carga.
 */
import type {
  CadDocument,
  CadEntity,
} from "./cad-document";
import {
  byId,
  CAD_DOCUMENT_SCHEMA,
  CONNECTOR_LAYER,
  CONNECTOR_PREFIX,
  DEFAULT_LAYER_ID,
  emptyStyles,
  point3,
  STATIONS_LAYER,
} from "./cad-document-shared";

// ---------------------------------------------------------------------------
// Modelo histórico (estructural: coincide con LayoutAsset/Annotation/… del API)
// ---------------------------------------------------------------------------

export interface LayoutAssetInput {
  id: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  label?: string;
  layer?: string;
  group?: string;
  shape?: "rect" | "circle";
  /** Etiquetas libres del objeto (`use:smt`, `requires:power`, …). */
  tags?: string[];
  /** Nota libre del objeto (owner, restricción, pendiente…). */
  notes?: string;
  /** Acabado elegido (id de `lib/cad/materials/architectural-material-library.ts`). */
  materialId?: string;
}
/** Colocación de una estación de línea en el plano (el catálogo vive aparte). */
export interface LayoutStationPlacementInput {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  /** Capa asignada en el editor; por defecto la capa estable de estaciones. */
  layer?: string;
  /** Etiquetas libres de la estación. */
  tags?: string[];
  /** Nota libre de la estación. */
  notes?: string;
}
export interface LayoutAnnotationInput {
  id: string;
  type: "text" | "dim";
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  text?: string;
  color?: string;
  layer?: string;
}
export interface LayoutConnectorInput {
  from: string;
  to: string;
  kind?: string;
}
export interface LayoutLayerInput {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
}
export interface LayoutInput {
  assets?: LayoutAssetInput[];
  annotations?: LayoutAnnotationInput[];
  connectors?: LayoutConnectorInput[];
  layers?: LayoutLayerInput[];
  stations?: LayoutStationPlacementInput[];
}

// ---------------------------------------------------------------------------
// Adaptador: modelo histórico → documento canónico
// ---------------------------------------------------------------------------

/**
 * Construye un `CadDocument` desde el modelo histórico. Sin pérdida: cada
 * colección se mapea a entidades tipadas conservando todos sus campos. Las
 * entidades quedan ordenadas por id para que el documento sea determinista.
 */
export function layoutToCadDocument(
  layout: LayoutInput,
  options: {
    unit?: string;
    version?: number;
    /**
     * Huella y paso de rejilla del editor. Van a `meta` porque es de donde el
     * adaptador heredado los LEE al abrir (`footprintFromMeta`); sin esto la
     * proyección nacía sin huella y el guardado canónico no tenía forma de
     * transportar un cambio de tamaño de planta.
     */
    footprintW?: number;
    footprintH?: number;
    gridSize?: number;
  } = {},
): CadDocument {
  const entities: CadEntity[] = [];

  for (const a of layout.assets ?? []) {
    if (a.shape === "circle" && Math.abs(a.w - a.h) <= 1e-9) {
      const circle: Extract<CadEntity, { type: "circle" }> = {
        id: a.id,
        type: "circle",
        center: point3(a.x + a.w / 2, a.y + a.h / 2),
        radius: a.w / 2,
        layer: a.layer ?? DEFAULT_LAYER_ID,
        legacy: { kind: a.kind, rotation: a.rotation },
      };
      if (a.label !== undefined) circle.legacy!.label = a.label;
      if (a.group !== undefined) circle.legacy!.group = a.group;
      if (a.tags !== undefined) circle.legacy!.tags = [...a.tags];
      if (a.notes !== undefined) circle.legacy!.notes = a.notes;
      if (a.materialId !== undefined) circle.legacy!.materialId = a.materialId;
      entities.push(circle);
      continue;
    }
    const box: CadEntity = {
      id: a.id,
      type: "box",
      kind: a.kind,
      x: a.x,
      y: a.y,
      w: a.w,
      h: a.h,
      rotation: a.rotation,
      layer: a.layer ?? DEFAULT_LAYER_ID,
      shape: a.shape ?? "rect",
    };
    if (a.label !== undefined) box.label = a.label;
    if (a.group !== undefined) box.group = a.group;
    if (a.tags !== undefined) box.tags = [...a.tags];
    if (a.notes !== undefined) box.notes = a.notes;
    if (a.materialId !== undefined) box.materialId = a.materialId;
    entities.push(box);
  }

  for (const s of layout.stations ?? []) {
    const station: CadEntity = {
      id: s.id,
      type: "station",
      x: s.x,
      y: s.y,
      w: s.w,
      h: s.h,
      rotation: s.rotation,
      layer: s.layer ?? STATIONS_LAYER,
    };
    if (s.tags !== undefined) station.tags = [...s.tags];
    if (s.notes !== undefined) station.notes = s.notes;
    entities.push(station);
  }

  for (const an of layout.annotations ?? []) {
    if (an.type === "dim") {
      const dim: CadEntity = {
        id: an.id,
        type: "dimension",
        a: { x: an.x, y: an.y },
        b: { x: an.x2 ?? an.x, y: an.y2 ?? an.y },
        layer: an.layer ?? "Measurements",
      };
      if (an.text !== undefined) dim.text = an.text;
      if (an.color !== undefined) dim.color = an.color;
      entities.push(dim);
    } else {
      const text: CadEntity = {
        id: an.id,
        type: "text",
        x: an.x,
        y: an.y,
        text: an.text ?? "",
        layer: an.layer ?? "Text",
      };
      if (an.color !== undefined) text.color = an.color;
      entities.push(text);
    }
  }

  for (const c of layout.connectors ?? []) {
    entities.push({
      id: `${CONNECTOR_PREFIX}${c.from}->${c.to}`,
      type: "connector",
      from: c.from,
      to: c.to,
      kind: c.kind ?? "flow",
      layer: CONNECTOR_LAYER,
    });
  }

  const layers = (layout.layers ?? [])
    .map((l) => ({
      id: l.id,
      name: l.name,
      color: l.color,
      visible: l.visible,
      locked: l.locked,
    }))
    .sort(byId);

  const orderedEntities = entities.sort(byId);
  return {
    meta: {
      version: options.version ?? 1,
      schema: CAD_DOCUMENT_SCHEMA,
      unit: options.unit ?? "mm",
      // Sólo cuando existen: un documento que nunca declaró huella no puede
      // estrenar una aquí, o el adaptador dejaría de aplicar su default.
      ...(options.footprintW === undefined ? {} : { footprintW: options.footprintW }),
      ...(options.footprintH === undefined ? {} : { footprintH: options.footprintH }),
      ...(options.gridSize === undefined ? {} : { gridSize: options.gridSize }),
    },
    layers,
    entities: orderedEntities,
    history: [],
    modelSpace: { entityIds: orderedEntities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: emptyStyles(),
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

// ---------------------------------------------------------------------------
// Adaptador: documento canónico → modelo histórico
// ---------------------------------------------------------------------------

/**
 * Proyecta el documento de vuelta al modelo histórico. Inversa exacta de
 * `layoutToCadDocument`: los assets recuperan `shape`/`label`/`group`, las
 * cotas su `x2`/`y2`, y los conectores su `from`/`to`.
 */
export function cadDocumentToLayout(doc: CadDocument): Required<LayoutInput> {
  const assets: LayoutAssetInput[] = [];
  const annotations: LayoutAnnotationInput[] = [];
  const connectors: LayoutConnectorInput[] = [];
  const stations: LayoutStationPlacementInput[] = [];

  for (const e of doc.entities) {
    if (e.type === "box") {
      const a: LayoutAssetInput = {
        id: e.id,
        kind: e.kind,
        x: e.x,
        y: e.y,
        w: e.w,
        h: e.h,
        rotation: e.rotation,
      };
      if (e.label !== undefined) a.label = e.label;
      if (e.layer !== DEFAULT_LAYER_ID) a.layer = e.layer;
      if (e.group !== undefined) a.group = e.group;
      if (e.shape === "circle") a.shape = "circle";
      if (e.tags !== undefined) a.tags = [...e.tags];
      if (e.notes !== undefined) a.notes = e.notes;
      if (e.materialId !== undefined) a.materialId = e.materialId;
      assets.push(a);
    } else if (e.type === "circle" && e.legacy) {
      const a: LayoutAssetInput = {
        id: e.id,
        kind: e.legacy.kind,
        x: e.center.x - e.radius,
        y: e.center.y - e.radius,
        w: e.radius * 2,
        h: e.radius * 2,
        rotation: e.legacy.rotation,
        shape: "circle",
      };
      if (e.layer !== DEFAULT_LAYER_ID) a.layer = e.layer;
      if (e.legacy.label !== undefined) a.label = e.legacy.label;
      if (e.legacy.group !== undefined) a.group = e.legacy.group;
      if (e.legacy.tags !== undefined) a.tags = [...e.legacy.tags];
      if (e.legacy.notes !== undefined) a.notes = e.legacy.notes;
      if (e.legacy.materialId !== undefined) a.materialId = e.legacy.materialId;
      assets.push(a);
    } else if (e.type === "station") {
      const s: LayoutStationPlacementInput = { id: e.id, x: e.x, y: e.y, w: e.w, h: e.h, rotation: e.rotation };
      if (e.layer !== STATIONS_LAYER) s.layer = e.layer;
      if (e.tags !== undefined) s.tags = [...e.tags];
      if (e.notes !== undefined) s.notes = e.notes;
      stations.push(s);
    } else if (e.type === "text") {
      const an: LayoutAnnotationInput = { id: e.id, type: "text", x: e.x, y: e.y, text: e.text };
      if (e.layer !== "Text") an.layer = e.layer;
      if (e.color !== undefined) an.color = e.color;
      annotations.push(an);
    } else if (e.type === "dimension") {
      const an: LayoutAnnotationInput = {
        id: e.id,
        type: "dim",
        x: e.a.x,
        y: e.a.y,
        x2: e.b.x,
        y2: e.b.y,
      };
      if (e.text !== undefined) an.text = e.text;
      if (e.layer !== "Measurements") an.layer = e.layer;
      if (e.color !== undefined) an.color = e.color;
      annotations.push(an);
    } else if (e.type === "connector") {
      const c: LayoutConnectorInput = { from: e.from, to: e.to };
      if (e.kind !== "flow") c.kind = e.kind;
      connectors.push(c);
    }
  }

  return { assets, annotations, connectors, layers: doc.layers.map((l) => ({ ...l })), stations };
}
