import type { CadLayerId } from "./layers";

export type CadRackRowOrientation = "horizontal" | "vertical";

export interface CadRackRowGeneratorInput {
  rows: number;
  baysPerRow: number;
  bayWidth: number;
  rackDepth: number;
  aisleWidth: number;
  orientation: CadRackRowOrientation;
  labelPrefix: string;
  startIndex?: number;
  margin?: number;
}

export interface CadGeneratedLayoutAsset {
  ref: string;
  kind: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  layer: CadLayerId;
  tags: string[];
}

export interface CadGeneratedLayoutAnnotation {
  ref: string;
  type: "text";
  text: string;
  x: number;
  y: number;
  layer: CadLayerId;
}

export interface CadWarehouseRackRowsResult {
  input: Required<CadRackRowGeneratorInput>;
  scale: number;
  assets: CadGeneratedLayoutAsset[];
  annotations: CadGeneratedLayoutAnnotation[];
  warnings: string[];
  summary: {
    rackCount: number;
    aisleCount: number;
    labelCount: number;
    footprintWidth: number;
    footprintHeight: number;
  };
}

const MAX_ROWS = 12;
const MAX_BAYS_PER_ROW = 24;
const MAX_RACKS = 144;

function clampInt(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = Math.round(Number.isFinite(value) ? Number(value) : fallback);
  return Math.max(min, Math.min(max, parsed));
}

function clampNumber(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = Number.isFinite(value) ? Number(value) : fallback;
  return Math.max(min, Math.min(max, parsed));
}

function snap(value: number, gridSize: number): number {
  const grid = Math.max(1, Math.abs(gridSize || 1));
  return Math.round(value / grid) * grid;
}

function scaleDimension(value: number, scale: number, gridSize: number): number {
  return Math.max(gridSize, snap(value * scale, gridSize));
}

function clampToFootprint(
  item: CadGeneratedLayoutAsset,
  width: number,
  height: number,
): CadGeneratedLayoutAsset {
  const w = Math.max(1, Math.min(width, item.w));
  const h = Math.max(1, Math.min(height, item.h));
  return {
    ...item,
    w,
    h,
    x: Math.max(0, Math.min(width - w, item.x)),
    y: Math.max(0, Math.min(height - h, item.y)),
  };
}

function rowLabel(prefix: string, rowNumber: number): string {
  return `${prefix}${String(rowNumber).padStart(2, "0")}`;
}

function addUniqueWarning(warnings: string[], message: string): void {
  if (!warnings.includes(message)) warnings.push(message);
}

export function generateWarehouseRackRows(
  input: CadRackRowGeneratorInput,
  footprint: { width: number; height: number; gridSize?: number },
): CadWarehouseRackRowsResult {
  const warnings: string[] = [];
  const gridSize = Math.max(1, footprint.gridSize ?? 100);
  const width = Math.max(gridSize, footprint.width);
  const height = Math.max(gridSize, footprint.height);
  const margin = snap(
    clampNumber(
      input.margin,
      gridSize,
      Math.max(gridSize, Math.min(width, height) / 4),
      gridSize * 2,
    ),
    gridSize,
  );

  const rows = clampInt(input.rows, 1, MAX_ROWS, 2);
  let baysPerRow = clampInt(input.baysPerRow, 1, MAX_BAYS_PER_ROW, 4);
  if (rows !== Math.round(input.rows || 0))
    addUniqueWarning(warnings, `Rows were limited to ${rows}.`);
  if (baysPerRow !== Math.round(input.baysPerRow || 0))
    addUniqueWarning(warnings, `Bays per row were limited to ${baysPerRow}.`);

  if (rows * baysPerRow > MAX_RACKS) {
    baysPerRow = Math.max(1, Math.floor(MAX_RACKS / rows));
    addUniqueWarning(
      warnings,
      `Rack count was capped at ${rows * baysPerRow} to keep the editor responsive.`,
    );
  }

  const normalized: Required<CadRackRowGeneratorInput> = {
    rows,
    baysPerRow,
    bayWidth: clampNumber(input.bayWidth, 300, 12000, 2400),
    rackDepth: clampNumber(input.rackDepth, 300, 5000, 1100),
    aisleWidth: clampNumber(input.aisleWidth, 600, 8000, 3000),
    orientation: input.orientation === "vertical" ? "vertical" : "horizontal",
    labelPrefix: input.labelPrefix.trim() || "R",
    startIndex: clampInt(input.startIndex, 1, 999, 1),
    margin,
  };

  const rackRun = normalized.baysPerRow * normalized.bayWidth;
  const rackBreadth =
    normalized.rows * normalized.rackDepth +
    normalized.rows * normalized.aisleWidth;
  const requestedWidth =
    normalized.orientation === "horizontal" ? rackRun : rackBreadth;
  const requestedHeight =
    normalized.orientation === "horizontal" ? rackBreadth : rackRun;
  const availableWidth = Math.max(gridSize, width - normalized.margin * 2);
  const availableHeight = Math.max(gridSize, height - normalized.margin * 2);
  const fitScale = Math.min(
    1,
    availableWidth / Math.max(gridSize, requestedWidth),
    availableHeight / Math.max(gridSize, requestedHeight),
  );
  const scale = Math.max(0.35, Number.isFinite(fitScale) ? fitScale : 1);
  if (fitScale < 1)
    addUniqueWarning(
      warnings,
      `Warehouse rack generator scaled to ${Math.round(scale * 100)}% to fit the footprint.`,
    );

  const bayWidth = scaleDimension(normalized.bayWidth, scale, gridSize);
  const rackDepth = scaleDimension(normalized.rackDepth, scale, gridSize);
  const aisleWidth = scaleDimension(normalized.aisleWidth, scale, gridSize);
  const runLength = normalized.baysPerRow * bayWidth;
  const blockDepth = rackDepth + aisleWidth;
  const requiredW =
    normalized.orientation === "horizontal"
      ? runLength
      : normalized.rows * blockDepth;
  const requiredH =
    normalized.orientation === "horizontal"
      ? normalized.rows * blockDepth
      : runLength;
  const originX = snap(Math.max(0, (width - requiredW) / 2), gridSize);
  const originY = snap(Math.max(0, (height - requiredH) / 2), gridSize);

  const assets: CadGeneratedLayoutAsset[] = [];
  const annotations: CadGeneratedLayoutAnnotation[] = [
    {
      ref: "warehouse-generator-title",
      type: "text",
      text: `Generated warehouse racks: ${normalized.rows} rows x ${normalized.baysPerRow} bays`,
      x: Math.min(width, originX),
      y: Math.max(0, originY - gridSize),
      layer: "measurements",
    },
  ];

  for (let row = 0; row < normalized.rows; row++) {
    const logicalRow = normalized.startIndex + row;
    const label = rowLabel(normalized.labelPrefix, logicalRow);
    const rowX =
      normalized.orientation === "horizontal"
        ? originX
        : originX + row * blockDepth;
    const rowY =
      normalized.orientation === "horizontal"
        ? originY + row * blockDepth
        : originY;

    for (let bay = 0; bay < normalized.baysPerRow; bay++) {
      const bayNumber = bay + 1;
      const x =
        normalized.orientation === "horizontal"
          ? rowX + bay * bayWidth
          : rowX;
      const y =
        normalized.orientation === "horizontal"
          ? rowY
          : rowY + bay * bayWidth;
      assets.push(
        clampToFootprint(
          {
            ref: `rack-${label}-${bayNumber}`,
            kind: "rack",
            label: `${label}-${String(bayNumber).padStart(2, "0")}`,
            x,
            y,
            w: normalized.orientation === "horizontal" ? bayWidth : rackDepth,
            h: normalized.orientation === "horizontal" ? rackDepth : bayWidth,
            layer: "equipment",
            tags: [
              "warehouse",
              "rack",
              "generated",
              `row:${label}`,
              `bay:${bayNumber}`,
            ],
          },
          width,
          height,
        ),
      );
    }

    const aisleX =
      normalized.orientation === "horizontal" ? rowX : rowX + rackDepth;
    const aisleY =
      normalized.orientation === "horizontal" ? rowY + rackDepth : rowY;
    const aisle = clampToFootprint(
      {
        ref: `aisle-${label}`,
        kind: "agvpath",
        label: `Forklift aisle ${label}`,
        x: aisleX,
        y: aisleY,
        w: normalized.orientation === "horizontal" ? runLength : aisleWidth,
        h: normalized.orientation === "horizontal" ? aisleWidth : runLength,
        layer: "aisles",
        tags: ["warehouse", "aisle", "forklift", "generated", `row:${label}`],
      },
      width,
      height,
    );
    assets.push(aisle);

    annotations.push({
      ref: `label-${label}`,
      type: "text",
      text: `Rack row ${label}`,
      x: normalized.orientation === "horizontal" ? rowX : rowX + rackDepth / 2,
      y: normalized.orientation === "horizontal" ? rowY + rackDepth / 2 : rowY,
      layer: "measurements",
    });
    annotations.push({
      ref: `aisle-label-${label}`,
      type: "text",
      text: `Forklift aisle ${label}`,
      x: aisle.x + aisle.w / 2,
      y: aisle.y + aisle.h / 2,
      layer: "aisles",
    });
  }

  return {
    input: normalized,
    scale,
    assets,
    annotations,
    warnings,
    summary: {
      rackCount: normalized.rows * normalized.baysPerRow,
      aisleCount: normalized.rows,
      labelCount: annotations.length,
      footprintWidth: width,
      footprintHeight: height,
    },
  };
}
