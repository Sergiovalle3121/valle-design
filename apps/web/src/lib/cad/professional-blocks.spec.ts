import assert from 'node:assert/strict';
import { layoutToCadDocument, type CadBlockDefinition, type CadDocument, type CadEntity } from './cad-document';
import {
  analyzeCadBlocks,
  buildCadBlockThumbnail,
  buildCadInsertBatches,
  defineCadBlock,
  explodeCadInsert,
  insertCadBlock,
  purgeUnusedCadBlocks,
  redefineCadBlock,
  replaceCadBlock,
  resolveCadInsert,
  searchCadBlocks,
} from './professional-blocks';
import { CAD_ENTITY_REGISTRY, executeCadEntityCommand } from './entity-runtime';

const line = (id: string, x1: number, y1: number, x2: number, y2: number, layer = '0'): CadEntity => ({
  id, type: 'line', start: { x: x1, y: y1, z: 0 }, end: { x: x2, y: y2, z: 0 }, layer,
  context: { presentation: { color: { source: 'byBlock' } } },
});
const empty = (): CadDocument => layoutToCadDocument({ layers: [{ id: 'E', name: 'Equipment', color: '#00ffff', visible: true, locked: false }] });

let document = empty();
document = { ...document, entities: [line('source-a', 10, 20, 30, 20, 'E')], modelSpace: { entityIds: ['source-a'] } };
document = defineCadBlock(document, {
  id: 'door', name: 'DOOR', entityIds: ['source-a'], basePoint: { x: 10, y: 20, z: 0 },
  attributes: { MARK: { required: true, defaultValue: 'D-01', prompt: 'Door mark', position: { x: 10, y: 22, z: 0 }, height: 2 } },
  description: 'Steel access door', keywords: ['architecture', 'door'], library: { scope: 'tenant', tenantId: 'tenant-a' },
  businessLink: { tenantId: 'tenant-a', entityType: 'assetType', entityId: 'door-standard' },
});
assert.equal(document.blocks[0].version, 1, 'definition starts at version 1');
assert.equal(document.entities[0].type, 'insert', 'BLOCK replaces selected geometry with one live INSERT');
assert.equal(resolveCadInsert(document, document.entities[0].id).entities.length, 2, 'resolves geometry plus visible attribute');

document = insertCadBlock(document, {
  id: 'door-2', block: 'DOOR', insertion: { x: 100, y: 50, z: 0 }, scale: { x: 2, y: 2, z: 1 }, rotation: 90,
  layer: 'E', attributes: { MARK: 'D-02' }, context: { presentation: { color: { source: 'explicit', value: '#f97316' } }, businessLink: { entityType: 'workOrder', entityId: 'wo-42' } },
});
const resolved = resolveCadInsert(document, 'door-2');
const resolvedLine = resolved.entities.find((entity) => entity.type === 'line');
assert.ok(resolvedLine?.type === 'line');
assert.ok(Math.abs(resolvedLine.start.x - 100) < 1e-8 && Math.abs(resolvedLine.start.y - 50) < 1e-8, 'base point lands on insertion');
assert.ok(Math.abs(resolvedLine.end.x - 100) < 1e-8 && Math.abs(resolvedLine.end.y - 90) < 1e-8, 'scale and rotation are exact');
assert.equal(resolvedLine.context?.presentation?.color?.source, 'explicit', 'ByBlock resolves from instance override');
assert.ok(resolved.entities.some((entity) => entity.type === 'text' && entity.text === 'D-02'), 'per-instance attribute is rendered');
const nativeInsert = document.entities.find((entity) => entity.id === 'door-2')!;
assert.ok(CAD_ENTITY_REGISTRY.supports(nativeInsert), 'INSERT is a first-class native selectable entity');
if (!CAD_ENTITY_REGISTRY.supports(nativeInsert)) throw new Error('expected native INSERT');
const insertAdapter = CAD_ENTITY_REGISTRY.adapter(nativeInsert);
assert.ok(insertAdapter.renderer.paths(nativeInsert, 64, document).length > 0, 'registry renders the live definition without exploding it');
assert.equal(insertAdapter.hitTester.hitTest(nativeInsert, { x: 100, y: 70 }, 1, document), true, 'unitary hit-test follows transformed child geometry');
assert.equal(insertAdapter.properties.read(nativeInsert)['attribute:MARK'], 'D-02', 'per-instance attributes are editable properties');
const moved = executeCadEntityCommand(document, { type: 'transform', entityId: 'door-2', transform: { translation: { x: 25, y: 0 } } });
const movedInsert = moved.document.entities.find((entity) => entity.id === 'door-2');
assert.ok(movedInsert?.type === 'insert');
assert.equal(movedInsert.insertion.x, 125, 'command bus transforms INSERT without exploding it');
assert.equal(resolveCadInsert(document, 'door').diagnostics[0]?.severity, 'error', 'unknown insert id is honest');

const nested: CadBlockDefinition = {
  id: 'assembly', name: 'ASSEMBLY', basePoint: { x: 0, y: 0, z: 0 }, version: 1,
  entities: [{ id: 'nested-door', type: 'insert', block: 'door', insertion: { x: 10, y: 20, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, attributes: { MARK: 'N-1' }, layer: '0' }],
};
document = { ...document, blocks: [...document.blocks, nested], entities: [...document.entities, { id: 'assembly-1', type: 'insert', block: 'assembly', insertion: { x: 500, y: 600, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, layer: 'E' }], modelSpace: { entityIds: [...document.modelSpace.entityIds, 'assembly-1'] } };
assert.equal(resolveCadInsert(document, 'assembly-1').entities.length, 2, 'nested block resolves without exploding the stored instance');
assert.equal(analyzeCadBlocks(document).length, 0, 'valid nesting and attributes pass validation');

const cyclic: CadDocument = { ...document, blocks: document.blocks.map((block) => block.id === 'door' ? { ...block, entities: [...block.entities, { id: 'cycle', type: 'insert', block: 'assembly', insertion: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, layer: '0' }] } : block) };
assert.ok(analyzeCadBlocks(cyclic).some((item) => item.code === 'block_cycle'), 'cycle detection traverses nested definitions');
assert.throws(() => redefineCadBlock(document, 'door', cyclic.blocks[0].entities), /Cycle/, 'redefine rejects a new cycle');

document = redefineCadBlock(document, 'door', [line('replacement', 10, 20, 50, 20)]);
assert.equal(document.blocks.find((block) => block.id === 'door')?.version, 2, 'redefine increments version');
const redefined = resolveCadInsert(document, 'door-2').entities.find((entity) => entity.type === 'line');
assert.ok(redefined?.type === 'line' && Math.abs(redefined.end.y - 130) < 1e-8, 'existing instance reads live redefined geometry');

const target: CadBlockDefinition = { id: 'window', name: 'WINDOW', basePoint: { x: 0, y: 0, z: 0 }, entities: [line('window-line', 0, 0, 5, 0)], attributes: { CODE: { defaultValue: 'W' } }, version: 1 };
document = { ...document, blocks: [...document.blocks, target] };
document = replaceCadBlock(document, 'door', 'window', { CODE: 'MARK' });
assert.ok(document.entities.filter((entity) => entity.type === 'insert' && entity.block === 'window').length >= 2, 'replace retargets every source instance');
assert.ok(document.entities.some((entity) => entity.type === 'insert' && entity.attributes?.CODE === 'D-02'), 'replace maps per-instance attributes');

const toExplode = document.entities.find((entity) => entity.type === 'insert' && entity.id === 'door-2');
assert.ok(toExplode);
document = explodeCadInsert(document, 'door-2');
assert.ok(!document.entities.some((entity) => entity.id === 'door-2'), 'explode removes the INSERT');
assert.ok(document.entities.some((entity) => entity.id.startsWith('door-2:root')), 'explode creates independently editable geometry');

assert.deepEqual(searchCadBlocks(document.blocks, 'steel door').map((block) => block.id), ['door'], 'search covers description and keywords');
assert.ok(buildCadBlockThumbnail(document.blocks.find((block) => block.id === 'door')!).includes('<path'), 'thumbnail is deterministic SVG geometry');
const batches = buildCadInsertBatches(document);
assert.ok(batches.every((batch) => batch.insertIds.length > 0 && batch.matrices.length === batch.insertIds.length), 'batch plan groups instance matrices');

const purge = purgeUnusedCadBlocks({ ...document, blocks: [...document.blocks, { id: 'unused', name: 'UNUSED', basePoint: { x: 0, y: 0, z: 0 }, entities: [line('u', 0, 0, 1, 0)] }] });
assert.ok(purge.purged.includes('unused'), 'purge removes unreachable definitions');
assert.ok(purge.document.blocks.some((block) => block.id === 'window'), 'purge preserves blocks referenced by live inserts');

console.log('cad professional block specs passed');
