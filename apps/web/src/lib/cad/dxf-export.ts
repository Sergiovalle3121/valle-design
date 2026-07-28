import type { CadDxfPoint, CadDxfPrimitive } from "./dxf-import";
import {
  alignedDimension,
  DEFAULT_DIMENSION_STYLE,
  type DimensionGeometry,
} from "./dimension";

export type CadDxfExportUnit = "mm" | "m";
export interface CadDxfExportOptions {
  units?: CadDxfExportUnit;
  fileComment?: string;
}
export interface CadDxfExportLayer {
  name: string;
  color?: number;
}
export interface CadDxfExportText {
  layer?: string;
  position: CadDxfPoint;
  text: string;
  height?: number;
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
}
/** Referencia INSERT a un bloque, con su transformación. */
export interface CadDxfExportInsert {
  block: string;
  x: number;
  y: number;
  /** Grados CCW. */
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  layer?: string;
}
export interface CadDxfExportModel {
  primitives?: CadDxfPrimitive[];
  layers?: CadDxfExportLayer[];
  texts?: CadDxfExportText[];
  mtexts?: CadDxfExportMText[];
  measurements?: CadDxfExportMeasurement[];
  blocks?: CadDxfExportBlock[];
  inserts?: CadDxfExportInsert[];
  hatches?: CadDxfExportHatch[];
}
export interface CadDxfExportResult {
  content: string;
  layers: string[];
  entityCount: number;
}

const DEFAULT_LAYER = "0";
const MEASUREMENT_LAYER = "Measurements";
const TEXT_LAYER = "Text";
const PRIMITIVE_LABEL_HEIGHT = 220;
const DXF_UNIT_CODES: Record<CadDxfExportUnit, number> = { mm: 4, m: 6 };

function safeLayerName(name: string | undefined): string {
  const cleaned = (name || DEFAULT_LAYER).trim().replace(/[\r\n]/g, " ");
  return cleaned || DEFAULT_LAYER;
}
function safeText(value: string): string {
  return value.replace(/[\r\n]/g, " ").trim();
}
function safeStyleName(value: string | undefined): string {
  return safeText(value ?? "Standard").replace(/[<>/\\"':;?*|=`,]/g, "_").slice(0, 64) || "Standard";
}
function fmt(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Number(value.toFixed(6)).toString();
}
function pushPair(
  lines: string[],
  code: number | string,
  value: number | string,
) {
  lines.push(String(code), String(value));
}
function pushPoint(lines: string[], point: CadDxfPoint) {
  pushPair(lines, 10, fmt(point.x));
  pushPair(lines, 20, fmt(point.y));
  pushPair(lines, 30, "0");
}
function uniqueLayers(model: CadDxfExportModel): string[] {
  const names = new Set<string>([DEFAULT_LAYER]);
  for (const layer of model.layers ?? []) names.add(safeLayerName(layer.name));
  for (const primitive of model.primitives ?? [])
    names.add(safeLayerName(primitive.layer));
  for (const block of model.blocks ?? [])
    for (const primitive of block.primitives)
      names.add(safeLayerName(primitive.layer));
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
  return [...names].sort((a, b) => a.localeCompare(b));
}
function layerColor(model: CadDxfExportModel, name: string): number {
  const found = (model.layers ?? []).find(
    (layer) => safeLayerName(layer.name) === name,
  );
  return found?.color ?? 7;
}
function pushLayerTable(
  lines: string[],
  model: CadDxfExportModel,
  layers: string[],
) {
  pushPair(lines, 0, "SECTION");
  pushPair(lines, 2, "TABLES");
  pushPair(lines, 0, "TABLE");
  pushPair(lines, 2, "LAYER");
  pushPair(lines, 70, layers.length);
  for (const layer of layers) {
    pushPair(lines, 0, "LAYER");
    pushPair(lines, 2, layer);
    pushPair(lines, 70, 0);
    pushPair(lines, 62, layerColor(model, layer));
    pushPair(lines, 6, "CONTINUOUS");
  }
  pushPair(lines, 0, "ENDTAB");
  const textStyles = new Map<string, string>([["Standard", "arial.ttf"]]);
  for (const mtext of model.mtexts ?? []) {
    const name = safeStyleName(mtext.style);
    const family = safeText(mtext.fontFamily ?? "Arial").replace(/[^\w.-]+/g, "").toLowerCase() || "arial";
    textStyles.set(name, family.endsWith(".ttf") || family.endsWith(".shx") ? family : `${family}.ttf`);
  }
  pushPair(lines, 0, "TABLE");
  pushPair(lines, 2, "STYLE");
  pushPair(lines, 70, textStyles.size);
  for (const [name, font] of textStyles) {
    pushPair(lines, 0, "STYLE");
    pushPair(lines, 2, name);
    pushPair(lines, 70, 0);
    pushPair(lines, 40, 0);
    pushPair(lines, 41, 1);
    pushPair(lines, 50, 0);
    pushPair(lines, 71, 0);
    pushPair(lines, 42, 2.5);
    pushPair(lines, 3, font);
    pushPair(lines, 4, "");
  }
  pushPair(lines, 0, "ENDTAB");
  pushPair(lines, 0, "ENDSEC");
}
function pushHeader(lines: string[], options: CadDxfExportOptions) {
  pushPair(lines, 0, "SECTION");
  pushPair(lines, 2, "HEADER");
  // AC1015 (AutoCAD 2000): la versión mínima honesta para las entidades que
  // emitimos — ELLIPSE no existe en R12 (AC1009).
  pushPair(lines, 9, "$ACADVER");
  pushPair(lines, 1, "AC1015");
  pushPair(lines, 9, "$INSUNITS");
  pushPair(lines, 70, DXF_UNIT_CODES[options.units ?? "mm"]);
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
) {
  pushPair(lines, 0, "LINE");
  pushPair(lines, 8, layer);
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
) {
  pushPair(lines, 0, "POLYLINE");
  pushPair(lines, 8, layer);
  pushPair(lines, 66, 1);
  pushPair(lines, 70, closed ? 1 : 0);
  for (const point of points) {
    pushPair(lines, 0, "VERTEX");
    pushPair(lines, 8, layer);
    pushPoint(lines, point);
  }
  pushPair(lines, 0, "SEQEND");
}
function pushCircle(
  lines: string[],
  layer: string,
  center: CadDxfPoint,
  radius: number,
) {
  pushPair(lines, 0, "CIRCLE");
  pushPair(lines, 8, layer);
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
) {
  pushPair(lines, 0, "ARC");
  pushPair(lines, 8, layer);
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
) {
  pushPair(lines, 0, "ELLIPSE");
  pushPair(lines, 8, layer);
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
function clampedKnots(controlCount: number, degree: number): number[] {
  const knots: number[] = [];
  const spans = controlCount - degree;
  for (let i = 0; i <= degree; i++) knots.push(0);
  for (let i = 1; i < spans; i++) knots.push(i / spans);
  for (let i = 0; i <= degree; i++) knots.push(1);
  return knots;
}
function pushSpline(
  lines: string[],
  layer: string,
  controlPoints: CadDxfPoint[],
  degree: number,
  knots?: number[],
) {
  const expectedKnots = controlPoints.length + degree + 1;
  const knotValues =
    knots && knots.length === expectedKnots
      ? knots
      : clampedKnots(controlPoints.length, degree);
  pushPair(lines, 0, "SPLINE");
  pushPair(lines, 8, layer);
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
) {
  const content = safeText(text);
  if (!content) return false;
  pushPair(lines, 0, "TEXT");
  pushPair(lines, 8, layer);
  pushPoint(lines, position);
  pushPair(lines, 40, fmt(height));
  pushPair(lines, 1, content);
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
function rectToClosedPoints(points: CadDxfPoint[]): CadDxfPoint[] {
  if (points.length >= 5) return points.slice(0, 5);
  if (points.length >= 4) return [...points.slice(0, 4), points[0]];
  if (points.length >= 2) {
    const [a, b] = points;
    return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }, a];
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
 * Escribe la geometría de una primitiva (compartido entre ENTITIES y BLOCKS).
 * Devuelve true si escribió geometría no-texto (candidata a etiqueta).
 */
function writePrimitiveGeometry(
  lines: string[],
  layer: string,
  primitive: CadDxfPrimitive,
): { wrote: boolean; isGeometry: boolean } {
  if (primitive.kind === "line" && primitive.points.length >= 2) {
    pushLine(lines, layer, primitive.points[0], primitive.points[1]);
    return { wrote: true, isGeometry: true };
  }
  if (primitive.kind === "polyline" && primitive.points.length >= 2) {
    pushPolyline(lines, layer, primitive.points, false);
    return { wrote: true, isGeometry: true };
  }
  if (primitive.kind === "rect" && primitive.points.length >= 2) {
    pushPolyline(lines, layer, rectToClosedPoints(primitive.points), true);
    return { wrote: true, isGeometry: true };
  }
  if (
    primitive.kind === "circle" &&
    primitive.points[0] &&
    typeof primitive.radius === "number" &&
    primitive.radius > 0
  ) {
    pushCircle(lines, layer, primitive.points[0], primitive.radius);
    return { wrote: true, isGeometry: true };
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
    );
    return { wrote: true, isGeometry: true };
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
    );
    return { wrote: true, isGeometry: true };
  }
  if (primitive.kind === "spline" && primitive.points.length >= 2) {
    pushSpline(
      lines,
      layer,
      primitive.points,
      Math.max(1, Math.min(primitive.degree ?? 3, primitive.points.length - 1)),
      primitive.knots,
    );
    return { wrote: true, isGeometry: true };
  }
  if (primitive.kind === "text" && primitive.points[0] && primitive.text) {
    const wrote = pushText(lines, layer, primitive.points[0], primitive.text);
    return { wrote, isGeometry: false };
  }
  return { wrote: false, isGeometry: false };
}

/**
 * Geometría renderizada de una cota como primitivas (líneas de extensión,
 * línea de cota, flechas y texto), lista para vivir en su bloque anónimo *D.
 */
function dimensionBlockPrimitives(
  geo: DimensionGeometry,
  layer: string,
  label: string,
): CadDxfPrimitive[] {
  const seg = (a: CadDxfPoint, b: CadDxfPoint): CadDxfPrimitive => ({
    kind: "line",
    layer,
    points: [a, b],
  });
  const arrow = (tri: CadDxfPoint[]): CadDxfPrimitive => ({
    kind: "polyline",
    layer,
    points: [...tri, tri[0]],
  });
  return [
    seg(geo.extensionA.a, geo.extensionA.b),
    seg(geo.extensionB.a, geo.extensionB.b),
    seg(geo.dimLine.a, geo.dimLine.b),
    arrow(geo.arrowA),
    arrow(geo.arrowB),
    { kind: "text", layer, points: [geo.textAnchor], text: label },
  ];
}

interface PreparedDimension {
  measurement: CadDxfExportMeasurement;
  geo: DimensionGeometry;
  blockName: string;
  label: string;
}

/** Resuelve cada cota exportable a su geometría + bloque anónimo *D{n}. */
function prepareDimensions(
  measurements: CadDxfExportMeasurement[],
): PreparedDimension[] {
  const prepared: PreparedDimension[] = [];
  for (const measurement of measurements) {
    const geo = alignedDimension(
      measurement.from,
      measurement.to,
      measurement.offset ?? 0,
      DEFAULT_DIMENSION_STYLE,
    );
    if (!geo) continue; // cota degenerada (from == to): no hay nada que medir
    prepared.push({
      measurement,
      geo,
      blockName: `*D${prepared.length + 1}`,
      label: safeText(measurement.label ?? fmt(geo.measurement)),
    });
  }
  return prepared;
}

/**
 * Entidad DIMENSION nativa (cota alineada) que referencia su bloque *D con la
 * geometría renderizada — el mismo esquema que escribe AutoCAD.
 */
function pushDimension(lines: string[], layer: string, dim: PreparedDimension) {
  pushPair(lines, 0, "DIMENSION");
  pushPair(lines, 8, layer);
  pushPair(lines, 2, dim.blockName);
  // 10/20/30: punto de definición (extremo de la línea de cota).
  pushPoint(lines, dim.geo.dimLine.b);
  // 11/21/31: centro del texto.
  pushPair(lines, 11, fmt(dim.geo.textAnchor.x));
  pushPair(lines, 21, fmt(dim.geo.textAnchor.y));
  pushPair(lines, 31, "0");
  // 70: tipo 1 (alineada) + 32 (la geometría vive en un bloque referenciado).
  pushPair(lines, 70, 33);
  pushPair(lines, 1, dim.label);
  pushPair(lines, 42, fmt(dim.geo.measurement));
  // 13/23 y 14/24: orígenes de las líneas de extensión (los puntos medidos).
  pushPair(lines, 13, fmt(dim.measurement.from.x));
  pushPair(lines, 23, fmt(dim.measurement.from.y));
  pushPair(lines, 33, "0");
  pushPair(lines, 14, fmt(dim.measurement.to.x));
  pushPair(lines, 24, fmt(dim.measurement.to.y));
  pushPair(lines, 34, "0");
}

/**
 * HATCH de relleno SOLID con un contorno poligonal cerrado — los códigos del
 * estándar DXF (patrón 2=SOLID, 70=1 sólido, camino 92=2 polilínea, 73=1
 * cerrado). dxf-parser lo DESCARTA al leer (el import lo avisa honesto); los
 * CAD reales lo pintan como área rellena.
 */
function hatchLoops(hatch: CadDxfExportHatch): CadDxfPoint[][] {
  return (hatch.boundaries?.length ? hatch.boundaries : hatch.points ? [hatch.points] : [])
    .map((boundary) => {
      if (boundary.length > 3) {
        const first = boundary[0];
        const last = boundary.at(-1)!;
        if (first.x === last.x && first.y === last.y) return boundary.slice(0, -1);
      }
      return boundary;
    })
    .filter((boundary) => boundary.length >= 3);
}

function pushHatch(lines: string[], layer: string, hatch: CadDxfExportHatch) {
  const boundaries = hatchLoops(hatch);
  const requestedPattern = safeText(hatch.pattern || (hatch.solid === false ? "ANSI31" : "SOLID")) || "SOLID";
  const solid = hatch.solid ?? requestedPattern.toUpperCase() === "SOLID";
  const pattern = solid ? "SOLID" : requestedPattern.toUpperCase() === "SOLID" ? "ANSI31" : requestedPattern;
  const angle = Number.isFinite(hatch.angle) ? hatch.angle! : 45;
  const scale = Number.isFinite(hatch.scale) && hatch.scale! > 0 ? hatch.scale! : 1;
  const origin = hatch.origin ?? boundaries[0]?.[0] ?? { x: 0, y: 0 };
  const islandStyle = hatch.islandStyle === "outer" ? 1 : hatch.islandStyle === "ignore" ? 2 : 0;
  pushPair(lines, 0, "HATCH");
  pushPair(lines, 8, layer);
  pushPoint(lines, { x: 0, y: 0 }); // punto de elevación (siempre 0 en 2D)
  pushPair(lines, 210, "0");
  pushPair(lines, 220, "0");
  pushPair(lines, 230, "1");
  pushPair(lines, 2, pattern);
  pushPair(lines, 70, solid ? 1 : 0);
  pushPair(lines, 71, 0); // no asociativo
  pushPair(lines, 91, boundaries.length);
  for (const boundary of boundaries) {
    pushPair(lines, 92, 2); // camino = polilínea
    pushPair(lines, 72, 0); // sin bulge
    pushPair(lines, 73, 1); // cerrado
    pushPair(lines, 93, boundary.length);
    for (const point of boundary) {
      pushPair(lines, 10, fmt(point.x));
      pushPair(lines, 20, fmt(point.y));
    }
    pushPair(lines, 97, 0); // sin objetos fuente
  }
  pushPair(lines, 75, islandStyle);
  pushPair(lines, 76, 1); // patrón predefinido
  if (!solid) {
    const definitionAngles = pattern.toUpperCase() === "CROSS" ? [angle, angle + 90] : [angle];
    pushPair(lines, 52, fmt(angle));
    pushPair(lines, 41, fmt(scale));
    pushPair(lines, 77, 0);
    pushPair(lines, 78, definitionAngles.length);
    for (const definitionAngle of definitionAngles) {
      pushPair(lines, 53, fmt(definitionAngle));
      pushPair(lines, 43, fmt(origin.x));
      pushPair(lines, 44, fmt(origin.y));
      pushPair(lines, 45, 0);
      pushPair(lines, 46, fmt(scale));
      pushPair(lines, 79, 0);
    }
  }
  pushPair(lines, 98, 1);
  pushPoint(lines, origin);
}

/** Sección BLOCKS: definiciones reutilizables (mismos códigos que lee el parser). */
function pushBlocks(lines: string[], blocks: CadDxfExportBlock[]) {
  pushPair(lines, 0, "SECTION");
  pushPair(lines, 2, "BLOCKS");
  for (const block of blocks) {
    pushPair(lines, 0, "BLOCK");
    pushPair(lines, 8, DEFAULT_LAYER);
    pushPair(lines, 2, safeText(block.name) || "BLOQUE");
    // Flag 1: bloque anónimo (los *D de las cotas), 0: bloque con nombre.
    pushPair(lines, 70, block.name.startsWith("*") ? 1 : 0);
    pushPoint(lines, { x: 0, y: 0 });
    for (const primitive of block.primitives)
      writePrimitiveGeometry(lines, safeLayerName(primitive.layer), primitive);
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
  // Cotas nativas (CAD-NEXT-066): cada medición se materializa como entidad
  // DIMENSION + bloque anónimo *D{n} con su geometría renderizada.
  const dimensions = prepareDimensions(model.measurements ?? []);
  const dimensionBlocks: CadDxfExportBlock[] = dimensions.map((dim) => ({
    name: dim.blockName,
    primitives: dimensionBlockPrimitives(
      dim.geo,
      safeLayerName(dim.measurement.layer ?? MEASUREMENT_LAYER),
      dim.label,
    ),
  }));
  const allBlocks = [...(model.blocks ?? []), ...dimensionBlocks];
  pushHeader(lines, options);
  pushLayerTable(lines, model, layers);
  if (allBlocks.length) pushBlocks(lines, allBlocks);
  pushPair(lines, 0, "SECTION");
  pushPair(lines, 2, "ENTITIES");

  for (const primitive of model.primitives ?? []) {
    const layer = safeLayerName(primitive.layer);
    const { wrote, isGeometry } = writePrimitiveGeometry(lines, layer, primitive);
    if (wrote) entityCount += 1;
    if (wrote && isGeometry && pushPrimitiveLabel(lines, layer, primitive))
      entityCount += 1;
  }
  for (const insert of model.inserts ?? []) {
    pushPair(lines, 0, "INSERT");
    pushPair(lines, 8, safeLayerName(insert.layer));
    pushPair(lines, 2, safeText(insert.block));
    pushPoint(lines, { x: insert.x, y: insert.y });
    if (insert.rotation) pushPair(lines, 50, fmt(insert.rotation));
    if (insert.scaleX !== undefined && insert.scaleX !== 1)
      pushPair(lines, 41, fmt(insert.scaleX));
    if (insert.scaleY !== undefined && insert.scaleY !== 1)
      pushPair(lines, 42, fmt(insert.scaleY));
    entityCount += 1;
  }
  for (const hatch of model.hatches ?? []) {
    if (!hatchLoops(hatch).length) continue; // un relleno necesita área real
    pushHatch(lines, safeLayerName(hatch.layer), hatch);
    entityCount += 1;
  }
  for (const text of model.texts ?? []) {
    if (
      pushText(
        lines,
        safeLayerName(text.layer ?? TEXT_LAYER),
        text.position,
        text.text,
        text.height,
      )
    )
      entityCount += 1;
  }
  for (const text of model.mtexts ?? [])
    if (pushMText(lines, safeLayerName(text.layer ?? TEXT_LAYER), text)) entityCount += 1;
  for (const dim of dimensions) {
    pushDimension(
      lines,
      safeLayerName(dim.measurement.layer ?? MEASUREMENT_LAYER),
      dim,
    );
    entityCount += 1;
  }

  pushPair(lines, 0, "ENDSEC");
  pushPair(lines, 0, "EOF");
  return { content: `${lines.join("\n")}\n`, layers, entityCount };
}
