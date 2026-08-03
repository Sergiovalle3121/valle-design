import { expect, test, type BrowserContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import type { CadDocument, CadEntity } from '../../src/lib/cad/cad-document';
import { importDxfPrimitives } from '../../src/lib/cad/dxf-import';

type CadArc = Extract<CadEntity, { type: 'arc' }>;

function canonicalDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: 'WALLS', name: 'WALLS', color: '#a78bfa', visible: true, locked: false }],
    entities: [
      { id: 'fillet-horizontal', type: 'line', start: { x: 4_000, y: 4_000, z: 0 }, end: { x: 8_000, y: 4_000, z: 0 }, layer: 'WALLS' },
      { id: 'fillet-vertical', type: 'line', start: { x: 4_000, y: 4_000, z: 0 }, end: { x: 4_000, y: 8_000, z: 0 }, layer: 'WALLS' },
    ],
    history: [], modelSpace: { entityIds: ['fillet-horizontal', 'fillet-vertical'] }, paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} }, blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
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

test('FILLET trims two LINE entities and persists a tangent semantic ARC atomically', async ({ context, page }, testInfo) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-native-entity-fillet-horizontal')).toBeVisible();

  await page.getByTitle(/Selección profesional/).click();
  const palette = page.getByTestId('cad-selection-palette');
  await palette.getByLabel('Filtrar por tipo').selectOption('line');
  await page.getByTestId('cad-quick-select-apply').click();
  await expect(page.getByTestId('cad-selection-count')).toHaveText('2 seleccionados');
  await page.getByLabel('Cerrar panel profesional').click();

  const fillet = page.getByTestId('cad-fillet-control');
  await expect(fillet).toBeVisible();
  await page.getByTestId('cad-fillet-radius').fill('500');
  await page.getByTestId('cad-fillet-apply').click();
  await expect(page.getByTestId('cad-native-properties')).toContainText('ARC');
  await expect(page.getByTestId('cad-native-property-radius')).toHaveValue('500');
  await expect(page.getByTestId('cad-native-property-centerX')).toHaveValue('4500');
  await expect(page.getByTestId('cad-native-property-centerY')).toHaveValue('4500');

  const arcId = backend.snapshot().document.entities.find((entity) => entity.type === 'arc')?.id;
  expect(arcId).toBeUndefined();
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId(/^cad-native-entity-fillet-/)).toHaveCount(2);
  await page.keyboard.press('Control+Shift+z');
  await page.getByTestId('cad-native-entity-list').getByRole('button').filter({ hasText: 'ARC' }).click();
  await expect(page.getByTestId('cad-native-properties')).toContainText('ARC');

  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(() => backend.snapshot().version).toBe(1);
  const stored = backend.snapshot().document;
  const storedArc = stored.entities.find((entity): entity is CadArc => entity.type === 'arc');
  expect(storedArc).toBeDefined();
  expect(storedArc?.radius).toBe(500);
  expect(storedArc?.context?.metadata).toMatchObject({ sourceType: 'FILLET', sourceIds: 'fillet-horizontal,fillet-vertical' });
  expect(stored.history.some((change) => change.label.includes('fillet:'))).toBe(true);
  expect(stored.entities.find((entity) => entity.id === 'fillet-horizontal')).toMatchObject({ start: { x: 4_500, y: 4_000 } });
  expect(stored.entities.find((entity) => entity.id === 'fillet-vertical')).toMatchObject({ start: { x: 4_000, y: 4_500 } });

  await page.reload();
  await page.getByTestId(`cad-native-entity-${storedArc!.id}`).click();
  await expect(page.getByTestId('cad-native-property-radius')).toHaveValue('500');
  await page.getByTitle(/Exportar a DXF/).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar DXF' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const imported = importDxfPrimitives(await readFile(path!, 'utf8'));
  const importedArc = imported.primitives.find((primitive) => primitive.kind === 'arc');
  expect(importedArc?.radius).toBe(500);
  await page.screenshot({ path: testInfo.outputPath('native-fillet.png'), fullPage: true, scale: 'css' });
});
