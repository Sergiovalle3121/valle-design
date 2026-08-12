import { expect, test, type BrowserContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import { migrateCadDocument, type CadDocument } from '../../src/lib/cad/cad-document';
import { importDxfPrimitives } from '../../src/lib/cad/dxf-import';

// MIGRACIÓN R3: mock en la superficie v1 real (el adaptador R2 reescribe las
// rutas legacy antes de tocar la red). Mismo documento, misma huella y mismo
// CAS contractual. Interfaz snapshot() intacta.
async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, migrateCadDocument({ meta: { version: 1, schema: 3, unit: 'mm' }, entities: [] }), {
    footprintW: 12_000, footprintH: 10_000, unit: 'mm', gridSize: 100,
  });
}

test('creates, edits, undoes, reloads and DXF round-trips semantic MTEXT', async ({ context, page }) => {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');

  await page.getByTitle(/^MTEXT:/).click();
  const editor = page.getByTestId('cad-mtext-editor');
  await expect(editor).toBeVisible();
  await page.getByTestId('cad-mtext-content').fill('Instrucción de proceso\nSegunda línea');
  await page.getByTestId('cad-mtext-width').fill('800');
  await page.getByTestId('cad-mtext-height').fill('80');
  await page.getByTestId('cad-mtext-rotation').fill('12');
  await page.getByTestId('cad-mtext-line-spacing').fill('1.4');
  await page.getByTestId('cad-mtext-columns').fill('2');
  await page.getByTestId('cad-mtext-alignment').selectOption('middle-center');
  await page.getByTestId('cad-mtext-paragraph').selectOption('center');
  await page.getByTestId('cad-mtext-bold').click();
  await page.getByTestId('cad-mtext-italic').click();
  await page.getByTestId('cad-mtext-underline').click();
  await page.getByTestId('cad-mtext-background-mask').click();
  await page.getByTestId('cad-mtext-save').click();

  const properties = page.getByTestId('cad-native-properties');
  await expect(properties).toContainText('MTEXT');
  await expect(page.getByTestId('cad-native-property-text')).toHaveValue('Instrucción de proceso\nSegunda línea');
  await page.getByTestId('cad-mtext-edit').click();
  await page.getByTestId('cad-mtext-content').fill('Instrucción editada\nSegunda línea');
  await page.getByTestId('cad-mtext-save').click();
  await expect(page.getByTestId('cad-native-property-text')).toHaveValue('Instrucción editada\nSegunda línea');
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('cad-native-property-text')).toHaveValue('Instrucción de proceso\nSegunda línea');
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByTestId('cad-native-property-text')).toHaveValue('Instrucción editada\nSegunda línea');

  await saveAndSettle(page, backend);
  const stored = backend.snapshot().document.entities.find((entity) => entity.type === 'mtext');
  expect(stored?.type).toBe('mtext');
  if (stored?.type === 'mtext') {
    expect(stored.width).toBe(800);
    expect(stored.height).toBe(80);
    expect(stored.rotation).toBe(12);
    expect(stored.columns).toBe(2);
    expect(stored.bold).toBe(true);
    expect(stored.italic).toBe(true);
    expect(stored.underline).toBe(true);
    expect(stored.backgroundMask).toBe(true);
  }

  await page.reload();
  const list = page.getByTestId('cad-native-entity-list');
  await expect(list).toContainText('MTEXT');
  await list.getByRole('button').filter({ hasText: 'MTEXT' }).click();
  await expect(page.getByTestId('cad-native-property-text')).toHaveValue('Instrucción editada\nSegunda línea');

  await page.getByTitle(/Exportar a DXF/).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar DXF' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const imported = importDxfPrimitives(await readFile(path!, 'utf8'));
  expect(imported.mtexts).toHaveLength(1);
  expect(imported.mtexts[0].text).toBe('Instrucción editada\nSegunda línea');
  expect(imported.mtexts[0].backgroundMask).toBe(true);
});
