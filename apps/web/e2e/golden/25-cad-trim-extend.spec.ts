import { expect, test, type BrowserContext } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsMaster } from '../fixtures/session';
import type { CadDocument, CadEntity } from '../../src/lib/cad/cad-document';

type CadLine = Extract<CadEntity, { type: 'line' }>;

function canonicalDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [
      { id: 'trim-target', type: 'line', start: { x: 0, y: 1_000, z: 0 }, end: { x: 10_000, y: 1_000, z: 0 }, layer: '0' },
      { id: 'trim-cutter', type: 'line', start: { x: 6_000, y: 0, z: 0 }, end: { x: 6_000, y: 2_000, z: 0 }, layer: '0' },
      { id: 'extend-target', type: 'line', start: { x: 0, y: 4_000, z: 0 }, end: { x: 4_000, y: 4_000, z: 0 }, layer: '0' },
      { id: 'extend-boundary', type: 'line', start: { x: 6_000, y: 3_000, z: 0 }, end: { x: 6_000, y: 5_000, z: 0 }, layer: '0' },
    ],
    history: [], modelSpace: { entityIds: ['trim-target', 'trim-cutter', 'extend-target', 'extend-boundary'] }, paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} }, blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
  };
}

// MIGRACIÓN R3: mock en la superficie v1 real (el adaptador R2 reescribe las
// rutas legacy antes de tocar la red). Mismo documento, misma huella y mismo
// CAS contractual. Interfaz snapshot() intacta.
async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, canonicalDocument(), {
    footprintW: 12_000, footprintH: 8_000, unit: 'mm', gridSize: 100,
  });
}

async function selectPair(page: import('@playwright/test').Page, first: string, second: string) {
  await page.getByTitle(/Selección profesional/).click();
  const query = page.getByTestId('cad-quick-select-text');
  await query.fill(first);
  await page.getByTestId('cad-quick-select-apply').click();
  await page.getByTestId('cad-selection-operation-add').click();
  await query.fill(second);
  await page.getByTestId('cad-quick-select-apply').click();
  await expect(page.getByTestId('cad-selection-count')).toHaveText('2 seleccionados');
  await page.getByLabel('Cerrar panel profesional').click();
  await expect(page.getByTestId('cad-line-edit-control')).toBeVisible();
}

test('native TRIM and EXTEND edit LINE endpoints atomically and persist', async ({ context, page }, testInfo) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsMaster(context);
  const backend = await installCadBackend(context);
  await page.goto('/studio');

  await test.step('15. TRIM', async () => {
    await selectPair(page, 'trim-target', 'trim-cutter');
    await page.getByTestId('cad-line-edit-operation').selectOption('trim');
    await page.getByTestId('cad-line-edit-target').selectOption('trim-target');
    await page.getByTestId('cad-line-edit-endpoint').selectOption('start');
    await page.getByTestId('cad-line-edit-apply').click();
    await expect(page.getByTestId('cad-native-property-endX')).toHaveValue('6000');
  });

  await page.getByTestId('cad-native-properties').getByRole('button', { name: 'Deseleccionar' }).click();
  await test.step('16. EXTEND', async () => {
    await selectPair(page, 'extend-target', 'extend-boundary');
    await page.getByTestId('cad-line-edit-operation').selectOption('extend');
    await page.getByTestId('cad-line-edit-target').selectOption('extend-target');
    await page.getByTestId('cad-line-edit-endpoint').selectOption('end');
    await page.getByTestId('cad-line-edit-apply').click();
    await expect(page.getByTestId('cad-native-property-endX')).toHaveValue('6000');
  });

  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(() => backend.snapshot().version).toBe(1);
  const stored = backend.snapshot().document;
  expect((stored.entities.find((entity) => entity.id === 'trim-target') as CadLine).end.x).toBe(6_000);
  expect((stored.entities.find((entity) => entity.id === 'extend-target') as CadLine).end.x).toBe(6_000);
  expect(stored.history.map((entry) => entry.label)).toEqual(expect.arrayContaining([
    'trim:trim-target:start:boundary:trim-cutter',
    'extend:extend-target:end:boundary:extend-boundary',
  ]));
  await page.reload();
  await page.getByTestId('cad-native-entity-extend-target').click();
  await expect(page.getByTestId('cad-native-property-endX')).toHaveValue('6000');
  await page.getByTestId('cad-native-properties').screenshot({ path: testInfo.outputPath('trim-extend-properties.png'), scale: 'css' });
});
