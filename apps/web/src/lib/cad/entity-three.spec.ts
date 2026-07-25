import assert from "node:assert/strict";
import {
  buildCadNativeObject,
  disposeCadNativeObject,
  setCadNativeObjectSelected,
} from "./entity-three";
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

console.log("cad native Three.js renderer specs passed");
