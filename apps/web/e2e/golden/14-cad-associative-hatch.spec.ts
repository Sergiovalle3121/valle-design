import { expect, test, type BrowserContext } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { loginAsMaster } from '../fixtures/session';
import { API_ORIGIN } from '../fixtures/constants';
import type { CadDocument, CadEntity } from '../../src/lib/cad/cad-document';

type CadHatch = Extract<CadEntity, { type: 'hatch' }>;

function canonicalDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [
      { id: '0', name: '0', color: '#ffffff', visible: true, locked: false },
      { id: 'CURVES', name: 'CURVES', color: '#60a5fa', visible: true, locked: false },
    ],
    entities: [{
      id: 'hatch-source-ellipse',
      type: 'ellipse',
      center: { x: 7_000, y: 4_000, z: 0 },
      majorAxis: { x: 800, y: 200, z: 0 },
      ratio: 0.45,
      startParameter: 0,
      endParameter: 360,
      layer: 'CURVES',
    }],
    history: [],
    modelSpace: { entityIds: ['hatch-source-ellipse'] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
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
    if (request.method() === 'GET') return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(layout()),
    });
    if (request.method() === 'PUT') {
      const body = request.postDataJSON() as { cadDocument: CadDocument };
      document = body.cadDocument;
      version += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(layout()) });
    }
    return route.fallback();
  });
  return { snapshot: () => ({ document, version }) };
}

test('HATCH remains associated, regenerates with its source and reports a broken reference', async ({ context, page }) => {
  await installMockBackend(context);
  await loginAsMaster(context);
  const backend = await installCadBackend(context);
  await page.goto('/dashboard/cad');

  await page.getByTestId('cad-native-entity-hatch-source-ellipse').click();
  await page.getByTitle(/^HATCH:/).click();
  const palette = page.getByTestId('cad-hatch-palette');
  await expect(palette).toBeVisible();
  await palette.getByTestId('cad-hatch-selection-pattern').click();

  const properties = page.getByTestId('cad-native-properties');
  await expect(properties).toContainText('HATCH');
  await expect(properties).toContainText('associated');
  await expect(properties).toContainText('1 refs');
  await page.getByTestId('cad-hatch-detach').click();
  await expect(properties).toContainText('detached');
  await page.getByTestId('cad-hatch-reassociate').click();
  await expect(properties).toContainText('associated');

  await properties.getByRole('button', { name: 'Deseleccionar' }).click();
  await page.getByTestId('cad-native-entity-hatch-source-ellipse').click();
  const majorAxisX = page.getByTestId('cad-native-property-majorAxisX');
  await majorAxisX.fill('1000');
  await majorAxisX.blur();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(() => backend.snapshot().version).toBe(1);
  const associated = backend.snapshot().document.entities.find((entity): entity is CadHatch => entity.type === 'hatch');
  expect(associated).toBeDefined();
  expect(associated?.associationStatus).toBe('associated');
  expect(associated?.boundaryRefs).toEqual(['hatch-source-ellipse']);
  expect(Math.max(...(associated?.boundaries[0] ?? []).map((point) => point.x))).toBeGreaterThan(8_000);

  await page.getByTestId('cad-native-delete').click();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(() => backend.snapshot().version).toBe(2);
  const broken = backend.snapshot().document.entities.find((entity): entity is CadHatch => entity.type === 'hatch');
  expect(broken?.associationStatus).toBe('broken');
});

test('HATCH resolves an exact interior point through the production boundary picker', async ({ context, page }) => {
  await installMockBackend(context);
  await loginAsMaster(context);
  const backend = await installCadBackend(context);
  await page.goto('/dashboard/cad');

  await page.getByTitle(/^HATCH:/).click();
  const palette = page.getByTestId('cad-hatch-palette');
  await expect(palette).toBeVisible();
  await palette.getByTestId('cad-hatch-point-x').fill('7000');
  await palette.getByTestId('cad-hatch-point-y').fill('4000');
  await palette.getByTestId('cad-hatch-create-exact').click();

  const properties = page.getByTestId('cad-native-properties');
  await expect(properties).toContainText('HATCH');
  await expect(properties).toContainText('associated');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(() => backend.snapshot().version).toBe(1);

  const hatch = backend.snapshot().document.entities.find((entity): entity is CadHatch => entity.type === 'hatch');
  expect(hatch).toBeDefined();
  expect(hatch?.origin).toMatchObject({ x: 7_000, y: 4_000 });
  expect(hatch?.boundaryRefs).toEqual(['hatch-source-ellipse']);
  expect(hatch?.associationStatus).toBe('associated');
  expect(hatch?.boundaries).toHaveLength(1);
});
