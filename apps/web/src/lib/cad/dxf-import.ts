/* eslint-disable @typescript-eslint/no-explicit-any */
import DxfParser from "dxf-parser";
import type { CadDimensionEntity } from "./associative-dimension";
import type { CadMleaderEntity } from "./associative-mleader";
// El aplanado de un INSERT vive en su propio módulo: es una pieza coherente y
// este archivo está en su asignación de tamaño.
import {
  transformInsertPrimitive,
  type CadDxfInsertTransform,
} from "./dxf-insert-transform";
import type { CadDxfSchema4Kind, CadDxfSchema4Payload } from "./dxf-schema4";
// La lectura de pares crudos y los parsers de las anotaciones semánticas viven
// en sus propios módulos: este archivo está en su asignación de tamaño y los
// tipos del esquema 4 necesitaban sitio.
import { num, pt, rawDxfPairs } from "./dxf-read-core";
import {
  decodeComponent,
  insertSignature,
  parseRawBlockXdata,
  type RawBlockXdata,
} from "./dxf-block-xdata";
import {
  parseRawDxfMTexts,
  parseRawDxfSemanticDimensions,
  parseRawDxfSemanticMleaders,
} from "./dxf-read-annotations";
import {
  DXF_SCHEMA4_ENTITY_TYPES,
  parseRawDxfSchema4,
  type CadDxfImportedImageDefinition,
} from "./dxf-read-schema4";
// Cómo se DIBUJA lo que entra —tabla LTYPE, propiedades de capa, $LTSCALE y la
// presentación por entidad— vive en su propio módulo por el mismo motivo que
// las anotaciones: es una familia coherente y este archivo está en su tope.
import {
  auditDxfLinetypeReferences,
  dxfPropertyIndex,
  parseRawDxfProperties,
  type CadDxfLayerDefinition,
  type CadDxfLinetypeDefinition,
} from "./dxf-read-properties";
import type { CadEntityPresentation } from "./cad-document";
// Las cotas de OTROS CAD tienen su propio lector: rehacerlas exige interpretar
// el código 70 familia a familia, y esa tabla es una pieza coherente por su
// cuenta que además declara lo que NO sabe rehacer.
import { parseRawDxfForeignDimensions } from "./dxf-read-foreign-dimensions";
export { parseRawDxfMTexts, parseRawDxfSemanticDimensions, parseRawDxfSemanticMleaders };

export type CadDxfPrimitiveKind =
  | "line"
  | "polyline"
  | "rect"
  | "text"
  | "circle"
  | "arc"
  | "ellipse"
  | "spline"
  // Esquema 4. Entran por el MISMO canal que el resto —ver `dxf-schema4.ts`—
  // para que exportar un XLINE no exija que cada intermediario aprenda una
  // lista nueva; lo que no es geometría viaja en `schema4`.
  | CadDxfSchema4Kind;
export interface CadDxfPoint {
  x: number;
  y: number;
  /**
   * Abombamiento del segmento que ARRANCA en este vértice (código de grupo 42
   * de DXF): `bulge = tan(θ/4)`, positivo = antihorario. Sólo aplica a
   * polilíneas; su ausencia significa segmento recto.
   */
  bulge?: number;
}
export interface CadDxfPrimitive {
  kind: CadDxfPrimitiveKind;
  layer: string;
  points: CadDxfPoint[];
  /**
   * Cierre EXPLÍCITO del recorrido, sólo para "polyline" y "rect".
   *
   * Antes no existía y el cierre viajaba repitiendo el primer vértice al
   * final. Ese canal lateral perdía información en las dos direcciones: al
   * escribir añadía un segmento nulo y dejaba el grupo 70 en 0, y al leer
   * confundía una polilínea ABIERTA de extremos coincidentes con una cerrada.
   * `undefined` significa "no aplica" (líneas, círculos, textos…).
   */
  closed?: boolean;
  text?: string;
  /** Altura del texto, sólo para kind "text". Sin ella se usa la del exportador. */
  textHeight?: number;
  /** Radio, sólo para kind "circle" y "arc". */
  radius?: number;
  /** Ángulo inicial en grados (CCW desde +X), sólo para kind "arc" y "ellipse". */
  startAngle?: number;
  /** Ángulo final en grados (CCW desde +X), sólo para kind "arc" y "ellipse". */
  endAngle?: number;
  /** Extremo del eje mayor RELATIVO al centro, sólo para kind "ellipse". */
  majorAxis?: CadDxfPoint;
  /** Razón eje menor / eje mayor (0..1], sólo para kind "ellipse". */
  axisRatio?: number;
  /** Grado de la curva, sólo para kind "spline" (points = puntos de control). */
  degree?: number;
  /** Vector de nudos, sólo para kind "spline". */
  knots?: number[];
  /**
   * Carga útil de los tipos del esquema 4: todo lo que no es geometría de
   * `points`. La unión se discrimina por el MISMO `kind` de la primitiva, así
   * que `kind === "image" && schema4?.kind === "image"` estrecha el tipo sin
   * un solo `as`.
   */
  schema4?: CadDxfSchema4Payload;
  /**
   * Cómo se dibuja: tipo de línea, su escala y grosor, con su ORIGEN
   * (`byLayer` / `byBlock` / `explicit`). Va aquí y no en la entidad canónica
   * porque la primitiva es lo que cruza la frontera del formato en las dos
   * direcciones, y una propiedad que sólo existe a un lado se pierde al volver.
   */
  presentation?: CadEntityPresentation;
  /**
   * `true` cuando la entidad de origen traía el código de grupo 67 en 1 —
   * espacio PAPEL, no modelo. `dxf-parser` ya lo captura como
   * `entity.inPaperSpace`; sin este campo, `document-import.ts` mezclaba una
   * hoja de plano con el dibujo del arquitecto en la misma lista de
   * entidades, indistinguibles. Ausente o `false` = espacio modelo, la
   * inmensa mayoría de los ficheros.
   */
  paperSpace?: boolean;
}
export interface CadDxfHatch {
  layer: string;
  pattern: string;
  solid: boolean;
  boundaries: CadDxfPoint[][];
  scale?: number;
  angle?: number;
  origin?: CadDxfPoint;
  islandStyle?: "normal" | "outer" | "ignore";
  /** Ver `CadDxfPrimitive.paperSpace`: mismo código 67, mismo significado. */
  paperSpace?: boolean;
}
export interface CadDxfMText {
  layer: string;
  insertion: CadDxfPoint;
  /** Ver `CadDxfPrimitive.paperSpace`: mismo código 67, mismo significado. */
  paperSpace?: boolean;
  text: string;
  width?: number;
  height?: number;
  rotation?: number;
  alignment?: "top-left" | "top-center" | "top-right" | "middle-left" | "middle-center" | "middle-right" | "bottom-left" | "bottom-center" | "bottom-right";
  paragraphAlignment?: "left" | "center" | "right" | "justify";
  style?: string;
  fontFamily?: string;
  lineSpacing?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  backgroundMask?: boolean;
  backgroundColor?: string;
  backgroundPadding?: number;
  columns?: number;
}
export type CadDxfSemanticDimension = Omit<
  CadDimensionEntity,
  "id" | "type" | "context" | "references" | "associative" | "associationStatus"
  /** annotativeHeightMm: flecha SOBRE PAPEL (mm) si la cota es anotativa. */
> & { blockName: string; annotativeHeightMm?: number; paperSpace?: boolean };
export type CadDxfSemanticMleader = Omit<
  CadMleaderEntity,
  "id" | "type" | "context" | "references" | "associative" | "associationStatus"
> & { sourceOrdinal: number; paperSpace?: boolean };
export interface CadDxfBlockAttributeDefinition {
  defaultValue?: string;
  prompt?: string;
  position?: CadDxfPoint;
  height?: number;
  invisible?: boolean;
  constant?: boolean;
}
export interface CadDxfSemanticInsert {
  block: string;
  insertion: CadDxfPoint;
  scaleX: number;
  scaleY: number;
  rotation: number;
  layer: string;
  attributes: Record<string, string>;
  /** Tipo de línea y grosor de la INSERCIÓN: de aquí tira el BYBLOCK de dentro. */
  presentation?: CadEntityPresentation;
  /** Ver `CadDxfPrimitive.paperSpace`: mismo código 67, mismo significado. */
  paperSpace?: boolean;
}
export interface CadDxfSemanticBlock {
  name: string;
  basePoint: CadDxfPoint;
  primitives: CadDxfPrimitive[];
  inserts: CadDxfSemanticInsert[];
  attributes: Record<string, CadDxfBlockAttributeDefinition>;
  version?: number;
  description?: string;
  keywords?: string[];
  libraryScope?: "document" | "tenant";
  libraryTenantId?: string;
  businessEntityType?: string;
  businessEntityId?: string;
}
export interface CadDxfImportWarning {
  code: string;
  message: string;
  entityType?: string;
  layer?: string;
}
export interface CadDxfImportResult {
  primitives: CadDxfPrimitive[];
  primitiveSources: Array<"entity" | "insert" | "dimension">;
  hatches: CadDxfHatch[];
  mtexts: CadDxfMText[];
  semanticDimensions: CadDxfSemanticDimension[];
  mleaders: CadDxfSemanticMleader[];
  /** Preserved BLOCK table and live top-level INSERTs; primitives remain for backward compatibility. */
  blocks: CadDxfSemanticBlock[];
  inserts: CadDxfSemanticInsert[];
  /**
   * Catálogo de imágenes referenciadas por las entidades IMAGE del fichero,
   * igual que `blocks` lo es de los INSERT: N inserciones comparten un archivo.
   */
  imageDefinitions: CadDxfImportedImageDefinition[];
  warnings: CadDxfImportWarning[];
  layers: string[];
  /**
   * La tabla LTYPE del fichero. Es la CONVENCIÓN del despacho remitente —qué
   * mide un eje, qué mide un oculto— y sin ella dos capas que digan CENTER
   * dibujan ejes distintos según quién las abra.
   */
  linetypes: CadDxfLinetypeDefinition[];
  /**
   * La tabla LAYER con lo que declara de cada capa. `layers` sigue siendo la
   * lista de NOMBRES vistos en las entidades: no son lo mismo, y un fichero
   * puede declarar capas que no usa y usar capas que no declara.
   */
  layerDefinitions: CadDxfLayerDefinition[];
  /** $LTSCALE. Ausente cuando el fichero no la declara. */
  linetypeScale?: number;
  /** Tabla DIMSTYLE del fichero: la norma de acotación del remitente. */
  dimensionStyles?: Record<string, import("./dimension-style").CadDimensionStyleDefinition>;
}

export interface CadDxfWarningSummary {
  key: string;
  code: string;
  entityType?: string;
  layer?: string;
  count: number;
  message: string;
}

export function summarizeDxfImportWarnings(
  warnings: CadDxfImportWarning[],
): CadDxfWarningSummary[] {
  const groups = new Map<string, CadDxfWarningSummary>();
  for (const warning of warnings) {
    const key = [
      warning.code,
      warning.entityType ?? "",
      warning.layer ?? "",
      warning.message,
    ].join("|");
    const existing = groups.get(key);
    if (existing) existing.count += 1;
    else
      groups.set(key, {
        key,
        code: warning.code,
        entityType: warning.entityType,
        layer: warning.layer,
        count: 1,
        message: warning.message,
      });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

const DEFAULT_LAYER = "0";
const MAX_DXF_ENTITIES = 50000;

/**
 * Tipos que se leen FUERA del tokenizador y por eso no cuentan como ausencias.
 *
 * HATCH, MTEXT, MLEADER y los ocho del esquema 4 los lee este módulo sobre los
 * pares crudos; VERTEX, SEQEND y ATTRIB no son entidades sueltas sino partes de
 * la POLYLINE o del INSERT que las contiene. Todo lo demás que aparezca en
 * ENTITIES y no llegue al mapeador ES una ausencia y se declara.
 */
const RAW_ONLY_ENTITY_TYPES = new Set([
  "HATCH",
  "MTEXT",
  "MLEADER",
  "VERTEX",
  "SEQEND",
  "ATTRIB",
  ...DXF_SCHEMA4_ENTITY_TYPES,
]);

/**
 * Cuántas entidades de cada tipo hay REALMENTE en la sección ENTITIES.
 *
 * Existe para cerrar el agujero que la matriz del corpus externo destapó: un
 * 3DSOLID, un MESH, una REGION o un LEADER los descarta `dxf-parser` ANTES de
 * llegar al mapeador, así que no producían primitiva NI aviso. El fichero
 * perdía geometría y el usuario recibía un informe que decía «todo entró». Una
 * ausencia silenciosa es peor que una limitación declarada: la segunda se puede
 * accionar —el remitente explota la entidad y reenvía—, la primera se descubre
 * en obra.
 *
 * Se cuenta sobre los pares crudos porque es la única fuente que ve lo que el
 * tokenizador tiró. Sólo la sección ENTITIES: lo que hay dentro de BLOCKS llega
 * por la expansión de INSERT y tiene su propio camino.
 */
function rawEntityTypeCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  let section: string | null = null;
  let expectSectionName = false;
  for (const pair of rawDxfPairs(text)) {
    if (pair.code === 0) {
      const type = pair.value.toUpperCase();
      if (type === "SECTION") {
        expectSectionName = true;
        continue;
      }
      if (type === "ENDSEC" || type === "EOF") {
        section = null;
        continue;
      }
      if (section === "ENTITIES") counts.set(type, (counts.get(type) ?? 0) + 1);
      continue;
    }
    if (pair.code === 2 && expectSectionName) {
      section = pair.value.toUpperCase();
      expectSectionName = false;
    }
  }
  return counts;
}


function closeEnough(a: number, b: number, tol = 1e-6) {
  return Math.abs(a - b) <= tol;
}
function samePoint(a: CadDxfPoint, b: CadDxfPoint) {
  return closeEnough(a.x, b.x) && closeEnough(a.y, b.y);
}
function isAxisAlignedRect(points: CadDxfPoint[]): boolean {
  const pts =
    points.length === 5 && samePoint(points[0], points[4])
      ? points.slice(0, 4)
      : points;
  if (pts.length !== 4) return false;
  const xs = [...new Set(pts.map((p) => p.x))];
  const ys = [...new Set(pts.map((p) => p.y))];
  return xs.length === 2 && ys.length === 2;
}

export function mapDxfEntityToPrimitive(entity: any): {
  primitive?: CadDxfPrimitive;
  warning?: CadDxfImportWarning;
} {
  const type = String(entity?.type || "").toUpperCase();
  const layer = String(entity?.layer || DEFAULT_LAYER);
  // Código de grupo 67, ya decodificado por `dxf-parser` como booleano. Se
  // consulta UNA vez y se añade a cada primitiva que esta función devuelva:
  // ver el comentario de `CadDxfPrimitive.paperSpace`.
  const paperSpace = entity?.inPaperSpace === true;
  if (type === "LINE") {
    const verts = Array.isArray(entity.vertices)
      ? (entity.vertices.map(pt).filter(Boolean) as CadDxfPoint[])
      : ([
          pt(entity.startPoint ?? entity.start),
          pt(entity.endPoint ?? entity.end),
        ].filter(Boolean) as CadDxfPoint[]);
    if (verts.length >= 2)
      return {
        primitive: {
          kind: "line",
          layer,
          points: verts.slice(0, 2),
          ...(paperSpace ? { paperSpace } : {}),
        },
      };
    return {
      warning: {
        code: "invalid_line",
        message: "LINE sin dos puntos válidos.",
        entityType: type,
        layer,
      },
    };
  }
  if (type === "LWPOLYLINE" || type === "POLYLINE") {
    const points = (Array.isArray(entity.vertices) ? entity.vertices : [])
      .map(pt)
      .filter(Boolean) as CadDxfPoint[];
    if (points.length < 2)
      return {
        warning: {
          code: "invalid_polyline",
          message: "Polyline sin suficientes vértices.",
          entityType: type,
          layer,
        },
      };
    // Bit 1 del grupo 70. `dxf-parser` lo expone como `shape` en POLYLINE y
    // como `closed` en LWPOLYLINE, así que se consultan ambos.
    const closed = !!(entity.closed || entity.shape);
    // Un DXF de otra herramienta sí puede repetir el primer vértice al final
    // de un contorno cerrado. Ese punto es redundante con el bit 70: se funde
    // aquí para que el documento canónico tenga vértices ÚNICOS, en vez de
    // arrastrar un segmento nulo hasta el validador y el dibujo.
    const vertices =
      closed &&
      points.length > 2 &&
      samePoint(points[0], points[points.length - 1])
        ? points.slice(0, -1)
        : points;
    return {
      primitive: {
        // Una polilínea con arcos NUNCA es un rectángulo, aunque sus vértices
        // caigan en las esquinas: degradarla a "rect" perdería los arcos.
        kind:
          closed &&
          !vertices.some((point) => point.bulge) &&
          isAxisAlignedRect(vertices)
            ? "rect"
            : "polyline",
        layer,
        points: vertices,
        closed,
        ...(paperSpace ? { paperSpace } : {}),
      },
    };
  }
  if (type === "CIRCLE") {
    const center = pt(entity.center);
    const radius = num(entity.radius);
    if (center && radius != null && radius > 0)
      return {
        primitive: {
          kind: "circle",
          layer,
          points: [center],
          radius,
          ...(paperSpace ? { paperSpace } : {}),
        },
      };
    return {
      warning: {
        code: "invalid_circle",
        message: "CIRCLE sin centro o radio válido.",
        entityType: type,
        layer,
      },
    };
  }
  if (type === "ARC") {
    const center = pt(entity.center);
    const radius = num(entity.radius);
    // dxf-parser entrega startAngle/endAngle en RADIANES (códigos 50/51 del DXF
    // llegan en grados y la librería los convierte). Los normalizamos a grados
    // para conservar la convención del modelo de primitivas.
    const startRad = num(entity.startAngle);
    const endRad = num(entity.endAngle);
    if (
      center &&
      radius != null &&
      radius > 0 &&
      startRad != null &&
      endRad != null
    )
      return {
        primitive: {
          kind: "arc",
          layer,
          points: [center],
          radius,
          startAngle: (startRad * 180) / Math.PI,
          endAngle: (endRad * 180) / Math.PI,
          ...(paperSpace ? { paperSpace } : {}),
        },
      };
    return {
      warning: {
        code: "invalid_arc",
        message: "ARC sin centro, radio o ángulos válidos.",
        entityType: type,
        layer,
      },
    };
  }
  if (type === "ELLIPSE") {
    const center = pt(entity.center);
    const major = pt(entity.majorAxisEndPoint ?? entity.majorAxisEndpoint);
    const ratio = num(entity.axisRatio);
    // dxf-parser entrega los parámetros 41/42 en RADIANES (así van en el DXF);
    // los normalizamos a grados como el resto del modelo. Elipse completa =
    // 0..360 (2π en el archivo).
    const startRad = num(entity.startAngle) ?? 0;
    const endRad = num(entity.endAngle) ?? Math.PI * 2;
    if (center && major && ratio != null && ratio > 0) {
      return {
        primitive: {
          kind: "ellipse",
          layer,
          points: [center],
          majorAxis: major,
          axisRatio: ratio,
          startAngle: (startRad * 180) / Math.PI,
          endAngle: (endRad * 180) / Math.PI,
          ...(paperSpace ? { paperSpace } : {}),
        },
      };
    }
    return {
      warning: {
        code: "invalid_ellipse",
        message: "ELLIPSE sin centro, eje mayor o razón válidos.",
        entityType: type,
        layer,
      },
    };
  }
  if (type === "SPLINE") {
    const control = (Array.isArray(entity.controlPoints) ? entity.controlPoints : [])
      .map(pt)
      .filter(Boolean) as CadDxfPoint[];
    const degree = num(entity.degree) ?? 3;
    const knots = (Array.isArray(entity.knotValues) ? entity.knotValues : [])
      .map((k: unknown) => Number(k))
      .filter((k: number) => Number.isFinite(k));
    if (control.length >= 2 && degree >= 1) {
      return {
        primitive: {
          kind: "spline",
          layer,
          points: control,
          degree,
          ...(knots.length ? { knots } : {}),
          ...(paperSpace ? { paperSpace } : {}),
        },
      };
    }
    return {
      warning: {
        code: "invalid_spline",
        message: "SPLINE sin suficientes puntos de control.",
        entityType: type,
        layer,
      },
    };
  }
  if (type === "TEXT" || type === "MTEXT") {
    const pos = pt(entity.position ?? entity.startPoint ?? entity.insert);
    const text = String(
      entity.text ?? entity.string ?? entity.value ?? "",
    ).trim();
    if (pos && text)
      return {
        primitive: {
          kind: "text",
          layer,
          points: [pos],
          text,
          ...(paperSpace ? { paperSpace } : {}),
        },
      };
    return {
      warning: {
        code: "invalid_text",
        message: "Texto DXF sin posición o contenido.",
        entityType: type,
        layer,
      },
    };
  }
  return {
    warning: {
      code: "unsupported_entity",
      message: `Entidad DXF no soportada: ${type || "UNKNOWN"}.`,
      entityType: type || "UNKNOWN",
      layer,
    },
  };
}

const MAX_INSERT_DEPTH = 4;

/**
 * Expande un INSERT a las primitivas de su bloque, transformadas (posición +
 * rotación + escala). Los INSERT anidados se expanden recursivamente hasta
 * `MAX_INSERT_DEPTH`; un bloque desconocido o la anisotropía sobre entidades
 * circulares generan advertencia honesta en vez de geometría silenciosamente
 * mala (CAD-NEXT-063).
 */
function expandInsert(
  entity: any,
  blocks: Record<string, any>,
  warnings: CadDxfImportWarning[],
  depth: number,
): CadDxfPrimitive[] {
  const name = String(entity?.name ?? "");
  const layer = String(entity?.layer || DEFAULT_LAYER);
  const block = blocks[name];
  if (!block || !Array.isArray(block.entities)) {
    warnings.push({
      code: "unknown_block",
      message: `INSERT de bloque desconocido: "${name || "(sin nombre)"}".`,
      entityType: "INSERT",
      layer,
    });
    return [];
  }
  if (depth >= MAX_INSERT_DEPTH) {
    warnings.push({
      code: "insert_depth",
      message: `INSERT anidado más allá de ${MAX_INSERT_DEPTH} niveles: "${name}" no se expande.`,
      entityType: "INSERT",
      layer,
    });
    return [];
  }
  const t: CadDxfInsertTransform = {
    x: Number(entity?.position?.x) || 0,
    y: Number(entity?.position?.y) || 0,
    rotationDeg: Number(entity?.rotation) || 0,
    sx: Number(entity?.xScale) || 1,
    sy: Number(entity?.yScale) || 1,
  };
  // Se comparan MAGNITUDES a propósito: el aviso existe porque el radio se
  // aproxima por el promedio, y un espejo puro como `(2, −2)` conserva los
  // ángulos — el círculo sigue siendo círculo y el radio es exacto. Lo que sí
  // se perdía ahí eran los ángulos del arco, y eso lo arregla `mappedInsertAngle`.
  const anisotropic = Math.abs(Math.abs(t.sx) - Math.abs(t.sy)) > 1e-9;
  let warnedAnisotropy = false;
  const expanded: CadDxfPrimitive[] = [];
  for (const child of block.entities) {
    const childType = String(child?.type || "").toUpperCase();
    if (childType === "ATTDEF" || childType === "ATTRIB" || childType === "SEQEND") continue;
    const nested =
      childType === "INSERT"
        ? expandInsert(child, blocks, warnings, depth + 1)
        : (() => {
            const mapped = mapDxfEntityToPrimitive(child);
            if (mapped.warning) warnings.push(mapped.warning);
            return mapped.primitive ? [mapped.primitive] : [];
          })();
    for (const primitive of nested) {
      if (anisotropic && typeof primitive.radius === "number" && !warnedAnisotropy) {
        warnedAnisotropy = true;
        warnings.push({
          code: "anisotropic_insert",
          message: `INSERT "${name}" con escala no uniforme sobre geometría circular: el radio se aproxima por el promedio.`,
          entityType: "INSERT",
          layer,
        });
      }
      expanded.push(transformInsertPrimitive(primitive, t));
    }
  }
  return expanded;
}

/**
 * Expande una entidad DIMENSION a la geometría de su bloque anónimo *D
 * (líneas de extensión, línea de cota, flechas y texto). Si el archivo no
 * trae el bloque renderizado, cae honestamente al texto de la medición en el
 * ancla del texto, con advertencia (CAD-NEXT-066).
 */
function expandDimension(
  entity: any,
  blocks: Record<string, any>,
  warnings: CadDxfImportWarning[],
): CadDxfPrimitive[] {
  const layer = String(entity?.layer || DEFAULT_LAYER);
  const blockName = String(entity?.block ?? "");
  const block = blockName ? blocks[blockName] : undefined;
  // La DIMENSION en sí lleva el 67, no las líneas/flechas de su bloque *D:
  // se hereda al padre a los hijos expandidos.
  const paperSpace = entity?.inPaperSpace === true;
  if (block && Array.isArray(block.entities) && block.entities.length) {
    const expanded: CadDxfPrimitive[] = [];
    for (const child of block.entities) {
      const mapped = mapDxfEntityToPrimitive(child);
      if (mapped.warning) warnings.push(mapped.warning);
      if (mapped.primitive)
        expanded.push(
          paperSpace ? { ...mapped.primitive, paperSpace } : mapped.primitive,
        );
    }
    if (expanded.length) return expanded;
  }
  const anchor = pt(entity?.middleOfText) ?? pt(entity?.anchorPoint);
  const measured = num(entity?.actualMeasurement);
  const label =
    String(entity?.text ?? "").trim() ||
    (measured != null && measured > 0 ? String(Number(measured.toFixed(2))) : "");
  warnings.push({
    code: "dimension_without_block",
    message: `DIMENSION sin bloque de geometría ("${blockName || "(sin nombre)"}"): se conserva sólo el texto de la cota.`,
    entityType: "DIMENSION",
    layer,
  });
  return anchor && label
    ? [
        {
          kind: "text",
          layer,
          points: [anchor],
          text: label,
          ...(paperSpace ? { paperSpace } : {}),
        },
      ]
    : [];
}

function semanticInsert(
  entity: any,
  xdata: RawBlockXdata,
  presentation?: CadEntityPresentation,
): CadDxfSemanticInsert {
  const block = String(entity?.name ?? entity?.block ?? '');
  const x = Number(entity?.position?.x) || 0;
  const y = Number(entity?.position?.y) || 0;
  const rotation = Number(entity?.rotation) || 0;
  const queue = xdata.insertAttributes.get(insertSignature(block, x, y, rotation));
  const attributes = queue?.shift() ?? {};
  return {
    block,
    insertion: { x, y },
    scaleX: Number(entity?.xScale) || 1,
    scaleY: Number(entity?.yScale) || 1,
    rotation,
    layer: String(entity?.layer || DEFAULT_LAYER),
    attributes,
    ...(presentation ? { presentation } : {}),
    ...(entity?.inPaperSpace === true ? { paperSpace: true } : {}),
  };
}

function semanticBlocks(
  parsedBlocks: Record<string, any>,
  xdata: RawBlockXdata,
  warnings: CadDxfImportWarning[],
  blockProperties: Record<string, ReturnType<typeof dxfPropertyIndex>>,
): CadDxfSemanticBlock[] {
  return Object.entries(parsedBlocks).filter(([name]) => !name.startsWith('*')).map(([name, raw]) => {
    const primitives: CadDxfPrimitive[] = [];
    const inserts: CadDxfSemanticInsert[] = [];
    const attributes: Record<string, CadDxfBlockAttributeDefinition> = {};
    // Ordinal POR TIPO dentro del bloque: el mismo criterio con el que se
    // sincroniza el recorrido crudo con lo que entrega el tokenizador.
    const ordinals = new Map<string, number>();
    const presentationAt = blockProperties[name];
    const nextPresentation = (type: string): CadEntityPresentation | undefined => {
      const ordinal = ordinals.get(type) ?? 0;
      ordinals.set(type, ordinal + 1);
      return presentationAt?.(type, ordinal);
    };
    for (const entity of Array.isArray(raw?.entities) ? raw.entities : []) {
      const type = String(entity?.type ?? '').toUpperCase();
      const presentation = nextPresentation(type);
      if (type === 'INSERT') { inserts.push(semanticInsert(entity, xdata, presentation)); continue; }
      if (type === 'ATTDEF') {
        const tag = String(entity?.tag ?? '').trim();
        if (tag) attributes[tag] = {
          defaultValue: String(entity?.text ?? ''), prompt: String(entity?.prompt ?? tag),
          ...(entity?.startPoint ? { position: { x: Number(entity.startPoint.x) || 0, y: Number(entity.startPoint.y) || 0 } } : {}),
          ...(Number(entity?.textHeight) > 0 ? { height: Number(entity.textHeight) } : {}),
          invisible: !!entity?.invisible, constant: !!entity?.constant,
        };
        continue;
      }
      const mapped = mapDxfEntityToPrimitive(entity);
      if (mapped.primitive)
        primitives.push(presentation ? { ...mapped.primitive, presentation } : mapped.primitive);
      if (mapped.warning) warnings.push(mapped.warning);
    }
    const metadata = xdata.definitions.get(name);
    const version = Number(metadata?.get('version'));
    const scope = metadata?.get('libraryScope');
    const libraryScope: CadDxfSemanticBlock['libraryScope'] = scope === 'tenant' || scope === 'document' ? scope : undefined;
    return {
      name,
      basePoint: { x: Number(raw?.position?.x) || 0, y: Number(raw?.position?.y) || 0 },
      primitives,
      inserts,
      attributes,
      ...(Number.isInteger(version) && version > 0 ? { version } : {}),
      ...(metadata?.has('description') ? { description: decodeComponent(metadata.get('description')) } : {}),
      ...(metadata?.has('keywords') ? { keywords: decodeComponent(metadata.get('keywords')).split('\n').filter(Boolean) } : {}),
      ...(libraryScope ? { libraryScope } : {}),
      ...(metadata?.has('libraryTenantId') && decodeComponent(metadata.get('libraryTenantId')) ? { libraryTenantId: decodeComponent(metadata.get('libraryTenantId')) } : {}),
      ...(metadata?.has('businessEntityType') && decodeComponent(metadata.get('businessEntityType')) ? { businessEntityType: decodeComponent(metadata.get('businessEntityType')) } : {}),
      ...(metadata?.has('businessEntityId') && decodeComponent(metadata.get('businessEntityId')) ? { businessEntityId: decodeComponent(metadata.get('businessEntityId')) } : {}),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}


export function parseRawDxfHatches(text: string): {
  hatches: CadDxfHatch[];
  warnings: CadDxfImportWarning[];
} {
  const pairs = rawDxfPairs(text);
  const hatches: CadDxfHatch[] = [];
  const warnings: CadDxfImportWarning[] = [];
  let scannedHatches = 0;
  for (let start = 0; start < pairs.length && scannedHatches < MAX_DXF_ENTITIES; start += 1) {
    if (pairs[start].code !== 0 || pairs[start].value.toUpperCase() !== "HATCH") continue;
    scannedHatches += 1;
    let end = start + 1;
    while (end < pairs.length && pairs[end].code !== 0) end += 1;
    const entityPairs = pairs.slice(start + 1, end);
    const first = (code: number) => entityPairs.find((pair) => pair.code === code)?.value;
    const layer = first(8) || DEFAULT_LAYER;
    const pattern = first(2) || "SOLID";
    const solid = Number(first(70) ?? 0) === 1 || pattern.toUpperCase() === "SOLID";
    const scale = num(first(41));
    const angle = num(first(52));
    const islandCode = Number(first(75) ?? 0);
    const islandStyle: CadDxfHatch["islandStyle"] = islandCode === 1 ? "outer" : islandCode === 2 ? "ignore" : "normal";
    const seedCountIndex = entityPairs.findIndex((pair) => pair.code === 98);
    const seedX = seedCountIndex >= 0
      ? num(entityPairs.find((pair, index) => index > seedCountIndex && pair.code === 10)?.value)
      : null;
    const seedY = seedCountIndex >= 0
      ? num(entityPairs.find((pair, index) => index > seedCountIndex && pair.code === 20)?.value)
      : null;
    const patternOriginX = num(first(43));
    const patternOriginY = num(first(44));
    const origin = seedX !== null && seedY !== null
      ? { x: seedX, y: seedY }
      : patternOriginX !== null && patternOriginY !== null
        ? { x: patternOriginX, y: patternOriginY }
        : undefined;
    const paperSpace = first(67) === "1";
    const boundaries: CadDxfPoint[][] = [];
    let unsupportedEdgePath = false;
    for (let cursor = 0; cursor < entityPairs.length; cursor += 1) {
      if (entityPairs[cursor].code !== 92) continue;
      const pathFlags = Number(entityPairs[cursor].value) || 0;
      const nextPath = entityPairs.findIndex((pair, index) => index > cursor && pair.code === 92);
      const pathEnd = nextPath >= 0 ? nextPath : entityPairs.length;
      if ((pathFlags & 2) === 0) {
        unsupportedEdgePath = true;
        cursor = pathEnd - 1;
        continue;
      }
      const countIndex = entityPairs.findIndex((pair, index) => index > cursor && index < pathEnd && pair.code === 93);
      const vertexCount = countIndex >= 0 ? Number(entityPairs[countIndex].value) : 0;
      const boundary: CadDxfPoint[] = [];
      let pendingX: number | null = null;
      for (let index = countIndex + 1; index < pathEnd && boundary.length < vertexCount; index += 1) {
        const pair = entityPairs[index];
        if (pair.code === 10) pendingX = num(pair.value);
        else if (pair.code === 20 && pendingX !== null) {
          const y = num(pair.value);
          if (y !== null) boundary.push({ x: pendingX, y });
          pendingX = null;
        }
      }
      if (boundary.length >= 3) boundaries.push(boundary);
      cursor = pathEnd - 1;
    }
    if (boundaries.length) {
      hatches.push({
        layer,
        pattern,
        solid,
        boundaries,
        ...(scale !== null && scale > 0 ? { scale } : {}),
        ...(angle !== null ? { angle } : {}),
        ...(origin ? { origin } : {}),
        islandStyle,
        ...(paperSpace ? { paperSpace } : {}),
      });
      if (unsupportedEdgePath)
        warnings.push({
          code: "hatch_edge_path_partial",
          message: "HATCH conserva sus contornos poligonales; un contorno curvo no soportado fue omitido.",
          entityType: "HATCH",
          layer,
        });
    } else {
      warnings.push({
        code: "hatch_unsupported_boundary",
        message: "HATCH sin contorno poligonal compatible; no se importó el relleno.",
        entityType: "HATCH",
        layer,
      });
    }
    start = end - 1;
  }
  return { hatches, warnings };
}

export function importDxfPrimitives(text: string): CadDxfImportResult {
  const rawHatchResult = parseRawDxfHatches(text);
  // Los ocho tipos del esquema 4 se leen sobre los pares crudos: `dxf-parser`
  // no modela XLINE, RAY, WIPEOUT ni IMAGE, y los que sí modela llegarían sin
  // su carga útil (el estilo del punto, las banderas del ATTDEF).
  const schema4 = parseRawDxfSchema4(text);
  const rawMTexts = parseRawDxfMTexts(text);
  const ownDimensions = parseRawDxfSemanticDimensions(text);
  // Las ajenas se leen aparte y se suman: para todo lo que viene después son
  // cotas de pleno derecho, con la única diferencia de que entran desligadas.
  const foreign = parseRawDxfForeignDimensions(text);
  const semanticDimensions = [...ownDimensions, ...foreign.dimensions.map((entry) => entry.dimension)];
  const foreignDimensionOrdinals = new Set(foreign.dimensions.map((entry) => entry.ordinal));
  const mleaders = parseRawDxfSemanticMleaders(text);
  const blockXdata = parseRawBlockXdata(text);
  // Una sola pasada para todo lo que dice CÓMO se dibuja el fichero.
  const properties = parseRawDxfProperties(text);
  const warnings: CadDxfImportWarning[] = [
    ...rawHatchResult.warnings,
    ...properties.warnings.map((warning) => ({ ...warning })),
    ...auditDxfLinetypeReferences(properties),
    ...foreign.warnings,
  ];
  let parsed: any;
  try {
    parsed = new (DxfParser as any)().parseSync(text);
  } catch {
    return {
      primitives: [],
      primitiveSources: [],
      hatches: rawHatchResult.hatches,
      mtexts: rawMTexts,
      semanticDimensions,
      mleaders,
      blocks: [],
      inserts: [],
      imageDefinitions: [],
      linetypes: properties.linetypes, layerDefinitions: properties.layers,
    ...(Object.keys(properties.dimensionStyles).length ? { dimensionStyles: properties.dimensionStyles } : {}),
      ...(properties.linetypeScale !== undefined ? { linetypeScale: properties.linetypeScale } : {}),
      layers: [...new Set([...rawHatchResult.hatches.map((hatch) => hatch.layer), ...rawMTexts.map((mtext) => mtext.layer), ...semanticDimensions.map((dimension) => dimension.layer), ...mleaders.map((mleader) => mleader.layer)])].sort(),
      warnings: [
        ...warnings,
        { code: "parse_failed", message: "No se pudo parsear el DXF." },
      ],
    };
  }
  const remainingEntityCapacity = Math.max(0, MAX_DXF_ENTITIES - rawHatchResult.hatches.length - rawMTexts.length - semanticDimensions.length - mleaders.length);
  const entities: any[] = Array.isArray(parsed?.entities)
    ? parsed.entities.slice(0, remainingEntityCapacity)
    : [];
  const parsedBlocks: Record<string, any> =
    parsed?.blocks && typeof parsed.blocks === "object" ? parsed.blocks : {};
  const blockProperties = Object.fromEntries(
    Object.entries(properties.blocks).map(([name, entries]) => [name, dxfPropertyIndex(entries)]),
  );
  const blocks = semanticBlocks(parsedBlocks, blockXdata, warnings, blockProperties);
  const entityPresentationAt = dxfPropertyIndex(properties.entities);
  const inserts = entities
    .filter((entity) => String(entity?.type || "").toUpperCase() === "INSERT")
    .map((entity, ordinal) => semanticInsert(entity, blockXdata, entityPresentationAt("INSERT", ordinal)));
  const primitives: CadDxfPrimitive[] = [];
  const primitiveSources: CadDxfImportResult["primitiveSources"] = [];
  const layers = new Set<string>();
  /**
   * Cursor sobre el orden REAL de la sección ENTITIES.
   *
   * Las primitivas del esquema 4 se intercalan donde estaban en vez de
   * amontonarse al principio: el orden de esa sección ES el orden de dibujo, y
   * para un WIPEOUT eso no es cosmético — su sitio en la pila es lo que decide
   * qué tapa. El cursor se sincroniza por TIPO, así que si el tokenizador se
   * saltó una entidad que el recorrido crudo sí vio, el desfase se corrige solo
   * en la siguiente coincidencia.
   */
  let orderCursor = 0;
  /**
   * Avanza hasta consumir el hueco de la entidad `type` que el tokenizador está
   * entregando, emitiendo por el camino las primitivas del esquema 4 que la
   * preceden. Con `null` vacía lo que quede detrás de la última.
   */
  const flushSchema4Upto = (type: string | null) => {
    while (orderCursor < schema4.order.length) {
      const slot = schema4.order[orderCursor];
      orderCursor += 1;
      if (slot.schema4Index !== null) {
        const primitive = schema4.primitives[slot.schema4Index];
        // El recorrido de propiedades enumera la sección ENTITIES con el MISMO
        // criterio que `schema4.order` —sin VERTEX, SEQEND ni ATTRIB—, así que
        // las dos listas van en paralelo y la posición es exacta, no un
        // emparejamiento por tipo que se desalinee con el primer hueco.
        const presentation = properties.entities[orderCursor - 1]?.presentation;
        primitives.push(presentation ? { ...primitive, presentation } : primitive);
        primitiveSources.push("entity");
        layers.add(primitive.layer);
      }
      // Este hueco ES el de la entidad que trae el tokenizador: se para aquí.
      if (type !== null && slot.type === type) return;
    }
  };
  /** Presentación de la entidad que el tokenizador acaba de entregar. */
  const currentPresentation = (type: string): CadEntityPresentation | undefined => {
    const entry = properties.entities[orderCursor - 1];
    return entry?.type === type ? entry.presentation : undefined;
  };

  const semanticDimensionBlocks = new Set(ownDimensions.map((dimension) => dimension.blockName));
  // Ordinal y no nombre de bloque: una cota ajena puede no traer el código 2, y
  // dos cotas distintas pueden compartirlo si el remitente reutilizó el bloque.
  let dimensionOrdinal = -1;
  const semanticMleaderOrdinals = new Set(mleaders.map((mleader) => mleader.sourceOrdinal));
  let mleaderOrdinal = -1;
  for (const entity of entities) {
    if (primitives.length >= remainingEntityCapacity) break;
    const type = String(entity?.type || "").toUpperCase();
    flushSchema4Upto(type);
    if (type === "MLEADER") {
      mleaderOrdinal += 1;
      if (semanticMleaderOrdinals.has(mleaderOrdinal)) continue;
    }
    if (type === "MTEXT") continue;
    // Ya los leyó `parseRawDxfSchema4`. Sin este salto, `dxf-parser` los daría
    // por no soportados y el fichero llegaría con un aviso por cada uno.
    if (DXF_SCHEMA4_ENTITY_TYPES.has(type)) continue;
    if (type === "INSERT") {
      // Expansión de bloques (CAD-NEXT-063): las puertas/luminarias/mobiliario
      // insertados dejan de perderse como "no soportados".
      for (const primitive of expandInsert(entity, parsedBlocks, warnings, 0)) {
        if (primitives.length >= remainingEntityCapacity) break;
        primitives.push(primitive);
        primitiveSources.push("insert");
        layers.add(primitive.layer);
      }
      continue;
    }
    if (type === "DIMENSION") {
      dimensionOrdinal += 1;
      if (foreignDimensionOrdinals.has(dimensionOrdinal)) continue;
      if (semanticDimensionBlocks.has(String(entity?.block ?? entity?.blockName ?? ""))) continue;
      // Cotas nativas (CAD-NEXT-066): la geometría renderizada vive en el
      // bloque anónimo *D que referencia la entidad.
      for (const primitive of expandDimension(entity, parsedBlocks, warnings)) {
        if (primitives.length >= remainingEntityCapacity) break;
        primitives.push(primitive);
        primitiveSources.push("dimension");
        layers.add(primitive.layer);
      }
      continue;
    }
    const mapped = mapDxfEntityToPrimitive(entity);
    if (mapped.primitive) {
      const presentation = currentPresentation(type);
      primitives.push(presentation ? { ...mapped.primitive, presentation } : mapped.primitive);
      primitiveSources.push("entity");
      layers.add(mapped.primitive.layer);
    }
    if (mapped.warning) warnings.push(mapped.warning);
  }
  // Lo que quedara detrás de la última entidad tokenizada.
  flushSchema4Upto(null);
  // Lo que el tokenizador TIRÓ antes de que nadie lo pudiera mapear. Ver
  // `rawEntityTypeCounts`: hasta esta ola se perdía sin aviso.
  const tokenized = new Map<string, number>();
  for (const entity of Array.isArray(parsed?.entities) ? parsed.entities : []) {
    const type = String(entity?.type || "").toUpperCase();
    tokenized.set(type, (tokenized.get(type) ?? 0) + 1);
  }
  for (const [type, count] of rawEntityTypeCounts(text)) {
    if (RAW_ONLY_ENTITY_TYPES.has(type)) continue;
    const dropped = count - (tokenized.get(type) ?? 0);
    // Un aviso POR EJEMPLAR, como el resto del importador: el informe agrupa y
    // cuenta, y un solo aviso por tipo le quitaría el número.
    for (let index = 0; index < dropped; index += 1)
      warnings.push({
        code: "unsupported_entity",
        message: `Entidad DXF no soportada: ${type}.`,
        entityType: type,
      });
  }
  if (
    Array.isArray(parsed?.entities) &&
    parsed.entities.length > remainingEntityCapacity
  )
    warnings.push({
      code: "entity_limit",
      message: `DXF recortado a ${MAX_DXF_ENTITIES} entidades incluyendo HATCH.`,
    });
  for (const hatch of rawHatchResult.hatches) layers.add(hatch.layer);
  for (const mtext of rawMTexts) layers.add(mtext.layer);
  for (const dimension of semanticDimensions) layers.add(dimension.layer);
  for (const mleader of mleaders) layers.add(mleader.layer);
  // `layers` sigue siendo la lista de capas USADAS por las entidades. Las
  // DECLARADAS viajan aparte en `layerDefinitions`: son dos preguntas
  // distintas y fundirlas cambiaría el recuento de todos los ficheros ya
  // medidos sin que nadie lo hubiera pedido.
  return {
    primitives, primitiveSources, hatches: rawHatchResult.hatches, mtexts: rawMTexts,
    semanticDimensions, mleaders, blocks, inserts,
    imageDefinitions: schema4.imageDefinitions,
    linetypes: properties.linetypes, layerDefinitions: properties.layers,
    ...(Object.keys(properties.dimensionStyles).length ? { dimensionStyles: properties.dimensionStyles } : {}),
    ...(properties.linetypeScale !== undefined ? { linetypeScale: properties.linetypeScale } : {}),
    warnings, layers: [...layers].sort(),
  };
}
