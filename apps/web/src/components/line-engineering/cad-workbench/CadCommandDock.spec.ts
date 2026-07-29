import { strict as assert } from 'node:assert';
import { describeCadPreviewOperation } from './CadCommandDock';

assert.equal(
  describeCadPreviewOperation({
    type: 'move',
    objectId: 'rack-7',
    before: { id: 'rack-7', type: 'asset', label: 'Rack 7', x: 0, y: 0, w: 1, h: 1 },
    after: { id: 'rack-7', type: 'asset', label: 'Rack 7', x: 25.6, y: 14.4, w: 1, h: 1 },
  }),
  'Mover rack-7 → (26, 14)',
);

assert.equal(
  describeCadPreviewOperation({ type: 'studio_export', format: 'dxf' }),
  'Exportar DXF',
);

assert.equal(
  describeCadPreviewOperation({ type: 'clear_annotations', kind: 'all' }),
  'Quitar anotaciones',
);

assert.equal(
  describeCadPreviewOperation({ type: 'report', title: 'Auditoría', rows: [] }),
  'Auditoría',
);

console.log('CadCommandDock operation descriptions: 4 passed');
