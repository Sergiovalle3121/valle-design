import assert from 'node:assert/strict';
import type { CadDocument } from './cad-document';
import { buildCadPublishPlan, createCadPaperSpace } from './paper-space';
import { cadDocumentDxfBlocks, cadDocumentDxfInserts } from './dxf-cad-document';
import {
  analyzeCadXrefGraph,
  attachCadXref,
  bindCadXref,
  cadTenantLayoutUri,
  compareCadXrefVersion,
  detachCadXref,
  hashCadXrefDocument,
  isCadTenantAssetUri,
  reloadCadXref,
  unloadCadXref,
  type CadXrefAssetSnapshot,
} from './cad-xrefs';

function document(lineEnd = 100): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [{ id: 'line', type: 'line', start: { x: 0, y: 0, z: 0 }, end: { x: lineEnd, y: 0, z: 0 }, layer: '0' }],
    history: [], modelSpace: { entityIds: ['line'] }, paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
  };
}

async function snapshot(assetId: string, version: number, lineEnd = 100): Promise<CadXrefAssetSnapshot> {
  const source = document(lineEnd);
  return {
    tenantId: 'tenant-a', assetId, name: assetId, revision: `R${version}`, version,
    document: source, contentHash: await hashCadXrefDocument(source), fetchedAt: new Date(version * 1_000).toISOString(),
  };
}

async function main() {
  assert.equal(cadTenantLayoutUri('PLANT A', 'R1'), 'tenant-layout://PLANT%20A/R1');
  assert.equal(isCadTenantAssetUri('C:\\local\\drawing.dwg'), false);
  assert.equal(isCadTenantAssetUri(cadTenantLayoutUri('PLANT A', 'R1')), true);

  const first = await snapshot('PLANT-A', 1);
  let host = attachCadXref(document(), { id: 'ref-a', snapshot: first, hostAssetId: 'HOST', insertion: { x: 20, y: 30 }, scale: 2 });
  assert.equal(host.externalReferences[0].status, 'loaded');
  assert.match(host.externalReferences[0].contentHash ?? '', /^[0-9a-f]{64}$/);
  assert.equal(host.entities.filter((entity) => entity.type === 'insert').length, 1);
  assert.ok(host.blocks.some((block) => block.id === host.externalReferences[0].blockId));
  assert.equal(analyzeCadXrefGraph(host, 'HOST').issues.length, 0);
  host = { ...host, paperSpaces: [createCadPaperSpace({ id: 'sheet', name: 'Sheet', order: 0, modelBounds: { x: 0, y: 0, width: 500, height: 500 }, metadata: { project: 'Xref', drawingNumber: 'X-1', title: 'Xref', sheetNumber: '1', revision: 'A', discipline: 'CAD' } })] };
  const publish = buildCadPublishPlan(host);
  assert.ok(publish.sheets[0].viewports[0].commands.some((command) => command.entityId.includes('xref:ref-a')));
  assert.ok(cadDocumentDxfBlocks(host).some((block) => block.name.includes('XREF|')));
  assert.ok(cadDocumentDxfInserts(host).some((insert) => insert.block.includes('XREF|')));

  host = unloadCadXref(host, 'ref-a');
  assert.equal(host.externalReferences[0].status, 'unloaded');
  assert.equal(host.entities.some((entity) => entity.id === host.externalReferences[0].insertId), false);
  assert.ok(buildCadPublishPlan(host).warnings.some((warning) => warning.code === 'xref_unloaded'));

  const changed = await snapshot('PLANT-A', 2, 240);
  const comparison = compareCadXrefVersion(host, 'ref-a', changed);
  assert.equal(comparison.changed, true);
  assert.equal(comparison.modified.length, 1);
  host = reloadCadXref(host, 'ref-a', changed, 'HOST');
  assert.equal(host.externalReferences[0].sourceVersion, 2);
  assert.equal(host.externalReferences[0].loaded, true);

  const bound = bindCadXref(host, 'ref-a');
  assert.equal(bound.externalReferences.length, 0);
  assert.equal(bound.entities.some((entity) => entity.type === 'line' && entity.id.includes('xref:ref-a')), true);
  assert.equal(bound.entities.some((entity) => entity.type === 'insert' && entity.id.includes('xref:ref-a')), false);

  const attachedAgain = attachCadXref(document(), { id: 'ref-b', snapshot: changed });
  const detached = detachCadXref(attachedAgain, 'ref-b');
  assert.equal(detached.externalReferences.length, 0);
  assert.equal(detached.blocks.some((block) => block.id.startsWith('xref:ref-b:')), false);

  const cyclic = analyzeCadXrefGraph({ externalReferences: [{
    id: 'cycle', name: 'Cycle', uri: cadTenantLayoutUri('A', 'R1'), loaded: false,
    assetId: 'A', mode: 'attachment', dependencyAssetIds: ['HOST'],
  }] }, 'HOST');
  assert.ok(cyclic.issues.some((issue) => issue.code === 'cycle'));
  const tooDeep = analyzeCadXrefGraph({ externalReferences: [{
    id: 'deep', name: 'Deep', uri: cadTenantLayoutUri('A', 'R1'), loaded: false,
    assetId: 'A', mode: 'attachment', dependencyAssetIds: ['B'],
    dependencyEdges: [{ from: 'B', to: 'C', mode: 'attachment' }],
  }] }, 'HOST', 1);
  assert.ok(tooDeep.issues.some((issue) => issue.code === 'depth_exceeded'));
  assert.throws(() => attachCadXref(document(), {
    id: 'cycle-ref', hostAssetId: 'HOST',
    snapshot: { ...first, document: { ...first.document, externalReferences: [{ id: 'back', name: 'Back', uri: cadTenantLayoutUri('HOST', 'R1'), loaded: false, assetId: 'HOST', mode: 'attachment' }] } },
  }), /cycle/i);

  const nested = document();
  nested.blocks = [{ id: 'nested-block', name: 'Nested', basePoint: { x: 0, y: 0, z: 0 }, entities: [{ id: 'nested-line', type: 'line', start: { x: 0, y: 0, z: 0 }, end: { x: 20, y: 0, z: 0 }, layer: '0' }] }];
  nested.entities.push({ id: 'nested-insert', type: 'insert', block: 'nested-block', insertion: { x: 10, y: 10, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, layer: '0' });
  nested.modelSpace.entityIds.push('nested-insert');
  nested.externalReferences.push({ id: 'child-ref', name: 'Child', uri: cadTenantLayoutUri('CHILD', 'R1'), loaded: true, mode: 'attachment', assetId: 'CHILD', insertId: 'nested-insert' });
  const nestedSnapshot: CadXrefAssetSnapshot = { ...first, assetId: 'PARENT', name: 'Parent', document: nested, contentHash: await hashCadXrefDocument(nested) };
  const overlay = attachCadXref(document(), { id: 'overlay', snapshot: nestedSnapshot, mode: 'overlay' });
  const attachment = attachCadXref(document(), { id: 'attachment', snapshot: nestedSnapshot, mode: 'attachment' });
  assert.equal(overlay.blocks.find((block) => block.id === overlay.externalReferences[0].blockId)?.entities.some((entity) => entity.type === 'insert'), false);
  assert.equal(overlay.externalReferences[0].dependencyAssetIds?.length, 0);
  assert.equal(attachment.blocks.find((block) => block.id === attachment.externalReferences[0].blockId)?.entities.some((entity) => entity.type === 'insert'), true);
  assert.deepEqual(attachment.externalReferences[0].dependencyAssetIds, ['CHILD']);

  console.log('cad xref specs passed');
}

void main();
