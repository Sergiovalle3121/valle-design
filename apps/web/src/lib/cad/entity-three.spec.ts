import assert from "node:assert/strict";
import {
  buildCadNativeOverviewObject,
  buildCadNativeObject,
  disposeCadNativeObject,
  setCadNativeOverviewHiddenLayers,
  setCadNativeObjectSelected,
  updateCadNativeOverviewObject,
} from "./entity-three";
import type { BufferAttribute } from "three";
import type { CadNativeEntity } from "./entity-runtime";

const arc: Extract<CadNativeEntity, { type: "arc" }> = {
  id: "arc-render",
  type: "arc",
  center: { x: 500, y: 500, z: 0 },
  radius: 200,
  startAngle: 0,
  endAngle: 180,
  layer: "CURVES",
};
const object = buildCadNativeObject(
  arc,
  { scale: 0.01, width: 1_000, height: 1_000 },
  false,
);
assert.equal(object.userData.nativeEntityId, arc.id);
assert.ok(object.children.some((child) => child.userData.nativePath));
assert.ok(object.children.some((child) => child.userData.nativeGrip));
assert.equal(
  object.children.filter((child) => child.userData.nativeGrip).every((child) => !child.visible),
  true,
);
setCadNativeObjectSelected(object, true);
assert.equal(
  object.children.filter((child) => child.userData.nativeGrip).every((child) => child.visible),
  true,
);
disposeCadNativeObject(object);

const hatch: Extract<CadNativeEntity, { type: "hatch" }> = {
  id: "hatch-render",
  type: "hatch",
  pattern: "SOLID",
  solid: true,
  boundaries: [[
    { x: 100, y: 100, z: 0 },
    { x: 900, y: 100, z: 0 },
    { x: 900, y: 900, z: 0 },
    { x: 100, y: 900, z: 0 },
  ]],
  layer: "AREAS",
};
const hatchObject = buildCadNativeObject(
  hatch,
  { scale: 0.01, width: 1_000, height: 1_000 },
  false,
);
assert.ok(hatchObject.children.some((child) => child.userData.nativeFill), "solid hatch has a real fill mesh");
assert.ok(hatchObject.children.some((child) => child.userData.nativePath), "solid hatch keeps its editable outline");
setCadNativeObjectSelected(hatchObject, true);
const hatchFill = hatchObject.children.find((child) => child.userData.nativeFill);
assert.equal(hatchFill?.userData.nativeEntityId, hatch.id);
disposeCadNativeObject(hatchObject);

const overviewArc = { ...arc, id: "arc-overview" };
const overview = buildCadNativeOverviewObject(
  [overviewArc, hatch],
  { scale: 0.01, width: 1_000, height: 1_000 },
  4,
);
assert.equal(overview.userData.nativeOverview, true);
assert.equal(overview.userData.nativeOverviewEntities, 2);
assert.equal(overview.geometry.getAttribute("position").count, 16);
const beforeOverview = [...overview.geometry.getAttribute("position").array];
const movedOverviewArc = {
  ...overviewArc,
  center: { ...overviewArc.center, x: overviewArc.center.x + 50 },
};
assert.equal(updateCadNativeOverviewObject(overview, {
  upsert: [movedOverviewArc],
  remove: [],
}), true);
const updatedAttribute = overview.geometry.getAttribute("position") as BufferAttribute;
assert.equal(updatedAttribute.updateRanges.length, 1);
assert.equal(updatedAttribute.updateRanges[0]?.count, 24);
assert.notDeepEqual(
  [...overview.geometry.getAttribute("position").array],
  beforeOverview,
);
assert.equal(updateCadNativeOverviewObject(overview, {
  upsert: [{ ...overviewArc, id: "new-arc" }],
  remove: [],
}), false);
assert.equal(updateCadNativeOverviewObject(overview, {
  upsert: [],
  remove: [hatch.id],
}), true);
assert.equal(
  [...overview.geometry.getAttribute("position").array].slice(24).every((value) => value === 0),
  true,
);
setCadNativeOverviewHiddenLayers(overview, new Set([overviewArc.layer]));
assert.equal(
  [...overview.geometry.getAttribute("position").array].slice(0, 24).every((value) => value === 0),
  true,
);
setCadNativeOverviewHiddenLayers(overview, new Set());
assert.equal(
  [...overview.geometry.getAttribute("position").array].slice(0, 24).some((value) => value !== 0),
  true,
);
disposeCadNativeObject(overview);

console.log("cad native Three.js renderer specs passed");
