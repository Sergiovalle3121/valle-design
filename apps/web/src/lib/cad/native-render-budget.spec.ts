import assert from "node:assert/strict";
import {
  CAD_NATIVE_DETAILED_RENDER_LIMIT,
  CAD_NATIVE_LARGE_DRAWING_RENDER_LIMIT,
  planCadNativeRenderBudget,
} from "./native-render-budget";
import type { CadNativeEntity } from "./entity-runtime";

const entities: CadNativeEntity[] = Array.from({ length: 100_000 }, (_, index) => ({
  id: `arc-${index}`,
  type: "arc",
  center: { x: index % 1_000, y: Math.floor(index / 1_000), z: 0 },
  radius: 1,
  startAngle: 0,
  endAngle: 180,
  layer: "BENCHMARK",
}));

const plan = planCadNativeRenderBudget(entities, ["arc-99999", "arc-50001"]);
assert.equal(plan.total, 100_000);
assert.equal(plan.visible, 100_000);
assert.equal(plan.rendered, CAD_NATIVE_LARGE_DRAWING_RENDER_LIMIT);
assert.equal(plan.omitted, 100_000 - CAD_NATIVE_LARGE_DRAWING_RENDER_LIMIT);
assert.equal(plan.limited, true);
assert.equal(plan.viewportDriven, false);
assert.deepEqual(plan.entities.slice(0, 2).map((entity) => entity.id), [
  "arc-50001",
  "arc-99999",
]);
assert.equal(new Set(plan.entities.map((entity) => entity.id)).size, plan.rendered);
assert.ok(plan.entities.some((entity) => entity.id === "arc-0"));
assert.ok(plan.entities.some((entity) => Number(entity.id.slice(4)) > 99_000));

const repeated = planCadNativeRenderBudget(entities, ["arc-99999", "arc-50001"]);
assert.deepEqual(
  repeated.entities.map((entity) => entity.id),
  plan.entities.map((entity) => entity.id),
);

const small = entities.slice(0, 5);
const complete = planCadNativeRenderBudget(small, [], 5);
assert.equal(complete.entities, small);
assert.deepEqual(complete, {
  entities: small,
  total: 5,
  visible: 5,
  rendered: 5,
  omitted: 0,
  limited: false,
  viewportDriven: false,
});

const selectedOverflow = planCadNativeRenderBudget(entities.slice(0, 10), [
  "arc-7",
  "arc-8",
  "arc-9",
], 2);
assert.deepEqual(selectedOverflow.entities.map((entity) => entity.id), ["arc-7", "arc-8"]);
assert.equal(selectedOverflow.omitted, 8);

const tenThousand = planCadNativeRenderBudget(
  entities.slice(0, CAD_NATIVE_DETAILED_RENDER_LIMIT),
);
assert.equal(tenThousand.limited, false);
assert.equal(tenThousand.rendered, CAD_NATIVE_DETAILED_RENDER_LIMIT);

const zoomedEntities = entities.slice(51_000, 51_600);
const zoomed = planCadNativeRenderBudget(
  entities,
  ['arc-99999'],
  undefined,
  { visibleEntities: zoomedEntities },
);
assert.equal(zoomed.viewportDriven, true);
assert.equal(zoomed.visible, 600);
assert.equal(zoomed.rendered, 601);
assert.equal(zoomed.entities[0]?.id, 'arc-99999');
assert.deepEqual(zoomed.entities.slice(1), zoomedEntities);

const denseViewport = planCadNativeRenderBudget(
  entities,
  [],
  undefined,
  { visibleEntities: entities.slice(10_000, 30_000) },
);
assert.equal(denseViewport.visible, 20_000);
assert.equal(denseViewport.rendered, CAD_NATIVE_LARGE_DRAWING_RENDER_LIMIT);
assert.ok(denseViewport.entities.every((entity) => {
  const index = Number(entity.id.slice(4));
  return index >= 10_000 && index < 30_000;
}));

console.log("native-render-budget: el presupuesto de render acota lo que entra en escena");
