import assert from 'node:assert/strict';
import {
  defaultCadDynamicValues,
  parseCadDynamicScalar,
  resolveCadDynamicInput,
} from './dynamic-input';

assert.equal(parseCadDynamicScalar('1,5m', 'mm', 'es-MX'), 1_500);
assert.equal(parseCadDynamicScalar('2ft', 'mm'), 609.6);
assert.equal(parseCadDynamicScalar('25.4mm', 'm'), 0.0254);
assert.equal(parseCadDynamicScalar('45°', 'mm', 'es-MX', 'angle'), 45);
assert.equal(parseCadDynamicScalar('4m', 'mm', 'es-MX', 'angle'), null);

assert.deepEqual(resolveCadDynamicInput({ x: '10', y: '20' }, {
  mode: 'absolute', documentUnit: 'mm',
}), { ok: true, mode: 'absolute', point: { x: 10, y: 20 }, previewLabel: '10, 20' });
assert.deepEqual(resolveCadDynamicInput({ x: '5', y: '-3' }, {
  mode: 'relative', documentUnit: 'mm', anchor: { x: 10, y: 10 },
}), { ok: true, mode: 'relative', point: { x: 15, y: 7 }, previewLabel: '@5, -3' });

const polar = resolveCadDynamicInput({ distance: '10', angle: '90' }, {
  mode: 'polar', documentUnit: 'mm', anchor: { x: 5, y: 5 },
});
assert.ok(polar.ok && 'point' in polar && Math.abs(polar.point.x - 5) < 1e-9 && Math.abs(polar.point.y - 15) < 1e-9);
assert.deepEqual(resolveCadDynamicInput({ diameter: '20' }, {
  mode: 'diameter', documentUnit: 'mm',
}), { ok: true, mode: 'diameter', scalar: 10, previewLabel: 'Ø 20' });
assert.equal(resolveCadDynamicInput({ x: '1', y: '2' }, {
  mode: 'relative', documentUnit: 'mm',
}).ok, false);

const defaults = defaultCadDynamicValues({ x: 0, y: 0 }, { x: 3, y: 4 });
assert.equal(defaults.distance, 5);
assert.equal(defaults.diameter, 10);

console.log("dynamic-input: campos, validación y valores por defecto de la entrada dinámica");
