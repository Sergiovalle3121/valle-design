import { expect, test, type BrowserContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadV1Backend } from '../fixtures/cad-v1-backend';
import { loginAsMaster } from '../fixtures/session';
import type { CadDocument } from '../../src/lib/cad/cad-document';

function canonicalDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [
      { id: '0', name: '0', color: '#111827', visible: true, locked: false },
      { id: 'CURVES', name: 'CURVES', color: '#2563eb', visible: true, locked: false, lineweight: 0.25 },
    ],
    entities: [
      { id: 'layout-line', type: 'line', start: { x: 1_000, y: 1_000, z: 0 }, end: { x: 10_000, y: 7_500, z: 0 }, layer: '0' },
      { id: 'layout-arc', type: 'arc', center: { x: 5_000, y: 4_000, z: 0 }, radius: 1_200, startAngle: 0, endAngle: 270, layer: 'CURVES' },
    ],
    history: [], modelSpace: { entityIds: ['layout-line', 'layout-arc'] }, paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
  };
}

// MIGRACIÓN R3: mock en la superficie v1 real. Las publicaciones llegan como
// POST /v1/cad/documents/:id/publications (recibo plano v1 + CAS + recibo
// embebido server-managed, igual que la API real); el fixture captura los
// cuerpos en publicationRequests. Interfaz snapshot() intacta.
async function installCadBackend(context: BrowserContext) {
  const { backend, snapshot } = await installCadV1Backend(context, {
    document: canonicalDocument() as unknown as Record<string, unknown>,
    footprint: { footprintW: 12_000, footprintH: 9_000, unit: 'mm', gridSize: 100 },
  });
  return {
    snapshot: () => {
      const current = snapshot();
      return {
        document: current.document as unknown as CadDocument,
        version: current.version,
        publicationRequests: structuredClone(backend.publicationRequests),
      };
    },
  };
}

test('multiple paper viewports persist, preflight and publish as one audited vector sheet set', async ({ context, page }, testInfo) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsMaster(context);
  const backend = await installCadBackend(context);
  await page.goto('/studio');
  await expect(page.getByTestId('cad-native-entity-layout-line')).toBeVisible();

  await page.getByTitle(/Paquete de entrega/).click();
  await page.getByRole('button', { name: 'Demo 3 hojas' }).click();
  const manager = page.getByTestId('cad-layout-manager');
  await expect(manager).toContainText('Viewports · 1');
  await page.getByTestId('cad-viewport-add').click();
  await expect(manager).toContainText('Viewports · 2');

  await page.getByTestId('cad-viewport-name').fill('Detail viewport');
  await page.getByTestId('cad-viewport-custom-scale').fill('75');
  await page.getByTestId('cad-viewport-annotation-scale').fill('50');
  await page.getByTestId('cad-viewport-named-view').fill('MEZZANINE-NORTH');
  await page.getByTestId('cad-viewport-layer-CURVES').uncheck();
  await manager.getByLabel('Override lineweight 0').fill('0.5');

  const viewport = manager.locator('[data-testid^="cad-paper-viewport-"]').nth(1);
  const viewportStyle = await viewport.getAttribute('style');
  const viewportBox = await viewport.boundingBox();
  await page.mouse.move(viewportBox!.x + 20, viewportBox!.y + 28);
  await page.mouse.down();
  await page.mouse.move(viewportBox!.x + 48, viewportBox!.y + 48, { steps: 4 });
  await page.mouse.up();
  await expect(viewport).not.toHaveAttribute('style', viewportStyle!);

  const resizeGrip = manager.locator('[data-testid^="cad-viewport-resize-"]').nth(0);
  const gripBox = await resizeGrip.boundingBox();
  const movedStyle = await viewport.getAttribute('style');
  await page.mouse.move(gripBox!.x + gripBox!.width / 2, gripBox!.y + gripBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(gripBox!.x + 22, gripBox!.y + 14, { steps: 4 });
  await page.mouse.up();
  await expect(viewport).not.toHaveAttribute('style', movedStyle!);

  await page.getByTestId('cad-viewport-lock').click();
  await page.getByTestId('cad-page-margin-left').fill('12');
  await page.getByTestId('cad-layout-preview-build').click();
  const preview = page.getByTestId('cad-exact-print-preview');
  await expect(preview).toBeVisible();
  // The primary viewport renders both entities; CURVES is frozen only in the
  // second viewport, which therefore contributes the remaining line path.
  await expect(preview.locator('path')).toHaveCount(3);
  await expect(page.getByTestId('cad-layout-preflight')).toContainText('viewport_overlap');
  await page.screenshot({ path: testInfo.outputPath('multiple-viewports-preflight.png'), fullPage: true, scale: 'css' });

  const tabs = page.locator('[data-testid^="cad-layout-tab-"]');
  await tabs.nth(2).dragTo(tabs.nth(0));
  await page.getByLabel('Cerrar paquete de entrega').click();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(() => backend.snapshot().version).toBe(1);
  const storedGeneral = backend.snapshot().document.paperSpaces.find((space) => space.id === 'sheet-general')!;
  const storedViewport = storedGeneral.viewports?.find((candidate) => candidate.name === 'Detail viewport');
  expect(storedGeneral.viewports).toHaveLength(2);
  expect(storedViewport).toMatchObject({ scale: 75, annotationScale: 50, namedView: 'MEZZANINE-NORTH', locked: true });
  expect(storedViewport?.layerVisibility?.CURVES).toBe(false);
  expect(storedViewport?.layerOverrides?.['0']?.lineweight).toBe(0.5);
  expect(backend.snapshot().document.paperSpaces.map((space) => space.id)).toEqual(['sheet-detail-b', 'sheet-general', 'sheet-detail-a']);

  await page.reload();
  await expect(page.getByTestId('cad-native-entity-layout-line')).toBeVisible();
  await page.getByTitle(/Paquete de entrega/).click();
  await page.getByTestId('cad-layout-tab-sheet-general').click();
  await expect(page.getByTestId('cad-layout-manager')).toContainText('Viewports · 2');
  await page.getByRole('button', { name: 'Detail viewport' }).last().click();
  await expect(page.getByTestId('cad-viewport-custom-scale')).toHaveValue('75');
  await expect(page.getByTestId('cad-viewport-named-view')).toHaveValue('MEZZANINE-NORTH');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Publicar PDF/ }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const pdf = await readFile(downloadPath!);
  expect(pdf.byteLength).toBeGreaterThan(2_000);
  expect(backend.snapshot().publicationRequests).toHaveLength(1);
  expect(backend.snapshot().publicationRequests[0].paperSpaceIds).toEqual(['sheet-detail-b', 'sheet-general', 'sheet-detail-a']);
  expect(backend.snapshot().publicationRequests[0].sha256).toMatch(/^[0-9a-f]{64}$/);
});
