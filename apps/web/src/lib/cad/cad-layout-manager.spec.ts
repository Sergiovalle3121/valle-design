import assert from 'node:assert/strict';
import type { CadPaperSpace } from './cad-document';
import {
  createCadPaperViewport,
  deleteCadPaperViewport,
  duplicateCadPaperViewport,
  normalizeCadViewportPaperBounds,
  preflightCadPaperSpace,
  setCadViewportLayerOverride,
  setCadViewportLayerVisibility,
  updateCadPaperViewport,
} from './cad-layout-manager';

const space: CadPaperSpace = {
  id: 'sheet', name: 'Sheet', entityIds: [], includeInPublish: true,
  page: { width: 420, height: 297, unit: 'mm', orientation: 'landscape' },
  pageSetup: { paper: 'A3', margins: { top: 10, right: 10, bottom: 10, left: 10 }, colorMode: 'color', lineweightScale: 1 },
  viewports: [], titleBlock: { attributes: {} },
};
const first = createCadPaperViewport({ space, id: 'vp-1', modelBounds: { x: 0, y: 0, width: 10_000, height: 6_000 }, unit: 'mm' });
assert.ok(first.scale >= 25);
assert.equal(first.annotationScale, first.scale);
let edited: CadPaperSpace = { ...space, viewports: [first] };
edited = duplicateCadPaperViewport(edited, first.id, 'vp-2');
assert.equal(edited.viewports?.length, 2);
assert.notEqual(edited.viewports?.[1].id, first.id);
edited = updateCadPaperViewport(edited, 'vp-2', (viewport) => ({ ...viewport, paperBounds: { x: -100, y: -100, width: 999, height: 999 } }));
assert.deepEqual(edited.viewports?.[1].paperBounds, normalizeCadViewportPaperBounds(edited, { x: -100, y: -100, width: 999, height: 999 }));
edited = setCadViewportLayerVisibility(edited, 'vp-1', 'A', false);
edited = setCadViewportLayerOverride(edited, 'vp-1', 'B', { color: '#ff0000', lineweight: 0.5 });
assert.equal(edited.viewports?.[0].layerVisibility?.A, false);
assert.deepEqual(edited.viewports?.[0].layerOverrides?.B, { color: '#ff0000', lineweight: 0.5 });
const issues = preflightCadPaperSpace(edited, ['A']);
assert.ok(issues.some((issue) => issue.code === 'viewport_overlap'));
assert.ok(issues.some((issue) => issue.code === 'viewport_unlocked'));
edited = deleteCadPaperViewport(edited, 'vp-2');
assert.equal(edited.viewports?.length, 1);
assert.equal(preflightCadPaperSpace({ ...edited, viewports: [] })[0].code, 'no_viewports');

console.log('cad layout manager specs passed');
