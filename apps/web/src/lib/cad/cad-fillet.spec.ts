import assert from 'node:assert/strict';
import { applyCadLineFillet, computeCadLineFillet } from './cad-fillet';
import type { CadDocument, CadEntity } from './cad-document';

type CadLine = Extract<CadEntity, { type: 'line' }>;
const horizontal: CadLine = { id: 'horizontal', type: 'line', start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: 'WALLS' };
const vertical: CadLine = { id: 'vertical', type: 'line', start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 10, z: 0 }, layer: 'WALLS' };

const geometry = computeCadLineFillet(horizontal, vertical, 2, 'fillet-arc');
assert.deepEqual(geometry.lineA.start, { x: 2.0000000000000004, y: 0, z: 0 });
assert.deepEqual(geometry.lineA.end, horizontal.end);
assert.deepEqual(geometry.lineB.start, { x: 0, y: 2.0000000000000004, z: 0 });
assert.deepEqual(geometry.lineB.end, vertical.end);
assert.ok(Math.abs(geometry.arc.center.x - 2) < 1e-9);
assert.ok(Math.abs(geometry.arc.center.y - 2) < 1e-9);
assert.equal(geometry.arc.radius, 2);
assert.ok(((geometry.arc.endAngle - geometry.arc.startAngle + 360) % 360) <= 180);

const document: CadDocument = {
  meta: { version: 7, schema: 3, unit: 'mm' },
  layers: [{ id: 'WALLS', name: 'WALLS', color: '#fff', visible: true, locked: false }],
  entities: [horizontal, vertical], history: [], modelSpace: { entityIds: ['horizontal', 'vertical'] }, paperSpaces: [],
  styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} }, blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
};
const applied = applyCadLineFillet(document, { lineAId: 'horizontal', lineBId: 'vertical', radius: 2, arcId: 'fillet-arc' });
assert.equal(applied.meta.version, 8);
assert.equal(applied.history.length, 1);
assert.equal(applied.entities.length, 3);
assert.deepEqual(applied.modelSpace.entityIds, ['fillet-arc', 'horizontal', 'vertical']);
assert.deepEqual(horizontal.start, { x: 0, y: 0, z: 0 });

assert.throws(() => computeCadLineFillet(horizontal, { ...vertical, start: { x: 0, y: 1, z: 0 }, end: { x: 10, y: 1, z: 0 } }, 2, 'parallel'), /non-parallel/);
assert.throws(() => computeCadLineFillet(horizontal, vertical, 20, 'oversize'), /too large/);
assert.throws(() => applyCadLineFillet(document, { lineAId: 'horizontal', lineBId: 'missing', radius: 2, arcId: 'x' }), /two existing LINE/);

console.log('cad fillet specs passed');
