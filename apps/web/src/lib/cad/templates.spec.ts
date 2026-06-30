import { strict as assert } from "node:assert";
import {
  CAD_LAYOUT_TEMPLATES,
  instantiateCadLayoutTemplate,
} from "./templates";

assert.equal(
  new Set(CAD_LAYOUT_TEMPLATES.map((template) => template.id)).size,
  CAD_LAYOUT_TEMPLATES.length,
  "template ids are unique",
);

const smt = instantiateCadLayoutTemplate("smt-line", {
  width: 20000,
  height: 8000,
  gridSize: 100,
});
assert.ok(smt.assets.length >= 8, "SMT template creates editable assets");
assert.ok(smt.connectors.length >= 6, "SMT template creates flow connectors");
assert.ok(
  smt.assets.some((asset) => asset.layer === "safety"),
  "SMT template includes safety layer objects",
);

const supermarket = instantiateCadLayoutTemplate("supermarket-kitting", {
  width: 16000,
  height: 9500,
  gridSize: 100,
});
assert.ok(
  supermarket.assets.length >= 16,
  "supermarket template creates a complete editable kitting area",
);
assert.ok(
  supermarket.assets.some((asset) => asset.tags.includes("kanban")),
  "supermarket template includes kanban lanes",
);
assert.ok(
  supermarket.assets.some((asset) => asset.tags.includes("kitting")),
  "supermarket template includes kitting carts/areas",
);
assert.ok(
  supermarket.assets.some((asset) => asset.layer === "aisles"),
  "supermarket template includes aisle objects",
);
assert.ok(
  supermarket.assets.some((asset) => asset.layer === "safety"),
  "supermarket template includes safety objects",
);
assert.ok(
  supermarket.connectors.some((connector) => connector.kind === "material") &&
    supermarket.connectors.some((connector) => connector.kind === "flow"),
  "supermarket template creates material and flow connectors",
);

const small = instantiateCadLayoutTemplate("ems-mini-factory", {
  width: 9000,
  height: 6000,
  gridSize: 100,
});
assert.ok(small.scale < 1, "large factory template scales down");
assert.ok(small.warnings.length > 0, "scaled template reports warnings");
assert.ok(
  small.assets.every(
    (asset) =>
      asset.x >= 0 &&
      asset.y >= 0 &&
      asset.x + asset.w <= 9000 &&
      asset.y + asset.h <= 6000,
  ),
  "template assets stay inside the footprint",
);

console.log("cad templates specs passed");
