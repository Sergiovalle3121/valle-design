import type { CadLayerId } from "./layers";

export type CadRackRowOrientation = "horizontal" | "vertical";
export type CadDockStagingSide = "north" | "south" | "east" | "west";
export type CadDockStagingMode = "receiving" | "shipping" | "crossdock";

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

export interface CadDockStagingGeneratorInput {
  dockCount: number;
  stagingLanes: number;
  dockWidth: number;
  dockDepth: number;
  stagingDepth: number;
  aisleWidth: number;
  side: CadDockStagingSide;
  mode: CadDockStagingMode;
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

export interface CadGeneratedLayoutConnector {
  fromRef: string;
  toRef: string;
  kind: string;
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

export interface CadWarehouseDockStagingResult {
  input: Required<CadDockStagingGeneratorInput>;
  scale: number;
  assets: CadGeneratedLayoutAsset[];
  annotations: CadGeneratedLayoutAnnotation[];
  connectors: CadGeneratedLayoutConnector[];
  warnings: string[];
  summary: {
    dockCount: number;
    stagingLaneCount: number;
    palletCount: number;
    aisleCount: number;
    labelCount: number;
    footprintWidth: number;
    footprintHeight: number;
  };
}

const MAX_ROWS = 12;
const MAX_BAYS_PER_ROW = 24;
const MAX_RACKS = 144;
const MAX_DOCKS = 24;
const MAX_STAGING_LANES = 36;

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

function dockLabel(prefix: string, dockNumber: number): string {
  return `${prefix}${String(dockNumber).padStart(2, "0")}`;
}

function modeTitle(mode: CadDockStagingMode): string {
  if (mode === "shipping") return "Shipping";
  if (mode === "crossdock") return "Cross-dock";
  return "Receiving";
}

function isHorizontalDockSide(side: CadDockStagingSide): boolean {
  return side === "north" || side === "south";
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

export function generateWarehouseDockStaging(
  input: CadDockStagingGeneratorInput,
  footprint: { width: number; height: number; gridSize?: number },
): CadWarehouseDockStagingResult {
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

  const dockCount = clampInt(input.dockCount, 1, MAX_DOCKS, 4);
  const stagingLanes = clampInt(input.stagingLanes, 1, MAX_STAGING_LANES, dockCount);
  if (dockCount !== Math.round(input.dockCount || 0))
    addUniqueWarning(warnings, `Dock count was limited to ${dockCount}.`);
  if (stagingLanes !== Math.round(input.stagingLanes || 0))
    addUniqueWarning(warnings, `Staging lanes were limited to ${stagingLanes}.`);

  const normalized: Required<CadDockStagingGeneratorInput> = {
    dockCount,
    stagingLanes,
    dockWidth: clampNumber(input.dockWidth, 1200, 8000, 3200),
    dockDepth: clampNumber(input.dockDepth, 300, 5000, 900),
    stagingDepth: clampNumber(input.stagingDepth, 1200, 12000, 5000),
    aisleWidth: clampNumber(input.aisleWidth, 600, 9000, 3600),
    side: ["north", "south", "east", "west"].includes(input.side)
      ? input.side
      : "south",
    mode: ["receiving", "shipping", "crossdock"].includes(input.mode)
      ? input.mode
      : "receiving",
    labelPrefix: input.labelPrefix.trim() || "D",
    startIndex: clampInt(input.startIndex, 1, 999, 1),
    margin,
  };

  const slotCount = Math.max(normalized.dockCount, normalized.stagingLanes);
  const horizontal = isHorizontalDockSide(normalized.side);
  const requestedRun = slotCount * normalized.dockWidth;
  const requestedDepth =
    normalized.dockDepth + normalized.stagingDepth + normalized.aisleWidth;
  const requestedWidth = horizontal ? requestedRun : requestedDepth;
  const requestedHeight = horizontal ? requestedDepth : requestedRun;
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
      `Dock/staging generator scaled to ${Math.round(scale * 100)}% to fit the footprint.`,
    );

  const dockWidth = scaleDimension(normalized.dockWidth, scale, gridSize);
  const dockDepth = scaleDimension(normalized.dockDepth, scale, gridSize);
  const stagingDepth = scaleDimension(normalized.stagingDepth, scale, gridSize);
  const aisleWidth = scaleDimension(normalized.aisleWidth, scale, gridSize);
  const runLength = slotCount * dockWidth;
  const originLong = snap(
    Math.max(0, ((horizontal ? width : height) - runLength) / 2),
    gridSize,
  );
  const title = modeTitle(normalized.mode);
  const assets: CadGeneratedLayoutAsset[] = [];
  const annotations: CadGeneratedLayoutAnnotation[] = [];
  const connectors: CadGeneratedLayoutConnector[] = [];

  const horizontalBox = (
    ref: string,
    kind: string,
    label: string,
    slot: number,
    y: number,
    depth: number,
    layer: CadLayerId,
    tags: string[],
  ): CadGeneratedLayoutAsset =>
    clampToFootprint(
      {
        ref,
        kind,
        label,
        x: originLong + slot * dockWidth,
        y,
        w: dockWidth,
        h: depth,
        layer,
        tags,
      },
      width,
      height,
    );

  const verticalBox = (
    ref: string,
    kind: string,
    label: string,
    slot: number,
    x: number,
    depth: number,
    layer: CadLayerId,
    tags: string[],
  ): CadGeneratedLayoutAsset =>
    clampToFootprint(
      {
        ref,
        kind,
        label,
        x,
        y: originLong + slot * dockWidth,
        w: depth,
        h: dockWidth,
        layer,
        tags,
      },
      width,
      height,
    );

  const dockEdge =
    normalized.side === "north" || normalized.side === "west"
      ? normalized.margin
      : horizontal
        ? height - normalized.margin - dockDepth
        : width - normalized.margin - dockDepth;
  const stagingEdge =
    normalized.side === "north" || normalized.side === "west"
      ? dockEdge + dockDepth
      : dockEdge - stagingDepth;
  const aisleEdge =
    normalized.side === "north" || normalized.side === "west"
      ? stagingEdge + stagingDepth
      : stagingEdge - aisleWidth;

  const apron = horizontal
    ? clampToFootprint(
        {
          ref: "dock-forklift-apron",
          kind: "agvpath",
          label: `${title} forklift apron`,
          x: originLong,
          y: aisleEdge,
          w: runLength,
          h: aisleWidth,
          layer: "aisles",
          tags: ["warehouse", "dock", "forklift", "apron", "generated", normalized.mode],
        },
        width,
        height,
      )
    : clampToFootprint(
        {
          ref: "dock-forklift-apron",
          kind: "agvpath",
          label: `${title} forklift apron`,
          x: aisleEdge,
          y: originLong,
          w: aisleWidth,
          h: runLength,
          layer: "aisles",
          tags: ["warehouse", "dock", "forklift", "apron", "generated", normalized.mode],
        },
        width,
        height,
      );
  assets.push(apron);

  annotations.push({
    ref: "dock-generator-title",
    type: "text",
    text: `${title} dock/staging: ${normalized.dockCount} docks, ${normalized.stagingLanes} lanes`,
    x: horizontal ? originLong : Math.min(width, Math.max(0, dockEdge)),
    y: horizontal ? Math.max(0, Math.min(height, dockEdge - gridSize)) : originLong,
    layer: "measurements",
  });
  annotations.push({
    ref: "dock-apron-label",
    type: "text",
    text: `${title} forklift apron`,
    x: apron.x + apron.w / 2,
    y: apron.y + apron.h / 2,
    layer: "aisles",
  });

  for (let index = 0; index < normalized.dockCount; index++) {
    const label = dockLabel(normalized.labelPrefix, normalized.startIndex + index);
    const ref = `dock-door-${label}`;
    const dock = horizontal
      ? horizontalBox(
          ref,
          "wall",
          `${title} dock ${label}`,
          index,
          dockEdge,
          dockDepth,
          "layout",
          ["warehouse", "dock", "dock-door", "generated", normalized.mode, `dock:${label}`],
        )
      : verticalBox(
          ref,
          "wall",
          `${title} dock ${label}`,
          index,
          dockEdge,
          dockDepth,
          "layout",
          ["warehouse", "dock", "dock-door", "generated", normalized.mode, `dock:${label}`],
        );
    assets.push(dock);
  }

  for (let index = 0; index < normalized.stagingLanes; index++) {
    const label = dockLabel(normalized.labelPrefix, normalized.startIndex + index);
    const laneRef = `staging-lane-${label}`;
    const dockRef = `dock-door-${label}`;
    const lane = horizontal
      ? horizontalBox(
          laneRef,
          "zone",
          `${title} staging ${label}`,
          index,
          stagingEdge,
          stagingDepth,
          "equipment",
          ["warehouse", "dock", "staging", "generated", normalized.mode, `lane:${label}`],
        )
      : verticalBox(
          laneRef,
          "zone",
          `${title} staging ${label}`,
          index,
          stagingEdge,
          stagingDepth,
          "equipment",
          ["warehouse", "dock", "staging", "generated", normalized.mode, `lane:${label}`],
        );
    assets.push(lane);

    const palletWidth = Math.max(
      gridSize,
      Math.min(horizontal ? lane.w * 0.62 : lane.w * 0.46, scaleDimension(1200, scale, gridSize)),
    );
    const palletHeight = Math.max(
      gridSize,
      Math.min(horizontal ? lane.h * 0.38 : lane.h * 0.62, scaleDimension(1000, scale, gridSize)),
    );
    assets.push(
      clampToFootprint(
        {
          ref: `staging-pallet-${label}`,
          kind: "pallet",
          label: `${title} pallet ${label}`,
          x: lane.x + (lane.w - palletWidth) / 2,
          y: lane.y + (lane.h - palletHeight) / 2,
          w: palletWidth,
          h: palletHeight,
          layer: "equipment",
          tags: ["warehouse", "dock", "pallet", "staging", "generated", normalized.mode, `lane:${label}`],
        },
        width,
        height,
      ),
    );

    if (index < normalized.dockCount)
      connectors.push({ fromRef: dockRef, toRef: laneRef, kind: "flow" });
    connectors.push({ fromRef: laneRef, toRef: apron.ref, kind: "flow" });

    annotations.push({
      ref: `staging-label-${label}`,
      type: "text",
      text: `${title} lane ${label}`,
      x: lane.x + lane.w / 2,
      y: lane.y + lane.h / 2,
      layer: "measurements",
    });
  }

  return {
    input: normalized,
    scale,
    assets,
    annotations,
    connectors,
    warnings,
    summary: {
      dockCount: normalized.dockCount,
      stagingLaneCount: normalized.stagingLanes,
      palletCount: normalized.stagingLanes,
      aisleCount: 1,
      labelCount: annotations.length,
      footprintWidth: width,
      footprintHeight: height,
    },
  };
}
