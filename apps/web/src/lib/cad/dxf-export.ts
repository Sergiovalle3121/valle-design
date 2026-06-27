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
  pushPair(lines, 9, "$ACADVER");
  pushPair(lines, 1, "AC1009");
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
    if (primitive.kind === "line" && primitive.points.length >= 2) {
      pushLine(lines, layer, primitive.points[0], primitive.points[1]);
      entityCount += 1;
    } else if (primitive.kind === "polyline" && primitive.points.length >= 2) {
      pushPolyline(lines, layer, primitive.points, false);
      entityCount += 1;
    } else if (primitive.kind === "rect" && primitive.points.length >= 2) {
      pushPolyline(lines, layer, rectToClosedPoints(primitive.points), true);
      entityCount += 1;
    } else if (
      primitive.kind === "text" &&
      primitive.points[0] &&
      primitive.text
    ) {
      if (pushText(lines, layer, primitive.points[0], primitive.text))
        entityCount += 1;
    }
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
