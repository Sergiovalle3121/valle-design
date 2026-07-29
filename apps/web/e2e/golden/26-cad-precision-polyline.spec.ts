import { expect, test, type BrowserContext } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { loginAsMaster } from '../fixtures/session';
import { API_ORIGIN } from '../fixtures/constants';
import type { CadDocument } from '../../src/lib/cad/cad-document';

async function installCadBackend(context: BrowserContext) {
  let document: CadDocument | null = null;
  let assets: Array<{ id: string; label?: string; x: number; y: number; w: number; h: number }> = [];
  let version = 0;
  const layout = () => ({
    model: 'AXOS-CAD-STUDIO', revision: 'UNIVERSAL', footprint: { footprintW: 12_000, footprintH: 8_000, unit: 'mm', gridSize: 100 },
    stations: [], dxf: null, connectors: [], assets, annotations: [], cells: [], layers: [], cadDocument: document, cadDocumentVersion: version,
    approval: { status: 'draft', by: null, at: null, note: null },
  });
  await context.route(`${API_ORIGIN}/line-engineering/layout**`, async (route) => {
    const request = route.request();
    if (new URL(request.url()).pathname !== '/line-engineering/layout') return route.fallback();
    if (request.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(layout()) });
    if (request.method() === 'PUT') {
      const body = request.postDataJSON() as { cadDocument: CadDocument; assets: typeof assets };
      document = body.cadDocument;
      assets = body.assets;
      version += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(layout()) });
    }
    return route.fallback();
  });
  return { snapshot: () => ({ document, assets, version }) };
}

async function fillPoint(page: import('@playwright/test').Page, x: string, y: string) {
  await page.getByTestId('cad-dynamic-field-x').fill(x);
  await page.getByTestId('cad-dynamic-field-y').fill(y);
  await page.getByTestId('cad-dynamic-input').getByRole('button', { name: 'Aplicar' }).click();
}

test('neutral drawing uses units, layers, ABS/REL/POLAR, closed polyline and OFFSET', async ({ context, page }, testInfo) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsMaster(context);
  const backend = await installCadBackend(context);

  await test.step('1. Abrir dibujo', async () => {
    await page.goto('/dashboard/cad');
    await expect(page.getByTestId('cad-canvas')).toBeVisible();
  });
  await test.step('2. Elegir unidades', async () => {
    const view = page.getByTitle(/Vista, capas/);
    await view.click();
    const manager = page.getByTestId('cad-layer-manager');
    await manager.getByRole('button', { name: 'm', exact: true }).click();
    await manager.getByRole('button', { name: 'mm', exact: true }).click();
    await expect(manager).toContainText('mm');
  });
  await test.step('3. Crear capas', async () => {
    await page.getByTestId('cad-layer-new-name').fill('Acceptance Geometry');
    await page.getByTestId('cad-layer-create').click();
    await expect(page.getByTestId('cad-layer-row-Acceptance_Geometry')).toBeVisible();
    await page.getByTitle(/Vista, capas/).click();
  });

  await page.getByRole('button', { name: 'Line', exact: true }).click();
  await test.step('4/7. Coordenada absoluta y dynamic input', async () => {
    await expect(page.getByTestId('cad-dynamic-input')).toBeVisible();
    await fillPoint(page, '1000', '1000');
  });
  await test.step('5. Coordenada relativa', async () => {
    await page.getByTestId('cad-dynamic-input').getByRole('button', { name: 'REL' }).click();
    await fillPoint(page, '2000', '0');
  });
  await test.step('6. Coordenada polar', async () => {
    const dynamic = page.getByTestId('cad-dynamic-input');
    await dynamic.getByRole('button', { name: 'POLAR' }).click();
    await page.getByTestId('cad-dynamic-field-distance').fill('1500');
    await page.getByTestId('cad-dynamic-field-angle').fill('90deg');
    await dynamic.getByRole('button', { name: 'Aplicar' }).click();
    await page.getByRole('button', { name: 'Terminar' }).click();
    await expect(page.getByText(/2 equipos/)).toBeVisible();
  });

  await test.step('13. Crear polilínea cerrada', async () => {
    await page.getByRole('button', { name: 'Pline', exact: true }).click();
    await fillPoint(page, '2000', '4000');
    await page.getByTestId('cad-dynamic-input').getByRole('button', { name: 'REL' }).click();
    await fillPoint(page, '2000', '0');
    await fillPoint(page, '0', '1500');
    await page.getByTestId('cad-polyline-close').click();
    await expect(page.getByText(/5 equipos/)).toBeVisible();
  });

  await test.step('14. Aplicar offset', async () => {
    await page.getByTitle(/Selección profesional/).click();
    await page.getByTestId('cad-quick-select-text').fill('Pline 1');
    await page.getByTestId('cad-quick-select-apply').click();
    await expect(page.getByTestId('cad-selection-count')).toHaveText('1 seleccionados');
    await page.getByLabel('Cerrar panel profesional').click();
    await page.getByRole('button', { name: 'Offset', exact: true }).click();
    await page.getByTestId('cad-dynamic-field-offset').fill('250mm');
    await page.getByTestId('cad-dynamic-input').getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByText(/6 equipos/)).toBeVisible();
  });

  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(() => backend.snapshot().version).toBe(1);
  expect(backend.snapshot().assets).toHaveLength(6);
  expect(backend.snapshot().assets.filter((asset) => asset.label?.startsWith('Pline'))).toHaveLength(4);
  expect(backend.snapshot().document?.layers.some((layer) => layer.id === 'Acceptance_Geometry')).toBe(true);
  await page.getByTestId('cad-canvas').screenshot({ path: testInfo.outputPath('neutral-precision-drawing.png'), scale: 'css' });
});
