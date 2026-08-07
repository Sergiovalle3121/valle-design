/**
 * Documento CAD canónico de Valle Design CAD (CAD-NEXT-010).
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
 * El esquema v3 incluye ModelSpace/PaperSpace, estilos, bloques, restricciones,
 * xrefs, enlaces de negocio y passthrough opaco para entidades no soportadas.
 * El editor legado sigue siendo una proyección compatible, no otra fuente de
 * verdad.
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
  /** Capa asignada en el editor; por defecto la capa estable de estaciones. */
  layer?: string;
  /** Etiquetas libres de la estación. */
  tags?: string[];
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
  /**
   * Huella del dibujo y paso de rejilla. Son CONTENIDO del documento, no una
   * proyección desechable del editor: definen el lienzo que el usuario compuso
   * y el incremento de las órdenes de movimiento. Se declaran opcionales
   * porque un documento puede no fijarlos; cuando existen, deben sobrevivir al
   * guardado y a la reapertura sin que nadie los sustituya por un default.
   */
  footprintW?: number;
  footprintH?: number;
  gridSize?: number;
}

export interface CadPoint2 {
  x: number;
  y: number;
}

export interface CadPoint3 extends CadPoint2 {
  z: number;
}

export type CadPropertySource = "byLayer" | "byBlock" | "explicit";

export interface CadEntityPresentation {
  color?: { source: CadPropertySource; value?: string };
  linetype?: { source: CadPropertySource; value?: string; scale?: number };
  lineweight?: { source: CadPropertySource; value?: number };
}

export interface CadEntityMetadata {
  [key: string]: string | number | boolean | null;
}

export interface CadEntityContext {
  handle?: string;
  elevation?: number;
  normal?: CadPoint3;
  presentation?: CadEntityPresentation;
  metadata?: CadEntityMetadata;
  provenance?: { provider: string; sourceId?: string; importedAt?: string };
  businessLink?: { tenantId?: string; entityType: string; entityId: string };
  editable?: boolean;
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
      context?: CadEntityContext;
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
      tags?: string[];
      context?: CadEntityContext;
    }
  | {
      id: string;
      type: "text";
      x: number;
      y: number;
      text: string;
      layer: string;
      color?: string;
      style?: string;
      height?: number;
      rotation?: number;
      context?: CadEntityContext;
    }
  | {
      id: string;
      type: "dimension";
      a: { x: number; y: number };
      b: { x: number; y: number };
      c?: { x: number; y: number };
      dimensionKind?: "linear" | "aligned" | "angular" | "radius" | "diameter" | "ordinate" | "arc-length";
      axis?: "x" | "y";
      offset?: number;
      radius?: number;
      layer: string;
      text?: string;
      color?: string;
      style?: string;
      precision?: number;
      units?: "mm" | "cm" | "m" | "in" | "ft";
      sourceUnit?: "mm" | "cm" | "m" | "in" | "ft";
      prefix?: string;
      suffix?: string;
      alternateUnits?: "mm" | "cm" | "m" | "in" | "ft";
      extensionLines?: boolean;
      arrowhead?: "closed-filled" | "open" | "architectural-tick" | "dot";
      arrowSize?: number;
      extensionGap?: number;
      extensionOvershoot?: number;
      textGap?: number;
      textPosition?: { x: number; y: number };
      associative?: boolean;
      references?: Array<{
        entityId: string;
        anchor: "start" | "end" | "center" | "arc-start" | "arc-end" | "major-start" | "major-end" | "control" | "insertion";
        index?: number;
      }>;
      associationStatus?: "associated" | "broken" | "detached";
      context?: CadEntityContext;
    }
  | {
      id: string;
      type: "connector";
      from: string;
      to: string;
      kind: string;
      layer: string;
      context?: CadEntityContext;
    }
  | {
      id: string;
      type: "line";
      start: CadPoint3;
      end: CadPoint3;
      layer: string;
      context?: CadEntityContext;
    }
  | {
      id: string;
      type: "polyline";
      vertices: (CadPoint3 & { bulge?: number })[];
      closed: boolean;
      layer: string;
      context?: CadEntityContext;
    }
  | {
      id: string;
      type: "circle";
      center: CadPoint3;
      radius: number;
      layer: string;
      legacy?: { kind: string; rotation: number; label?: string; group?: string; tags?: string[] };
      context?: CadEntityContext;
    }
  | {
      id: string;
      type: "arc";
      center: CadPoint3;
      radius: number;
      startAngle: number;
      endAngle: number;
      layer: string;
      context?: CadEntityContext;
    }
  | {
      id: string;
      type: "ellipse";
      center: CadPoint3;
      majorAxis: CadPoint3;
      ratio: number;
      startParameter: number;
      endParameter: number;
      layer: string;
      context?: CadEntityContext;
    }
  | {
      id: string;
      type: "spline";
      degree: number;
      controlPoints: CadPoint3[];
      knots: number[];
      weights?: number[];
      closed?: boolean;
      layer: string;
      context?: CadEntityContext;
    }
  | {
      id: string;
      type: "mtext";
      insertion: CadPoint3;
      text: string;
      width?: number;
      height?: number;
      rotation?: number;
      style?: string;
      alignment?: "top-left" | "top-center" | "top-right" | "middle-left" | "middle-center" | "middle-right" | "bottom-left" | "bottom-center" | "bottom-right";
      paragraphAlignment?: "left" | "center" | "right" | "justify";
      fontFamily?: string;
      lineSpacing?: number;
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      backgroundMask?: boolean;
      backgroundColor?: string;
      backgroundPadding?: number;
      columns?: number;
      layer: string;
      context?: CadEntityContext;
    }
  | {
      id: string;
      type: "hatch";
      pattern: string;
      solid: boolean;
      boundaries: CadPoint3[][];
      scale?: number;
      angle?: number;
      origin?: CadPoint3;
      islandStyle?: "normal" | "outer" | "ignore";
      associative?: boolean;
      boundaryRefs?: string[];
      associationStatus?: "associated" | "broken" | "detached";
      layer: string;
      context?: CadEntityContext;
    }
  | {
      id: string;
      type: "mleader";
      /** Primary leader line; retained for schema-v3 backward compatibility. */
      vertices: CadPoint3[];
      /** One or more tip-to-elbow leader lines. */
      leaderLines?: CadPoint3[][];
      text: string;
      textPosition: CadPoint3;
      contentType?: "text" | "mtext";
      textWidth?: number;
      textHeight?: number;
      textRotation?: number;
      textAlignment?: "left" | "center" | "right" | "justify";
      fontFamily?: string;
      lineSpacing?: number;
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      backgroundMask?: boolean;
      backgroundColor?: string;
      backgroundPadding?: number;
      landing?: boolean;
      doglegLength?: number;
      arrowhead?: "closed-filled" | "open" | "architectural-tick" | "dot" | "none";
      arrowSize?: number;
      style?: string;
      associative?: boolean;
      references?: Array<{
        entityId: string;
        anchor: "start" | "end" | "center" | "arc-start" | "arc-end" | "major-start" | "major-end" | "control" | "insertion" | "corner-ne";
        index?: number;
      }>;
      associationStatus?: "associated" | "broken" | "detached";
      layer: string;
      context?: CadEntityContext;
    }
  | {
      id: string;
      type: "insert";
      block: string;
      insertion: CadPoint3;
      scale: CadPoint3;
      rotation: number;
      attributes?: Record<string, string>;
      layer: string;
      context?: CadEntityContext;
    };

export interface CadLayerDef {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
  linetype?: string;
  lineweight?: number;
  plot?: boolean;
}

export interface CadStyleTable {
  text: Record<string, { fontFamily?: string; height?: number }>;
  dimension: Record<string, { textStyle?: string; arrowSize?: number; precision?: number }>;
  mleader?: Record<string, { textStyle?: string; arrowSize?: number; doglegLength?: number; landing?: boolean }>;
  table: Record<string, { textStyle?: string; rowHeight?: number }>;
  plot: Record<string, { colorMode?: "color" | "monochrome"; lineweightScale?: number }>;
}

export interface CadBlockDefinition {
  id: string;
  name: string;
  basePoint: CadPoint3;
  entities: CadEntity[];
  attributes?: Record<string, {
    defaultValue?: string;
    required?: boolean;
    prompt?: string;
    position?: CadPoint3;
    height?: number;
    style?: string;
    invisible?: boolean;
    constant?: boolean;
  }>;
  description?: string;
  keywords?: string[];
  /** Monotonic content version; redefining a block updates every live INSERT. */
  version?: number;
  library?: {
    scope: "document" | "tenant";
    tenantId?: string;
    sourceId?: string;
  };
  thumbnail?: { svg: string; generatedAt?: string };
  businessLink?: CadEntityContext["businessLink"];
}

export type CadConstraintKind =
  | "coincident"
  | "horizontal"
  | "vertical"
  | "parallel"
  | "perpendicular"
  | "collinear"
  | "equalLength"
  | "distance"
  | "angle";

export interface CadConstraint {
  id: string;
  kind: CadConstraintKind;
  entityIds: string[];
  value?: number;
  enabled: boolean;
}

export interface CadLossManifestEntry {
  code: string;
  entityId?: string;
  sourceType?: string;
  detail: string;
  severity: "info" | "warning" | "error";
}

export interface CadOpaqueEntity {
  id: string;
  provider: string;
  sourceType: string;
  layer?: string;
  raw: string;
  editable: false;
}

export interface CadPaperSpace {
  id: string;
  name: string;
  entityIds: string[];
  order?: number;
  includeInPublish?: boolean;
  page: {
    width: number;
    height: number;
    unit: "mm" | "in";
    orientation: "portrait" | "landscape";
  };
  pageSetup?: {
    paper: "A4" | "A3" | "A2" | "A1" | "A0" | "letter" | "tabloid" | "custom";
    margins: { top: number; right: number; bottom: number; left: number };
    colorMode: "color" | "monochrome";
    lineweightScale: number;
  };
  viewports?: CadPaperViewport[];
  titleBlock?: {
    block?: string;
    attributes: Record<string, string>;
  };
}

export interface CadPaperViewport {
  id: string;
  name?: string;
  paperBounds: { x: number; y: number; width: number; height: number };
  modelBounds: { x: number; y: number; width: number; height: number };
  scale: number;
  locked: boolean;
  /** Independent annotation scale for annotative content in this viewport. */
  annotationScale?: number;
  /** Optional named model view used to restore this viewport deterministically. */
  namedView?: string;
  layerVisibility?: Record<string, boolean>;
  layerOverrides?: Record<string, { color?: string; linetype?: string; lineweight?: number }>;
}

export interface CadPublicationRecord {
  id: string;
  paperSpaceIds: string[];
  fileName: string;
  sha256: string;
  bytes: number;
  publishedAt: string;
  publishedBy: string;
}

export interface CadExternalReference {
  id: string;
  name: string;
  /** Tenant asset URI. Browser-local absolute paths are never persisted. */
  uri: string;
  revision?: string;
  loaded: boolean;
  mode?: "attachment" | "overlay";
  tenantId?: string;
  assetId?: string;
  sourceVersion?: number;
  contentHash?: string;
  relativePath?: string;
  blockId?: string;
  insertId?: string;
  dependencyAssetIds?: string[];
  dependencyEdges?: Array<{ from: string; to: string; mode: "attachment" | "overlay" }>;
  status?: "loaded" | "unloaded" | "missing" | "stale" | "denied" | "cycle" | "depth_exceeded";
  lastLoadedAt?: string;
  lastCheckedAt?: string;
  error?: string;
}

export interface CadChange {
  version: number;
  label: string;
}

export type CadReviewThreadStatus = "open" | "resolved";

export interface CadReviewThread {
  id: string;
  entityId?: string;
  body: string;
  author: string;
  assignedTo?: string;
  status: CadReviewThreadStatus;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  markup?: {
    kind: "note" | "arrow" | "cloud";
    point?: CadPoint2;
    color: string;
  };
}

/**
 * Metadato NO SENSIBLE de un review link. El token NUNCA vive aquí: lo genera
 * el servidor al crear la sesión de revisión (`POST /v1/cad/documents/:id/
 * review-sessions`), sólo se persiste su sha256 en `cad_review_sessions.
 * token_hash` y su valor en claro aparece UNA vez, en esa respuesta.
 *
 * `id` es el id de la sesión de revisión server-owned — la misma referencia
 * que usan revocación (`/v1/cad/review-sessions/:id/close`) y auditoría.
 * `hasToken` lo escribe la API al redactar documentos heredados que todavía
 * traían el token en claro dentro del JSON.
 */
export interface CadReviewLink {
  id: string;
  label: string;
  readOnly: true;
  createdAt: string;
  createdBy: string;
  expiresAt?: string;
  revokedAt?: string;
  hasToken?: boolean;
}

export interface CadCollaborationAuditEvent {
  id: string;
  action:
    | "version_created"
    | "merge_applied"
    | "comment_added"
    | "comment_resolved"
    | "review_link_created"
    | "review_link_revoked";
  actor: string;
  at: string;
  detail: string;
  entityIds?: string[];
}

export interface CadVersionSnapshot {
  id: string;
  label: string;
  createdAt: string;
  createdBy: string;
  contentHash: string;
  /** Full canonical content without collaboration recursion. */
  document: Omit<CadDocument, "collaboration">;
}

export interface CadCollaborationState {
  versions: CadVersionSnapshot[];
  threads: CadReviewThread[];
  reviewLinks: CadReviewLink[];
  audit: CadCollaborationAuditEvent[];
}

/**
 * Agrupación industrial de estaciones. NO es núcleo arquitectónico —un plano de
 * arquitectura no tiene celdas—, así que vive como sección OPCIONAL: un
 * documento que nunca las tuvo se serializa exactamente igual que antes.
 *
 * Está aquí porque la alternativa era seguir perdiéndolas: el editor las dejaba
 * en un ref que sólo escribía la vía de guardado heredada, de modo que en un
 * documento moderno crear una celda ensuciaba el dibujo, provocaba un autosave
 * que respondía 200 y la celda no llegaba al servidor.
 */
export interface CadCellDefinition {
  id: string;
  name: string;
  color: string;
  stationIds: string[];
}

export interface CadDocument {
  meta: CadDocumentMeta;
  layers: CadLayerDef[];
  entities: CadEntity[];
  history: CadChange[];
  modelSpace: { entityIds: string[] };
  paperSpaces: CadPaperSpace[];
  styles: CadStyleTable;
  blocks: CadBlockDefinition[];
  constraints: CadConstraint[];
  externalReferences: CadExternalReference[];
  unsupportedEntities: CadOpaqueEntity[];
  lossManifest: CadLossManifestEntry[];
  publications: CadPublicationRecord[];
  /** Review/merge metadata persisted in the same tenant-scoped CAS document. */
  collaboration?: CadCollaborationState;
  /** Extensión industrial: agrupaciones de estaciones. Ausente si no se usan. */
  cells?: CadCellDefinition[];
}

/** v3: modelo profesional extensible con migración aditiva desde v1/v2. */
export const CAD_DOCUMENT_SCHEMA = 3;
/** Capa estable de las colocaciones de estación. */
export const STATIONS_LAYER = "Stations";
/** Prefijo estable del id de conector (from→to) para round-trip determinista. */
const CONNECTOR_PREFIX = "conn:";

function byId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function emptyStyles(): CadStyleTable {
  return { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} };
}

function point3(x: number, y: number, z = 0): CadPoint3 {
  return { x, y, z };
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

  const orderedEntities = entities.sort(byId);
  return {
    meta: {
      version: options.version ?? 1,
      schema: CAD_DOCUMENT_SCHEMA,
      unit: options.unit ?? "mm",
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
      assets.push(a);
    } else if (e.type === "station") {
      const s: LayoutStationPlacementInput = { id: e.id, x: e.x, y: e.y, w: e.w, h: e.h, rotation: e.rotation };
      if (e.layer !== STATIONS_LAYER) s.layer = e.layer;
      if (e.tags !== undefined) s.tags = [...e.tags];
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

// ---------------------------------------------------------------------------
// Versionado + serialización determinista
// ---------------------------------------------------------------------------

/**
 * Devuelve una copia del documento con la versión incrementada y un registro
 * añadido al historial. Inmutable: no muta el documento de entrada.
 */
/**
 * Sustituye un conjunto de ids del orden de dibujo por otros, **en la posición
 * que ocupaban**, conservando el z-order del resto.
 *
 * Es lo que necesitan convertir geometría en bloque y explotar un bloque: si
 * el resultado se añade al final, la operación cambia lo que tapa a qué. Con
 * esto, definir un bloque y explotarlo vuelve a ser visualmente inocuo.
 *
 * La posición elegida es la del elemento sustituido MÁS ALTO (el índice mayor),
 * porque es el que determinaba qué cubría el conjunto.
 */
export function replaceEntityIdsAt(
  entityIds: string[],
  removed: ReadonlySet<string>,
  inserted: string[],
): string[] {
  const indices = entityIds
    .map((id, index) => (removed.has(id) ? index : -1))
    .filter((index) => index >= 0);
  const kept = entityIds.filter((id) => !removed.has(id));
  if (indices.length === 0) return [...kept, ...inserted];
  // Cuántos elementos conservados quedaban por debajo del más alto retirado.
  const anchor = indices[indices.length - 1];
  const below = entityIds
    .slice(0, anchor)
    .filter((id) => !removed.has(id)).length;
  return [...kept.slice(0, below), ...inserted, ...kept.slice(below)];
}

/**
 * Reconstruye el orden de dibujo CONSERVANDO el previo.
 *
 * Necesario cada vez que un camino recompone el documento a partir de una
 * colección de entidades: esa colección puede estar ordenada por id para
 * canonicalización, y derivar `entityIds` de ella **alfabetiza el z-order**.
 * Ése era el defecto que sobrevivía en `replaceEditorProjection` y en la
 * migración de MLEADER heredados: editar una propiedad convertía
 * `zeta, alfa` en `alfa, zeta`.
 *
 * Contrato: las entidades que ya tenían posición la conservan, en su orden
 * relativo; las nuevas se añaden AL FRENTE (final de la lista), en el orden en
 * que llegan; las desaparecidas se quitan.
 */
export function preserveDrawOrder(
  previousIds: readonly string[],
  presentIds: readonly string[],
): string[] {
  const present = new Set(presentIds);
  const kept = previousIds.filter((id) => present.has(id));
  const seen = new Set(kept);
  const appended = presentIds.filter((id) => !seen.has(id));
  return [...kept, ...appended];
}

export function commitChange(doc: CadDocument, label: string): CadDocument {
  const version = doc.meta.version + 1;
  return {
    ...doc,
    meta: { ...doc.meta, version },
    entities: doc.entities.map((e) => ({ ...e })),
    layers: doc.layers.map((l) => ({ ...l })),
    modelSpace: { entityIds: [...doc.modelSpace.entityIds] },
    paperSpaces: structuredClone(doc.paperSpaces),
    styles: structuredClone(doc.styles),
    blocks: structuredClone(doc.blocks),
    constraints: structuredClone(doc.constraints),
    externalReferences: structuredClone(doc.externalReferences),
    unsupportedEntities: structuredClone(doc.unsupportedEntities),
    lossManifest: structuredClone(doc.lossManifest),
    publications: structuredClone(doc.publications),
    collaboration: doc.collaboration ? structuredClone(doc.collaboration) : undefined,
    ...(doc.cells ? { cells: structuredClone(doc.cells) } : {}),
    history: [...doc.history, { version, label }],
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function orderedEntity(e: CadEntity): Record<string, unknown> {
  // Orden recursivo de claves sin cambiar la forma del schema. El serializado
  // también es un formato de reload; no se aplana ni descarta contexto v3.
  return stableValue(e) as Record<string, unknown>;
}

/**
 * Serializa el documento a un JSON determinista: entidades y capas ordenadas
 * por id, claves en orden fijo. Dos documentos con el MISMO contenido producen
 * el MISMO texto aunque las entradas llegaran en otro orden — base para diffs y
 * hashes de versión reproducibles.
 */
export function serializeCadDocument(doc: CadDocument): string {
  const payload = {
    // La huella y la rejilla viajan con el documento: reconstruir `meta` con
    // sólo {version, schema, unit} las borraba en CADA guardado, y como este
    // serializado es también el formato de recarga, el dibujo se reabría con
    // el lienzo y el paso de rejilla del default legacy.
    meta: {
      version: doc.meta.version,
      schema: doc.meta.schema,
      unit: doc.meta.unit,
      ...(doc.meta.footprintW === undefined ? {} : { footprintW: doc.meta.footprintW }),
      ...(doc.meta.footprintH === undefined ? {} : { footprintH: doc.meta.footprintH }),
      ...(doc.meta.gridSize === undefined ? {} : { gridSize: doc.meta.gridSize }),
    },
    layers: [...doc.layers].sort(byId).map(stableValue),
    entities: [...doc.entities].sort(byId).map(orderedEntity),
    history: doc.history.map((h) => ({ version: h.version, label: h.label })),
    // NO ordenar: `entityIds` ES el orden de dibujo (draw order). Ordenarlo
    // alfabéticamente destruía en cada guardado el z-order del dibujo, y con
    // él Bring to front / Send to back, el apilado de hatches, wipeouts y
    // anotaciones. El determinismo no se pierde: dos documentos con el mismo
    // contenido siguen produciendo el mismo texto, porque el orden de dibujo
    // ES contenido — si difiere, los documentos son legítimamente distintos.
    modelSpace: { entityIds: [...doc.modelSpace.entityIds] },
    // NO ordenar: el orden de las láminas ES el orden del juego de planos que
    // compuso el usuario, igual que `entityIds` es el z-order del modelo.
    paperSpaces: doc.paperSpaces.map(stableValue),
    styles: stableValue(doc.styles),
    // La TABLA de bloques sí es un índice de definiciones (se resuelve por
    // nombre), así que ordenarla es canonicalización legítima. Las entidades
    // DENTRO de un bloque no: ese array es su z-order interno.
    blocks: [...doc.blocks].sort(byId).map((block) => stableValue({
      ...block,
      entities: [...block.entities],
    })),
    constraints: [...doc.constraints].sort(byId).map(stableValue),
    externalReferences: [...doc.externalReferences].sort(byId).map(stableValue),
    unsupportedEntities: [...doc.unsupportedEntities].sort(byId).map(stableValue),
    lossManifest: doc.lossManifest.map(stableValue),
    publications: doc.publications.map(stableValue),
    collaboration: doc.collaboration ? stableValue(doc.collaboration) : undefined,
    ...(doc.cells ? { cells: [...doc.cells].sort(byId).map(stableValue) } : {}),
  };
  return JSON.stringify(payload);
}

/** Cuenta de entidades por tipo — útil para paneles/telemetría. */
export function cadDocumentStats(doc: CadDocument): Record<CadEntity["type"], number> {
  const stats = {
    box: 0, station: 0, text: 0, dimension: 0, connector: 0, line: 0,
    polyline: 0, circle: 0, arc: 0, ellipse: 0, spline: 0, mtext: 0,
    hatch: 0, mleader: 0, insert: 0,
  } satisfies Record<CadEntity["type"], number>;
  for (const e of doc.entities) stats[e.type]++;
  return stats;
}

function finite(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finite);
  if (value && typeof value === "object") return Object.values(value).every(finite);
  return true;
}

function withV3Defaults(doc: Partial<CadDocument>): CadDocument {
  const entities = Array.isArray(doc.entities) ? doc.entities : [];
  return {
    meta: {
      version: Number(doc.meta?.version) || 1,
      schema: CAD_DOCUMENT_SCHEMA,
      unit: doc.meta?.unit || "mm",
      // La huella declarada del documento se conserva tal cual. Normalizar el
      // esquema no puede inventar un lienzo ni descartar el que ya existía.
      ...(Number.isFinite(doc.meta?.footprintW) ? { footprintW: doc.meta!.footprintW } : {}),
      ...(Number.isFinite(doc.meta?.footprintH) ? { footprintH: doc.meta!.footprintH } : {}),
      ...(Number.isFinite(doc.meta?.gridSize) ? { gridSize: doc.meta!.gridSize } : {}),
    },
    layers: Array.isArray(doc.layers) ? doc.layers : [],
    entities,
    history: Array.isArray(doc.history) ? doc.history : [],
    // Documento heredado sin `modelSpace`: el orden del array `entities` es la
    // mejor señal disponible del orden de dibujo. Ordenar por id imponía un
    // z-order alfabético que nunca estuvo en los datos.
    modelSpace: doc.modelSpace ?? { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: Array.isArray(doc.paperSpaces) ? doc.paperSpaces : [],
    styles: doc.styles ?? emptyStyles(),
    blocks: Array.isArray(doc.blocks) ? doc.blocks : [],
    constraints: Array.isArray(doc.constraints) ? doc.constraints : [],
    externalReferences: Array.isArray(doc.externalReferences) ? doc.externalReferences : [],
    unsupportedEntities: Array.isArray(doc.unsupportedEntities) ? doc.unsupportedEntities : [],
    lossManifest: Array.isArray(doc.lossManifest) ? doc.lossManifest : [],
    publications: Array.isArray(doc.publications) ? doc.publications : [],
    collaboration:
      doc.collaboration && typeof doc.collaboration === "object"
        ? doc.collaboration
        : undefined,
    // Sección OPCIONAL: sólo aparece si el documento la traía. Materializarla
    // como `[]` cambiaría la serialización de todos los documentos existentes.
    ...(Array.isArray(doc.cells) ? { cells: doc.cells } : {}),
  };
}

const legacyPointEqual = (a: CadPoint2, b: CadPoint2, tolerance = 1e-6) =>
  Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;

/**
 * The former editor emitted a leader as two `ld_*` legacy DIM annotations plus
 * one `nt_*` TEXT at the landing endpoint. Only that exact, isolated signature
 * is folded into one MLEADER; ambiguous candidates remain untouched and gain a
 * loss-manifest warning instead of being guessed.
 */
export function migrateLegacyMleaderCompositions(document: CadDocument): CadDocument {
  const dimensions = document.entities.filter((entity): entity is Extract<CadEntity, { type: "dimension" }> =>
    entity.type === "dimension" && !entity.dimensionKind && /^ld_/.test(entity.id));
  const texts = document.entities.filter((entity): entity is Extract<CadEntity, { type: "text" }> =>
    entity.type === "text" && /^nt_/.test(entity.id));
  const used = new Set<string>();
  const created: Extract<CadEntity, { type: "mleader" }>[] = [];
  const warnings: CadLossManifestEntry[] = [];
  for (const dogleg of dimensions) {
    if (used.has(dogleg.id) || Math.abs(dogleg.a.y - dogleg.b.y) > 1e-6) continue;
    const candidates = dimensions.filter((leader) =>
      leader.id !== dogleg.id && !used.has(leader.id) &&
      [leader.a, leader.b].some((point) => legacyPointEqual(point, dogleg.a) || legacyPointEqual(point, dogleg.b)));
    const textCandidates = texts.filter((text) =>
      !used.has(text.id) && (legacyPointEqual({ x: text.x, y: text.y }, dogleg.a) || legacyPointEqual({ x: text.x, y: text.y }, dogleg.b)));
    if (candidates.length !== 1 || textCandidates.length !== 1) {
      if (candidates.length || textCandidates.length) warnings.push({
        code: "legacy_mleader_ambiguous",
        entityId: dogleg.id,
        sourceType: "DIM+DIM+TEXT",
        detail: "Legacy leader composition was not uniquely identifiable and remains unflattened.",
        severity: "warning",
      });
      continue;
    }
    const leader = candidates[0];
    const text = textCandidates[0];
    const shared = [leader.a, leader.b].find((point) => legacyPointEqual(point, dogleg.a) || legacyPointEqual(point, dogleg.b))!;
    const tip = legacyPointEqual(leader.a, shared) ? leader.b : leader.a;
    const textPosition = { x: text.x, y: text.y, z: 0 };
    const id = `mleader:migrated:${[leader.id, dogleg.id, text.id].sort().join("+")}`;
    created.push({
      id,
      type: "mleader",
      vertices: [point3(tip.x, tip.y), point3(shared.x, shared.y)],
      leaderLines: [[point3(tip.x, tip.y), point3(shared.x, shared.y)]],
      text: text.text,
      textPosition,
      contentType: "text",
      landing: true,
      doglegLength: Math.hypot(dogleg.b.x - dogleg.a.x, dogleg.b.y - dogleg.a.y),
      arrowhead: "closed-filled",
      associationStatus: "detached",
      associative: false,
      style: "Standard",
      layer: text.layer || leader.layer,
      context: { provenance: { provider: "legacy-editor" }, metadata: { migratedLeader: leader.id, migratedDogleg: dogleg.id, migratedText: text.id } },
    });
    used.add(leader.id); used.add(dogleg.id); used.add(text.id);
  }
  if (!created.length && !warnings.length) return document;
  const entities = [...document.entities.filter((entity) => !used.has(entity.id)), ...created].sort(byId);
  return {
    ...document,
    entities,
    // Mismo defecto que en `replaceEditorProjection`: `entities` está ordenado
    // por id y derivar de ahí el orden de dibujo lo alfabetizaba. Migrar
    // MLEADER heredados no debe reordenar el plano del usuario.
    modelSpace: {
      entityIds: preserveDrawOrder(
        document.modelSpace.entityIds,
        entities.map((entity) => entity.id),
      ),
    },
    lossManifest: [...document.lossManifest, ...warnings],
  };
}

/** Deterministic additive migration from v1/v2 to the current schema. */
export function migrateCadDocument(value: unknown): CadDocument {
  if (!value || typeof value !== "object") throw new Error("CadDocument must be an object.");
  const raw = value as Partial<CadDocument>;
  const schema = Number(raw.meta?.schema) || 1;
  if (schema > CAD_DOCUMENT_SCHEMA) throw new Error(`Unsupported CadDocument schema ${schema}.`);
  const migrated = migrateLegacyMleaderCompositions(withV3Defaults(raw));
  if (!finite(migrated)) throw new Error("CadDocument contains non-finite numeric values.");
  const ids = migrated.entities.map((entity) => entity.id);
  if (ids.some((id) => typeof id !== "string" || !id) || new Set(ids).size !== ids.length) {
    throw new Error("CadDocument entity ids must be non-empty and unique.");
  }
  return migrated;
}

export function parseCadDocument(serialized: string): CadDocument {
  if (serialized.length > 20_000_000) throw new Error("CadDocument exceeds the 20 MB client limit.");
  return migrateCadDocument(JSON.parse(serialized));
}

/**
 * Replace the legacy editor projection without dropping first-class entities,
 * constraints, blocks, xrefs or opaque provider payloads.
 */
export function replaceEditorProjection(
  base: CadDocument | null | undefined,
  projection: CadDocument,
): CadDocument {
  const projectionIds = new Set(projection.entities.map((entity) => entity.id));
  const preserved = base
    ? base.entities.filter((entity) =>
        !projectionIds.has(entity.id)
        && !["box", "station", "text", "connector"].includes(entity.type)
        && (entity.type !== "dimension" || !!entity.dimensionKind)
        && (entity.type !== "circle" || !entity.legacy),
      )
    : [];

  /**
   * La proyección del editor es una vista PARCIAL: no modela `context`, donde
   * viven el color/tipo de línea/grosor explícitos, la cota, el `handle` del
   * DXF de origen y la procedencia de lo importado. Como los tipos `box`,
   * `station`, `text` y `connector` se reemplazan en bloque desde ella, todo
   * eso se perdía en CADA guardado del estudio moderno: el muro al que alguien
   * puso un color dejaba de tenerlo, y lo importado perdía su trazabilidad.
   *
   * Lo que la proyección no sabe expresar no puede destruirlo. Si trae su
   * propio `context` manda ella; si no, se conserva el del documento base.
   */
  const baseById = new Map((base?.entities ?? []).map((entity) => [entity.id, entity]));
  const projected = projection.entities.map((entity) => {
    if (entity.context !== undefined) return entity;
    const previous = baseById.get(entity.id);
    return previous?.context === undefined
      ? entity
      : ({ ...entity, context: structuredClone(previous.context) } as CadEntity);
  });
  const entities = [...projected, ...preserved].sort(byId);
  const current = base ? migrateCadDocument(base) : projection;
  return {
    ...current,
    meta: { ...current.meta, schema: CAD_DOCUMENT_SCHEMA, unit: projection.meta.unit },
    layers: projection.layers.length ? projection.layers : current.layers,
    entities,
    // `entities` va ordenado por id para canonicalización; derivar el orden de
    // dibujo de ahí lo alfabetizaba en CADA reproyección (tras editar una
    // propiedad, transformar o mover un grip). Se conserva el z-order previo.
    modelSpace: {
      entityIds: preserveDrawOrder(
        base?.modelSpace?.entityIds ?? [],
        entities.map((entity) => entity.id),
      ),
    },
  };
}
