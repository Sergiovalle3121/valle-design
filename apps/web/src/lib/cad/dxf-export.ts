import type { CadDxfPoint, CadDxfPrimitive } from "./dxf-import";

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
export interface CadDxfExportMeasurement {
  layer?: string;
  from: CadDxfPoint;
  to: CadDxfPoint;
  label?: string;
}
export interface CadDxfExportModel {
  primitives?: CadDxfPrimitive[];
  layers?: CadDxfExportLayer[];
  texts?: CadDxfExportText[];
  measurements?: CadDxfExportMeasurement[];
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
  for (const text of model.texts ?? [])
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

export function exportCadDxf(
  model: CadDxfExportModel,
  options: CadDxfExportOptions = {},
): CadDxfExportResult {
  const layers = uniqueLayers(model);
  const lines: string[] = [];
  let entityCount = 0;
  pushHeader(lines, options);
  pushLayerTable(lines, model, layers);
  pushPair(lines, 0, "SECTION");
  pushPair(lines, 2, "ENTITIES");

  for (const primitive of model.primitives ?? []) {
    const layer = safeLayerName(primitive.layer);
    let wroteGeometry = false;
    if (primitive.kind === "line" && primitive.points.length >= 2) {
      pushLine(lines, layer, primitive.points[0], primitive.points[1]);
      entityCount += 1;
      wroteGeometry = true;
    } else if (primitive.kind === "polyline" && primitive.points.length >= 2) {
      pushPolyline(lines, layer, primitive.points, false);
      entityCount += 1;
      wroteGeometry = true;
    } else if (primitive.kind === "rect" && primitive.points.length >= 2) {
      pushPolyline(lines, layer, rectToClosedPoints(primitive.points), true);
      entityCount += 1;
      wroteGeometry = true;
    } else if (
      primitive.kind === "circle" &&
      primitive.points[0] &&
      typeof primitive.radius === "number" &&
      primitive.radius > 0
    ) {
      pushCircle(lines, layer, primitive.points[0], primitive.radius);
      entityCount += 1;
      wroteGeometry = true;
    } else if (
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
      entityCount += 1;
      wroteGeometry = true;
    } else if (
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
      entityCount += 1;
      wroteGeometry = true;
    } else if (primitive.kind === "spline" && primitive.points.length >= 2) {
      pushSpline(
        lines,
        layer,
        primitive.points,
        Math.max(1, Math.min(primitive.degree ?? 3, primitive.points.length - 1)),
        primitive.knots,
      );
      entityCount += 1;
      wroteGeometry = true;
    } else if (
      primitive.kind === "text" &&
      primitive.points[0] &&
      primitive.text
    ) {
      if (pushText(lines, layer, primitive.points[0], primitive.text))
        entityCount += 1;
    }
    if (wroteGeometry && pushPrimitiveLabel(lines, layer, primitive))
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
  for (const measurement of model.measurements ?? []) {
    const layer = safeLayerName(measurement.layer ?? MEASUREMENT_LAYER);
    pushLine(lines, layer, measurement.from, measurement.to);
    entityCount += 1;
    if (measurement.label) {
      const midpoint = {
        x: (measurement.from.x + measurement.to.x) / 2,
        y: (measurement.from.y + measurement.to.y) / 2,
      };
      if (pushText(lines, layer, midpoint, measurement.label, 200))
        entityCount += 1;
    }
  }

  pushPair(lines, 0, "ENDSEC");
  pushPair(lines, 0, "EOF");
  return { content: `${lines.join("\n")}\n`, layers, entityCount };
}
