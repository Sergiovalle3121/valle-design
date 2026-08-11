/**
 * Vocabulario DXF de los ocho tipos del esquema 4.
 *
 * ## Por qué viajan como PRIMITIVA y no como una lista aparte
 *
 * El modelo de exportación (`CadDxfExportModel`) tiene una lista por familia:
 * `primitives`, `hatches`, `mtexts`, `semanticDimensions`… Añadir ocho listas
 * más obligaría a que TODO el que compone un modelo —incluido el editor, que
 * las enumera campo a campo— aprendiera ocho nombres nuevos a la vez.
 *
 * El canal que ya existe es `primitives`: sale de `cadEntityToDxfPrimitive`,
 * pasa por `cadDocumentNativeDxfPrimitives` y llega al escritor sin que nadie
 * intermedio tenga que enterarse. Estos tipos entran por ahí: la geometría va
 * en `points`, como en cualquier primitiva, y lo que no es geometría va en
 * `schema4`, una unión discriminada por el MISMO `kind` de la primitiva.
 *
 * El resultado es que exportar un XLINE no exigió tocar ni una línea del
 * componente que dispara la exportación.
 *
 * Módulo de TIPOS: sólo importa tipos, así que se borra al compilar.
 */
import type { CadTextAnchor } from "./cad-entities-v4";
import type { CadDxfPoint } from "./dxf-import";

/** Los ocho `kind` de primitiva que estrena el esquema 4. */
export const DXF_SCHEMA4_KINDS = [
  "point",
  "xline",
  "ray",
  "solid",
  "wipeout",
  "image",
  "attdef",
  "table",
] as const;

export type CadDxfSchema4Kind = (typeof DXF_SCHEMA4_KINDS)[number];

/**
 * La imagen referenciada, tal y como la necesita la sección OBJECTS.
 *
 * `key` es el nombre con el que la entrada vive en `ACAD_IMAGE_DICT`: en DXF
 * una IMAGE no lleva su archivo dentro, apunta a un IMAGEDEF que vive en un
 * diccionario. Viaja DENTRO de la primitiva —y no en una tabla aparte del
 * modelo— para que una primitiva sea autosuficiente: quien la escribe tiene
 * todo lo que necesita sin consultar el documento.
 */
export interface CadDxfImageDefinitionRef {
  key: string;
  path: string;
  pixelWidth: number;
  pixelHeight: number;
  loaded?: boolean;
}

/** POINT: la geometría es `points[0]`; el estilo es global del fichero. */
export interface CadDxfSchema4PointPayload {
  kind: "point";
  /** Códigos de `PDMODE`: 0 punto, 1 nada, 2 cruz, 3 aspa, 4 tick, +32/+64. */
  style?: number;
  /** `PDSIZE`: negativo = porcentaje del viewport. */
  size?: number;
}

/** XLINE y RAY: `points[0]` es el punto base (grupo 10), `direction` el 11. */
export interface CadDxfSchema4RayPayload {
  kind: "xline" | "ray";
  direction: CadDxfPoint;
}

/** SOLID: `points` va en orden de CONTORNO; el corbatín lo pone el escritor. */
export interface CadDxfSchema4SolidPayload {
  kind: "solid";
}

/** WIPEOUT: `points` es el contorno en coordenadas de dibujo. */
export interface CadDxfSchema4WipeoutPayload {
  kind: "wipeout";
  /** ¿Se dibuja el borde? (`WIPEOUTFRAME`). */
  frame?: boolean;
}

/** IMAGE: `points[0]` es la esquina inferior izquierda (grupo 10). */
export interface CadDxfSchema4ImagePayload {
  kind: "image";
  /** Tamaño de UN píxel en unidades de dibujo, con la rotación dentro. */
  uVector: CadDxfPoint;
  vVector: CadDxfPoint;
  /** Tamaño del encuadre EN PÍXELES (grupos 13/23). */
  pixelWidth: number;
  pixelHeight: number;
  brightness?: number;
  contrast?: number;
  fade?: number;
  showImage?: boolean;
  clipBoundary?: CadDxfPoint[];
  definition: CadDxfImageDefinitionRef;
}

/** ATTDEF: `points[0]` es el punto de inserción del texto. */
export interface CadDxfSchema4AttdefPayload {
  kind: "attdef";
  tag: string;
  prompt?: string;
  defaultValue?: string;
  height?: number;
  rotation?: number;
  style?: string;
  alignment?: CadTextAnchor;
  invisible?: boolean;
  constant?: boolean;
  verify?: boolean;
  preset?: boolean;
  lockPosition?: boolean;
}

export interface CadDxfSchema4TableCell {
  row: number;
  column: number;
  text: string;
  rowSpan?: number;
  columnSpan?: number;
  alignment?: CadTextAnchor;
  textHeight?: number;
  textStyle?: string;
}

/** TABLE: `points[0]` es la esquina superior izquierda de la rejilla. */
export interface CadDxfSchema4TablePayload {
  kind: "table";
  rows: number;
  columns: number;
  rowHeights: number[];
  columnWidths: number[];
  cells: CadDxfSchema4TableCell[];
  rotation?: number;
  style?: string;
}

export type CadDxfSchema4Payload =
  | CadDxfSchema4PointPayload
  | CadDxfSchema4RayPayload
  | CadDxfSchema4SolidPayload
  | CadDxfSchema4WipeoutPayload
  | CadDxfSchema4ImagePayload
  | CadDxfSchema4AttdefPayload
  | CadDxfSchema4TablePayload;

/**
 * Banderas del grupo 70 de ATTDEF. Son las mismas cuatro de AutoCAD y se
 * nombran aquí para que el escritor y el lector no las repitan como números
 * sueltos en dos sitios.
 */
export const DXF_ATTDEF_INVISIBLE = 1;
export const DXF_ATTDEF_CONSTANT = 2;
export const DXF_ATTDEF_VERIFY = 4;
export const DXF_ATTDEF_PRESET = 8;

/**
 * Alineación ↔ pareja (72 horizontal, 74 vertical) de TEXT/ATTDEF.
 *
 * Se declara una vez y se lee en los dos sentidos: si sólo existiera el mapa de
 * ida, la vuelta se escribiría a ojo y la ida y vuelta dejaría de ser simétrica
 * exactamente en las alineaciones raras.
 */
export const DXF_TEXT_ANCHOR_CODES: Record<CadTextAnchor, { h: number; v: number }> = {
  "top-left": { h: 0, v: 3 },
  "top-center": { h: 1, v: 3 },
  "top-right": { h: 2, v: 3 },
  "middle-left": { h: 0, v: 2 },
  "middle-center": { h: 1, v: 2 },
  "middle-right": { h: 2, v: 2 },
  "bottom-left": { h: 0, v: 1 },
  "bottom-center": { h: 1, v: 1 },
  "bottom-right": { h: 2, v: 1 },
};

export function dxfTextAnchorFromCodes(
  horizontal: number,
  vertical: number,
): CadTextAnchor {
  for (const [anchor, codes] of Object.entries(DXF_TEXT_ANCHOR_CODES))
    if (codes.h === horizontal && codes.v === vertical)
      return anchor as CadTextAnchor;
  return "bottom-left";
}
