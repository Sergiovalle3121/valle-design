import {
  exportCadDxf,
  type CadDxfExportLayer,
  type CadDxfExportModel,
  type CadDxfExportOptions,
  type CadDxfExportResult,
} from "./dxf-export";

export interface CadExportBox {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Grados; el rect se emite con las esquinas ya rotadas (AXOS-CAD-DXF-ROT-001). */
  rotation?: number;
  layer?: string;
}
export interface CadExportConnector {
  from: { x: number; y: number };
  to: { x: number; y: number };
  layer?: string;
}
export interface CadExportTextLabel {
  text: string;
  x: number;
  y: number;
  layer?: string;
}
export interface CadExportMeasurement {
  from: { x: number; y: number };
  to: { x: number; y: number };
  label?: string;
  layer?: string;
}
export interface CadLayoutExportInput {
  boxes?: CadExportBox[];
  connectors?: CadExportConnector[];
  labels?: CadExportTextLabel[];
  measurements?: CadExportMeasurement[];
}

const CAD_DXF_LAYER_COLORS: Record<string, number> = {
  Layout: 4,
  Architecture: 8,
  Structure: 9,
  Equipment: 5,
  Utilities: 130,
  Flow: 3,
  Aisles: 2,
  Measurements: 6,
  Safety: 1,
  Text: 7,
};

function rectPoints(box: CadExportBox) {
  const hw = box.width / 2;
  const hh = box.height / 2;
  // Rotación real en el DXF: una puerta girada 90 llega girada a AutoCAD,
  // no como su bounding box. dxf-export respeta >=5 puntos tal cual.
  const rot = (((box.rotation ?? 0) % 360) + 360) % 360;
  const rad = (rot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ].map((c) => ({
    x: box.x + (rot ? c.x * cos - c.y * sin : c.x),
    y: box.y + (rot ? c.x * sin + c.y * cos : c.y),
  }));
  return [...corners, corners[0]];
}
function collectLayoutLayers(input: CadLayoutExportInput): CadDxfExportLayer[] {
  const names = new Set<string>();
  for (const box of input.boxes ?? []) names.add(box.layer ?? "Equipment");
  for (const connector of input.connectors ?? [])
    names.add(connector.layer ?? "Flow");
  for (const label of input.labels ?? []) names.add(label.layer ?? "Text");
  for (const measurement of input.measurements ?? [])
    names.add(measurement.layer ?? "Measurements");
  return [...names].sort((a, b) => a.localeCompare(b)).map((name) => ({
    name,
    color: CAD_DXF_LAYER_COLORS[name] ?? 7,
  }));
}
export function cadLayoutToDxfExportModel(
  input: CadLayoutExportInput,
): CadDxfExportModel {
  return {
    layers: collectLayoutLayers(input),
    primitives: [
      ...(input.boxes ?? []).map((box) => ({
        kind: "rect" as const,
        layer: box.layer ?? "Equipment",
        points: rectPoints(box),
        text: box.label,
      })),
      ...(input.connectors ?? []).map((connector) => ({
        kind: "line" as const,
        layer: connector.layer ?? "Flow",
        points: [connector.from, connector.to],
      })),
    ],
    texts: (input.labels ?? []).map((label) => ({
      text: label.text,
      position: { x: label.x, y: label.y },
      layer: label.layer ?? "Text",
    })),
    measurements: input.measurements,
  };
}
export function exportCadLayoutDxf(
  input: CadLayoutExportInput,
  options?: CadDxfExportOptions,
): CadDxfExportResult {
  return exportCadDxf(cadLayoutToDxfExportModel(input), options);
}
