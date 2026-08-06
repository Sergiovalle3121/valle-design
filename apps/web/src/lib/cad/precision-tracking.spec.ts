import assert from 'node:assert/strict';
import {
  acquireCadTrackingPoint,
  cadWorldToleranceFromView,
  resolveCadPolarTracking,
  trackFromAcquiredPoints,
} from './precision-tracking';

const far = cadWorldToleranceFromView({
  cameraDistance: 1_000,
  verticalFovDeg: 50,
  viewportHeightPx: 1_000,
  drawingToSceneScale: 1,
});
const near = cadWorldToleranceFromView({
  cameraDistance: 100,
  verticalFovDeg: 50,
  viewportHeightPx: 1_000,
  drawingToSceneScale: 1,
});
assert.ok(far > near && Math.abs(far / near - 10) < 1e-9, 'aperture follows zoom linearly');
assert.equal(cadWorldToleranceFromView({ cameraDistance: 1e9, verticalFovDeg: 50, viewportHeightPx: 10, drawingToSceneScale: 1, max: 25 }), 25);

let acquired = acquireCadTrackingPoint([], { x: 10, y: 20 }, 0.5);
acquired = acquireCadTrackingPoint(acquired, { x: 10.1, y: 20.1 }, 0.5);
assert.equal(acquired.length, 1, 'near duplicate is coalesced');
acquired = acquireCadTrackingPoint(acquired, { x: 40, y: 50 }, 0.5);
const tracked = trackFromAcquiredPoints({ x: 10.2, y: 49.8 }, acquired, 0.5);
assert.deepEqual(tracked.point, { x: 10, y: 50 });
assert.deepEqual(tracked.guides.map((guide) => guide.axis).sort(), ['x', 'y']);

const polar = resolveCadPolarTracking({ x: 0, y: 0 }, { x: 20, y: 19 }, 45, 5);
assert.equal(polar.snapped, true);
assert.equal(polar.angle, 45);
assert.equal(polar.guide?.axis, 'polar');

console.log("precision-tracking: rastreo polar y ortogonal con sus guías");
