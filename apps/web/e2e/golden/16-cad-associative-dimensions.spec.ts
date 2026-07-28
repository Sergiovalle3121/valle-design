import { expect, test, type BrowserContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installMockBackend } from '../fixtures/mock-backend';
import { loginAsMaster } from '../fixtures/session';
import { API_ORIGIN } from '../fixtures/constants';
import type { CadDocument, CadEntity } from '../../src/lib/cad/cad-document';
import { importDxfPrimitives } from '../../src/lib/cad/dxf-import';

type CadDimension = Extract<CadEntity, { type: 'dimension' }>;

function canonicalDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [
      { id: '0', name: '0', color: '#ffffff', visible: true, locked: false },
      { id: 'DIMENSIONS', name: 'DIMENSIONS', color: '#34d399', visible: true, locked: false },
    ],
    entities: [{
      id: 'dimension-source-line',
      type: 'line',
      start: { x: 6_000, y: 4_000, z: 0 },
      end: { x: 6_200, y: 4_000, z: 0 },
      layer: '0',
    }],
    history: [],
    modelSpace: { entityIds: ['dimension-source-line'] },
    paperSpaces: [],
    styles: { text: {}, dimension: { Standard: { precision: 2, arrowSize: 12 } }, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [],
    publications: [],
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

test('associated DIMENSION follows source edits, survives undo/reload/DXF and reports broken refs', async ({ context, page }) => {
  await installMockBackend(context);
  await loginAsMaster(context);
  const backend = await installCadBackend(context);
  await page.goto('/dashboard/cad');

  await page.getByTestId('cad-native-entity-dimension-source-line').click();
  await page.getByTitle(/^Dimensiones asociativas:/).click();
  const palette = page.getByTestId('cad-dimension-palette');
  await expect(palette).toBeVisible();
  await page.getByTestId('cad-dimension-kind').selectOption('aligned');
  await page.getByTestId('cad-dimension-offset').fill('30');
  await page.getByTestId('cad-dimension-create').click();

  const properties = page.getByTestId('cad-native-properties');
  await expect(properties).toContainText('DIMENSION');
  await expect(properties).toContainText('associated');
  await expect(properties).toContainText('2 refs');
  await expect(page.getByTestId('cad-native-property-measurement')).toHaveValue('200');
  await page.getByTestId('cad-dimension-detach').click();
  await expect(properties).toContainText('detached');
  await page.getByTestId('cad-dimension-reassociate').click();
  await expect(properties).toContainText('associated');

  await properties.getByRole('button', { name: 'Deseleccionar' }).click();
  await page.getByTestId('cad-native-entity-dimension-source-line').click();
  const endX = page.getByTestId('cad-native-property-endX');
  await endX.fill('6260');
  await endX.blur();
  await properties.getByRole('button', { name: 'Deseleccionar' }).click();
  await page.getByTestId(/^cad-native-entity-dim_/).click();
  await expect(page.getByTestId('cad-native-property-measurement')).toHaveValue('260');
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('cad-native-property-measurement')).toHaveValue('200');
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByTestId('cad-native-property-measurement')).toHaveValue('260');

  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(() => backend.snapshot().version).toBe(1);
  const stored = backend.snapshot().document.entities.find((entity): entity is CadDimension => entity.type === 'dimension');
  expect(stored?.associationStatus).toBe('associated');
  expect(stored?.references).toEqual([
    { entityId: 'dimension-source-line', anchor: 'start' },
    { entityId: 'dimension-source-line', anchor: 'end' },
  ]);
  expect(stored?.b.x).toBe(6_260);

  await page.reload();
  await page.getByTestId(/^cad-native-entity-dim_/).click();
  await expect(page.getByTestId('cad-native-property-measurement')).toHaveValue('260');
  await page.getByTitle(/Exportar a DXF/).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar DXF' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const imported = importDxfPrimitives(await readFile(path!, 'utf8'));
  expect(imported.semanticDimensions).toHaveLength(1);
  expect(imported.semanticDimensions[0].dimensionKind).toBe('aligned');
  expect(imported.semanticDimensions[0].b.x).toBe(6_260);

  await properties.getByRole('button', { name: 'Deseleccionar' }).click();
  await page.getByTestId('cad-native-entity-dimension-source-line').click();
  await page.getByTestId('cad-native-delete').click();
  await page.getByTestId(/^cad-native-entity-dim_/).click();
  await expect(properties).toContainText('broken');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(() => backend.snapshot().version).toBe(2);
  const broken = backend.snapshot().document.entities.find((entity): entity is CadDimension => entity.type === 'dimension');
  expect(broken?.associationStatus).toBe('broken');
});
