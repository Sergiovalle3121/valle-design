import { strict as assert } from "node:assert";
import { generateWarehouseRackRows } from "./warehouse-generators";

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

console.log("cad warehouse generator specs passed");
