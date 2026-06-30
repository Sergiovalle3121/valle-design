import { strict as assert } from "node:assert";
import {
  ASSET_CATALOG,
  ASSET_CATEGORIES,
  assetMeta,
  type AssetArchetype,
} from "./asset-catalog";

const ehsKinds = [
  "fire_extinguisher",
  "eyewash",
  "emergency_exit",
  "first_aid",
  "spill_kit",
  "ppe_station",
];
const utilityKinds = [
  "power_panel",
  "compressed_air",
  "network_drop",
  "maintenance_area",
  "tool_crib",
  "calibration_station",
];
const reusedArchetypes = new Set<AssetArchetype>([
  "cabinet",
  "path",
  "bin",
  "column",
  "zone",
  "shelf",
  "desk",
]);

assert.equal(
  new Set(ASSET_CATALOG.map((asset) => asset.kind)).size,
  ASSET_CATALOG.length,
  "asset kinds are unique",
);

const ehsCategory = ASSET_CATEGORIES.find(
  (category) => category.category === "seguridad",
);
assert.equal(ehsCategory?.label, "Seguridad / EHS", "EHS group is visible");
assert.deepEqual(
  ehsCategory?.items.map((asset) => asset.kind),
  ehsKinds,
  "EHS fixtures are grouped for the equipment rail",
);

const utilityCategory = ASSET_CATEGORIES.find(
  (category) => category.category === "utilidades",
);
assert.equal(utilityCategory?.label, "Utilidades", "utilities group is visible");
assert.deepEqual(
  utilityCategory?.items.map((asset) => asset.kind),
  utilityKinds,
  "utility fixtures are grouped for the equipment rail",
);

for (const kind of [...ehsKinds, ...utilityKinds]) {
  const asset = assetMeta(kind);
  assert.ok(asset.w > 0 && asset.h > 0, `${kind} has a footprint`);
  assert.ok(asset.height > 0, `${kind} has a render height`);
  assert.ok(
    reusedArchetypes.has(asset.archetype),
    `${kind} reuses an existing 3D archetype`,
  );
}

assert.equal(
  assetMeta("emergency_exit").archetype,
  "path",
  "emergency exit inserts as an editable floor path",
);
assert.equal(
  assetMeta("maintenance_area").archetype,
  "zone",
  "maintenance area inserts as an editable floor zone",
);
assert.equal(assetMeta("door").archetype, "door", "door has a native opening archetype");
assert.equal(assetMeta("room").archetype, "zone", "room inserts as an editable area zone");
assert.equal(assetMeta("room").category, "zona", "room appears in the zones group");

console.log("asset catalog specs passed");
