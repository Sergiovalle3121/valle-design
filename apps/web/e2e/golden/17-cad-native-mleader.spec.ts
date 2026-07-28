import { expect, test, type BrowserContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installMockBackend } from '../fixtures/mock-backend';
import { loginAsMaster } from '../fixtures/session';
import { API_ORIGIN } from '../fixtures/constants';
import type { CadDocument, CadEntity } from '../../src/lib/cad/cad-document';
import { importDxfPrimitives } from '../../src/lib/cad/dxf-import';

type CadMleader = Extract<CadEntity, { type: 'mleader' }>;

function canonicalDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [{
      id: 'mleader-source-line', type: 'line',
      start: { x: 5_800, y: 4_000, z: 0 }, end: { x: 6_000, y: 4_000, z: 0 }, layer: '0',
    }],
    history: [], modelSpace: { entityIds: ['mleader-source-line'] }, paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: { Standard: { arrowSize: 18, doglegLength: 360, landing: true } }, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
  };
}

async function installCadBackend(context: BrowserContext) {
  let document = canonicalDocument();
  let version = 0;
  const layout = () => ({
    model: 'AXOS-CAD-STUDIO', revision: 'UNIVERSAL',
    footprint: { footprintW: 12_000, footprintH: 10_000, unit: 'mm', gridSize: 100 },
    stations: [], dxf: null, connectors: [], assets: [], annotations: [], cells: [], layers: [],
    cadDocument: document, cadDocumentVersion: version,
    approval: { status: 'draft', by: null, at: null, note: null },
  });
  await context.route(`${API_ORIGIN}/line-engineering/layout**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname !== '/line-engineering/layout') return route.fallback();
    if (request.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(layout()) });
    if (request.method() === 'PUT') {
      document = (request.postDataJSON() as { cadDocument: CadDocument }).cadDocument;
      version += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(layout()) });
    }
    return route.fallback();
  });
  return { snapshot: () => ({ document, version }) };
}

test('MLEADER is unitary, associative, editable, persistent and DXF semantic', async ({ context, page }) => {
  await installMockBackend(context);
  await loginAsMaster(context);
  const backend = await installCadBackend(context);
  await page.goto('/dashboard/cad');

  await page.getByTestId('cad-native-entity-mleader-source-line').click();
  await page.getByTitle(/^MLEADER:/).click();
  const palette = page.getByTestId('cad-mleader-palette');
  await expect(palette).toBeVisible();
  await page.getByTestId('cad-mleader-content').fill('Inspect connection\nTorque 25 Nm');
  await page.getByTestId('cad-mleader-arrow').selectOption('open');
  await page.getByTestId('cad-mleader-dogleg').fill('420');
  await page.getByTestId('cad-mleader-create').click();

  const properties = page.getByTestId('cad-native-properties');
  await expect(properties).toContainText('MLEADER');
  await expect(properties).toContainText('associated');
  await expect(properties).toContainText('1 refs · 1 leaders');
  await page.getByTestId('cad-mleader-detach').click();
  await expect(properties).toContainText('detached');
  await page.getByTestId('cad-mleader-reassociate').click();
  await expect(properties).toContainText('associated');

  const text = page.getByTestId('cad-native-property-text');
  await text.fill('Inspect connection\nTorque verified');
  await text.blur();
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('cad-native-property-text')).toHaveValue('Inspect connection\nTorque 25 Nm');
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByTestId('cad-native-property-text')).toHaveValue('Inspect connection\nTorque verified');

  await properties.getByRole('button', { name: 'Deseleccionar' }).click();
  await page.getByTestId('cad-native-entity-mleader-source-line').click();
  await page.getByTestId('cad-native-property-endX').fill('6100');
  await page.getByTestId('cad-native-property-endX').blur();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(() => backend.snapshot().version).toBe(1);
  const stored = backend.snapshot().document.entities.find((entity): entity is CadMleader => entity.type === 'mleader');
  expect(stored?.associationStatus).toBe('associated');
  expect(stored?.vertices[0].x).toBe(5_950);
  expect(stored?.text).toBe('Inspect connection\nTorque verified');
  expect(stored?.arrowhead).toBe('open');

  await page.reload();
  await page.getByTestId(/^cad-native-entity-mleader_/).click();
  await expect(page.getByTestId('cad-native-property-text')).toHaveValue('Inspect connection\nTorque verified');
  await page.getByTitle(/Exportar a DXF/).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar DXF' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const imported = importDxfPrimitives(await readFile(path!, 'utf8'));
  expect(imported.mleaders).toHaveLength(1);
  expect(imported.mleaders[0].text).toBe('Inspect connection\nTorque verified');
  expect(imported.mleaders[0].arrowhead).toBe('open');

  await properties.getByRole('button', { name: 'Deseleccionar' }).click();
  await page.getByTestId('cad-native-entity-mleader-source-line').click();
  await page.getByTestId('cad-native-delete').click();
  await page.getByTestId(/^cad-native-entity-mleader_/).click();
  await expect(properties).toContainText('broken');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(() => backend.snapshot().version).toBe(2);
  const broken = backend.snapshot().document.entities.find((entity): entity is CadMleader => entity.type === 'mleader');
  expect(broken?.associationStatus).toBe('broken');
});
