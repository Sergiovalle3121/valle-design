import assert from 'node:assert/strict';
import type { CadDocument, CadEntity } from './cad-document';
import { applyCadLineEdit, computeCadLineExtend, computeCadLineTrim } from './cad-line-edit';

type CadLine = Extract<CadEntity, { type: 'line' }>;
const target: CadLine = { id: 'target', type: 'line', start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: '0' };
const cutter: CadLine = { id: 'cutter', type: 'line', start: { x: 6, y: -5, z: 0 }, end: { x: 6, y: 5, z: 0 }, layer: '0' };
assert.deepEqual(computeCadLineTrim(target, cutter, 'start').end, { x: 6, y: 0, z: 0 });
assert.deepEqual(computeCadLineTrim(target, cutter, 'end').start, { x: 6, y: 0, z: 0 });

const short: CadLine = { ...target, end: { x: 4, y: 0, z: 0 } };
assert.deepEqual(computeCadLineExtend(short, cutter, 'end').end, { x: 6, y: 0, z: 0 });
assert.throws(() => computeCadLineExtend(short, cutter, 'start'), /beyond the start/);
assert.throws(() => computeCadLineTrim(target, { ...cutter, start: { x: 6, y: 10, z: 0 }, end: { x: 6, y: 20, z: 0 } }, 'start'), /does not reach/);

const document: CadDocument = {
  meta: { version: 4, schema: 3, unit: 'mm' }, layers: [{ id: '0', name: '0', color: '#fff', visible: true, locked: false }],
  entities: [short, cutter], history: [], modelSpace: { entityIds: ['target', 'cutter'] }, paperSpaces: [],
  styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} }, blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
};
const applied = applyCadLineEdit(document, { operation: 'extend', targetId: 'target', boundaryId: 'cutter', endpoint: 'end' });
assert.equal(applied.meta.version, 5);
assert.equal(applied.history.length, 1);
assert.equal(applied.history[0].label, 'extend:target:end:boundary:cutter');
assert.deepEqual((applied.entities.find((entity) => entity.id === 'target') as CadLine).end, { x: 6, y: 0, z: 0 });
assert.deepEqual(document.entities[0], short);
console.log('cad line edit specs passed');
