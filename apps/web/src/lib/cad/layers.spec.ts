/** Pure CAD layer smoke tests. */
import { strict as assert } from "node:assert";
import {
  assignObjectsToLayer,
  DEFAULT_CAD_LAYERS,
  editableObjectIds,
  isLayerLocked,
  isObjectLayerLocked,
  isLayerVisible,
  layerForObject,
  toggleCadLayerLocked,
  toggleCadLayerVisible,
} from "./layers";

let layers = DEFAULT_CAD_LAYERS;
assert.equal(
  isLayerVisible(layers, "layout"),
  true,
  "layout visible by default",
);
layers = toggleCadLayerVisible(layers, "layout");
assert.equal(isLayerVisible(layers, "layout"), false, "visibility toggles");
layers = toggleCadLayerLocked(layers, "equipment");
assert.equal(isLayerLocked(layers, "equipment"), true, "lock toggles");
const assignments = assignObjectsToLayer({}, ["a", "b"], "safety");
assert.equal(
  layerForObject(assignments, "a", "layout"),
  "safety",
  "assignment works",
);
assert.equal(
  layerForObject(assignments, "x", "layout"),
  "layout",
  "fallback works",
);

assert.equal(
  isObjectLayerLocked(layers, assignments, "a", "layout"),
  false,
  "object on unlocked safety layer can be edited",
);
layers = toggleCadLayerLocked(layers, "safety");
assert.equal(
  isObjectLayerLocked(layers, assignments, "a", "layout"),
  true,
  "object on locked assigned layer is locked",
);
assert.deepEqual(
  editableObjectIds(layers, assignments, [
    { id: "a", fallbackLayer: "layout" },
    { id: "x", fallbackLayer: "layout" },
  ]),
  ["x"],
  "editableObjectIds filters locked objects",
);
console.log("cad layer specs passed");
