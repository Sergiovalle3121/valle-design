import { expect, test, type BrowserContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installMockBackend } from '../fixtures/mock-backend';
import { loginAsMaster } from '../fixtures/session';
import { API_ORIGIN } from '../fixtures/constants';
import type { CadBlockDefinition, CadDocument, CadEntity } from '../../src/lib/cad/cad-document';
import { importDxfPrimitives } from '../../src/lib/cad/dxf-import';

type CadInsert = Extract<CadEntity, { type: 'insert' }>;

interface LibraryRow {
  id: string;
  name: string;
  assets: [];
  definition: CadBlockDefinition;
  version: number;
  createdAt: string;
}

function canonicalDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [{
      id: 'block-source-line', type: 'line',
      start: { x: 5_800, y: 4_000, z: 0 }, end: { x: 6_200, y: 4_000, z: 0 }, layer: '0',
      context: { presentation: { color: { source: 'byBlock' } } },
    }],
    history: [], modelSpace: { entityIds: ['block-source-line'] }, paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
  };
}

async function installCadBackend(context: BrowserContext) {
  let document = canonicalDocument();
  let version = 0;
  const library: LibraryRow[] = [];
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
  await context.route(`${API_ORIGIN}/line-engineering/cad-blocks**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const match = url.pathname.match(/^\/line-engineering\/cad-blocks(?:\/([^/]+))?$/);
    if (!match) return route.fallback();
    if (request.method() === 'GET') {
      const query = (url.searchParams.get('q') ?? '').toLowerCase();
      const rows = query
        ? library.filter((row) => `${row.name} ${row.definition.description ?? ''} ${(row.definition.keywords ?? []).join(' ')}`.toLowerCase().includes(query))
        : library;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
    }
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as { name: string; definition: CadBlockDefinition };
      const row: LibraryRow = { id: `library-${library.length + 1}`, name: body.name, assets: [], definition: body.definition, version: 1, createdAt: new Date(0).toISOString() };
      library.push(row);
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(row) });
    }
    if (request.method() === 'PATCH' && match[1]) {
      const row = library.find((candidate) => candidate.id === match[1]);
      if (!row) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'not found' }) });
      const body = request.postDataJSON() as { name?: string; definition?: CadBlockDefinition };
      if (body.name) row.name = body.name;
      if (body.definition) row.definition = body.definition;
      row.version += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(row) });
    }
    return route.fallback();
  });
  return { snapshot: () => ({ document, version, library: structuredClone(library) }) };
}

test('BLOCK/INSERT stays native through tenant library, attributes, persistence, DXF and explode', async ({ context, page }) => {
  await installMockBackend(context);
  await loginAsMaster(context);
  const backend = await installCadBackend(context);
  await page.goto('/dashboard/cad');

  await page.getByTestId('cad-native-entity-block-source-line').click();
  await page.getByTitle(/^BLOCK\/INSERT:/).click();
  const palette = page.getByTestId('cad-block-palette');
  await expect(palette).toBeVisible();
  await page.getByTestId('cad-block-name').fill('DOOR');
  await palette.getByLabel('Keywords').fill('door, steel, safety');
  await palette.getByLabel('Descripción').fill('Standard safety door');
  await palette.getByLabel('ATTDEF tag').fill('MARK');
  await palette.getByLabel('Default').fill('D-01');
  await palette.getByLabel('Business type').fill('assetType');
  await palette.getByLabel('Business id').fill('door-standard');
  await palette.getByLabel('Publicar en biblioteca tenant').check();
  await page.getByTestId('cad-block-define').click();

  await expect(page.getByTestId('cad-block-row-DOOR')).toBeVisible();
  await expect.poll(() => backend.snapshot().library.length).toBe(1);
  expect(backend.snapshot().library[0].definition.library?.scope).toBe('tenant');

  await page.getByTestId('cad-block-insert-x').fill('7200');
  await page.getByTestId('cad-block-insert-y').fill('4300');
  await page.getByTestId('cad-block-insert-rotation').fill('30');
  await page.getByTestId('cad-block-insert-scaleX').fill('1.5');
  await page.getByTestId('cad-block-insert-scaleY').fill('0.75');
  await page.getByTestId('cad-block-attributes').fill('MARK=D-02');
  await page.getByTestId('cad-block-insert').click();

  await page.getByLabel('Cerrar panel profesional').click();
  const properties = page.getByTestId('cad-native-properties');
  await expect(properties).toContainText('INSERT');
  await expect(page.getByTestId('cad-native-property-rotation')).toHaveValue('30');
  await expect(page.getByTestId('cad-native-property-scaleX')).toHaveValue('1.5');
  await expect(page.getByTestId('cad-native-property-attribute:MARK')).toHaveValue('D-02');
  await page.getByTestId('cad-native-property-rotation').fill('45');
  await page.getByTestId('cad-native-property-rotation').blur();
  await page.getByTestId('cad-native-property-scaleX').fill('2');
  await page.getByTestId('cad-native-property-scaleX').blur();
  await page.getByTestId('cad-native-property-attribute:MARK').fill('D-03');
  await page.getByTestId('cad-native-property-attribute:MARK').blur();
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('cad-native-property-attribute:MARK')).toHaveValue('D-02');
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByTestId('cad-native-property-attribute:MARK')).toHaveValue('D-03');

  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(() => backend.snapshot().version).toBe(1);
  const stored = backend.snapshot().document;
  const storedInserts = stored.entities.filter((entity): entity is CadInsert => entity.type === 'insert');
  expect(stored.blocks).toHaveLength(1);
  expect(storedInserts).toHaveLength(2);
  const transformed = storedInserts.find((insert) => insert.attributes?.MARK === 'D-03');
  expect(transformed).toMatchObject({ rotation: 45, scale: { x: 2, y: 0.75, z: 1 } });

  await page.reload();
  await page.getByTestId(`cad-native-entity-${transformed!.id}`).click();
  await expect(page.getByTestId('cad-native-property-attribute:MARK')).toHaveValue('D-03');
  await page.getByTitle(/Exportar a DXF/).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar DXF' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const imported = importDxfPrimitives(await readFile(path!, 'utf8'));
  expect(imported.blocks).toHaveLength(1);
  expect(imported.inserts).toHaveLength(2);
  expect(imported.inserts.find((insert) => insert.attributes.MARK === 'D-03')).toMatchObject({ rotation: 45, scaleX: 2, scaleY: 0.75 });

  await page.getByTitle(/^BLOCK\/INSERT:/).click();
  await page.getByTestId('cad-block-explode').click();
  await expect(properties).not.toBeVisible();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(() => backend.snapshot().version).toBe(2);
  const exploded = backend.snapshot().document;
  expect(exploded.entities.filter((entity) => entity.type === 'insert')).toHaveLength(1);
  expect(exploded.entities.some((entity) => entity.type === 'line' && entity.id.startsWith(`${transformed!.id}:`))).toBe(true);
  expect(exploded.entities.some((entity) => entity.type === 'text' && entity.text === 'D-03')).toBe(true);
});
