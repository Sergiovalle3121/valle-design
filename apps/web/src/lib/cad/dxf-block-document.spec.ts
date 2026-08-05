import assert from 'node:assert/strict';
import { layoutToCadDocument, type CadBlockDefinition, type CadDocument } from './cad-document';
import { cadDocumentDxfBlocks, cadDocumentDxfInserts, cadDxfBlocksToCadDocumentParts } from './dxf-cad-document';
import { exportCadDxf } from './dxf-export';
import { importDxfPrimitives } from './dxf-import';
import { analyzeCadBlocks, resolveCadInsert } from './professional-blocks';

const door: CadBlockDefinition = {
  id: 'door', name: 'DOOR', basePoint: { x: 10, y: 20, z: 0 }, version: 4,
  description: 'Tenant steel door', keywords: ['door', 'steel'],
  library: { scope: 'tenant', tenantId: 'tenant-a' },
  businessLink: { entityType: 'assetType', entityId: 'door-std' },
  attributes: { MARK: { required: true, defaultValue: 'D-01', prompt: 'Door mark', position: { x: 10, y: 22, z: 0 }, height: 2 } },
  entities: [{ id: 'door-line', type: 'line', start: { x: 10, y: 20, z: 0 }, end: { x: 30, y: 20, z: 0 }, layer: '0' }],
};
const assembly: CadBlockDefinition = {
  id: 'assembly', name: 'ASSEMBLY', basePoint: { x: 0, y: 0, z: 0 }, version: 2,
  entities: [{ id: 'nested', type: 'insert', block: 'door', insertion: { x: 10, y: 20, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, layer: '0', attributes: { MARK: 'NESTED' } }],
};
const base = layoutToCadDocument({ layers: [{ id: 'E', name: 'Equipment', color: '#00ffff', visible: true, locked: false }] });
const document: CadDocument = {
  ...base, blocks: [door, assembly],
  entities: [{ id: 'assembly-1', type: 'insert', block: 'assembly', insertion: { x: 100, y: 200, z: 0 }, scale: { x: 2, y: 2, z: 1 }, rotation: 90, layer: 'E' }],
  modelSpace: { entityIds: ['assembly-1'] },
};

const exported = exportCadDxf({ blocks: cadDocumentDxfBlocks(document), inserts: cadDocumentDxfInserts(document) });
assert.match(exported.content, /\nBLOCK\n/);
assert.match(exported.content, /\nINSERT\n/);
assert.match(exported.content, /\nATTDEF\n/);
assert.match(exported.content, /\nATTRIB\n/);
assert.match(exported.content, /VALLE_BLOCK/);

const imported = importDxfPrimitives(exported.content);
assert.equal(imported.blocks.length, 2, 'BLOCK definitions remain semantic');
assert.equal(imported.inserts.length, 1, 'top-level INSERT remains live');
assert.equal(imported.blocks.find((block) => block.name === 'DOOR')?.version, 4, 'definition version survives XDATA');
assert.equal(imported.blocks.find((block) => block.name === 'DOOR')?.attributes.MARK.prompt, 'Door mark', 'ATTDEF survives');
assert.equal(imported.blocks.find((block) => block.name === 'ASSEMBLY')?.inserts[0]?.attributes.MARK, 'NESTED', 'nested per-instance ATTRIB survives');
assert.equal(imported.primitiveSources.filter((source) => source === 'insert').length, imported.primitives.length, 'compatibility geometry is explicitly attributed to INSERT');

const parts = cadDxfBlocksToCadDocumentParts(imported.blocks, imported.inserts, { idPrefix: 'roundtrip' });
const roundTrip: CadDocument = { ...base, blocks: parts.blocks, entities: parts.inserts, modelSpace: { entityIds: parts.inserts.map((entity) => entity.id) } };
assert.equal(analyzeCadBlocks(roundTrip).length, 0, 'round-trip definitions remain valid and acyclic');
const resolved = resolveCadInsert(roundTrip, parts.inserts[0]);
assert.equal(resolved.diagnostics.length, 0);
assert.ok(resolved.entities.some((entity) => entity.type === 'line'), 'nested INSERT resolves to editable geometry after round-trip');
assert.ok(resolved.entities.some((entity) => entity.type === 'text' && entity.text === 'NESTED'), 'attribute remains a per-instance value after round-trip');

console.log('cad semantic BLOCK/INSERT DXF specs passed');
