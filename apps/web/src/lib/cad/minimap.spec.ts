/** Pure plant-minimap coordinate maths tests. */
import { strict as assert } from 'node:assert';
import {
  minimapScale,
  targetToWorld,
  worldToTarget,
  clampToFootprint,
  boxToMini,
  MINI_MAX_W,
  MINI_MAX_H,
} from './minimap';

// --- scale fits the footprint inside the mini box, preserving aspect ---
const sc = minimapScale(200000, 150000); // a 200×150 m plant in mm
assert.ok(200000 * sc <= MINI_MAX_W + 1e-6, 'width fits');
assert.ok(150000 * sc <= MINI_MAX_H + 1e-6, 'height fits');
assert.ok(Math.abs(200000 * sc - MINI_MAX_W) < 1e-6 || Math.abs(150000 * sc - MINI_MAX_H) < 1e-6, 'touches one edge');
assert.equal(minimapScale(0, 0) > 0, true, 'degenerate footprint is safe');

// --- target<->world round-trip (scene scale s, footprint W×H) ---
const s = 30 / 200000; // editor scale for a 200 m plant
const W = 200000, H = 150000;
for (const [wx, wy] of [[0, 0], [W / 2, H / 2], [W, H], [12500, 8000]]) {
  const t = worldToTarget(wx, wy, s, W, H);
  const back = targetToWorld(t.x, t.z, s, W, H);
  assert.ok(Math.abs(back.x - wx) < 1e-6 && Math.abs(back.y - wy) < 1e-6, `round-trips at ${wx},${wy}`);
}
// centre of plant maps to the scene origin (where OrbitControls starts)
const centre = worldToTarget(W / 2, H / 2, s, W, H);
assert.ok(Math.abs(centre.x) < 1e-9 && Math.abs(centre.z) < 1e-9, 'plant centre is scene origin');
// s === 0 is handled
assert.deepEqual(targetToWorld(5, 5, 0, W, H), { x: W / 2, y: H / 2 }, 's=0 falls back to centre');

// --- clamping keeps navigation inside the plant ---
assert.deepEqual(clampToFootprint(-50, 999999, W, H), { x: 0, y: H }, 'clamps both axes');
assert.deepEqual(clampToFootprint(100, 200, W, H), { x: 100, y: 200 }, 'in-range stays');

// --- box scaling floors tiny boxes to 1px so they never vanish ---
const tiny = boxToMini({ x: 1000, y: 2000, w: 1, h: 1 }, sc);
assert.ok(tiny.w >= 1 && tiny.h >= 1, 'tiny box stays visible');
assert.ok(Math.abs(tiny.x - 1000 * sc) < 1e-9, 'box x scaled');

console.log('cad minimap specs passed');
