import assert from 'node:assert/strict';
import {
  cadMTextMeasurementCacheSize,
  clearCadMTextMeasurementCache,
  layoutCadMText,
  measureCadMText,
  type CadMTextEntity,
} from './mtext-layout';

const base: CadMTextEntity = {
  id: 'note',
  type: 'mtext',
  insertion: { x: 100, y: 200, z: 0 },
  text: 'Primera línea con palabras\nSegunda línea',
  width: 420,
  height: 40,
  lineSpacing: 1.25,
  alignment: 'top-left',
  paragraphAlignment: 'left',
  layer: 'TEXT',
};

clearCadMTextMeasurementCache();
const layout = layoutCadMText(base);
assert.ok(layout.lines.length >= 3, 'wrap y salto explícito producen varias líneas');
assert.equal(layout.lineHeight, 50);
assert.deepEqual(layout.corners[0], { x: 100, y: 200 });
assert.ok(layout.bounds.maxX > layout.bounds.minX);

const centered = layoutCadMText({ ...base, alignment: 'middle-center', paragraphAlignment: 'center' });
assert.ok(centered.corners[0].x < base.insertion.x);
assert.ok(centered.corners[0].y > base.insertion.y);
assert.ok(centered.lines.every((line) => line.x >= centered.corners[0].x - base.insertion.x));

const rotated = layoutCadMText({ ...base, rotation: 90 });
assert.ok(Math.abs((rotated.bounds.maxY - rotated.bounds.minY) - layout.width) < 1e-6);

const columns = layoutCadMText({ ...base, text: 'uno dos tres cuatro cinco seis siete ocho nueve diez', columns: 2 });
assert.equal(new Set(columns.lines.map((line) => line.column)).size, 2);

const justified = layoutCadMText({ ...base, paragraphAlignment: 'justify' });
assert.ok(justified.lines.some((line) => line.justify && line.width === justified.columnWidth));

const cacheBefore = cadMTextMeasurementCacheSize();
const first = measureCadMText('cache', 40, { fontFamily: 'Arial', bold: true });
const cacheAfterFirst = cadMTextMeasurementCacheSize();
const second = measureCadMText('cache', 40, { fontFamily: 'Arial', bold: true });
assert.equal(first, second);
assert.equal(cacheAfterFirst, cacheBefore + 1);
assert.equal(cadMTextMeasurementCacheSize(), cacheAfterFirst);
