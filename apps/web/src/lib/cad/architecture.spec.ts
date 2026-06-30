import { strict as assert } from "node:assert";
import {
  buildCadArchitectureTakeoff,
  defaultCadLayerForAssetKind,
  describeCadArchitectureObject,
  roomUseTypeFromTags,
} from "./architecture";

assert.equal(
  defaultCadLayerForAssetKind("wall"),
  "architecture",
  "walls default to the Architecture layer",
);
assert.equal(
  defaultCadLayerForAssetKind("column"),
  "structure",
  "columns default to the Structure layer",
);
assert.equal(
  defaultCadLayerForAssetKind("power_panel"),
  "utilities",
  "utility fixtures default to the Utilities layer",
);
assert.equal(
  defaultCadLayerForAssetKind("room", "use:quality, dept:qa"),
  "architecture",
  "rooms default to the Architecture layer",
);

assert.equal(
  roomUseTypeFromTags("room, use:smt"),
  "smt",
  "room use tags are parsed",
);
assert.equal(
  roomUseTypeFromTags("cuarto, calidad"),
  "quality",
  "Spanish quality tags are parsed",
);

const wall = describeCadArchitectureObject({
  id: "w1",
  kind: "wall",
  label: "North wall",
  x: 0,
  y: 0,
  width: 6000,
  height: 150,
  layerId: "architecture",
});
assert.equal(wall?.role, "wall", "wall role is detected");
assert.equal(wall?.length, 6000, "wall length uses the long side");
assert.equal(wall?.thickness, 150, "wall thickness uses the short side");

const room = describeCadArchitectureObject({
  id: "r1",
  kind: "room",
  label: "Quality lab",
  x: 0,
  y: 0,
  width: 5000,
  height: 4000,
  layerId: "architecture",
  tags: "room, use:quality, dept:qa",
});
assert.equal(room?.role, "room", "room role is detected");
assert.equal(room?.roomUse, "quality", "room use is exposed");
assert.equal(room?.department, "QA", "department tag is exposed");

const takeoff = buildCadArchitectureTakeoff({
  unit: "mm",
  footprintArea: 100_000_000,
  layers: [
    { id: "layout", label: "Layout" },
    { id: "architecture", label: "Architecture" },
    { id: "structure", label: "Structure" },
    { id: "utilities", label: "Utilities" },
  ],
  stations: [
    { id: "st1", kind: "station", x: 0, y: 0, width: 2000, height: 1000, layerId: "layout" },
  ],
  assets: [
    { id: "w1", kind: "wall", x: 0, y: 0, width: 6000, height: 150, layerId: "architecture" },
    { id: "c1", kind: "column", x: 0, y: 0, width: 400, height: 400, layerId: "structure" },
    { id: "d1", kind: "door", x: 0, y: 0, width: 1000, height: 120, layerId: "architecture" },
    { id: "r1", kind: "room", label: "SMT room", x: 0, y: 0, width: 9000, height: 5000, tags: "room, use:smt", layerId: "architecture" },
    { id: "u1", kind: "power_panel", x: 0, y: 0, width: 800, height: 350, layerId: "utilities" },
  ],
});

assert.equal(takeoff.wallCount, 1, "wall count is computed");
assert.equal(takeoff.columnCount, 1, "column count is computed");
assert.equal(takeoff.doorCount, 1, "door count is computed");
assert.equal(takeoff.roomCount, 1, "room count is computed");
assert.equal(takeoff.utilityCount, 1, "utility count is computed");
assert.equal(takeoff.wallLength, 6000, "wall length is totaled");
assert.equal(takeoff.byRoomUse[0]?.key, "smt", "room area is grouped by use");
assert.ok(
  takeoff.byLayer.some((layer) => layer.key === "architecture"),
  "architecture layer area is reported",
);

console.log("cad architecture specs passed");
