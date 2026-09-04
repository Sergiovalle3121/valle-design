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
import type { CadImageDefinition, CadPositionedAttribute, CadSchema4Entity } from "./cad-entities-v4";
import type { CadSchema5Entity } from "./cad-entities-v5";
import type { CadSchema6Entity } from "./cad-entities-v6";
import type { CadSchema7Entity } from "./cad-entities-v7";
import type { CadSchema10DimensionFields } from "./cad-entities-v10";
import type { CadHatchImportedPattern } from "./cad-hatch-imported-pattern";
import { byId, byName } from "./cad-document-shared";

// ---------------------------------------------------------------------------
// Modelo histórico
// ---------------------------------------------------------------------------

/**
 * El adaptador hacia y desde el modelo histórico vive en
 * `cad-document-legacy-adapter.ts`. Se reexporta entero para que ningún
 * consumidor tenga que cambiar su import: la separación es de responsabilidad
 * (modelo canónico vs. proyección compatible), no de API pública.
 */
export {
  cadDocumentToLayout,
  layoutToCadDocument,
  type LayoutAnnotationInput,
  type LayoutAssetInput,
  type LayoutConnectorInput,
  type LayoutInput,
  type LayoutLayerInput,
  type LayoutStationPlacementInput,
} from "./cad-document-legacy-adapter";

// ---------------------------------------------------------------------------
// Documento canónico
// ---------------------------------------------------------------------------

export {
  CAD_DOCUMENT_SCHEMA,
  DEFAULT_LAYER_ID,
  STATIONS_LAYER,
} from "./cad-document-shared";

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
  /**
   * Escala GLOBAL del guion ($LTSCALE). Multiplica a la escala propia de cada
   * entidad; no la sustituye. Es del dibujo entero porque en DXF lo es: un
   * plano a 1:50 la sube para que el trazo discontinuo siga leyéndose, y sin
   * ella todos los guiones salen del tamaño de otro plano. Ausente = 1.
   */
  linetypeScale?: number;
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
      /**
       * Nota libre del objeto. Campo propio, no `context.metadata`: la
       * reproyección trata el `context` como todo-o-nada, así que colgar aquí
       * las notas habría borrado el color explícito y la procedencia.
       */
      notes?: string;
      context?: CadEntityContext;
    }
  | {
      id: string;
      type: "station"; // LEGADO CONGELADO: persistido en documentos de clientes; se lee, no se ofrece (IDENTITY.md)
      x: number;
      y: number;
      w: number;
      h: number;
      rotation: number;
      layer: string;
      tags?: string[];
      notes?: string;
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
  | ({
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
    } & CadSchema10DimensionFields)
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
      /**
       * `bulge` es el arco del tramo que ARRANCA en este vértice (tan(θ/4),
       * positivo = antihorario). `startWidth`/`endWidth` son el grosor de ese
       * mismo tramo en cada punta, en unidades de dibujo — los mismos grupos
       * 40/41 de una LWPOLYLINE.
       *
       * Los grosores son OPCIONALES y su ausencia significa «traza fina», no
       * cero: materializarlos con un valor por defecto cambiaría el texto
       * serializado de todas las polilíneas existentes.
       */
      vertices: (CadPoint3 & { bulge?: number; startWidth?: number; endWidth?: number })[];
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
      legacy?: { kind: string; rotation: number; label?: string; group?: string; tags?: string[]; notes?: string };
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
  | ({
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
    } & CadHatchImportedPattern)
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
      /**
       * Los mismos atributos, pero CON geometría. Ver `CadPositionedAttribute`:
       * `attributes` dice qué vale cada etiqueta y esto dice dónde se dibuja.
       * Conviven; ninguno sustituye al otro.
       */
      positionedAttributes?: CadPositionedAttribute[];
      layer: string;
      context?: CadEntityContext;
    }
  /** Los ocho del esquema 4 (POINT, XLINE, RAY, SOLID, WIPEOUT, IMAGE,
   * ATTDEF, TABLE). Se declaran en `cad-entities-v4.ts`. */
  | CadSchema4Entity
  /**
   * Los dos que estrena el esquema 5: SOLID3D —un sólido B-rep descrito por su
   * ÁRBOL DE CONSTRUCCIÓN, no por su malla— y REGION. Viven en
   * `cad-entities-v5.ts`.
   */
  | CadSchema5Entity
  /**
   * El que estrena el esquema 6: WALL, el muro paramétrico que persiste su
   * EJE, grosor y altura — no su contorno. Vive en `cad-entities-v6.ts`.
   */
  | CadSchema6Entity
  /**
   * El que estrena el esquema 7: OPENING, el hueco ALOJADO en un muro. No
   * persiste coordenadas de mundo: guarda su anfitrión y su distancia sobre el
   * eje. Vive en `cad-entities-v7.ts`.
   */
  | CadSchema7Entity;

export interface CadLayerDef {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
  linetype?: string;
  lineweight?: number;
  plot?: boolean;
  /**
   * CONGELADA (esquema 9, bit 1 del código 70 DXF), distinto de apagada: ni se
   * dibuja, ni se regenera, ni entra en extensión ni en selección. Opcional-
   * ausente como `plot`. La regla vive en `cad-layer-visibility.ts`.
   */
  frozen?: boolean;
}

/**
 * `units` y `arrowhead` en el estilo de cota son lo que permite que una norma de
 * dibujo llegue al usuario sin que él la teclee. La entidad `dimension` ya sabía
 * acotar en metros y rematar con garrapata, pero esos datos vivían SÓLO en la
 * entidad: cada cota nueva nacía en milímetros y con flecha, y el arquitecto
 * mexicano tenía que corregirlas de una en una. Poniéndolos en el ESTILO, la
 * plantilla decide una vez y todas las cotas del documento heredan.
 *
 * Ambos son opcionales: un documento anterior que no los traiga se comporta
 * exactamente igual que antes, así que el serializado de lo ya guardado no
 * cambia ni un byte.
 */
export interface CadStyleTable {
  text: Record<string, { fontFamily?: string; height?: number }>;
  /** DIMSTYLE con nombre: el núcleo de ~30 DIMVARs (dimension-style.ts). */
  dimension: Record<string, import("./dimension-style").CadDimensionStyleDefinition>;
  mleader?: Record<string, { textStyle?: string; arrowSize?: number; doglegLength?: number; landing?: boolean }>;
  table: Record<string, { textStyle?: string; rowHeight?: number }>;
  plot: Record<string, { colorMode?: "color" | "monochrome"; lineweightScale?: number }>;
  /**
   * Catálogo de tipos de línea: nombre → patrón estilo `.lin` (>0 trazo, <0
   * hueco, 0 punto). Sección OPCIONAL — un documento que nunca abrió un DXF con
   * tabla LTYPE no la lleva, y materializarla vacía cambiaría el texto
   * serializado de todos los documentos existentes y con él su hash de versión.
   *
   * Está en la tabla de estilos y no en las capas porque una capa REFERENCIA un
   * tipo de línea por nombre: el patrón es del dibujo, y dos capas que digan
   * CENTER tienen que dibujar el mismo eje.
   */
  linetype?: Record<string, { pattern: number[]; description?: string }>;
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

// Restricciones y parámetros viven en `constraints/constraint-schema.ts` (un
// archivo SIN imports, así que no hay ciclo posible) y se reexportan aquí para
// que todo lo que ya los importaba desde este módulo siga compilando igual.
import type { CadConstraint, CadParameter } from "./constraints/constraint-schema";
export type {
  CadConstraint, CadConstraintAnchor, CadConstraintKind, CadParameter,
} from "./constraints/constraint-schema";

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

// La LÁMINA y su VENTANA GRÁFICA viven en `cad-paper-viewport.ts` desde que la
// ventana tiene cámara (esquema 8): es un archivo SIN imports de valor, así que
// no hay ciclo posible, y aquí sólo quedaba engordando el trinquete. Se
// reexportan enteros para que ningún consumidor cambie de import.
import type { CadPaperSpace } from "./cad-paper-viewport";
export type {
  CadPaperSpace, CadPaperViewport, CadViewportDerivation,
  CadViewportDerivationStatus, CadViewportSectionPlane, CadViewportView,
  CadViewportViewKind, CadSolviewLayerSuffix,
} from "./cad-paper-viewport";

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

/**
 * El vocabulario de COLABORACIÓN —versiones, hilos, enlaces de revisión y
 * auditoría— vive en `cad-document-collaboration.ts`. Se reexporta entero para
 * que ningún consumidor cambie de import: la separación es de responsabilidad
 * (geometría vs. proceso de revisión), no de API pública.
 */
export type {
  CadCollaborationAuditEvent,
  CadCollaborationState,
  CadReviewLink,
  CadReviewThread,
  CadReviewThreadStatus,
  CadVersionSnapshot,
} from "./cad-document-collaboration";
import type { CadCollaborationState } from "./cad-document-collaboration";

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
  /** Parámetros con nombre. Sección OPCIONAL: sólo existe si se usan. */
  parameters?: CadParameter[];
  externalReferences: CadExternalReference[];
  unsupportedEntities: CadOpaqueEntity[];
  lossManifest: CadLossManifestEntry[];
  publications: CadPublicationRecord[];
  /** Review/merge metadata persisted in the same tenant-scoped CAS document. */
  collaboration?: CadCollaborationState;
  /** Extensión industrial: agrupaciones de estaciones. Ausente si no se usan. */
  cells?: CadCellDefinition[];
  /**
   * Catálogo de imágenes referenciadas por las entidades IMAGE, igual que
   * `blocks` lo es de los INSERT: N inserciones comparten un archivo. Sección
   * OPCIONAL — un documento que nunca insertó una imagen se serializa
   * exactamente igual que antes del esquema 4.
   */
  imageDefinitions?: CadImageDefinition[];
  /**
   * Estados de capa con nombre (esquema 9). Sección OPCIONAL: hasta el v8
   * vivían en la sesión y LAYERSTATE avisaba de que no sobrevivían a una
   * recarga; ahora viajan con el documento. Captura y restauración viven en
   * `layer-states.ts`; la escritura entra por el lote (`layer-state`).
   */
  layerStates?: CadNamedLayerState[];
}

// Sólo TIPOS: se borran al compilar, así que no cierran ningún ciclo.
import type { CadNamedLayerState } from "./layer-states";
export type { CadLayerStateEntry, CadNamedLayerState } from "./layer-states";

/** Reexporta el vocabulario del esquema 4 desde el módulo del documento. */
export type {
  CadAttdefEntity,
  CadImageDefinition,
  CadImageEntity,
  CadPointEntity,
  CadPositionedAttribute,
  CadRayEntity,
  CadSchema4Entity,
  CadSolidEntity,
  CadTableCell,
  CadTableEntity,
  CadTextAnchor,
  CadWipeoutEntity,
  CadXLineEntity,
} from "./cad-entities-v4";
export { CAD_SCHEMA_4_ENTITY_TYPES } from "./cad-entities-v4";

/** Y el del esquema 5: sólidos B-rep y regiones. */
export type {
  CadRegionEntity,
  CadSchema5Entity,
  CadSolid3dEntity,
  CadSolidFrame,
  CadSolidNode,
  CadSolidNodeOp,
  CadSolidPlacement,
  CadSolidPlane,
  CadSolidProfile,
} from "./cad-entities-v5";
export {
  CAD_SCHEMA_5_ENTITY_TYPES,
  CAD_SOLID_LEAF_OPS,
  CAD_SOLID_NODE_OPS,
  CAD_SOLID_OPERATION_OPS,
} from "./cad-entities-v5";

/** Y el del esquema 6: el muro paramétrico. */
export type { CadSchema6Entity, CadWallEntity } from "./cad-entities-v6";
export { CAD_SCHEMA_6_ENTITY_TYPES } from "./cad-entities-v6";

/** Y el del esquema 7: el hueco alojado en un muro. */
export type { CadOpeningEntity, CadOpeningKind, CadSchema7Entity } from "./cad-entities-v7";
export { CAD_SCHEMA_7_ENTITY_TYPES } from "./cad-entities-v7";

// ---------------------------------------------------------------------------
// Versionado + serialización determinista
// ---------------------------------------------------------------------------

/** Ayudas de orden de dibujo: viven en el módulo hoja, se reexportan aquí. */
export { preserveDrawOrder, replaceEntityIdsAt } from "./cad-document-shared";

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
    modelSpace: { entityIds: [...doc.modelSpace.entityIds] },
    paperSpaces: structuredClone(doc.paperSpaces),
    styles: structuredClone(doc.styles),
    blocks: structuredClone(doc.blocks),
    constraints: structuredClone(doc.constraints),
    ...(doc.parameters ? { parameters: structuredClone(doc.parameters) } : {}),
    externalReferences: structuredClone(doc.externalReferences),
    unsupportedEntities: structuredClone(doc.unsupportedEntities),
    lossManifest: structuredClone(doc.lossManifest),
    publications: structuredClone(doc.publications),
    collaboration: doc.collaboration ? structuredClone(doc.collaboration) : undefined,
    ...(doc.cells ? { cells: structuredClone(doc.cells) } : {}),
    ...(doc.imageDefinitions ? { imageDefinitions: structuredClone(doc.imageDefinitions) } : {}),
    ...(doc.layerStates ? { layerStates: structuredClone(doc.layerStates) } : {}),
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
    ...(doc.parameters ? { parameters: [...doc.parameters].sort(byName).map(stableValue) } : {}),
    externalReferences: [...doc.externalReferences].sort(byId).map(stableValue),
    unsupportedEntities: [...doc.unsupportedEntities].sort(byId).map(stableValue),
    lossManifest: doc.lossManifest.map(stableValue),
    publications: doc.publications.map(stableValue),
    collaboration: doc.collaboration ? stableValue(doc.collaboration) : undefined,
    ...(doc.cells ? { cells: [...doc.cells].sort(byId).map(stableValue) } : {}),
    // Catálogo, no orden de dibujo: ordenarlo por id es canonicalización
    // legítima, igual que con `blocks`.
    ...(doc.imageDefinitions
      ? { imageDefinitions: [...doc.imageDefinitions].sort(byId).map(stableValue) }
      : {}),
    // Catálogo por NOMBRE: ordenarlo es canonicalización legítima, como blocks.
    ...(doc.layerStates ? { layerStates: [...doc.layerStates].sort(byName).map(stableValue) } : {}),
  };
  return JSON.stringify(payload);
}

/** El recuento por tipo vive en `cad-document-stats.ts`; misma puerta pública. */
export { cadDocumentStats } from "./cad-document-stats";

/**
 * Migración y lectura: viven en `cad-document-migrate.ts`, que normaliza lo
 * que llega del disco o de una versión anterior. Se reexportan aquí porque
 * son la puerta pública de siempre.
 */
export {
  migrateCadDocument,
  migrateLegacyMleaderCompositions,
  parseCadDocument,
} from "./cad-document-migrate";

/**
 * La REPROYECCIÓN del editor heredado vive en `cad-document-projection.ts`. Se
 * reexporta aquí porque es la puerta pública de siempre; salió de este archivo
 * por el trinquete de tamaño, no por un cambio de contrato.
 */
export { replaceEditorProjection } from "./cad-document-projection";
