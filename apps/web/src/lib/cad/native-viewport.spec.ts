import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  cadViewportBoundsChanged,
  cadViewportBoundsFromCamera,
} from './native-viewport';

const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
camera.position.set(0, 20, 0);
camera.up.set(0, 0, -1);
camera.lookAt(0, 0, 0);
camera.updateProjectionMatrix();

const bounds = cadViewportBoundsFromCamera(
  camera,
  { scale: 1, width: 100, height: 80 },
  0,
);
assert.ok(bounds);
assert.deepEqual(
  Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, Math.round(value)])),
  { minX: 40, minY: 30, maxX: 60, maxY: 50 },
);
assert.equal(cadViewportBoundsChanged(null, bounds), true);
assert.equal(cadViewportBoundsChanged(bounds, { ...bounds, minX: bounds.minX + 0.1 }), false);
assert.equal(cadViewportBoundsChanged(bounds, { ...bounds, minX: bounds.minX + 2 }), true);
assert.equal(cadViewportBoundsFromCamera(camera, { scale: 0, width: 1, height: 1 }), null);

console.log('CAD viewport projection: 5 passed');
