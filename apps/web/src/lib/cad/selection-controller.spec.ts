import assert from "node:assert/strict";
import {
  EMPTY_CAD_SELECTION,
  filterCadSelectableItems,
  reduceCadSelection,
  type CadSelectableItem,
} from "./selection-controller";
import { cadSelectionPathMatchesPolygon } from "./selection-shapes";

const universe: CadSelectableItem[] = [
  { key: "station:s1", type: "station", layer: "layout", label: "Cutting", properties: { status: "ready" } },
  { key: "asset:a1", type: "asset", layer: "equipment", label: "Robot", properties: { status: "blocked" } },
  { key: "native:n1", type: "arc", layer: "geometry", label: "ARC n1", properties: { radius: 25 } },
  { key: "native:n2", type: "ellipse", layer: "geometry", label: "ELLIPSE n2", properties: { radius: 40 } },
];

let state = reduceCadSelection(EMPTY_CAD_SELECTION, { type: "apply", keys: ["station:s1"] });
assert.deepEqual(state.current, ["station:s1"]);
state = reduceCadSelection(state, { type: "apply", keys: ["asset:a1"], operation: "add" });
assert.deepEqual(state.current, ["station:s1", "asset:a1"]);
state = reduceCadSelection(state, { type: "apply", keys: ["station:s1"], operation: "remove" });
assert.deepEqual(state.current, ["asset:a1"]);
state = reduceCadSelection(state, { type: "apply", keys: ["asset:a1", "native:n1"], operation: "toggle" });
assert.deepEqual(state.current, ["native:n1"]);

state = reduceCadSelection(state, { type: "all", universe });
assert.deepEqual(state.current, universe.map((item) => item.key));
state = reduceCadSelection(state, { type: "invert", universe });
assert.deepEqual(state.current, []);
state = reduceCadSelection(state, { type: "previous" });
assert.deepEqual(state.current, universe.map((item) => item.key));
state = reduceCadSelection(state, { type: "last" });
assert.deepEqual(state.current, ["native:n2"]);

state = reduceCadSelection(state, { type: "cycle", candidates: ["native:n1", "native:n2"] });
assert.deepEqual(state.current, ["native:n1"]);
state = reduceCadSelection(state, { type: "cycle", candidates: ["native:n1", "native:n2"] });
assert.deepEqual(state.current, ["native:n2"]);
state = reduceCadSelection(state, { type: "cycle", candidates: ["native:n1", "native:n2"] });
assert.deepEqual(state.current, ["native:n1"]);

assert.deepEqual(
  filterCadSelectableItems(universe, { types: ["arc"], layers: ["GEOMETRY"] }).map((item) => item.key),
  ["native:n1"],
);
assert.deepEqual(
  filterCadSelectableItems(universe, { text: "robot", property: { name: "status", value: "block" } }).map((item) => item.key),
  ["asset:a1"],
);
assert.deepEqual(
  reduceCadSelection(state, {
    type: "quick",
    universe,
    filter: { property: { name: "radius", value: "4" } },
  }).current,
  ["native:n2"],
);

state = reduceCadSelection(state, { type: "clear" });
assert.deepEqual(state.current, []);

const box = [{ x: 2, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 4 }, { x: 2, y: 4 }];
assert.equal(cadSelectionPathMatchesPolygon([
  { x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }, { x: 0, y: 6 },
], box, "polygon", false), true);
assert.equal(cadSelectionPathMatchesPolygon([
  { x: 3, y: 0 }, { x: 3, y: 6 },
], box, "fence"), true);
assert.equal(cadSelectionPathMatchesPolygon([
  { x: 3, y: 3 }, { x: 8, y: 3 }, { x: 8, y: 8 },
], box, "lasso"), true);

console.log("selection-controller: ventana, captura y lazo de selección");
