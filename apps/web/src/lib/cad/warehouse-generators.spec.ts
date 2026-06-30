import { strict as assert } from "node:assert";
import {
  generateWarehouseDockStaging,
  generateWarehouseRackRows,
  generateWarehouseSupermarketKitting,
} from "./warehouse-generators";

const horizontal = generateWarehouseRackRows(
  {
    rows: 2,
    baysPerRow: 3,
    bayWidth: 2400,
    rackDepth: 1100,
    aisleWidth: 3000,
    orientation: "horizontal",
    labelPrefix: "R",
  },
  { width: 12000, height: 10000, gridSize: 100 },
);

assert.equal(horizontal.summary.rackCount, 6, "rack count matches inputs");
assert.equal(horizontal.summary.aisleCount, 2, "one forklift aisle per row");
assert.equal(
  horizontal.assets.filter((asset) => asset.kind === "rack").length,
  6,
  "generator emits editable rack assets",
);
assert.equal(
  horizontal.assets.filter((asset) => asset.kind === "agvpath").length,
  2,
  "generator emits editable aisle assets",
);
assert.ok(
  horizontal.assets.every(
    (asset) =>
      asset.x >= 0 &&
      asset.y >= 0 &&
      asset.x + asset.w <= horizontal.summary.footprintWidth &&
      asset.y + asset.h <= horizontal.summary.footprintHeight,
  ),
  "horizontal assets stay inside the footprint",
);
assert.ok(
  horizontal.assets.some(
    (asset) => asset.layer === "aisles" && asset.tags.includes("forklift"),
  ),
  "aisle assets are assigned to the aisles layer",
);
assert.ok(
  horizontal.annotations.some((annotation) =>
    annotation.text.includes("Generated warehouse racks"),
  ),
  "generator emits visible layout labels",
);

const vertical = generateWarehouseRackRows(
  {
    rows: 3,
    baysPerRow: 2,
    bayWidth: 1800,
    rackDepth: 1000,
    aisleWidth: 2200,
    orientation: "vertical",
    labelPrefix: "V",
  },
  { width: 12000, height: 9000, gridSize: 100 },
);
const verticalAisle = vertical.assets.find((asset) => asset.kind === "agvpath");
assert.ok(verticalAisle, "vertical generator creates a forklift path");
assert.ok(
  verticalAisle!.h > verticalAisle!.w,
  "vertical forklift path runs along the bay direction",
);

const tiny = generateWarehouseRackRows(
  {
    rows: 12,
    baysPerRow: 24,
    bayWidth: 4200,
    rackDepth: 1200,
    aisleWidth: 3600,
    orientation: "horizontal",
    labelPrefix: "T",
  },
  { width: 8000, height: 5000, gridSize: 100 },
);

assert.ok(tiny.scale < 1, "oversized rack layout scales down");
assert.ok(tiny.warnings.length > 0, "oversized rack layout reports warnings");
assert.ok(
  tiny.summary.rackCount <= 144,
  "oversized rack request is capped for editor responsiveness",
);

const receivingDock = generateWarehouseDockStaging(
  {
    dockCount: 4,
    stagingLanes: 4,
    dockWidth: 3200,
    dockDepth: 900,
    stagingDepth: 5000,
    aisleWidth: 3600,
    side: "south",
    mode: "receiving",
    labelPrefix: "D",
  },
  { width: 22000, height: 16000, gridSize: 100 },
);

assert.equal(receivingDock.summary.dockCount, 4, "dock count matches inputs");
assert.equal(
  receivingDock.summary.stagingLaneCount,
  4,
  "staging lane count matches inputs",
);
assert.equal(
  receivingDock.assets.filter((asset) => asset.tags.includes("dock-door"))
    .length,
  4,
  "dock generator emits editable dock-door assets",
);
assert.equal(
  receivingDock.assets.filter((asset) => asset.tags.includes("staging"))
    .length,
  8,
  "dock generator emits staging zones and pallets",
);
assert.ok(
  receivingDock.assets.some(
    (asset) => asset.kind === "agvpath" && asset.layer === "aisles",
  ),
  "dock generator emits a forklift apron on the aisles layer",
);
assert.equal(
  receivingDock.connectors.length,
  8,
  "dock generator emits flow connectors from dock to lane to apron",
);
assert.ok(
  receivingDock.assets.every(
    (asset) =>
      asset.x >= 0 &&
      asset.y >= 0 &&
      asset.x + asset.w <= receivingDock.summary.footprintWidth &&
      asset.y + asset.h <= receivingDock.summary.footprintHeight,
  ),
  "receiving dock assets stay inside the footprint",
);

const eastShippingDock = generateWarehouseDockStaging(
  {
    dockCount: 3,
    stagingLanes: 5,
    dockWidth: 2800,
    dockDepth: 800,
    stagingDepth: 4200,
    aisleWidth: 3000,
    side: "east",
    mode: "shipping",
    labelPrefix: "S",
  },
  { width: 18000, height: 22000, gridSize: 100 },
);
const eastApron = eastShippingDock.assets.find(
  (asset) => asset.kind === "agvpath",
);
assert.ok(eastApron, "east dock generator creates a forklift apron");
assert.ok(
  eastApron!.h > eastApron!.w,
  "east/west dock apron runs along the dock line",
);
assert.ok(
  eastShippingDock.annotations.some((annotation) =>
    annotation.text.includes("Shipping dock/staging"),
  ),
  "dock generator emits visible title annotations",
);

const oversizedDock = generateWarehouseDockStaging(
  {
    dockCount: 24,
    stagingLanes: 36,
    dockWidth: 7000,
    dockDepth: 2500,
    stagingDepth: 10000,
    aisleWidth: 8000,
    side: "north",
    mode: "crossdock",
    labelPrefix: "X",
  },
  { width: 14000, height: 9000, gridSize: 100 },
);

assert.ok(oversizedDock.scale < 1, "oversized dock layout scales down");
assert.ok(
  oversizedDock.warnings.length > 0,
  "oversized dock layout reports warnings",
);
assert.ok(
  oversizedDock.summary.dockCount <= 24,
  "oversized dock request is capped for editor responsiveness",
);

console.log("cad warehouse generator specs passed");

const supermarket = generateWarehouseSupermarketKitting(
  {
    lanes: 3,
    cartsPerLane: 2,
    laneLength: 3600,
    laneWidth: 750,
    cartWidth: 1100,
    cartDepth: 750,
    aisleWidth: 1200,
    orientation: "horizontal",
    labelPrefix: "K",
    includeEsdZone: true,
    includeQuarantine: true,
  },
  { width: 18000, height: 11000, gridSize: 100 },
);

assert.equal(supermarket.summary.laneCount, 3, "supermarket lane count matches inputs");
assert.equal(supermarket.summary.cartCount, 6, "supermarket cart count matches inputs");
assert.ok(
  supermarket.assets.some(
    (asset) =>
      asset.label === "Material supermarket" &&
      asset.layer === "layout" &&
      asset.tags.includes("supermarket"),
  ),
  "supermarket generator emits editable supermarket zone",
);
assert.ok(
  supermarket.assets.some(
    (asset) =>
      asset.kind === "agv" &&
      asset.layer === "equipment" &&
      asset.tags.includes("kitting"),
  ),
  "supermarket generator emits editable kitting carts",
);
assert.ok(
  supermarket.assets.some(
    (asset) => asset.layer === "safety" && asset.tags.includes("esd"),
  ),
  "supermarket generator emits optional ESD safety boundary",
);
assert.ok(
  supermarket.connectors.some(
    (connector) =>
      connector.fromRef === "receiving-drop" &&
      connector.toRef === "incoming-qc" &&
      connector.kind === "material",
  ),
  "supermarket generator emits material flow connectors",
);
assert.ok(
  supermarket.connectors.some(
    (connector) =>
      connector.toRef === "line-side-delivery" && connector.kind === "flow",
  ),
  "supermarket generator emits line-side flow connectors",
);
assert.ok(
  supermarket.assets.every(
    (asset) =>
      asset.x >= 0 &&
      asset.y >= 0 &&
      asset.x + asset.w <= supermarket.summary.footprintWidth &&
      asset.y + asset.h <= supermarket.summary.footprintHeight,
  ),
  "supermarket assets stay inside the footprint",
);

const verticalSupermarket = generateWarehouseSupermarketKitting(
  {
    lanes: 2,
    cartsPerLane: 1,
    laneLength: 3000,
    laneWidth: 700,
    cartWidth: 1000,
    cartDepth: 700,
    aisleWidth: 1000,
    orientation: "vertical",
    labelPrefix: "V",
    includeEsdZone: false,
    includeQuarantine: false,
  },
  { width: 9000, height: 14000, gridSize: 100 },
);
const verticalLane = verticalSupermarket.assets.find((asset) =>
  asset.tags.includes("lane:V01"),
);
assert.ok(verticalLane, "vertical supermarket creates named lane tags");
assert.ok(
  verticalLane!.h > verticalLane!.w,
  "vertical supermarket lanes run along the vertical direction",
);
assert.equal(
  verticalSupermarket.summary.safetyCount,
  0,
  "optional safety objects can be disabled",
);

const tightSupermarket = generateWarehouseSupermarketKitting(
  {
    lanes: 12,
    cartsPerLane: 10,
    laneLength: 9000,
    laneWidth: 1800,
    cartWidth: 1800,
    cartDepth: 1200,
    aisleWidth: 3000,
    orientation: "horizontal",
    labelPrefix: "T",
  },
  { width: 7000, height: 5000, gridSize: 100 },
);

assert.equal(tightSupermarket.summary.laneCount, 8, "lane count is capped");
assert.equal(
  tightSupermarket.summary.cartCount,
  48,
  "cart count is capped for editor responsiveness",
);
assert.ok(tightSupermarket.scale < 1, "oversized supermarket layout scales down");
assert.ok(tightSupermarket.warnings.length > 0, "oversized supermarket reports warnings");

