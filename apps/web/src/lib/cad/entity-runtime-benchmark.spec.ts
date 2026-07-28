import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  CadSceneSynchronizer,
  CadSpatialIndex,
  type CadNativeEntity,
} from "./entity-runtime";
import { buildCadNativeOverviewObject, disposeCadNativeObject } from "./entity-three";
import { CadNativeSelectionIndex } from "./native-selection-index";

interface BenchmarkResult {
  entities: number;
  indexBuildMs: number;
  queryP50Ms: number;
  queryP95Ms: number;
}

function percentile(samples: number[], value: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * value))];
}

function benchmarkIndex(entities: number): BenchmarkResult {
  const index = new CadSpatialIndex(100);
  const started = performance.now();
  for (let id = 0; id < entities; id += 1) {
    const x = (id % 1_000) * 20;
    const y = Math.floor(id / 1_000) * 20;
    index.upsert(`arc-${id}`, {
      minX: x - 8,
      minY: y - 8,
      maxX: x + 8,
      maxY: y + 8,
    });
  }
  const indexBuildMs = performance.now() - started;
  assert.equal(index.size, entities);

  const samples: number[] = [];
  let hitCount = 0;
  for (let query = 0; query < 200; query += 1) {
    const x = ((query * 97) % 1_000) * 20;
    const y = ((query * 31) % Math.max(1, Math.ceil(entities / 1_000))) * 20;
    const queryStarted = performance.now();
    hitCount += index.search({
      minX: x,
      minY: y,
      maxX: x + 400,
      maxY: y + 400,
    }).length;
    samples.push(performance.now() - queryStarted);
  }
  assert.ok(hitCount > 0);

  return {
    entities,
    indexBuildMs,
    queryP50Ms: percentile(samples, 0.5),
    queryP95Ms: percentile(samples, 0.95),
  };
}

const results = [1_000, 10_000, 100_000].map(benchmarkIndex);
assert.deepEqual(
  results.map((result) => result.entities),
  [1_000, 10_000, 100_000],
);

const nativeEntities: CadNativeEntity[] = Array.from(
  { length: 100_000 },
  (_, index) => ({
    id: `native-${index}`,
    type: "arc",
    center: {
      x: (index % 1_000) * 20,
      y: Math.floor(index / 1_000) * 20,
      z: 0,
    },
    radius: 8,
    startAngle: 0,
    endAngle: 180,
    layer: "BENCHMARK",
  }),
);
const selectionIndex = new CadNativeSelectionIndex();
const selectionIndexStarted = performance.now();
selectionIndex.replace(nativeEntities);
const selectionIndexBuildMs = performance.now() - selectionIndexStarted;
const selectionSamples: number[] = [];
for (let query = 0; query < 200; query += 1) {
  const entityIndex = (query * 499) % nativeEntities.length;
  const entity = nativeEntities[entityIndex];
  assert.equal(entity.type, "arc");
  const queryStarted = performance.now();
  const hit = selectionIndex.hitTest({
    x: entity.center.x + entity.radius,
    y: entity.center.y,
  }, 0.5, 1);
  selectionSamples.push(performance.now() - queryStarted);
  assert.equal(hit[0]?.id, entity.id);
}

const overviewStarted = performance.now();
const overview = buildCadNativeOverviewObject(
  nativeEntities,
  { scale: 0.01, width: 20_000, height: 2_000 },
);
const overviewBuildMs = performance.now() - overviewStarted;
const overviewPositionBytes = overview.geometry.getAttribute("position").array.byteLength;
assert.equal(overview.userData.nativeOverviewEntities, 100_000);
assert.equal(overviewPositionBytes, 19_200_000);
disposeCadNativeObject(overview);

const canonicalHitP95Ms = percentile(selectionSamples, 0.95);
assert.ok(
  canonicalHitP95Ms < 12,
  `canonical hit-test p95 must stay below 12ms (actual ${canonicalHitP95Ms.toFixed(2)}ms)`,
);

const synchronizer = new CadSceneSynchronizer<{ revision: number }>();
const sink = {
  create: () => ({ revision: 1 }),
  update: (_entity: CadNativeEntity, projection: { revision: number }) => ({
    revision: projection.revision + 1,
  }),
  remove: () => undefined,
};
const initialStarted = performance.now();
const initial = synchronizer.applyPatch(
  { upsert: nativeEntities, remove: [] },
  sink,
);
const initialMs = performance.now() - initialStarted;
assert.equal(initial.created, 100_000);

const changed = nativeEntities.slice(0, 100).map((entity) => {
  assert.equal(entity.type, "arc");
  return { ...entity, radius: entity.radius + 1 };
});
const patchStarted = performance.now();
const patch = synchronizer.applyPatch({ upsert: changed, remove: [] }, sink);
const patchMs = performance.now() - patchStarted;
assert.equal(patch.updated, 100);
assert.equal(patch.total, 100_000);

console.log(
  JSON.stringify(
    {
      benchmark: "cad-native-runtime",
      results,
      scene: {
        entities: 100_000,
        initialMs,
        patchEntities: 100,
        patchMs,
      },
      canonicalSelection: {
        entities: selectionIndex.size,
        buildMs: selectionIndexBuildMs,
        hitP50Ms: percentile(selectionSamples, 0.5),
        hitP95Ms: canonicalHitP95Ms,
      },
      overview: {
        entities: nativeEntities.length,
        buildMs: overviewBuildMs,
        positionBytes: overviewPositionBytes,
        drawCalls: 1,
      },
    },
    null,
    2,
  ),
);
