import { expect, test, type BrowserContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
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

// MIGRACIÓN R3: mock en la superficie v1 real (el adaptador R2 reescribe las
// rutas legacy antes de tocar la red). Mismo documento, misma huella y mismo
// CAS contractual. Interfaz snapshot() intacta.
async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, canonicalDocument(), {
    footprintW: 12_000, footprintH: 10_000, unit: 'mm', gridSize: 100,
  });
}

test('associated DIMENSION follows source edits, survives undo/reload/DXF and reports broken refs', async ({ context, page }) => {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');

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

  const firstSavedVersion = await saveAndSettle(page, backend);
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
  const secondSavedVersion = await saveAndSettle(page, backend);
  expect(secondSavedVersion).toBeGreaterThan(firstSavedVersion);
  const broken = backend.snapshot().document.entities.find((entity): entity is CadDimension => entity.type === 'dimension');
  expect(broken?.associationStatus).toBe('broken');
});
