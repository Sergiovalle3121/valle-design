import assert from 'node:assert/strict';
import type { CadEntity } from './cad-document';
import { buildCadMleaderGeometry, regenerateAssociativeMleaders, type CadMleaderEntity } from './associative-mleader';

const leader: CadMleaderEntity = {
  id: 'leader', type: 'mleader', layer: 'NOTES', text: 'Inspect\nconnection',
  vertices: [{ x: 0, y: 0, z: 0 }, { x: 100, y: 80, z: 0 }],
  leaderLines: [
    [{ x: 0, y: 0, z: 0 }, { x: 100, y: 80, z: 0 }],
    [{ x: 0, y: 160, z: 0 }, { x: 100, y: 80, z: 0 }],
  ],
  textPosition: { x: 220, y: 80, z: 0 }, landing: true,
  arrowhead: 'closed-filled', arrowSize: 20, associative: true,
  references: [
    { entityId: 'line-a', anchor: 'center' },
    { entityId: 'line-b', anchor: 'center' },
  ],
  associationStatus: 'associated',
};

const geometry = buildCadMleaderGeometry(leader)!;
assert.equal(geometry.leaderLines.length, 2);
assert.equal(geometry.paths.filter((path) => path.role === 'arrow').length, 2);
assert.equal(geometry.paths.filter((path) => path.role === 'landing').length, 1);
assert.deepEqual(geometry.textAnchor, { x: 220, y: 80 });
assert.equal(buildCadMleaderGeometry({ ...leader, landing: false })!.paths.some((path) => path.role === 'landing'), false);
assert.equal(buildCadMleaderGeometry({ ...leader, arrowhead: 'none' })!.paths.some((path) => path.role === 'arrow'), false);

const lineA: CadEntity = { id: 'line-a', type: 'line', start: { x: 10, y: 20, z: 0 }, end: { x: 110, y: 20, z: 0 }, layer: '0' };
const lineB: CadEntity = { id: 'line-b', type: 'line', start: { x: 30, y: 200, z: 0 }, end: { x: 130, y: 200, z: 0 }, layer: '0' };
const regenerated = regenerateAssociativeMleaders([lineA, lineB, leader], ['line-a', 'line-b']);
assert.deepEqual(regenerated.regeneratedIds, ['leader']);
const updated = regenerated.entities.find((entity) => entity.id === 'leader');
assert.equal(updated?.type, 'mleader');
if (updated?.type === 'mleader') {
  assert.deepEqual(updated.leaderLines?.[0][0], { x: 60, y: 20, z: 0 });
  assert.deepEqual(updated.leaderLines?.[1][0], { x: 80, y: 200, z: 0 });
  assert.deepEqual(updated.vertices, updated.leaderLines?.[0]);
}
const broken = regenerateAssociativeMleaders([lineB, leader], ['line-a']);
assert.deepEqual(broken.brokenIds, ['leader']);
assert.equal(broken.entities.find((entity) => entity.id === 'leader')?.type === 'mleader'
  ? (broken.entities.find((entity) => entity.id === 'leader') as CadMleaderEntity).associationStatus
  : null, 'broken');

console.log("associative-mleader: la directriz sigue a su geometría y se marca broken al perderla");
