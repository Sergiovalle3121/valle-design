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
  // Los puntos de definición de una cota son 2D en el esquema. Los anclajes
  // salen de geometría 3D (`line.start` lleva `z`), y copiarlos tal cual le
  // añadía una `z` a la cota en la primera regeneración: la misma cota se
  // serializaba distinto según si había pasado por aquí. El adaptador ya la
  // descartaba al transformar; la regeneración hace ahora lo mismo.
  assert.deepEqual(next.a, { x: 10, y: 20 });
  assert.deepEqual(next.b, { x: 210, y: 20 });
}
const broken = regenerateAssociativeDimensions([associated], ['line']);
assert.deepEqual(broken.brokenIds, ['associated']);
assert.equal(broken.entities[0].type === 'dimension' ? broken.entities[0].associationStatus : null, 'broken');

// --- muro: los anclajes start/end resuelven a los extremos del eje -----------
const wall: CadEntity = {
  id: 'wall-1',
  type: 'wall',
  start: { x: 0, y: 0, z: 0 },
  end: { x: 5000, y: 0, z: 0 },
  thickness: 200,
  height: 3000,
  layer: 'MUROS',
};
const wallDim = dimension('aligned', {
  id: 'wall-dim',
  associative: true,
  references: [
    { entityId: 'wall-1', anchor: 'start' },
    { entityId: 'wall-1', anchor: 'end' },
  ],
  associationStatus: 'associated',
});
const wallRegen = regenerateAssociativeDimensions([wall, wallDim], ['wall-1']);
assert.deepEqual(wallRegen.regeneratedIds, ['wall-dim']);
const wallNext = wallRegen.entities.find((entity) => entity.id === 'wall-dim');
assert.equal(wallNext?.type === 'dimension' ? wallNext.associationStatus : null, 'associated');
if (wallNext?.type === 'dimension') {
  assert.deepEqual(wallNext.a, { x: 0, y: 0 });
  assert.deepEqual(wallNext.b, { x: 5000, y: 0 });
  // La medida coincide con la longitud del eje del muro.
  const geom = buildCadDimensionGeometry(wallNext);
  assert.ok(Math.abs((geom?.measurement ?? 0) - 5000) < 1e-6, `medida=${geom?.measurement}`);
}

// --- polilínea: extremos como anclajes start/end ---------------------------
const poly: CadEntity = {
  id: 'poly-1',
  type: 'polyline',
  vertices: [
    { x: 0, y: 0, z: 0 },
    { x: 100, y: 0, z: 0 },
    { x: 100, y: 200, z: 0 },
    { x: 0, y: 200, z: 0 },
  ],
  closed: true,
  layer: '0',
};
const polyDim = dimension('aligned', {
  id: 'poly-dim',
  associative: true,
  references: [
    { entityId: 'poly-1', anchor: 'start' },
    { entityId: 'poly-1', anchor: 'end' },
  ],
  associationStatus: 'associated',
});
const polyRegen = regenerateAssociativeDimensions([poly, polyDim], ['poly-1']);
assert.deepEqual(polyRegen.regeneratedIds, ['poly-dim']);
const polyNext = polyRegen.entities.find((entity) => entity.id === 'poly-dim');
if (polyNext?.type === 'dimension') {
  assert.equal(polyNext.associationStatus, 'associated');
  assert.deepEqual(polyNext.a, { x: 0, y: 0 });
  assert.deepEqual(polyNext.b, { x: 0, y: 200 });
}

console.log("associative-dimension: la cota sigue a su geometría y se marca broken al perderla; el muro ofrece sus extremos como anclajes; la polilínea también");
