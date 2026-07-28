import {
  exportCadDxf,
  type CadDxfExportLayer,
  type CadDxfExportBlock,
  type CadDxfExportInsert,
  type CadDxfExportHatch,
  type CadDxfExportMText,
  type CadDxfExportMleader,
  type CadDxfExportSemanticDimension,
  type CadDxfExportModel,
  type CadDxfExportOptions,
  type CadDxfExportResult,
} from "./dxf-export";
import type { CadDxfPrimitive } from "./dxf-import";

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
  /**
   * Forma del objeto. "circle" lo emite como un CIRCLE real en el DXF (centro
   * en x,y; radio = width/2), de modo que abre como círculo en AutoCAD y no como
   * un cuadrado. Por defecto (sin shape) es un rectángulo (AXOS-CAD-WIRE-001).
   */
  shape?: "circle" | "rect";
  /**
   * Además del contorno, emite el área como HATCH de relleno SOLID
   * (CAD-NEXT-067) — las zonas del editor llegan a AutoCAD como áreas
   * rellenas de verdad, no como rectángulos vacíos.
   */
  hatch?: boolean;
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
  /** First-class canonical entities that must not be flattened to boxes. */
  primitives?: CadDxfPrimitive[];
  /** First-class canonical HATCH entities, including holes and pattern data. */
  hatches?: CadDxfExportHatch[];
  /** First-class semantic multiline text entities. */
  mtexts?: CadDxfExportMText[];
  /** First-class semantic DIMENSION entities. */
  semanticDimensions?: CadDxfExportSemanticDimension[];
  /** First-class semantic MLEADER entities. */
  mleaders?: CadDxfExportMleader[];
  /** Reusable canonical BLOCK definitions and live INSERT instances. */
  blocks?: CadDxfExportBlock[];
  inserts?: CadDxfExportInsert[];
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
  for (const primitive of input.primitives ?? [])
    names.add(primitive.layer || "0");
  for (const hatch of input.hatches ?? []) names.add(hatch.layer || "0");
  for (const mtext of input.mtexts ?? []) names.add(mtext.layer || "Text");
  for (const dimension of input.semanticDimensions ?? []) names.add(dimension.layer || "Measurements");
  for (const mleader of input.mleaders ?? []) names.add(mleader.layer || "Text");
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
      ...(input.primitives ?? []),
      ...(input.boxes ?? []).map((box) =>
        box.shape === "circle"
          ? {
              kind: "circle" as const,
              layer: box.layer ?? "Equipment",
              points: [{ x: box.x, y: box.y }],
              radius: box.width / 2,
              text: box.label,
            }
          : {
              kind: "rect" as const,
              layer: box.layer ?? "Equipment",
              points: rectPoints(box),
              text: box.label,
            },
      ),
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
    mtexts: input.mtexts,
    semanticDimensions: input.semanticDimensions,
    mleaders: input.mleaders,
    blocks: input.blocks,
    inserts: input.inserts,
    hatches: [
      ...(input.hatches ?? []),
      ...(input.boxes ?? [])
        .filter((box) => box.hatch && box.shape !== "circle")
        .map((box) => ({
          layer: box.layer ?? "Equipment",
          // Mismo contorno rotado que la polilínea, sin repetir el cierre.
          points: rectPoints(box).slice(0, 4),
          pattern: "SOLID",
          solid: true,
        })),
    ],
  };
}
export function exportCadLayoutDxf(
  input: CadLayoutExportInput,
  options?: CadDxfExportOptions,
): CadDxfExportResult {
  return exportCadDxf(cadLayoutToDxfExportModel(input), options);
}
