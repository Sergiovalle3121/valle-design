import { expect, test, type BrowserContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installMockBackend } from '../fixtures/mock-backend';
import { loginAsMaster } from '../fixtures/session';
import { API_ORIGIN } from '../fixtures/constants';
import { importDxfPrimitives } from '../../src/lib/cad/dxf-import';
import type { CadDocument } from '../../src/lib/cad/cad-document';

const DXF_WITH_LOSS = `0
SECTION
2
HEADER
0
ENDSEC
0
SECTION
2
ENTITIES
0
ARC
8
CURVES
10
1000
20
1000
30
0
40
200
50
0
51
90
0
POINT
8
UNSUPPORTED
10
1600
20
1200
30
0
0
ENDSEC
0
EOF
`;

function canonicalDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [
      { id: '0', name: '0', color: '#ffffff', visible: true, locked: false },
      { id: 'CURVES', name: 'CURVES', color: '#60a5fa', visible: true, locked: false },
    ],
    entities: [], history: [], modelSpace: { entityIds: [] }, paperSpaces: [],
    styles: { text: {}, dimension: {}, table: {}, plot: {} }, blocks: [], constraints: [],
    externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
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
    if (url.pathname === '/line-engineering/layout/dxf' && request.method() === 'PUT')
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    if (url.pathname !== '/line-engineering/layout') return route.fallback();
    if (request.method() === 'GET') return route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(layout()),
    });
    if (request.method() === 'PUT') {
      document = (request.postDataJSON() as { cadDocument: CadDocument }).cadDocument;
      version += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(layout()) });
    }
    return route.fallback();
  });
  return { snapshot: () => ({ document, version }) };
}

test('DXF import remains editable/exportable and persists an explicit loss manifest', async ({ context, page }) => {
  await installMockBackend(context);
  await loginAsMaster(context);
  const backend = await installCadBackend(context);
  await page.goto('/dashboard/cad');

  await test.step('42. Importar DXF', async () => {
    await page.locator('input[accept=".dxf,.dwg"]').setInputFiles({
      name: 'neutral-loss.dxf',
      mimeType: 'application/dxf',
      buffer: Buffer.from(DXF_WITH_LOSS),
    });
    await expect(page.getByText(/1 entidades soportadas/)).toBeVisible();
    await expect(page.getByText(/Entidad DXF no soportada: POINT/)).toBeVisible();
    await page.getByRole('button', { name: 'Convertir entidades soportadas' }).click();
    await expect(page.getByTestId('cad-native-properties')).toContainText('ARC');
  });

  await test.step('43. Editar importado', async () => {
    const centerX = page.getByTestId('cad-native-property-centerX');
    const before = Number(await centerX.inputValue());
    await page.getByTestId('cad-native-move-x').click();
    await expect.poll(async () => Number(await centerX.inputValue())).toBe(before + 100);
  });

  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(() => backend.snapshot().version).toBe(1);

  await test.step('45. Verificar loss manifest', async () => {
    expect(backend.snapshot().document.lossManifest).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'dxf_import:unsupported_entity', sourceType: 'POINT', severity: 'warning' }),
    ]));
    await page.getByTitle(/Paquete de entrega/).click();
    await expect(page.getByTestId('cad-sheet-package-manifest')).toContainText('dxf_import:unsupported_entity');
    await page.getByLabel('Cerrar paquete de entrega').click();
  });

  await test.step('44. Exportar DXF', async () => {
    await page.getByTitle(/Exportar a DXF/).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar DXF' }).click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).not.toBeNull();
    const reimported = importDxfPrimitives(await readFile(path!, 'utf8'));
    expect(reimported.primitives.some((primitive) => primitive.kind === 'arc')).toBe(true);
  });
});
