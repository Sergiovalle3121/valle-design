import { expect, test, type BrowserContext } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsMaster } from '../fixtures/session';
import type { CadDocument } from '../../src/lib/cad/cad-document';

function canonicalDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false, linetype: 'CONTINUOUS', lineweight: -1, plot: true }],
    entities: [{ id: 'layer-line', type: 'line', start: { x: 1_000, y: 1_000, z: 0 }, end: { x: 5_000, y: 1_000, z: 0 }, layer: '0' }],
    history: [], modelSpace: { entityIds: ['layer-line'] }, paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} }, blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
  };
}

// MIGRACIÓN R3: mock en la superficie v1 real (el adaptador R2 reescribe las
// rutas legacy antes de tocar la red). Mismo documento, misma huella y mismo
// CAS contractual. Interfaz snapshot() intacta.
async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, canonicalDocument(), {
    footprintW: 12_000, footprintH: 10_000, unit: 'mm', gridSize: 100,
  });
}

test('canonical layer manager creates, edits, locks, assigns, deletes and persists document layers', async ({ context, page }, testInfo) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsMaster(context);
  const backend = await installCadBackend(context);
  await page.goto('/studio');
  await page.getByTestId('cad-native-entity-layer-line').click();
  await expect(page.getByTestId('cad-native-property-startX')).toHaveValue('1000');

  const viewButton = page.getByTitle(/Vista, capas/);
  await viewButton.click();
  await page.getByTestId('cad-layer-new-name').fill('Fire Protection');
  await page.getByTestId('cad-layer-new-color').fill('#ef4444');
  await page.getByTestId('cad-layer-create').click();
  await expect(page.getByTestId('cad-layer-row-Fire_Protection')).toBeVisible();
  await expect(page.getByTestId('cad-layer-active-Fire_Protection')).toHaveText('Fire Protection');

  await page.getByTestId('cad-layer-row-Fire_Protection').getByRole('button', { name: 'Asignar' }).click();
  await page.getByTestId('cad-layer-lock-Fire_Protection').click();
  await expect(page.getByTestId('cad-layer-lock-Fire_Protection')).toHaveText('Lock');
  await viewButton.click();
  await page.getByTestId('cad-native-move-x').click();
  await expect(page.getByText(/Layer Fire_Protection is locked/)).toBeVisible();
  await expect(page.getByTestId('cad-native-property-startX')).toHaveValue('1000');

  await viewButton.click();
  await page.getByTestId('cad-layer-lock-Fire_Protection').click();
  await page.getByTestId('cad-layer-name-Fire_Protection').fill('Fire Safety');
  await page.getByTestId('cad-layer-name-Fire_Protection').blur();
  await expect(page.getByTestId('cad-layer-active-Fire_Protection')).toHaveText('Fire Safety');
  await page.getByTestId('cad-layer-new-name').fill('Temporary Notes');
  await page.getByTestId('cad-layer-create').click();
  await expect(page.getByTestId('cad-layer-row-Temporary_Notes')).toBeVisible();
  await page.getByTestId('cad-layer-delete-Temporary_Notes').click();
  await expect(page.getByTestId('cad-layer-row-Temporary_Notes')).toHaveCount(0);
  await page.getByTestId('cad-layer-visible-Fire_Protection').click();

  await viewButton.click();
  await page.getByTestId('cad-native-move-x').click();
  await expect(page.getByTestId('cad-native-property-startX')).toHaveValue('1100');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(() => backend.snapshot().version).toBe(1);
  expect(backend.snapshot().document.layers).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: '0', name: '0' }),
    expect.objectContaining({ id: 'Fire_Protection', name: 'Fire Safety', color: '#ef4444', visible: false, locked: false }),
  ]));
  expect(backend.snapshot().document.layers.some((layer) => layer.id === 'Temporary_Notes')).toBe(false);
  expect(backend.snapshot().document.entities.find((entity) => entity.id === 'layer-line')).toMatchObject({ layer: 'Fire_Protection', start: { x: 1_100, y: 1_000 } });
  expect(backend.snapshot().document.history.some((entry) => entry.label === 'layer:create:Fire_Protection')).toBe(true);
  expect(backend.snapshot().document.history.some((entry) => entry.label.includes('layer:delete:Temporary_Notes'))).toBe(true);

  await page.reload();
  await viewButton.click();
  await expect(page.getByTestId('cad-layer-row-Fire_Protection')).toBeVisible();
  await expect(page.getByTestId('cad-layer-name-Fire_Protection')).toHaveValue('Fire Safety');
  await expect(page.getByTestId('cad-layer-visible-Fire_Protection')).toHaveClass(/opacity-30/);
  await page.getByTestId('cad-layer-manager').screenshot({ path: testInfo.outputPath('canonical-layer-manager.png'), scale: 'css' });
});
