import { expect, test, type BrowserContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadV1Backend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
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

// MIGRACIÓN R3: mock en la superficie v1 real. La biblioteca del tenant vive
// ahora en /v1/cad/blocks dentro del fixture (mismas formas que
// CadBlocksService: {items} en el listado, filtro q por nombre/keywords/
// descripción, POST/PATCH con fila completa). Interfaz snapshot() intacta.
async function installCadBackend(context: BrowserContext) {
  const { backend, snapshot } = await installCadV1Backend(context, {
    document: canonicalDocument() as unknown as Record<string, unknown>,
    footprint: { footprintW: 12_000, footprintH: 10_000, unit: 'mm', gridSize: 100 },
  });
  return {
    snapshot: () => {
      const current = snapshot();
      return {
        document: current.document as unknown as CadDocument,
        version: current.version,
        library: backend.libraryRows as unknown as LibraryRow[],
      };
    },
  };
}

test('BLOCK/INSERT stays native through tenant library, attributes, persistence, DXF and explode', async ({ context, page }) => {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');

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

  // El recorrido hasta aquí abarca varios pasos de UI y supera los 2 s del
  // debounce, así que el autosave persiste parte del lote de forma legítima:
  // el número EXACTO de versiones dependía del tiempo del usuario, no del
  // contrato. Se confirma que no queda trabajo pendiente y se afirma el
  // CONTENIDO, que es la sustancia. El conteo exacto se sigue afirmando donde
  // SÍ es el contrato (10-cad-native-entities, 30-cad-save-affordance).
  await saveAndSettle(page, backend);
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
  await saveAndSettle(page, backend);
  const exploded = backend.snapshot().document;
  expect(exploded.entities.filter((entity) => entity.type === 'insert')).toHaveLength(1);
  expect(exploded.entities.some((entity) => entity.type === 'line' && entity.id.startsWith(`${transformed!.id}:`))).toBe(true);
  expect(exploded.entities.some((entity) => entity.type === 'text' && entity.text === 'D-03')).toBe(true);
});
