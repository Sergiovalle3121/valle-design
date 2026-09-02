import type { CadDxfPoint, CadDxfPrimitive } from "./dxf-import";
import type { CadEntityPresentation } from "./cad-document";
import type { CadTextAnchor } from "./cad-entities-v4";
import type { CadDimensionEntity } from "./associative-dimension";
import { buildCadMleaderGeometry, type CadMleaderEntity } from "./associative-mleader";
import { DEFAULT_MLEADER_STYLE } from "./mleader";
import { clampedKnots } from "./dxf-nurbs-knots";
import { DXF_XDATA_APP_BLOCK, DXF_XDATA_APP_MLEADER } from "@valle-design/contracts";
// Los pares código/valor, el saneado de nombres y el formato numérico viven en
// su propio módulo hoja: los escritores del esquema 4 usan EXACTAMENTE los
// mismos, y duplicarlos era la manera segura de que divergiesen.
import {
  DEFAULT_LAYER,
  MEASUREMENT_LAYER,
  TEXT_LAYER,
  fmt,
  pushPair,
  pushPoint,
  pushPresentation,
  safeLayerName,
  safeStyleName,
  safeText,
} from "./dxf-write-core";
// La sección TABLES vive en su propio módulo: es lo que DECLARA cómo se dibuja
// el fichero —tipos de línea, grosores y estilos— y es una pieza coherente.
import { pushLayerTable } from "./dxf-write-tables";
// Los ocho tipos del esquema 4 tienen su propio módulo de escritura: cada uno
// con su código DXF real y con las rarezas del formato (el corbatín del SOLID,
// el diccionario de imágenes) resueltas ahí y no aquí.
import {
  createSchema4Objects,
  pushAttdef,
  pushImage,
  pushPointEntity,
  pushPositionedAttrib,
  pushSchema4Objects,
  pushSolid,
  pushWipeout,
  pushXLine,
  schema4PointVariables,
  type CadDxfSchema4Objects,
} from "./dxf-write-schema4";
import { tableToDxfPrimitives } from "./dxf-schema4-table";
// Las cotas —heredadas y semánticas— viven en su propio módulo de escritura.
import {
  dimensionBlockPrimitives,
  prepareDimensions,
  prepareSemanticDimensions,
  pushDimension,
  pushSemanticDimension,
  semanticDimensionBlockPrimitives,
} from "./dxf-write-dimensions";
import { hatchLoops, pushHatch } from "./dxf-export-hatch";

export type CadDxfExportUnit = "mm" | "m";
export interface CadDxfExportOptions {
  units?: CadDxfExportUnit;
  fileComment?: string;
}
export interface CadDxfExportLayer {
  name: string;
  color?: number;
  /** Tipo de línea de la capa (código 6). Ausente = CONTINUOUS. */
  linetype?: string;
  /**
   * Grosor de la capa en CENTÉSIMAS de milímetro (código 370), la unidad del
   * formato. La paleta de capas del editor guarda milímetros; la conversión
   * ocurre en `cad-effective-style.ts` y en el ensamblador de exportación, no
   * aquí: este tipo describe lo que se ESCRIBE al fichero.
   */
  lineweight?: number;
  /** Capa congelada: se escribe como bit 1 del código 70, como lee AutoCAD. */
  frozen?: boolean;
}
/** Definición de la tabla LTYPE: el patrón que hay que escribir. */
export interface CadDxfExportLinetype {
  name: string;
  description?: string;
  /** Longitudes con signo: >0 trazo, <0 hueco, 0 punto. */
  pattern: number[];
}
export interface CadDxfExportText {
  layer?: string;
  position: CadDxfPoint;
  text: string;
  height?: number;
  /**
   * Rotación en GRADOS, la unidad del documento y la del código de grupo 50.
   * Sin ella, un rótulo girado —el nombre de un eje inclinado, una cota de
   * nivel siguiendo una rampa— volvía horizontal al reimportar.
   */
  rotation?: number;
  /** Nombre del estilo de texto (código 7). */
  style?: string;
}
export interface CadDxfExportMText {
  layer?: string;
  insertion: CadDxfPoint;
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
export type CadDxfExportSemanticDimension = Omit<
  CadDimensionEntity,
  "id" | "type" | "context" | "references" | "associative" | "associationStatus"
> & { /** flecha SOBRE PAPEL (mm) si la cota es anotativa */ annotativeHeightMm?: number };
export type CadDxfExportMleader = Omit<
  CadMleaderEntity,
  "id" | "type" | "context" | "references" | "associative" | "associationStatus"
>;
export interface CadDxfExportMeasurement {
  layer?: string;
  from: CadDxfPoint;
  to: CadDxfPoint;
  label?: string;
  /** Desfase perpendicular de la línea de cota (con signo); 0 = sobre el tramo. */
  offset?: number;
}
/** Área rellena (HATCH SOLID) delimitada por un contorno cerrado (CAD-NEXT-067). */
export interface CadDxfExportHatch {
  layer?: string;
  /** Vértices del contorno único; compatibilidad con el adaptador de cajas. */
  points?: CadDxfPoint[];
  /** Primer contorno exterior y, opcionalmente, contornos interiores. */
  boundaries?: CadDxfPoint[][];
  pattern?: string;
  solid?: boolean;
  scale?: number;
  angle?: number;
  /** Origen del patrón/seed point. */
  origin?: CadDxfPoint;
  /** Regla de detección de islas DXF: normal=0, outer=1, ignore=2. */
  islandStyle?: "normal" | "outer" | "ignore";
}
/** Definición de bloque reutilizable (sección BLOCKS — CAD-NEXT-064). */
export interface CadDxfExportBlock {
  name: string;
  primitives: CadDxfPrimitive[];
  inserts?: CadDxfExportInsert[];
  basePoint?: CadDxfPoint;
  attributes?: Record<string, {
    defaultValue?: string;
    prompt?: string;
    position?: CadDxfPoint;
    height?: number;
    invisible?: boolean;
    constant?: boolean;
  }>;
  version?: number;
  description?: string;
  keywords?: string[];
  libraryScope?: "document" | "tenant";
  libraryTenantId?: string;
  businessEntityType?: string;
  businessEntityId?: string;
}
/** Referencia INSERT a un bloque, con su transformación. */
export interface CadDxfExportInsert {
  block: string;
  /** De aquí hereda la geometría del bloque que diga BYBLOCK. */
  presentation?: CadEntityPresentation;
  x: number;
  y: number;
  /** Grados CCW. */
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  layer?: string;
  attributes?: Record<string, string>;
  /**
   * Atributos CON geometría, ya en coordenadas del mundo. Cuando existen son la
   * fuente de los ATTRIB: el mapa plano `attributes` dice qué vale cada
   * etiqueta, pero no dónde se dibuja, y recomponer la posición desde la
   * definición del bloque dejaba el texto en un sitio distinto del que el
   * usuario veía en pantalla.
   */
  positionedAttributes?: Array<{
    tag: string;
    value: string;
    insertion: CadDxfPoint;
    height?: number;
    rotation?: number;
    style?: string;
    alignment?: CadTextAnchor;
    invisible?: boolean;
  }>;
}
export interface CadDxfExportModel {
  primitives?: CadDxfPrimitive[];
  layers?: CadDxfExportLayer[];
  /**
   * Tabla LTYPE. Sin ella, una capa o una entidad que nombre CENTER produce un
   * fichero que REFERENCIA un tipo de línea inexistente: AutoCAD lo abre y
   * dibuja continuo, así que el plano se degrada sin un solo mensaje.
   */
  linetypes?: CadDxfExportLinetype[];
  /** $LTSCALE. Ausente = no se escribe y el destino usa la suya. */
  linetypeScale?: number;
  texts?: CadDxfExportText[];
  mtexts?: CadDxfExportMText[];
  measurements?: CadDxfExportMeasurement[];
  semanticDimensions?: CadDxfExportSemanticDimension[];
  /** Tabla DIMSTYLE (norma de acotación); códec en dimension-style.ts. */ dimensionStyles?: Record<string, import("./dimension-style").CadDimensionStyleDefinition>;
  mleaders?: CadDxfExportMleader[];
  blocks?: CadDxfExportBlock[];
  inserts?: CadDxfExportInsert[];
  hatches?: CadDxfExportHatch[];
}
export interface CadDxfExportResult {
  content: string;
  layers: string[];
  entityCount: number;
}

const PRIMITIVE_LABEL_HEIGHT = 220;
const DXF_UNIT_CODES: Record<CadDxfExportUnit, number> = { mm: 4, m: 6 };
function uniqueLayers(model: CadDxfExportModel): string[] {
  const names = new Set<string>([DEFAULT_LAYER]);
  for (const layer of model.layers ?? []) names.add(safeLayerName(layer.name));
  for (const primitive of model.primitives ?? [])
    names.add(safeLayerName(primitive.layer));
  for (const block of model.blocks ?? []) {
    for (const primitive of block.primitives) names.add(safeLayerName(primitive.layer));
    for (const insert of block.inserts ?? []) names.add(safeLayerName(insert.layer));
  }
  for (const insert of model.inserts ?? [])
    names.add(safeLayerName(insert.layer));
  for (const hatch of model.hatches ?? [])
    names.add(safeLayerName(hatch.layer));
  for (const text of model.texts ?? [])
    names.add(safeLayerName(text.layer ?? TEXT_LAYER));
  for (const text of model.mtexts ?? [])
    names.add(safeLayerName(text.layer ?? TEXT_LAYER));
  for (const measurement of model.measurements ?? [])
    names.add(safeLayerName(measurement.layer ?? MEASUREMENT_LAYER));
  for (const dimension of model.semanticDimensions ?? [])
    names.add(safeLayerName(dimension.layer ?? MEASUREMENT_LAYER));
  for (const mleader of model.mleaders ?? []) names.add(safeLayerName(mleader.layer ?? TEXT_LAYER));
  return [...names].sort((a, b) => a.localeCompare(b));
}
function pushHeader(
  lines: string[],
  options: CadDxfExportOptions,
  pointVariables: { pdmode: number; pdsize: number } | null,
  linetypeScale?: number,
) {
  pushPair(lines, 0, "SECTION");
  pushPair(lines, 2, "HEADER");
  // AC1015 (AutoCAD 2000): la versión mínima honesta para las entidades que
  // emitimos — ELLIPSE no existe en R12 (AC1009).
  pushPair(lines, 9, "$ACADVER");
  pushPair(lines, 1, "AC1015");
  pushPair(lines, 9, "$INSUNITS");
  pushPair(lines, 70, DXF_UNIT_CODES[options.units ?? "mm"]);
  // La escala global del guion es del DIBUJO. Sin ella, un plano a 1:50 que se
  // devuelve al remitente le llega con los ejes veinticinco veces más cortos y
  // sin nada en el fichero que explique por qué.
  if (typeof linetypeScale === "number" && linetypeScale > 0) {
    pushPair(lines, 9, "$LTSCALE");
    pushPair(lines, 40, fmt(linetypeScale));
  }
  // El estilo de punto es del DIBUJO, no del POINT: si no viaja aquí, todos
  // los puntos del fichero salen del estilo por defecto y la marca que el
  // usuario eligió desaparece sin que nadie lo diga.
  if (pointVariables) {
    pushPair(lines, 9, "$PDMODE");
    pushPair(lines, 70, pointVariables.pdmode);
    pushPair(lines, 9, "$PDSIZE");
    pushPair(lines, 40, fmt(pointVariables.pdsize));
  }
  if (options.fileComment) {
    pushPair(lines, 999, safeText(options.fileComment));
  }
  pushPair(lines, 0, "ENDSEC");
}

function pushLine(
  lines: string[],
  layer: string,
  from: CadDxfPoint,
  to: CadDxfPoint,
  presentation?: CadEntityPresentation,
) {
  pushPair(lines, 0, "LINE");
  pushPair(lines, 8, layer);
  pushPresentation(lines, presentation);
  pushPoint(lines, from);
  pushPair(lines, 11, fmt(to.x));
  pushPair(lines, 21, fmt(to.y));
  pushPair(lines, 31, "0");
}
function pushPolyline(
  lines: string[],
  layer: string,
  points: CadDxfPoint[],
  closed: boolean,
  presentation?: CadEntityPresentation,
) {
  pushPair(lines, 0, "POLYLINE");
  pushPair(lines, 8, layer);
  pushPresentation(lines, presentation);
  pushPair(lines, 66, 1);
  pushPair(lines, 70, closed ? 1 : 0);
  for (const point of points) {
    pushPair(lines, 0, "VERTEX");
    pushPair(lines, 8, layer);
    pushPoint(lines, point);
    // Código de grupo 42: abombamiento del segmento que arranca aquí. Sin
    // emitirlo, cada arco de la polilínea salía como cuerda recta y la
    // pérdida era además silenciosa.
    if (typeof point.bulge === "number" && point.bulge !== 0) {
      pushPair(lines, 42, fmt(point.bulge));
    }
  }
  pushPair(lines, 0, "SEQEND");
}
function pushCircle(
  lines: string[],
  layer: string,
  center: CadDxfPoint,
  radius: number,
  presentation?: CadEntityPresentation,
) {
  pushPair(lines, 0, "CIRCLE");
  pushPair(lines, 8, layer);
  pushPresentation(lines, presentation);
  pushPoint(lines, center);
  pushPair(lines, 40, fmt(radius));
}
function pushArc(
  lines: string[],
  layer: string,
  center: CadDxfPoint,
  radius: number,
  startAngle: number,
  endAngle: number,
  presentation?: CadEntityPresentation,
) {
  pushPair(lines, 0, "ARC");
  pushPair(lines, 8, layer);
  pushPresentation(lines, presentation);
  pushPoint(lines, center);
  pushPair(lines, 40, fmt(radius));
  pushPair(lines, 50, fmt(startAngle));
  pushPair(lines, 51, fmt(endAngle));
}
function pushEllipse(
  lines: string[],
  layer: string,
  center: CadDxfPoint,
  majorAxis: CadDxfPoint,
  axisRatio: number,
  startAngleDeg: number,
  endAngleDeg: number,
  presentation?: CadEntityPresentation,
) {
  pushPair(lines, 0, "ELLIPSE");
  pushPair(lines, 8, layer);
  pushPresentation(lines, presentation);
  pushPoint(lines, center);
  // 11/21/31: extremo del eje mayor RELATIVO al centro (convención DXF).
  pushPair(lines, 11, fmt(majorAxis.x));
  pushPair(lines, 21, fmt(majorAxis.y));
  pushPair(lines, 31, "0");
  pushPair(lines, 40, fmt(axisRatio));
  // 41/42: parámetros en RADIANES en el archivo; el modelo usa grados.
  pushPair(lines, 41, fmt((startAngleDeg * Math.PI) / 180));
  pushPair(lines, 42, fmt((endAngleDeg * Math.PI) / 180));
}
/** Vector de nudos clamped uniforme: n + grado + 1 valores en [0,1]. */
function pushSpline(
  lines: string[],
  layer: string,
  controlPoints: CadDxfPoint[],
  degree: number,
  knots?: number[],
  presentation?: CadEntityPresentation,
) {
  const expectedKnots = controlPoints.length + degree + 1;
  const knotValues =
    knots && knots.length === expectedKnots
      ? knots
      : clampedKnots(controlPoints.length, degree);
  pushPair(lines, 0, "SPLINE");
  pushPair(lines, 8, layer);
  pushPresentation(lines, presentation);
  pushPair(lines, 70, 8); // planar
  pushPair(lines, 71, degree);
  pushPair(lines, 72, knotValues.length);
  pushPair(lines, 73, controlPoints.length);
  for (const knot of knotValues) pushPair(lines, 40, fmt(knot));
  for (const point of controlPoints) pushPoint(lines, point);
}
function pushText(
  lines: string[],
  layer: string,
  position: CadDxfPoint,
  text: string,
  height = 250,
  presentation?: CadEntityPresentation,
  rotation?: number, style?: string,
) {
  const content = safeText(text);
  if (!content) return false;
  pushPair(lines, 0, "TEXT");
  pushPair(lines, 8, layer);
  pushPresentation(lines, presentation);
  pushPoint(lines, position);
  pushPair(lines, 40, fmt(height));
  pushPair(lines, 1, content);
  // Opcionales los dos: un `50 0` en cada rótulo horizontal sería ruido.
  if (style) pushPair(lines, 7, safeStyleName(style));
  if (rotation) pushPair(lines, 50, fmt(rotation));
  return true;
}

function mtextAttachment(alignment: CadDxfExportMText["alignment"]): number {
  return {
    "top-left": 1, "top-center": 2, "top-right": 3,
    "middle-left": 4, "middle-center": 5, "middle-right": 6,
    "bottom-left": 7, "bottom-center": 8, "bottom-right": 9,
  }[alignment ?? "top-left"];
}

function pushMText(lines: string[], layer: string, text: CadDxfExportMText): boolean {
  const plain = text.text.replace(/\r\n?/g, "\n").trim();
  if (!plain) return false;
  const family = safeText(text.fontFamily ?? "Arial").replace(/[;|{}\\]/g, "") || "Arial";
  let content = plain.replace(/\\/g, "\\\\").replace(/\n/g, "\\P");
  if (text.underline) content = `\\L${content}\\l`;
  content = `{\\f${family}|b${text.bold ? 1 : 0}|i${text.italic ? 1 : 0};${content}}`;
  if (text.paragraphAlignment && text.paragraphAlignment !== "left") {
    const code = text.paragraphAlignment === "center" ? "c" : text.paragraphAlignment === "right" ? "r" : "j";
    content = `\\p${code};${content}`;
  }
  pushPair(lines, 0, "MTEXT");
  pushPair(lines, 8, layer);
  pushPoint(lines, text.insertion);
  pushPair(lines, 40, fmt(text.height ?? 120));
  pushPair(lines, 41, fmt(text.width ?? (text.height ?? 120) * 20));
  pushPair(lines, 71, mtextAttachment(text.alignment));
  pushPair(lines, 72, 1);
  while (content.length > 240) {
    pushPair(lines, 3, content.slice(0, 240));
    content = content.slice(240);
  }
  pushPair(lines, 1, content);
  pushPair(lines, 7, safeStyleName(text.style));
  pushPair(lines, 50, fmt(text.rotation ?? 0));
  pushPair(lines, 73, 2);
  pushPair(lines, 44, fmt(text.lineSpacing ?? 1.2));
  if (text.backgroundMask) {
    pushPair(lines, 90, 1);
    pushPair(lines, 45, fmt(1 + Math.max(0, text.backgroundPadding ?? 0.15)));
    if (/^#[0-9a-f]{6}$/i.test(text.backgroundColor ?? ""))
      pushPair(lines, 420, Number.parseInt(text.backgroundColor!.slice(1), 16));
  }
  const columns = Math.max(1, Math.min(8, Math.floor(text.columns ?? 1)));
  pushPair(lines, 75, columns > 1 ? 1 : 0);
  if (columns > 1) {
    pushPair(lines, 76, columns);
    pushPair(lines, 78, 0);
    pushPair(lines, 79, 0);
    pushPair(lines, 48, fmt((text.width ?? (text.height ?? 120) * 20) / columns));
    pushPair(lines, 49, fmt(text.height ?? 120));
  }
  return true;
}
/**
 * Las CUATRO esquinas de un rectángulo, sin repetir la primera.
 *
 * Antes devolvía cinco puntos y el escritor emitía además 70=1: un contorno
 * cerrado con un último tramo de longitud cero. El cierre lo declara el grupo
 * 70; el quinto punto sólo añadía un segmento nulo. Se acepta una entrada de
 * cinco puntos (cerrada al viejo estilo) para no romper llamadas existentes.
 */
function rectCornerPoints(points: CadDxfPoint[]): CadDxfPoint[] {
  if (points.length >= 5) return points.slice(0, 4);
  if (points.length >= 4) return points.slice(0, 4);
  if (points.length >= 2) {
    const [a, b] = points;
    return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
  }
  return points;
}
function primitiveLabelPoint(primitive: CadDxfPrimitive): CadDxfPoint | null {
  if (primitive.kind === "text" || !primitive.text || !primitive.points.length)
    return null;
  const xs = primitive.points.map((point) => point.x);
  const ys = primitive.points.map((point) => point.y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}
function pushPrimitiveLabel(
  lines: string[],
  layer: string,
  primitive: CadDxfPrimitive,
): boolean {
  const position = primitiveLabelPoint(primitive);
  return position
    ? pushText(
        lines,
        layer,
        position,
        primitive.text ?? "",
        PRIMITIVE_LABEL_HEIGHT,
      )
    : false;
}

/**
 * Escritura de los ocho tipos del esquema 4.
 *
 * Devuelve cuántas entidades DXF se escribieron (la tabla escribe muchas) o 0
 * si la primitiva no es de este esquema. Vive junto al despachador general
 * porque comparte su contrato: lo que no se escribe aquí lo declara el
 * manifiesto de pérdidas, nunca desaparece callando.
 */
function writeSchema4Geometry(
  lines: string[],
  layer: string,
  primitive: CadDxfPrimitive,
  objects: CadDxfSchema4Objects,
): number {
  const payload = primitive.schema4;
  if (!payload || payload.kind !== primitive.kind) return 0;
  const anchor = primitive.points[0];
  if (payload.kind === "point" && anchor) {
    pushPointEntity(lines, layer, anchor, primitive.presentation);
    return 1;
  }
  if ((payload.kind === "xline" || payload.kind === "ray") && anchor) {
    // Una dirección nula no define recta alguna: se descarta aquí en vez de
    // escribir una entidad que ningún lector puede dibujar.
    if (!payload.direction.x && !payload.direction.y) return 0;
    pushXLine(lines, layer, anchor, payload.direction, payload.kind === "ray", primitive.presentation);
    return 1;
  }
  if (payload.kind === "solid" && primitive.points.length >= 3) {
    pushSolid(lines, layer, primitive.points, primitive.presentation);
    return 1;
  }
  if (payload.kind === "wipeout" && primitive.points.length >= 3) {
    pushWipeout(lines, layer, primitive.points, objects, payload.frame);
    return 1;
  }
  if (payload.kind === "image" && anchor) {
    pushImage(lines, layer, anchor, payload, objects);
    return 1;
  }
  if (payload.kind === "attdef" && anchor) {
    pushAttdef(lines, layer, anchor, payload);
    return 1;
  }
  if (payload.kind === "table" && anchor) {
    // La tabla se degrada a geometría; el porqué está en `dxf-schema4-table.ts`
    // y el aviso, en el manifiesto de pérdidas.
    let written = 0;
    // La tabla se degrada a líneas y textos: el trazo de la entidad viaja con
    // cada trozo, o el borde de la tabla saldría continuo mientras su celda no.
    for (const piece of tableToDxfPrimitives(layer, anchor, payload))
      if (
        writePrimitiveGeometry(
          lines,
          layer,
          primitive.presentation ? { ...piece, presentation: primitive.presentation } : piece,
          objects,
        ).wrote
      )
        written += 1;
    return written;
  }
  return 0;
}

/**
 * Escribe la geometría de una primitiva (compartido entre ENTITIES y BLOCKS).
 * Devuelve true si escribió geometría no-texto (candidata a etiqueta).
 */
function writePrimitiveGeometry(
  lines: string[],
  layer: string,
  primitive: CadDxfPrimitive,
  objects: CadDxfSchema4Objects,
): { wrote: boolean; isGeometry: boolean; count: number } {
  if (primitive.schema4) {
    const count = writeSchema4Geometry(lines, layer, primitive, objects);
    // Los tipos del esquema 4 no llevan etiqueta de primitiva: su texto —el de
    // un ATTDEF o el de una celda— ya es una entidad de pleno derecho.
    return { wrote: count > 0, isGeometry: false, count };
  }
  if (primitive.kind === "line" && primitive.points.length >= 2) {
    pushLine(lines, layer, primitive.points[0], primitive.points[1], primitive.presentation);
    return { wrote: true, isGeometry: true, count: 1 };
  }
  if (primitive.kind === "polyline" && primitive.points.length >= 2) {
    // El cierre lo declara la primitiva. Estaba fijado a `false`, así que TODO
    // contorno cerrado salía con 70=0 —abierto para cualquier lector de DXF—
    // aunque llevase sus vértices coincidentes.
    pushPolyline(lines, layer, primitive.points, primitive.closed === true, primitive.presentation);
    return { wrote: true, isGeometry: true, count: 1 };
  }
  if (primitive.kind === "rect" && primitive.points.length >= 2) {
    pushPolyline(lines, layer, rectCornerPoints(primitive.points), true, primitive.presentation);
    return { wrote: true, isGeometry: true, count: 1 };
  }
  if (
    primitive.kind === "circle" &&
    primitive.points[0] &&
    typeof primitive.radius === "number" &&
    primitive.radius > 0
  ) {
    pushCircle(lines, layer, primitive.points[0], primitive.radius, primitive.presentation);
    return { wrote: true, isGeometry: true, count: 1 };
  }
  if (
    primitive.kind === "arc" &&
    primitive.points[0] &&
    typeof primitive.radius === "number" &&
    primitive.radius > 0 &&
    typeof primitive.startAngle === "number" &&
    typeof primitive.endAngle === "number"
  ) {
    pushArc(
      lines,
      layer,
      primitive.points[0],
      primitive.radius,
      primitive.startAngle,
      primitive.endAngle,
      primitive.presentation,
    );
    return { wrote: true, isGeometry: true, count: 1 };
  }
  if (
    primitive.kind === "ellipse" &&
    primitive.points[0] &&
    primitive.majorAxis &&
    typeof primitive.axisRatio === "number" &&
    primitive.axisRatio > 0
  ) {
    pushEllipse(
      lines,
      layer,
      primitive.points[0],
      primitive.majorAxis,
      primitive.axisRatio,
      primitive.startAngle ?? 0,
      primitive.endAngle ?? 360,
      primitive.presentation,
    );
    return { wrote: true, isGeometry: true, count: 1 };
  }
  if (primitive.kind === "spline" && primitive.points.length >= 2) {
    pushSpline(
      lines,
      layer,
      primitive.points,
      Math.max(1, Math.min(primitive.degree ?? 3, primitive.points.length - 1)),
      primitive.knots,
      primitive.presentation,
    );
    return { wrote: true, isGeometry: true, count: 1 };
  }
  if (primitive.kind === "text" && primitive.points[0] && primitive.text) {
    const wrote = pushText(
      lines,
      layer,
      primitive.points[0],
      primitive.text,
      primitive.textHeight,
      primitive.presentation,
    );
    return { wrote, isGeometry: false, count: wrote ? 1 : 0 };
  }
  return { wrote: false, isGeometry: false, count: 0 };
}

/**
 * HATCH de relleno SOLID con un contorno poligonal cerrado — los códigos del
 * estándar DXF (patrón 2=SOLID, 70=1 sólido, camino 92=2 polilínea, 73=1
 * cerrado). dxf-parser lo DESCARTA al leer (el import lo avisa honesto); los
 * CAD reales lo pintan como área rellena.
 */

function pushMleader(lines: string[], entity: CadDxfExportMleader): boolean {
  const geometry = buildCadMleaderGeometry({ id: "dxf-mleader", type: "mleader", ...entity });
  if (!geometry) return false;
  const layer = safeLayerName(entity.layer ?? TEXT_LAYER);
  pushPair(lines, 0, "MLEADER");
  pushPair(lines, 8, layer);
  pushPair(lines, 100, "AcDbMLeader");
  pushPair(lines, 270, 2);
  pushPair(lines, 300, "CONTEXT_DATA{");
  pushPair(lines, 40, 1);
  pushPair(lines, 10, fmt(entity.textPosition.x));
  pushPair(lines, 20, fmt(entity.textPosition.y));
  pushPair(lines, 30, 0);
  pushPair(lines, 304, safeText(entity.text));
  for (const leader of geometry.leaderLines) {
    pushPair(lines, 302, "LEADER{");
    pushPair(lines, 304, "LEADER_LINE{");
    leader.forEach((point) => pushPoint(lines, point));
    pushPair(lines, 305, "}");
    pushPair(lines, 303, "}");
  }
  pushPair(lines, 301, "}");
  pushPair(lines, 170, 1);
  pushPair(lines, 171, entity.contentType === "text" ? 1 : 2);
  pushPair(lines, 1001, DXF_XDATA_APP_MLEADER);
  const encodedText = encodeURIComponent(entity.text);
  const metadata = [
    `contentType=${entity.contentType ?? "mtext"}`, `style=${encodeURIComponent(entity.style ?? "Standard")}`,
    `textX=${fmt(entity.textPosition.x)}`, `textY=${fmt(entity.textPosition.y)}`,
    `textWidth=${fmt(entity.textWidth ?? 1800)}`, `textHeight=${fmt(entity.textHeight ?? 120)}`,
    `textRotation=${fmt(entity.textRotation ?? 0)}`, `textAlignment=${entity.textAlignment ?? "left"}`,
    `fontFamily=${encodeURIComponent(entity.fontFamily ?? "Arial")}`, `lineSpacing=${fmt(entity.lineSpacing ?? 1.2)}`,
    `bold=${entity.bold ? 1 : 0}`, `italic=${entity.italic ? 1 : 0}`, `underline=${entity.underline ? 1 : 0}`,
    `backgroundMask=${entity.backgroundMask ? 1 : 0}`, `backgroundColor=${entity.backgroundColor ?? ""}`,
    `backgroundPadding=${fmt(entity.backgroundPadding ?? 0.15)}`, `landing=${entity.landing === false ? 0 : 1}`,
    `doglegLength=${fmt(entity.doglegLength ?? DEFAULT_MLEADER_STYLE.doglegLength)}`,
    `arrowhead=${entity.arrowhead ?? "closed-filled"}`, `arrowSize=${fmt(entity.arrowSize ?? DEFAULT_MLEADER_STYLE.arrowSize)}`,
  ];
  geometry.leaderLines.forEach((leader, lineIndex) => leader.forEach((point, pointIndex) => metadata.push(`line=${lineIndex},${pointIndex},${fmt(point.x)},${fmt(point.y)}`)));
  for (let index = 0; index * 200 < encodedText.length; index += 1) metadata.push(`text${index}=${encodedText.slice(index * 200, (index + 1) * 200)}`);
  metadata.forEach((value) => pushPair(lines, 1000, value));
  return true;
}

/** Sección BLOCKS: definiciones reutilizables (mismos códigos que lee el parser). */
function pushInsert(lines: string[], insert: CadDxfExportInsert, definition?: CadDxfExportBlock) {
  const positioned = insert.positionedAttributes ?? [];
  const attributes = positioned.length
    ? []
    : Object.entries(insert.attributes ?? {}).filter(([tag]) => !!definition?.attributes?.[tag]);
  const attributeCount = positioned.length || attributes.length;
  pushPair(lines, 0, "INSERT");
  pushPair(lines, 8, safeLayerName(insert.layer));
  pushPresentation(lines, insert.presentation);
  pushPair(lines, 2, safeText(insert.block));
  if (attributeCount) pushPair(lines, 66, 1);
  pushPoint(lines, { x: insert.x, y: insert.y });
  if (insert.rotation) pushPair(lines, 50, fmt(insert.rotation));
  if (insert.scaleX !== undefined && insert.scaleX !== 1) pushPair(lines, 41, fmt(insert.scaleX));
  if (insert.scaleY !== undefined && insert.scaleY !== 1) pushPair(lines, 42, fmt(insert.scaleY));
  pushPair(lines, 1001, DXF_XDATA_APP_BLOCK);
  pushPair(lines, 1000, "kind=insert");
  for (const [tag, value] of Object.entries(insert.attributes ?? {}))
    pushPair(lines, 1000, `attribute=${encodeURIComponent(tag)},${encodeURIComponent(value)}`);
  for (const attribute of positioned)
    pushPositionedAttrib(lines, safeLayerName(insert.layer), attribute);
  for (const [tag, value] of attributes) {
    const attribute = definition?.attributes?.[tag];
    const base = definition?.basePoint ?? { x: 0, y: 0 };
    const local = attribute?.position ?? base;
    const x = (local.x - base.x) * (insert.scaleX ?? 1);
    const y = (local.y - base.y) * (insert.scaleY ?? 1);
    const radians = (insert.rotation ?? 0) * Math.PI / 180;
    pushPair(lines, 0, "ATTRIB");
    pushPair(lines, 8, safeLayerName(insert.layer));
    pushPoint(lines, { x: insert.x + x * Math.cos(radians) - y * Math.sin(radians), y: insert.y + x * Math.sin(radians) + y * Math.cos(radians) });
    pushPair(lines, 40, fmt(Math.max(1e-9, (attribute?.height ?? 120) * Math.abs(insert.scaleY ?? 1))));
    pushPair(lines, 1, safeText(value));
    pushPair(lines, 2, safeText(tag));
    pushPair(lines, 70, (attribute?.invisible ? 1 : 0) | (attribute?.constant ? 2 : 0));
    if (insert.rotation) pushPair(lines, 50, fmt(insert.rotation));
  }
  if (attributeCount) { pushPair(lines, 0, "SEQEND"); pushPair(lines, 8, safeLayerName(insert.layer)); }
}

function pushBlocks(
  lines: string[],
  blocks: CadDxfExportBlock[],
  objects: CadDxfSchema4Objects,
) {
  pushPair(lines, 0, "SECTION");
  pushPair(lines, 2, "BLOCKS");
  for (const block of blocks) {
    pushPair(lines, 0, "BLOCK");
    pushPair(lines, 8, DEFAULT_LAYER);
    pushPair(lines, 2, safeText(block.name) || "BLOQUE");
    // Flag 1: bloque anónimo (los *D de las cotas), 0: bloque con nombre.
    pushPair(lines, 70, block.name.startsWith("*") ? 1 : 0);
    pushPoint(lines, block.basePoint ?? { x: 0, y: 0 });
    if (!block.name.startsWith("*")) {
      pushPair(lines, 1001, DXF_XDATA_APP_BLOCK);
      pushPair(lines, 1000, "kind=definition");
      pushPair(lines, 1000, `version=${Math.max(1, Math.floor(block.version ?? 1))}`);
      pushPair(lines, 1000, `description=${encodeURIComponent(block.description ?? "")}`);
      pushPair(lines, 1000, `keywords=${encodeURIComponent((block.keywords ?? []).join("\n"))}`);
      pushPair(lines, 1000, `libraryScope=${block.libraryScope ?? "document"}`);
      pushPair(lines, 1000, `libraryTenantId=${encodeURIComponent(block.libraryTenantId ?? "")}`);
      pushPair(lines, 1000, `businessEntityType=${encodeURIComponent(block.businessEntityType ?? "")}`);
      pushPair(lines, 1000, `businessEntityId=${encodeURIComponent(block.businessEntityId ?? "")}`);
    }
    for (const primitive of block.primitives)
      writePrimitiveGeometry(lines, safeLayerName(primitive.layer), primitive, objects);
    for (const insert of block.inserts ?? [])
      pushInsert(lines, insert, blocks.find((candidate) => candidate.name === insert.block));
    for (const [tag, attribute] of Object.entries(block.attributes ?? {})) {
      pushPair(lines, 0, "ATTDEF");
      pushPair(lines, 8, DEFAULT_LAYER);
      pushPoint(lines, attribute.position ?? block.basePoint ?? { x: 0, y: 0 });
      pushPair(lines, 40, fmt(Math.max(1e-9, attribute.height ?? 120)));
      pushPair(lines, 1, safeText(attribute.defaultValue ?? ""));
      pushPair(lines, 3, safeText(attribute.prompt ?? tag));
      pushPair(lines, 2, safeText(tag));
      pushPair(lines, 70, (attribute.invisible ? 1 : 0) | (attribute.constant ? 2 : 0));
    }
    pushPair(lines, 0, "ENDBLK");
  }
  pushPair(lines, 0, "ENDSEC");
}

export function exportCadDxf(
  model: CadDxfExportModel,
  options: CadDxfExportOptions = {},
): CadDxfExportResult {
  const layers = uniqueLayers(model);
  const lines: string[] = [];
  let entityCount = 0;
  // Los manejadores de IMAGE/WIPEOUT y sus objetos se reparten entre ENTITIES
  // y OBJECTS: el estado tiene que nacer antes de escribir la primera entidad
  // y sobrevivir hasta que se cierre la sección de objetos.
  const schema4Objects = createSchema4Objects();
  // Cotas nativas (CAD-NEXT-066): cada medición se materializa como entidad
  // DIMENSION + bloque anónimo *D{n} con su geometría renderizada.
  const dimensions = prepareDimensions(model.measurements ?? []);
  const semanticDimensions = prepareSemanticDimensions(model.semanticDimensions ?? [], dimensions.length);
  const dimensionBlocks: CadDxfExportBlock[] = dimensions.map((dim) => ({
    name: dim.blockName,
    primitives: dimensionBlockPrimitives(
      dim.geo,
      safeLayerName(dim.measurement.layer ?? MEASUREMENT_LAYER),
      dim.label,
    ),
  }));
  const semanticDimensionBlocks: CadDxfExportBlock[] = semanticDimensions.map((dimension) => ({
    name: dimension.blockName,
    primitives: semanticDimensionBlockPrimitives(dimension),
  }));
  const allBlocks = [...(model.blocks ?? []), ...dimensionBlocks, ...semanticDimensionBlocks];
  pushHeader(lines, options, schema4PointVariables(model.primitives ?? []), model.linetypeScale);
  pushLayerTable(lines, model, layers);
  if (allBlocks.length) pushBlocks(lines, allBlocks, schema4Objects);
  pushPair(lines, 0, "SECTION");
  pushPair(lines, 2, "ENTITIES");

  for (const primitive of model.primitives ?? []) {
    const layer = safeLayerName(primitive.layer);
    const { wrote, isGeometry, count } = writePrimitiveGeometry(
      lines,
      layer,
      primitive,
      schema4Objects,
    );
    entityCount += count;
    if (wrote && isGeometry && pushPrimitiveLabel(lines, layer, primitive))
      entityCount += 1;
  }
  for (const insert of model.inserts ?? []) {
    const definition = allBlocks.find((block) => block.name === insert.block);
    pushInsert(lines, insert, definition);
    entityCount += 1;
  }
  for (const hatch of model.hatches ?? []) {
    if (!hatchLoops(hatch).length) continue; // un relleno necesita área real
    pushHatch(lines, safeLayerName(hatch.layer), hatch);
    entityCount += 1;
  }
  for (const text of model.texts ?? []) {
    const written = pushText(
      lines, safeLayerName(text.layer ?? TEXT_LAYER), text.position,
      text.text, text.height, undefined, text.rotation, text.style,
    );
    if (written) entityCount += 1;
  }
  for (const text of model.mtexts ?? [])
    if (pushMText(lines, safeLayerName(text.layer ?? TEXT_LAYER), text)) entityCount += 1;
  for (const mleader of model.mleaders ?? [])
    if (pushMleader(lines, mleader)) entityCount += 1;
  for (const dim of dimensions) {
    pushDimension(
      lines,
      safeLayerName(dim.measurement.layer ?? MEASUREMENT_LAYER),
      dim,
    );
    entityCount += 1;
  }
  for (const dimension of semanticDimensions) {
    pushSemanticDimension(lines, dimension);
    entityCount += 1;
  }

  pushPair(lines, 0, "ENDSEC");
  // La sección OBJECTS sólo existe si hay imágenes o enmascaramientos: un
  // dibujo sin ellos produce exactamente el mismo fichero que antes.
  pushSchema4Objects(lines, schema4Objects);
  pushPair(lines, 0, "EOF");
  return { content: `${lines.join("\n")}\n`, layers, entityCount };
}
