import assert from 'node:assert/strict';
import {
  apparentIntersection,
  nearestOnExtension,
  snap,
  type SnapScene,
} from './snap-engine';

const apparent = apparentIntersection(
  { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } },
  { a: { x: 3, y: -2 }, b: { x: 3, y: -1 } },
);
assert.deepEqual(apparent, { x: 3, y: 0 });
assert.deepEqual(
  nearestOnExtension({ x: 15, y: 2 }, { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }),
  { x: 15, y: 0 },
);

const semantics: SnapScene = {
  quadrants: [{ x: 10, y: 0 }],
  tangents: [{ x: 8, y: 6 }],
  insertions: [{ x: 4, y: 4 }],
  geometricCenters: [{ x: 5, y: 5 }],
};
assert.equal(snap({ x: 10.2, y: 0 }, semantics, { tolerance: 1 })?.type, 'quadrant');
assert.equal(snap({ x: 8.1, y: 6 }, semantics, { tolerance: 1 })?.type, 'tangent');
assert.equal(snap({ x: 4.1, y: 4 }, semantics, { tolerance: 1 })?.type, 'insertion');
assert.equal(snap({ x: 5.1, y: 5 }, semantics, { tolerance: 1 })?.type, 'geometric-center');

const derived: SnapScene = {
  segments: [
    { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } },
    { a: { x: 3, y: -2 }, b: { x: 3, y: -1 } },
  ],
};
const derivedHit = snap({ x: 3.1, y: 0.1 }, derived, {
  tolerance: 0.5,
  modes: { nearest: false, midpoint: false, extension: false },
});
assert.equal(derivedHit?.type, 'apparent-intersection');
assert.deepEqual(derivedHit?.point, { x: 3, y: 0 });
assert.ok(Math.abs((derivedHit?.distance ?? 0) - Math.hypot(0.1, 0.1)) < 1e-12);

console.log("professional-snapping: referencias a objeto derivadas (intersección aparente incluida)");
