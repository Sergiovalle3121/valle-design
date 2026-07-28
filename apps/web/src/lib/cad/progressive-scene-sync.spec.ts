import assert from 'node:assert/strict';
import { migrateCadDocument } from './cad-document';
import {
  CadSceneSynchronizer,
  type CadNativeEntity,
} from './entity-runtime';

const entities: CadNativeEntity[] = Array.from({ length: 5 }, (_, index) => ({
  id: `arc-${index}`,
  type: 'arc' as const,
  center: { x: index * 10, y: 0, z: 0 },
  radius: 2,
  startAngle: 0,
  endAngle: 180,
  layer: 'CURVES',
}));
const document = migrateCadDocument({
  meta: { version: 1, schema: 3, unit: 'mm' },
  entities,
});
const created: string[] = [];
const batches: number[] = [];
const synchronizer = new CadSceneSynchronizer<{ id: string }>();

void (async () => {
  const stats = await synchronizer.syncProgressive(document, {
    create: (entity) => { created.push(entity.id); return { id: entity.id }; },
    update: (entity) => ({ id: entity.id }),
    remove: () => undefined,
  }, {
    batchSize: 2,
    schedule: () => Promise.resolve(),
    onBatch: (batch) => batches.push(batch.processed),
  });
  assert.deepEqual(created, entities.map((entity) => entity.id));
  assert.deepEqual(batches, [2, 4, 5]);
  assert.deepEqual(stats, {
    created: 5,
    updated: 0,
    removed: 0,
    unchanged: 0,
    processed: 5,
    batches: 3,
    total: 5,
    cancelled: false,
  });

  const replacement = migrateCadDocument({
    ...document,
    entities: entities.slice(0, 2),
  });
  const next = await synchronizer.syncProgressive(replacement, {
    create: (entity) => ({ id: entity.id }),
    update: (entity) => ({ id: entity.id }),
    remove: () => undefined,
  }, { batchSize: 1, schedule: () => Promise.resolve() });
  assert.equal(next.removed, 3);
  assert.equal(next.unchanged, 2);
  assert.equal(synchronizer.entries().length, 2);
  console.log('CAD progressive scene sync: 9 passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
