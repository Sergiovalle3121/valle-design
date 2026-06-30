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

export type CadSupermarketGeneratorOrientation = "horizontal" | "vertical";
export interface CadSupermarketGeneratorInput {
  lanes: number;
  cartsPerLane: number;
  laneLength: number;
  laneWidth: number;
  cartWidth: number;
  cartDepth: number;
  aisleWidth: number;
  orientation: CadSupermarketGeneratorOrientation;
  labelPrefix: string;
  includeEsdZone?: boolean;
  includeQuarantine?: boolean;
  startIndex?: number;
  margin?: number;
}

export interface CadSupermarketGeneratorResult {
  input: Required<CadSupermarketGeneratorInput>;
  scale: number;
  assets: CadGeneratedLayoutAsset[];
  annotations: CadGeneratedLayoutAnnotation[];
  connectors: CadGeneratedLayoutConnector[];
  warnings: string[];
  summary: {
    laneCount: number;
    cartCount: number;
    connectorCount: number;
    safetyCount: number;
    labelCount: number;
    footprintWidth: number;
    footprintHeight: number;
  };
}

const MAX_SUPERMARKET_LANES = 8;
const MAX_CARTS_PER_LANE = 6;

interface BaseRect {
  ref: string;
  kind: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  layer: CadLayerId;
  tags: string[];
  rotation?: number;
}

function boundsOf(items: BaseRect[]): { width: number; height: number } {
  return items.reduce(
    (bounds, item) => ({
      width: Math.max(bounds.width, item.x + item.w),
      height: Math.max(bounds.height, item.y + item.h),
    }),
    { width: 0, height: 0 },
  );
}

function transformGeneratedAsset(
  item: BaseRect,
  orientation: CadSupermarketGeneratorOrientation,
  scale: number,
  originX: number,
  originY: number,
  gridSize: number,
  width: number,
  height: number,
): CadGeneratedLayoutAsset {
  const transformed =
    orientation === "vertical"
      ? {
          ...item,
          x: originX + item.y * scale,
          y: originY + item.x * scale,
          w: item.h,
          h: item.w,
        }
      : {
          ...item,
          x: originX + item.x * scale,
          y: originY + item.y * scale,
        };

  return clampToFootprint(
    {
      ...transformed,
      x: snap(transformed.x, gridSize),
      y: snap(transformed.y, gridSize),
      w: scaleDimension(transformed.w, scale, gridSize),
      h: scaleDimension(transformed.h, scale, gridSize),
    },
    width,
    height,
  );
}

function transformAnnotation(
  item: CadGeneratedLayoutAnnotation,
  orientation: CadSupermarketGeneratorOrientation,
  scale: number,
  originX: number,
  originY: number,
  gridSize: number,
  width: number,
  height: number,
): CadGeneratedLayoutAnnotation {
  const x =
    orientation === "vertical"
      ? originX + item.y * scale
      : originX + item.x * scale;
  const y =
    orientation === "vertical"
      ? originY + item.x * scale
      : originY + item.y * scale;
  return {
    ...item,
    x: Math.max(0, Math.min(width, snap(x, gridSize))),
    y: Math.max(0, Math.min(height, snap(y, gridSize))),
  };
}

export function generateWarehouseSupermarketKitting(
  input: CadSupermarketGeneratorInput,
  footprint: { width: number; height: number; gridSize?: number },
): CadSupermarketGeneratorResult {
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

  const lanes = clampInt(input.lanes, 1, MAX_SUPERMARKET_LANES, 3);
  const cartsPerLane = clampInt(
    input.cartsPerLane,
    1,
    MAX_CARTS_PER_LANE,
    1,
  );
  if (lanes !== Math.round(input.lanes || 0))
    addUniqueWarning(warnings, `Lanes were limited to ${lanes}.`);
  if (cartsPerLane !== Math.round(input.cartsPerLane || 0))
    addUniqueWarning(
      warnings,
      `Carts per lane were limited to ${cartsPerLane}.`,
    );

  const normalized: Required<CadSupermarketGeneratorInput> = {
    lanes,
    cartsPerLane,
    laneLength: clampNumber(input.laneLength, 1200, 12000, 3600),
    laneWidth: clampNumber(input.laneWidth, 400, 2600, 750),
    cartWidth: clampNumber(input.cartWidth, 500, 2200, 1100),
    cartDepth: clampNumber(input.cartDepth, 400, 1800, 750),
    aisleWidth: clampNumber(input.aisleWidth, 600, 5000, 1200),
    orientation: input.orientation === "vertical" ? "vertical" : "horizontal",
    labelPrefix: input.labelPrefix.trim() || "K",
    includeEsdZone: input.includeEsdZone ?? true,
    includeQuarantine: input.includeQuarantine ?? true,
    startIndex: clampInt(input.startIndex, 1, 999, 1),
    margin,
  };

  const laneGap = Math.max(gridSize, normalized.laneWidth * 0.38);
  const cartGap = Math.max(gridSize, normalized.cartWidth * 0.28);
  const lanesY = 2200;
  const laneRunHeight =
    normalized.lanes * normalized.laneWidth +
    (normalized.lanes - 1) * laneGap;
  const laneX = 4300;
  const cartX = laneX + normalized.laneLength + 700;
  const fifoX =
    cartX +
    normalized.cartsPerLane * normalized.cartWidth +
    Math.max(0, normalized.cartsPerLane - 1) * cartGap +
    600;
  const fifoWidth = 2200;
  const lineSideX = fifoX + fifoWidth + 700;
  const lineSideWidth = 1800;
  const farX = lineSideX + lineSideWidth;
  const forkliftY = lanesY + laneRunHeight + 700;
  const baseAssets: BaseRect[] = [
    {
      ref: "receiving-drop",
      kind: "zone",
      label: "Receiving drop",
      x: 0,
      y: 150,
      w: 2500,
      h: 1200,
      layer: "layout",
      tags: ["warehouse", "receiving", "generated", "supermarket"],
    },
    {
      ref: "incoming-qc",
      kind: "workbench",
      label: "Incoming QC",
      x: 2800,
      y: 300,
      w: 1200,
      h: 800,
      layer: "equipment",
      tags: ["quality", "incoming", "generated", "supermarket"],
    },
    {
      ref: "market-zone",
      kind: "zone",
      label: "Material supermarket",
      x: laneX,
      y: 0,
      w: normalized.laneLength,
      h: 1500,
      layer: "layout",
      tags: ["supermarket", "kitting", "generated"],
    },
    {
      ref: "replenishment-rack",
      kind: "rack",
      label: "Replenishment rack",
      x: laneX,
      y: 1650,
      w: Math.max(1800, normalized.laneLength * 0.55),
      h: 750,
      layer: "equipment",
      tags: ["replenishment", "rack", "generated", "supermarket"],
    },
    {
      ref: "kanban-board",
      kind: "cabinet",
      label: "Kanban board",
      x: Math.max(lineSideX, farX - 700),
      y: 250,
      w: 650,
      h: 500,
      layer: "equipment",
      tags: ["kanban", "visual-management", "generated"],
    },
    {
      ref: "pedestrian-pick-aisle",
      kind: "agvpath",
      label: "Pedestrian pick aisle",
      x: 0,
      y: 1600,
      w: farX,
      h: 450,
      layer: "aisles",
      tags: ["pedestrian", "aisle", "generated", "supermarket"],
    },
    {
      ref: "forklift-replenishment-aisle",
      kind: "agvpath",
      label: "Forklift replenishment aisle",
      x: 0,
      y: forkliftY,
      w: farX,
      h: normalized.aisleWidth,
      layer: "aisles",
      tags: ["forklift", "aisle", "generated", "supermarket"],
    },
    {
      ref: "fifo-wip",
      kind: "zone",
      label: "FIFO WIP lane",
      x: fifoX,
      y: lanesY,
      w: fifoWidth,
      h: laneRunHeight,
      layer: "layout",
      tags: ["fifo", "wip", "generated", "supermarket"],
    },
    {
      ref: "line-side-delivery",
      kind: "zone",
      label: "Line-side delivery",
      x: lineSideX,
      y: lanesY,
      w: lineSideWidth,
      h: laneRunHeight,
      layer: "layout",
      tags: ["line-side", "delivery", "generated", "supermarket"],
    },
    {
      ref: "kitting-operator",
      kind: "operator",
      label: "Kitting operator",
      x: fifoX - 650,
      y: lanesY + Math.max(0, laneRunHeight / 2 - 300),
      w: 600,
      h: 600,
      layer: "equipment",
      tags: ["operator", "kitting", "generated", "supermarket"],
    },
  ];

  if (normalized.includeQuarantine) {
    baseAssets.push({
      ref: "material-quarantine",
      kind: "fence",
      label: "Material quarantine",
      x: 0,
      y: lanesY,
      w: 2500,
      h: Math.min(1800, laneRunHeight),
      layer: "safety",
      tags: ["quality", "quarantine", "generated", "supermarket"],
    });
  }

  if (normalized.includeEsdZone) {
    baseAssets.push({
      ref: "esd-kitting-boundary",
      kind: "zone",
      label: "ESD controlled kitting",
      x: laneX - 300,
      y: 0,
      w: farX - laneX + 600,
      h: forkliftY - 200,
      layer: "safety",
      tags: ["esd", "controlled-area", "generated", "supermarket"],
    });
  }

  const laneRefs: string[] = [];
  const cartRefsByLane: string[][] = [];
  for (let lane = 0; lane < normalized.lanes; lane++) {
    const logicalLane = normalized.startIndex + lane;
    const label = rowLabel(normalized.labelPrefix, logicalLane);
    const laneY = lanesY + lane * (normalized.laneWidth + laneGap);
    const laneRef = `kanban-lane-${label}`;
    laneRefs.push(laneRef);
    baseAssets.push({
      ref: laneRef,
      kind: "zone",
      label: `Kanban lane ${label}`,
      x: laneX,
      y: laneY,
      w: normalized.laneLength,
      h: normalized.laneWidth,
      layer: "layout",
      tags: ["kanban", "lane", "generated", "supermarket", `lane:${label}`],
    });

    const cartRefs: string[] = [];
    for (let cart = 0; cart < normalized.cartsPerLane; cart++) {
      const cartRef = `kitting-cart-${label}-${cart + 1}`;
      cartRefs.push(cartRef);
      baseAssets.push({
        ref: cartRef,
        kind: "agv",
        label: `${label} cart ${cart + 1}`,
        x: cartX + cart * (normalized.cartWidth + cartGap),
        y: laneY + Math.max(0, (normalized.laneWidth - normalized.cartDepth) / 2),
        w: normalized.cartWidth,
        h: normalized.cartDepth,
        layer: "equipment",
        tags: [
          "kitting",
          "cart",
          "generated",
          "supermarket",
          `lane:${label}`,
        ],
      });
    }
    cartRefsByLane.push(cartRefs);
  }

  const baseBounds = boundsOf(baseAssets);
  const requestedWidth =
    normalized.orientation === "horizontal" ? baseBounds.width : baseBounds.height;
  const requestedHeight =
    normalized.orientation === "horizontal" ? baseBounds.height : baseBounds.width;
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
      `Supermarket generator scaled to ${Math.round(scale * 100)}% to fit the footprint.`,
    );

  const requiredW = requestedWidth * scale;
  const requiredH = requestedHeight * scale;
  const originX = snap(Math.max(0, (width - requiredW) / 2), gridSize);
  const originY = snap(Math.max(0, (height - requiredH) / 2), gridSize);
  const assets = baseAssets.map((item) =>
    transformGeneratedAsset(
      item,
      normalized.orientation,
      scale,
      originX,
      originY,
      gridSize,
      width,
      height,
    ),
  );

  const baseAnnotations: CadGeneratedLayoutAnnotation[] = [
    {
      ref: "supermarket-generator-title",
      type: "text",
      text: `Generated supermarket: ${normalized.lanes} lanes x ${normalized.cartsPerLane} carts`,
      x: 0,
      y: 0,
      layer: "measurements",
    },
    {
      ref: "supermarket-flow-note",
      type: "text",
      text: "Pull flow: receiving -> supermarket -> kitting carts -> line-side",
      x: laneX,
      y: lanesY - 350,
      layer: "flow",
    },
    ...laneRefs.map((ref): CadGeneratedLayoutAnnotation => {
      const source = baseAssets.find((item) => item.ref === ref)!;
      return {
        ref: `label-${ref}`,
        type: "text",
        text: source.label,
        x: source.x + 150,
        y: source.y + source.h / 2,
        layer: "measurements",
      };
    }),
  ];
  const annotations = baseAnnotations.map((item) =>
    transformAnnotation(
      item,
      normalized.orientation,
      scale,
      originX,
      originY,
      gridSize,
      width,
      height,
    ),
  );

  const connectors: CadGeneratedLayoutConnector[] = [
    { fromRef: "receiving-drop", toRef: "incoming-qc", kind: "material" },
    { fromRef: "incoming-qc", toRef: "market-zone", kind: "material" },
  ];
  laneRefs.forEach((laneRef, index) => {
    connectors.push({ fromRef: "market-zone", toRef: laneRef, kind: "material" });
    const carts = cartRefsByLane[index] ?? [];
    carts.forEach((cartRef, cartIndex) => {
      connectors.push({
        fromRef: cartIndex === 0 ? laneRef : carts[cartIndex - 1],
        toRef: cartRef,
        kind: "flow",
      });
    });
    const lastCart = carts[carts.length - 1];
    if (lastCart) connectors.push({ fromRef: lastCart, toRef: "fifo-wip", kind: "flow" });
  });
  connectors.push({ fromRef: "fifo-wip", toRef: "line-side-delivery", kind: "flow" });

  return {
    input: normalized,
    scale,
    assets,
    annotations,
    connectors,
    warnings,
    summary: {
      laneCount: normalized.lanes,
      cartCount: normalized.lanes * normalized.cartsPerLane,
      connectorCount: connectors.length,
      safetyCount: assets.filter((asset) => asset.layer === "safety").length,
      labelCount: annotations.length,
      footprintWidth: width,
      footprintHeight: height,
    },
  };
}
