import assert from 'node:assert/strict';
import { layoutToCadDocument, type CadDocument, type CadEntity } from './cad-document';
import { defineCadBlock, insertCadBlock, resolveCadInsert } from './professional-blocks';
import {
  applyCadBlockEditCommands,
  beginCadBlockEditSession,
  saveCadBlockEditSession,
} from './block-edit-session';

const line = (id: string, x1: number, y1: number, x2: number, y2: number, layer = '0'): CadEntity => ({
  id, type: 'line', start: { x: x1, y: y1, z: 0 }, end: { x: x2, y: y2, z: 0 }, layer,
  context: { presentation: { color: { source: 'byBlock' } } },
});
const lineY = (entity: CadEntity | undefined) => {
  assert.ok(entity?.type === 'line');
  return entity.start.y;
};
const empty = (): CadDocument => layoutToCadDocument({ layers: [{ id: 'E', name: 'Equipment', color: '#00ffff', visible: true, locked: false }] });

let document = empty();
document = { ...document, entities: [line('source-a', 10, 20, 30, 20, 'E'), line('source-b', 10, 30, 30, 30, 'E')], modelSpace: { entityIds: ['source-a', 'source-b'] } };
document = defineCadBlock(document, { id: 'door', name: 'DOOR', entityIds: ['source-a', 'source-b'], basePoint: { x: 10, y: 20, z: 0 } });
document = insertCadBlock(document, { id: 'door-2', block: 'DOOR', insertion: { x: 100, y: 50, z: 0 } });

// `defineCadBlock` remaps ids deterministically to `${blockId}:entity:${index}`.
const ENTITY_A = 'door:entity:0';
const ENTITY_B = 'door:entity:1';

assert.throws(() => beginCadBlockEditSession(document, 'missing'), /was not found/, 'unknown block key is rejected');

const emptyBlockDoc: CadDocument = {
  ...document,
  blocks: [...document.blocks, { id: 'ghost', name: 'GHOST', basePoint: { x: 0, y: 0, z: 0 }, entities: [] }],
};
assert.throws(() => beginCadBlockEditSession(emptyBlockDoc, 'GHOST'), /no entities to edit/, 'empty block definition is rejected');

// --- begin: the scratch document is built from the block, sharing shared tables ---
const outerBlocksRef = document.blocks;
const outerDoorEntitiesRef = document.blocks.find((block) => block.id === 'door')!.entities;
const session = beginCadBlockEditSession(document, 'DOOR');
assert.equal(session.blockId, 'door');
assert.equal(session.blockName, 'DOOR');
assert.deepEqual(session.history.value().entities.map((entity) => entity.id).sort(), [ENTITY_A, ENTITY_B]);
assert.equal(session.history.value().layers, document.layers, 'scratch document shares the real layer table by reference');
assert.equal(session.history.value().styles, document.styles, 'scratch document shares the real style table by reference');
assert.equal(session.history.value().constraints.length, 0, 'v1 scratch documents carry no constraints');

// also resolvable by name
assert.equal(beginCadBlockEditSession(document, 'door').blockId, 'door');

// --- apply: the SAME command executor the real editor uses, session-scoped undo ---
const applied = applyCadBlockEditCommands(
  session,
  [{ type: 'transform', entityId: ENTITY_A, transform: { translation: { x: 0, y: 100 } } }],
  'move',
);
assert.equal(lineY(applied.document.entities.find((entity) => entity.id === ENTITY_A)), 120, 'command result reflects the move');
assert.equal(lineY(session.history.value().entities.find((entity) => entity.id === ENTITY_A)), 120, 'session document reflects the move');
assert.equal(session.history.depths().undo, 1, 'the session keeps its own undo depth');

// --- isolation: the outer document is never touched by a session edit ---
assert.equal(document.blocks, outerBlocksRef, 'the outer document object is untouched by a session edit');
assert.equal(document.blocks.find((block) => block.id === 'door')!.entities, outerDoorEntitiesRef, 'the outer block definition array is untouched by a session edit');
assert.equal(lineY(document.blocks.find((block) => block.id === 'door')!.entities.find((entity) => entity.id === ENTITY_A)), 20, 'outer block geometry did not move');

// --- undo/redo are scoped to the session's own CanonicalHistory instance ---
assert.equal(lineY(session.history.undo().entities.find((entity) => entity.id === ENTITY_A)), 20, 'undo reverts the session document');
assert.equal(lineY(session.history.redo().entities.find((entity) => entity.id === ENTITY_A)), 120, 'redo restores the session document');

assert.throws(() => applyCadBlockEditCommands(session, [], 'noop'), /needs at least one command/, 'an empty command batch is rejected');

// --- save: the only write to the real document, exactly once, via redefineCadBlock ---
const beforeSave = document;
document = saveCadBlockEditSession(document, session);
assert.notEqual(document, beforeSave, 'save returns a new document; the input document object is untouched');
const savedBlock = document.blocks.find((block) => block.id === 'door')!;
assert.equal(savedBlock.version, 2, 'save goes through redefineCadBlock and bumps the block version');
const savedYs = savedBlock.entities.map((entity) => lineY(entity)).sort((a, b) => a - b);
assert.deepEqual(savedYs, [30, 120], 'saved block geometry reflects the edit made inside the session');
const resolvedAfterSave = resolveCadInsert(document, 'door-2').entities.filter((entity) => entity.type === 'line');
assert.equal(resolvedAfterSave.length, 2, 'the live INSERT regenerates from the session-edited definition');

// --- save propagates redefineCadBlock's "cannot be empty" guard, uncaught ---
document = { ...document, entities: [...document.entities, line('solo', 0, 0, 1, 1)], modelSpace: { entityIds: [...document.modelSpace.entityIds, 'solo'] } };
document = defineCadBlock(document, { id: 'solo-block', name: 'SOLO', entityIds: ['solo'], basePoint: { x: 0, y: 0, z: 0 } });
const soloSession = beginCadBlockEditSession(document, 'SOLO');
const soloEntityId = soloSession.history.value().entities[0].id;
applyCadBlockEditCommands(soloSession, [{ type: 'delete', entityId: soloEntityId }], 'delete');
assert.equal(soloSession.history.value().entities.length, 0, 'a session document can legitimately go empty mid-edit');
assert.throws(
  () => saveCadBlockEditSession(document, soloSession),
  /cannot be empty/,
  'save propagates the empty-block guard uncaught, so the caller (commitBlockMutation) can surface it',
);

console.log('block-edit-session.spec.ts OK');
