import { expect, test, type BrowserContext } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { loginAsMaster } from '../fixtures/session';
import { API_ORIGIN } from '../fixtures/constants';

const cadDocument = {
  meta: { version: 1, schema: 3, unit: 'mm' },
  layers: [
    { id: '0', name: '0', color: '#ffffff', visible: true, locked: false },
    { id: 'CURVES', name: 'CURVES', color: '#60a5fa', visible: true, locked: false },
  ],
  entities: [
    { id: 'selection-arc', type: 'arc', center: { x: 4_000, y: 3_000, z: 0 }, radius: 120, startAngle: 0, endAngle: 180, layer: 'CURVES' },
    { id: 'selection-ellipse', type: 'ellipse', center: { x: 5_000, y: 3_000, z: 0 }, majorAxis: { x: 180, y: 0, z: 0 }, ratio: 0.45, startParameter: 0, endParameter: 360, layer: 'CURVES' },
  ],
  history: [],
  modelSpace: { entityIds: ['selection-arc', 'selection-ellipse'] },
  paperSpaces: [],
  styles: { text: {}, dimension: {}, table: {}, plot: {} },
  blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [],
};

async function installCadBackend(context: BrowserContext) {
  await context.route(`${API_ORIGIN}/line-engineering/layout**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/line-engineering/layout' || route.request().method() !== 'GET')
      return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        model: 'AXOS-CAD-STUDIO', revision: 'UNIVERSAL',
        footprint: { footprintW: 12_000, footprintH: 10_000, unit: 'mm', gridSize: 100 },
        stations: [], dxf: null, connectors: [], assets: [], annotations: [], cells: [], layers: [],
        cadDocument, cadDocumentVersion: 0,
        approval: { status: 'draft', by: null, at: null, note: null },
      }),
    });
  });
}

test('professional selection composes quick, add, previous, last, all and invert', async ({ context, page }) => {
  await installMockBackend(context);
  await loginAsMaster(context);
  await installCadBackend(context);
  await page.goto('/dashboard/cad');
  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();

  await page.getByTitle(/Selección profesional/).click();
  const palette = page.getByTestId('cad-selection-palette');
  await expect(palette).toBeVisible();
  const count = page.getByTestId('cad-selection-count');

  await palette.getByLabel('Filtrar por tipo').selectOption('arc');
  await page.getByTestId('cad-quick-select-apply').click();
  await expect(count).toHaveText('1 seleccionados');

  await page.getByTestId('cad-selection-operation-add').click();
  await palette.getByLabel('Filtrar por tipo').selectOption('ellipse');
  await page.getByTestId('cad-quick-select-apply').click();
  await expect(count).toHaveText('2 seleccionados');

  await palette.getByRole('button', { name: 'Anterior' }).click();
  await expect(count).toHaveText('1 seleccionados');
  await page.getByTestId('cad-selection-operation-replace').click();
  await palette.getByRole('button', { name: 'Último' }).click();
  await expect(count).toHaveText('1 seleccionados');

  await palette.getByRole('button', { name: 'Todo', exact: true }).click();
  await expect(count).toHaveText('2 seleccionados');
  await palette.getByRole('button', { name: 'Invertir' }).click();
  await expect(count).toHaveText('0 seleccionados');
});
