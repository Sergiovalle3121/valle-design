/** Pure CAD layer smoke tests. */
import { strict as assert } from "node:assert";
import {
  assignObjectsToLayer,
  DEFAULT_CAD_LAYERS,
  editableObjectIds,
  isolateCadLayerVisibility,
  isLayerLocked,
  isObjectLayerLocked,
  isLayerVisible,
  layerForObject,
  showAllCadLayers,
  summarizeCadLayers,
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
assert.ok(
  DEFAULT_CAD_LAYERS.some((layer) => layer.id === "architecture"),
  "architecture layer is available",
);
assert.ok(
  DEFAULT_CAD_LAYERS.some((layer) => layer.id === "structure"),
  "structure layer is available",
);
assert.ok(
  DEFAULT_CAD_LAYERS.some((layer) => layer.id === "utilities"),
  "utilities layer is available",
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

layers = isolateCadLayerVisibility(layers, "safety");
assert.deepEqual(
  layers.filter((layer) => layer.visible).map((layer) => layer.id),
  ["safety"],
  "isolateCadLayerVisibility leaves only requested layer visible",
);
const hiddenSummary = summarizeCadLayers(layers, {
  layout: 2,
  equipment: 3,
  safety: 1,
});
assert.equal(hiddenSummary.visible, 1, "summary counts visible layers");
assert.equal(hiddenSummary.hiddenObjectCount, 5, "summary counts hidden objects");
assert.equal(hiddenSummary.lockedObjectCount, 4, "summary counts locked objects");
layers = showAllCadLayers(layers);
assert.equal(
  summarizeCadLayers(layers).hidden,
  0,
  "showAllCadLayers restores layer visibility",
);
console.log("cad layer specs passed");
