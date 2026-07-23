/**
 * Documento CAD canónico de AXOS CAD Next (CAD-NEXT-010).
 *
 * El editor histórico modela todo como cajas alineadas a ejes (`Asset`),
 * anotaciones y conectores, dispersos en colecciones sueltas. Este módulo
 * introduce un **documento único, versionado y serializable de forma
 * determinista** que es la fuente de verdad geométrica hacia la que migra el
 * programa — sin big-bang: se conecta al modelo histórico por un **adaptador
 * bidireccional sin pérdida**.
 *
 * Objetivos de diseño:
 *  - **Sin pérdida**: `layoutToCadDocument` → `cadDocumentToLayout` reconstruye
 *    exactamente los assets/anotaciones/conectores/capas de entrada (golden
 *    round-trip en el spec), incluida la forma real (`shape:"circle"`).
 *  - **Determinista**: `serializeCadDocument` produce el MISMO texto para el
 *    mismo contenido, sin importar el orden de entrada (entidades y capas
 *    ordenadas por id, claves en orden fijo). Permite diffs y hashes estables.
 *  - **Versionado**: cada cambio incrementa `meta.version` y deja rastro en
 *    `history` (base de undo/redo auditable y de la futura ChangeHistory).
 *  - **Puro**: sin `three`, sin DOM, sin `Date.now()` — testeable en Node.
 *
 * Es el esqueleto de `CadDocument` (ModelSpace/Layers/Entities). Bloques,
 * espacios de papel, restricciones y enlaces a objetos de negocio se añaden en
 * unidades posteriores sobre esta misma base, no como sistemas paralelos.
 */

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
}
/** Colocación de una estación de línea en el plano (el catálogo vive aparte). */
export interface LayoutStationPlacementInput {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
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
// Documento canónico
// ---------------------------------------------------------------------------

/** Prefijo de capa por defecto cuando un objeto no declara ninguna. */
export const DEFAULT_LAYER_ID = "0";

export interface CadDocumentMeta {
  /** Versión del contenido; sube en cada `commitChange`. */
  version: number;
  /** Versión del esquema de este módulo (no del contenido). */
  schema: number;
  unit: string;
}

export type CadEntity =
  | {
      id: string;
      type: "box";
      kind: string;
      x: number;
      y: number;
      w: number;
      h: number;
      rotation: number;
      layer: string;
      shape: "rect" | "circle";
      label?: string;
      group?: string;
      tags?: string[];
    }
  | {
      id: string;
      type: "station";
      x: number;
      y: number;
      w: number;
      h: number;
      rotation: number;
      layer: string;
    }
  | {
      id: string;
      type: "text";
      x: number;
      y: number;
      text: string;
      layer: string;
      color?: string;
    }
  | {
      id: string;
      type: "dimension";
      a: { x: number; y: number };
      b: { x: number; y: number };
      layer: string;
      text?: string;
      color?: string;
    }
  | {
      id: string;
      type: "connector";
      from: string;
      to: string;
      kind: string;
      layer: string;
    };

export interface CadLayerDef {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
}

export interface CadChange {
  version: number;
  label: string;
}

export interface CadDocument {
  meta: CadDocumentMeta;
  layers: CadLayerDef[];
  entities: CadEntity[];
  history: CadChange[];
}

/** v2: cajas con `tags` + entidad `station` (colocaciones de línea) — CAD-NEXT-011. */
export const CAD_DOCUMENT_SCHEMA = 2;
/** Capa estable de las colocaciones de estación. */
const STATIONS_LAYER = "Stations";
/** Prefijo estable del id de conector (from→to) para round-trip determinista. */
const CONNECTOR_PREFIX = "conn:";

function byId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
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
  options: { unit?: string; version?: number } = {},
): CadDocument {
  const entities: CadEntity[] = [];

  for (const a of layout.assets ?? []) {
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
    entities.push(box);
  }

  for (const s of layout.stations ?? []) {
    entities.push({
      id: s.id,
      type: "station",
      x: s.x,
      y: s.y,
      w: s.w,
      h: s.h,
      rotation: s.rotation,
      layer: STATIONS_LAYER,
    });
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
      layer: "Flow",
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

  return {
    meta: {
      version: options.version ?? 1,
      schema: CAD_DOCUMENT_SCHEMA,
      unit: options.unit ?? "mm",
    },
    layers,
    entities: entities.sort(byId),
    history: [],
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
      assets.push(a);
    } else if (e.type === "station") {
      stations.push({ id: e.id, x: e.x, y: e.y, w: e.w, h: e.h, rotation: e.rotation });
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
    } else {
      const c: LayoutConnectorInput = { from: e.from, to: e.to };
      if (e.kind !== "flow") c.kind = e.kind;
      connectors.push(c);
    }
  }

  return { assets, annotations, connectors, layers: doc.layers.map((l) => ({ ...l })), stations };
}

// ---------------------------------------------------------------------------
// Versionado + serialización determinista
// ---------------------------------------------------------------------------

/**
 * Devuelve una copia del documento con la versión incrementada y un registro
 * añadido al historial. Inmutable: no muta el documento de entrada.
 */
export function commitChange(doc: CadDocument, label: string): CadDocument {
  const version = doc.meta.version + 1;
  return {
    ...doc,
    meta: { ...doc.meta, version },
    entities: doc.entities.map((e) => ({ ...e })),
    layers: doc.layers.map((l) => ({ ...l })),
    history: [...doc.history, { version, label }],
  };
}

function orderedEntity(e: CadEntity): Record<string, unknown> {
  // Orden de claves fijo por tipo → JSON estable byte a byte.
  if (e.type === "box") {
    return {
      id: e.id, type: e.type, kind: e.kind, x: e.x, y: e.y, w: e.w, h: e.h,
      rotation: e.rotation, layer: e.layer, shape: e.shape,
      label: e.label ?? null, group: e.group ?? null, tags: e.tags ?? null,
    };
  }
  if (e.type === "station") {
    return {
      id: e.id, type: e.type, x: e.x, y: e.y, w: e.w, h: e.h,
      rotation: e.rotation, layer: e.layer,
    };
  }
  if (e.type === "text") {
    return { id: e.id, type: e.type, x: e.x, y: e.y, text: e.text, layer: e.layer, color: e.color ?? null };
  }
  if (e.type === "dimension") {
    return {
      id: e.id, type: e.type, ax: e.a.x, ay: e.a.y, bx: e.b.x, by: e.b.y,
      layer: e.layer, text: e.text ?? null, color: e.color ?? null,
    };
  }
  return { id: e.id, type: e.type, from: e.from, to: e.to, kind: e.kind, layer: e.layer };
}

/**
 * Serializa el documento a un JSON determinista: entidades y capas ordenadas
 * por id, claves en orden fijo. Dos documentos con el MISMO contenido producen
 * el MISMO texto aunque las entradas llegaran en otro orden — base para diffs y
 * hashes de versión reproducibles.
 */
export function serializeCadDocument(doc: CadDocument): string {
  const payload = {
    meta: { version: doc.meta.version, schema: doc.meta.schema, unit: doc.meta.unit },
    layers: [...doc.layers].sort(byId).map((l) => ({
      id: l.id, name: l.name, color: l.color, visible: l.visible, locked: l.locked,
    })),
    entities: [...doc.entities].sort(byId).map(orderedEntity),
    history: doc.history.map((h) => ({ version: h.version, label: h.label })),
  };
  return JSON.stringify(payload);
}

/** Cuenta de entidades por tipo — útil para paneles/telemetría. */
export function cadDocumentStats(doc: CadDocument): Record<CadEntity["type"], number> {
  const stats: Record<CadEntity["type"], number> = { box: 0, station: 0, text: 0, dimension: 0, connector: 0 };
  for (const e of doc.entities) stats[e.type]++;
  return stats;
}
