import assert from "node:assert/strict";
import { planCadNativeRenderBudget } from "./native-render-budget";
import { CadNativeSelectionIndex } from "./native-selection-index";
import type { CadNativeEntity } from "./entity-runtime";

const entities: CadNativeEntity[] = Array.from({ length: 1_000 }, (_, index) => ({
  id: `arc-${index}`,
  type: "arc",
  center: { x: index * 20, y: 100, z: 0 },
  radius: 5,
  startAngle: 0,
  endAngle: 180,
  layer: "BENCHMARK",
}));
const detailed = planCadNativeRenderBudget(entities, [], 10);
const omitted = entities.find(
  (entity) => !detailed.entities.some((candidate) => candidate.id === entity.id),
);
assert.ok(omitted);
assert.equal(omitted.type, "arc");
const materialized = planCadNativeRenderBudget(entities, [omitted.id], 10);
assert.equal(materialized.entities.length, 10);
assert.equal(
  materialized.entities.some((entity) => entity.id === omitted.id),
  true,
);

const index = new CadNativeSelectionIndex(100);
index.replace(entities);
assert.equal(index.size, 1_000);
assert.equal(
  index.hitTest({ x: omitted.center.x + omitted.radius, y: omitted.center.y }, 0.5)[0]?.id,
  omitted.id,
);

const windowHits = index.intersecting({
  minX: omitted.center.x - 6,
  minY: omitted.center.y - 6,
  maxX: omitted.center.x + 6,
  maxY: omitted.center.y + 6,
}, false);
assert.deepEqual(windowHits.map((entity) => entity.id), [omitted.id]);

const polygon = [
  { x: omitted.center.x - 7, y: omitted.center.y - 7 },
  { x: omitted.center.x + 7, y: omitted.center.y - 7 },
  { x: omitted.center.x + 7, y: omitted.center.y + 7 },
  { x: omitted.center.x - 7, y: omitted.center.y + 7 },
];
assert.deepEqual(index.path(polygon, "polygon", false).map((entity) => entity.id), [omitted.id]);
assert.deepEqual(index.path([
  { x: omitted.center.x - 7, y: omitted.center.y },
  { x: omitted.center.x + 7, y: omitted.center.y },
], "fence").map((entity) => entity.id), [omitted.id]);
assert.deepEqual(index.path([
  { x: omitted.center.x, y: omitted.center.y - 7 },
  { x: omitted.center.x + 7, y: omitted.center.y },
  { x: omitted.center.x, y: omitted.center.y + 7 },
], "lasso").map((entity) => entity.id), [omitted.id]);
assert.deepEqual(index.path([
  { x: omitted.center.x - 2, y: omitted.center.y - 2 },
  { x: omitted.center.x + 2, y: omitted.center.y - 2 },
  { x: omitted.center.x + 2, y: omitted.center.y + 2 },
  { x: omitted.center.x - 2, y: omitted.center.y + 2 },
], "polygon", false), []);

const moved = {
  ...omitted,
  center: { ...omitted.center, y: 500 },
};
index.applyPatch({ upsert: [moved], remove: [] });
assert.equal(
  index.hitTest({ x: omitted.center.x + omitted.radius, y: omitted.center.y }, 0.5).length,
  0,
);
assert.equal(
  index.hitTest({ x: moved.center.x + moved.radius, y: moved.center.y }, 0.5)[0]?.id,
  moved.id,
);

index.applyPatch({ upsert: [], remove: [moved.id] });
assert.equal(index.entity(moved.id), undefined);
assert.equal(index.size, 999);

console.log("native-selection-index: el índice espacial sigue altas, bajas y movimientos");
