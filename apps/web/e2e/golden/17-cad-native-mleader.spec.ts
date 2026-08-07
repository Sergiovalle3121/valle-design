import { expect, test, type BrowserContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import type { CadDocument, CadEntity } from '../../src/lib/cad/cad-document';
import { importDxfPrimitives } from '../../src/lib/cad/dxf-import';
import { applyNativeProperty } from '../fixtures/dynamic-input';

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

// MIGRACIÓN R3: mock en la superficie v1 real (el adaptador R2 reescribe las
// rutas legacy antes de tocar la red). Mismo documento, misma huella y mismo
// CAS contractual. Interfaz snapshot() intacta.
async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, canonicalDocument(), {
    footprintW: 12_000, footprintH: 10_000, unit: 'mm', gridSize: 100,
  });
}

test('MLEADER is unitary, associative, editable, persistent and DXF semantic', async ({ context, page }) => {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');

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
  await applyNativeProperty(page, 'endX', '6100');
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
