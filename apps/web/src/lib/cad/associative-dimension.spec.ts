import assert from 'node:assert/strict';
import type { CadEntity } from './cad-document';
import { buildCadDimensionGeometry, formatCadDimensionMeasurement, regenerateAssociativeDimensions, type CadDimensionEntity } from './associative-dimension';

const dimension = (kind: NonNullable<CadDimensionEntity['dimensionKind']>, patch: Partial<CadDimensionEntity> = {}): CadDimensionEntity => ({
  id: `dim-${kind}`,
  type: 'dimension',
  dimensionKind: kind,
  a: { x: 0, y: 0 },
  b: { x: 100, y: 0 },
  c: { x: 0, y: 100 },
  offset: 30,
  layer: 'DIMENSIONS',
  precision: 2,
  sourceUnit: 'mm',
  units: 'mm',
  ...patch,
});

assert.equal(buildCadDimensionGeometry(dimension('aligned'))?.measurement, 100);
assert.equal(buildCadDimensionGeometry(dimension('linear', { a: { x: 0, y: 20 }, b: { x: 100, y: 50 }, axis: 'x' }))?.measurement, 100);
assert.equal(buildCadDimensionGeometry(dimension('angular'))?.measurement, 90);
assert.equal(buildCadDimensionGeometry(dimension('radius', { radius: 100 }))?.measurement, 100);
assert.equal(buildCadDimensionGeometry(dimension('diameter', { radius: 100 }))?.measurement, 200);
assert.equal(buildCadDimensionGeometry(dimension('ordinate', { b: { x: 125, y: 40 }, axis: 'x' }))?.measurement, 125);
assert.ok(Math.abs((buildCadDimensionGeometry(dimension('arc-length', { radius: 50 }))?.measurement ?? 0) - Math.PI * 50 / 2) < 1e-9);

assert.equal(formatCadDimensionMeasurement(dimension('aligned', { units: 'in', alternateUnits: 'mm', prefix: '~', suffix: ' typ' }), 25.4), '~1.00 in typ [25.40 mm]');
assert.equal(formatCadDimensionMeasurement(dimension('angular', { precision: 1 }), 90), '90.0°');
assert.equal(formatCadDimensionMeasurement(dimension('aligned', { text: 'EQ' }), 100), 'EQ');
assert.ok(buildCadDimensionGeometry(dimension('aligned', { arrowhead: 'open', extensionLines: false }))!.paths.every((path) => path.role !== 'extension'));

const line: CadEntity = { id: 'line', type: 'line', start: { x: 10, y: 20, z: 0 }, end: { x: 210, y: 20, z: 0 }, layer: '0' };
const associated = dimension('aligned', {
  id: 'associated',
  associative: true,
  references: [
    { entityId: 'line', anchor: 'start' },
    { entityId: 'line', anchor: 'end' },
  ],
  associationStatus: 'associated',
});
const regenerated = regenerateAssociativeDimensions([line, associated], ['line']);
assert.deepEqual(regenerated.regeneratedIds, ['associated']);
const next = regenerated.entities.find((entity) => entity.id === 'associated');
assert.equal(next?.type, 'dimension');
if (next?.type === 'dimension') {
  assert.deepEqual(next.a, { x: 10, y: 20, z: 0 });
  assert.deepEqual(next.b, { x: 210, y: 20, z: 0 });
}
const broken = regenerateAssociativeDimensions([associated], ['line']);
assert.deepEqual(broken.brokenIds, ['associated']);
assert.equal(broken.entities[0].type === 'dimension' ? broken.entities[0].associationStatus : null, 'broken');

console.log("associative-dimension: la cota sigue a su geometría y se marca broken al perderla");
