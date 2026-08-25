import { expect, test, type BrowserContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import { importDxfPrimitives } from '../../src/lib/cad/dxf-import';
import type { CadDocument } from '../../src/lib/cad/cad-document';

// El tipo no soportado de este golden era POINT. Dejó de serlo: el esquema 4 lo
// importa como entidad de pleno derecho, así que el ejemplo pasa a 3DFACE, que
// sigue fuera del subconjunto implementado. Lo que este golden protege no es
// QUÉ tipo falta, sino que lo que falta se DECLARE en el manifiesto.

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
3DFACE
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

// MIGRACIÓN R3: mock en la superficie v1 real. El PUT del plano DXF legacy
// (`layout/dxf`) llega ahora como PUT /v1/cad/documents/:id/dxf y el fixture
// lo persiste (con su colocación) como la API real. Interfaz snapshot() intacta.
async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, canonicalDocument(), {
    footprintW: 12_000, footprintH: 10_000, unit: 'mm', gridSize: 100,
  });
}

test('DXF import remains editable/exportable and persists an explicit loss manifest', async ({ context, page }) => {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');

  await test.step('42. Importar DXF', async () => {
    await page.locator('input[accept=".dxf,.dwg"]').setInputFiles({
      name: 'neutral-loss.dxf',
      mimeType: 'application/dxf',
      buffer: Buffer.from(DXF_WITH_LOSS),
    });
    await expect(page.getByText(/1 entidades soportadas/)).toBeVisible();
    await expect(page.getByText(/Entidad DXF no soportada: 3DFACE/)).toBeVisible();
    await page.getByRole('button', { name: 'Convertir entidades soportadas' }).click();
    await expect(page.getByTestId('cad-native-properties')).toContainText('ARC');
  });

  await test.step('43. Editar importado', async () => {
    const centerX = page.getByTestId('cad-native-property-centerX');
    const before = Number(await centerX.inputValue());
    await page.getByTestId('cad-native-move-x').click();
    await expect.poll(async () => Number(await centerX.inputValue())).toBe(before + 100);
  });

  await saveAndSettle(page, backend);

  await test.step('45. Verificar loss manifest', async () => {
    expect(backend.snapshot().document.lossManifest).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'dxf_import:unsupported_entity', sourceType: '3DFACE', severity: 'warning' }),
      // P0-3: el ARC de este DXF vive en (1000,1000), no en el origen — la
      // conversión a editable lo desplaza para alinear con el backdrop, y
      // ese desplazamiento ya no es mudo (dxf-editable-import-losses.ts).
      expect.objectContaining({ code: 'dxf_import:origin_shifted', sourceType: 'DXF', severity: 'warning' }),
    ]));
    await page.getByTitle(/Paquete de entrega/).click();
    await expect(page.getByTestId('cad-sheet-package-manifest')).toContainText('dxf_import:unsupported_entity');
    await expect(page.getByTestId('cad-sheet-package-manifest')).toContainText('dxf_import:origin_shifted');
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
