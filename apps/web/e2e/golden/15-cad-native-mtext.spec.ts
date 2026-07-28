import { expect, test, type BrowserContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installMockBackend } from '../fixtures/mock-backend';
import { loginAsMaster } from '../fixtures/session';
import { API_ORIGIN } from '../fixtures/constants';
import { migrateCadDocument, type CadDocument } from '../../src/lib/cad/cad-document';
import { importDxfPrimitives } from '../../src/lib/cad/dxf-import';

async function installCadBackend(context: BrowserContext) {
  let document: CadDocument = migrateCadDocument({ meta: { version: 1, schema: 3, unit: 'mm' }, entities: [] });
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

test('creates, edits, undoes, reloads and DXF round-trips semantic MTEXT', async ({ context, page }) => {
  await installMockBackend(context);
  await loginAsMaster(context);
  const backend = await installCadBackend(context);
  await page.goto('/dashboard/cad');

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

  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(() => backend.snapshot().version).toBe(1);
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
