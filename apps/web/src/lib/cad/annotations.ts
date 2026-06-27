import {
  formatDistance,
  measurePoints,
  type CadMeasureUnit,
} from "./measurements";

export type CadAnnotationKind = "text" | "measurement" | "warning";
export interface CadAnnotationPoint {
  x: number;
  y: number;
}
export interface CadAnnotation {
  id: string;
  kind: CadAnnotationKind;
  label: string;
  layer: string;
  points: CadAnnotationPoint[];
  createdAt: string;
}
export interface CadMeasurementAnnotation extends CadAnnotation {
  kind: "measurement";
  distance: number;
  unit: CadMeasureUnit;
}

export function createTextAnnotation(
  id: string,
  label: string,
  point: CadAnnotationPoint,
  layer = "Measurements",
): CadAnnotation {
  return {
    id,
    kind: "text",
    label,
    layer,
    points: [point],
    createdAt: new Date().toISOString(),
  };
}
export function createMeasurementAnnotation(
  id: string,
  from: CadAnnotationPoint,
  to: CadAnnotationPoint,
  unit: CadMeasureUnit = "mm",
  layer = "Measurements",
): CadMeasurementAnnotation {
  const measured = measurePoints(from, to, "direct", unit);
  return {
    id,
    kind: "measurement",
    label: formatDistance(measured.distanceMm, unit),
    layer,
    points: [from, to],
    createdAt: new Date().toISOString(),
    distance: measured.distanceMm,
    unit,
  };
}
export function annotationBounds(annotation: CadAnnotation): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const xs = annotation.points.map((point) => point.x);
  const ys = annotation.points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY,
  };
}
export function filterAnnotationsByLayer(
  annotations: CadAnnotation[],
  visibleLayers: string[],
): CadAnnotation[] {
  const visible = new Set(visibleLayers);
  return annotations.filter((annotation) => visible.has(annotation.layer));
}
