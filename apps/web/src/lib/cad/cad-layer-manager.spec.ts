import assert from 'node:assert/strict';
import {
  createCadDocumentLayer,
  deleteCadDocumentLayer,
  setCadDocumentLayerViewportFreeze,
  updateCadDocumentLayer,
} from './cad-layer-manager';
import type { CadDocument } from './cad-document';

const base: CadDocument = {
  meta: { version: 1, schema: 3, unit: 'mm' },
  layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
  entities: [{ id: 'line', type: 'line', start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: '0' }],
  history: [], modelSpace: { entityIds: ['line'] }, paperSpaces: [], styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} }, blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
};

const created = createCadDocumentLayer(base, { name: 'Fire Protection', color: '#EF4444', linetype: 'DASHED', lineweight: 0.5 });
assert.deepEqual(created.layers[1], { id: 'Fire_Protection', name: 'Fire Protection', color: '#ef4444', visible: true, locked: false, linetype: 'DASHED', lineweight: 0.5, plot: true });
assert.equal(created.meta.version, 2);
assert.throws(() => createCadDocumentLayer(created, { name: 'fire protection', color: '#ffffff' }), /already exists/);
assert.throws(() => createCadDocumentLayer(base, { name: 'bad/name', color: '#ffffff' }), /valid DXF/);

const assigned: CadDocument = {
  ...created,
  entities: created.entities.map((entity) => ({ ...entity, layer: 'Fire_Protection' })),
  blocks: [{ id: 'block', name: 'BLOCK', basePoint: { x: 0, y: 0, z: 0 }, entities: [{ id: 'child', type: 'line', start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 }, layer: 'Fire_Protection' }], library: { scope: 'document' }, version: 1 }],
  paperSpaces: [{ id: 'sheet', name: 'Sheet', order: 0, entityIds: [], page: { width: 297, height: 210, unit: 'mm', orientation: 'landscape' }, pageSetup: { paper: 'A4', margins: { top: 10, right: 10, bottom: 10, left: 10 }, colorMode: 'color', lineweightScale: 1 }, viewports: [{ id: 'vp', paperBounds: { x: 10, y: 10, width: 100, height: 80 }, modelBounds: { x: 0, y: 0, width: 10, height: 10 }, scale: 1, locked: false, layerVisibility: { Fire_Protection: false }, layerOverrides: { Fire_Protection: { color: '#000000' } } }] }],
};
const updated = updateCadDocumentLayer(assigned, 'Fire_Protection', { visible: false, locked: true, name: 'Fire & Life Safety' });
assert.match(updated.layers.find((layer) => layer.id === 'Fire_Protection')!.name, /Life Safety/);
const deleted = deleteCadDocumentLayer(updated, 'Fire_Protection', '0');
assert.equal(deleted.entities[0].layer, '0');
assert.equal(deleted.blocks[0].entities[0].layer, '0');
assert.deepEqual(deleted.paperSpaces[0].viewports?.[0].layerVisibility, { 0: false });
assert.deepEqual(deleted.paperSpaces[0].viewports?.[0].layerOverrides, { 0: { color: '#000000' } });
assert.throws(() => deleteCadDocumentLayer(base, '0', 'missing'), /cannot be deleted/);

// T-41: una capa PROYECTADA de una xref se llama «XREF|<xref>|<capa>»; apagarla o bloquearla no la renombra,
// así que el filtro de caracteres DXF sólo corre cuando el parche trae un nombre.
const conXref: CadDocument = { ...base, layers: [...base.layers, { id: 'xref:PLANTA:EJES', name: 'XREF|PLANTA|EJES', color: '#ff00ff', visible: true, locked: false }] };
const apagada = updateCadDocumentLayer(conXref, 'xref:PLANTA:EJES', { visible: false });
assert.equal(apagada.layers.find((layer) => layer.id === 'xref:PLANTA:EJES')!.visible, false);
assert.equal(apagada.layers.find((layer) => layer.id === 'xref:PLANTA:EJES')!.name, 'XREF|PLANTA|EJES');
const bloqueada = updateCadDocumentLayer(apagada, 'xref:PLANTA:EJES', { locked: true });
assert.equal(bloqueada.layers.find((layer) => layer.id === 'xref:PLANTA:EJES')!.locked, true);
assert.throws(() => updateCadDocumentLayer(conXref, '0', { name: 'mal|nombre' }), /valid DXF/);
assert.throws(() => updateCadDocumentLayer(conXref, '0', { name: '' }), /valid DXF/);

// VP-Freeze desde el GESTOR DE CAPAS: dado sólo el DOCUMENTO (sin pasarle la
// hoja a mano, como sí exige `freezeCadLayerInViewport`), congela una capa en
// UNA ventana concreta y dice si la capa o la ventana no existen en vez de
// fallar en silencio.
const twoViewports: CadDocument = {
  ...base,
  paperSpaces: [
    {
      id: 'sheet', name: 'Sheet', order: 0, entityIds: [],
      page: { width: 297, height: 210, unit: 'mm', orientation: 'landscape' },
      viewports: [
        { id: 'vp-a', paperBounds: { x: 10, y: 10, width: 100, height: 80 }, modelBounds: { x: 0, y: 0, width: 10, height: 10 }, scale: 1, locked: false },
        { id: 'vp-b', paperBounds: { x: 120, y: 10, width: 100, height: 80 }, modelBounds: { x: 0, y: 0, width: 10, height: 10 }, scale: 1, locked: false },
      ],
    },
  ],
};
const vpFrozen = setCadDocumentLayerViewportFreeze(twoViewports, { layerId: '0', viewportId: 'vp-a', frozen: true });
assert.deepEqual(vpFrozen.paperSpaces[0].viewports?.find((v) => v.id === 'vp-a')?.layerVisibility, { 0: false });
assert.equal(vpFrozen.paperSpaces[0].viewports?.find((v) => v.id === 'vp-b')?.layerVisibility, undefined, 'la otra ventana no se toca');
assert.equal(vpFrozen.meta.version, twoViewports.meta.version + 1, 'UN paso de historia');

const vpThawed = setCadDocumentLayerViewportFreeze(vpFrozen, { layerId: '0', viewportId: 'vp-a', frozen: false });
assert.equal(vpThawed.paperSpaces[0].viewports?.find((v) => v.id === 'vp-a')?.layerVisibility, undefined, 'reutilizar borra la anulación, no escribe true');

assert.throws(
  () => setCadDocumentLayerViewportFreeze(twoViewports, { layerId: 'fantasma', viewportId: 'vp-a', frozen: true }),
  /was not found/,
  'una capa inexistente se nombra',
);
assert.throws(
  () => setCadDocumentLayerViewportFreeze(twoViewports, { layerId: '0', viewportId: 'vp-fantasma', frozen: true }),
  /was not found/,
  'una ventana inexistente se nombra',
);

console.log('cad layer manager specs passed');
