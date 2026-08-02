import { expect, test, type BrowserContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installMockBackend } from '../fixtures/mock-backend';
import { CadV1Backend, seedFootprint } from '../fixtures/cad-v1-backend';
import { loginAsMaster } from '../fixtures/session';
import type { CadDocument } from '../../src/lib/cad/cad-document';
import { cadTenantLayoutUri } from '../../src/lib/cad/cad-xrefs';
import { importDxfPrimitives } from '../../src/lib/cad/dxf-import';

const HOST_MODEL = 'AXOS-CAD-STUDIO';
const HOST_REVISION = 'UNIVERSAL';

function canonicalDocument(id: string, endX = 8_000): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [{ id, type: 'line', start: { x: 1_000, y: 1_000, z: 0 }, end: { x: endX, y: 5_000, z: 0 }, layer: '0' }],
    history: [], modelSpace: { entityIds: [id] }, paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
  };
}

// MIGRACIÓN R3: mock en la superficie v1 real, ahora MULTI-DOCUMENTO (el
// adaptador resuelve cada model@revision contra el listado y abre cada
// documento por id):
//  - host AXOS-CAD-STUDIO@UNIVERSAL (GET/PUT con CAS),
//  - fuente REF-PLANT@R1 (versión CAS arrancando en 1, reemplazable) para el
//    attach inicial y los compare/reload (la referencia conserva revision R1),
//  - fuente espejo REF-PLANT@UNIVERSAL para el attach OVERLAY posterior al
//    reload (el palette remonta y vuelve a la revisión por defecto
//    'UNIVERSAL' — el mock del origen ignoraba la revisión y respondía la
//    misma fuente para cualquiera; el espejo replica esa semántica),
//  - DENIED@UNIVERSAL cuya APERTURA responde el 403 real (el editor lo mapea
//    a "Permission denied", como en el origen),
//  - CYCLE@UNIVERSAL con la referencia de vuelta al host (detección de ciclos).
const FOOTPRINT = { footprintW: 12_000, footprintH: 9_000, unit: 'mm', gridSize: 100 };

async function installCadBackend(context: BrowserContext) {
  const cyclic = {
    ...canonicalDocument('cycle-line'),
    externalReferences: [{ id: 'back', name: 'Host', uri: cadTenantLayoutUri(`${HOST_MODEL}@${HOST_REVISION}`, 'LIVE'), loaded: false, assetId: `${HOST_MODEL}@${HOST_REVISION}`, mode: 'attachment' as const }],
  };
  const backend = new CadV1Backend([
    { model: HOST_MODEL, revision: HOST_REVISION, document: canonicalDocument('host-line') as unknown as Record<string, unknown>, version: 0, footprint: FOOTPRINT },
    { model: 'REF-PLANT', revision: 'R1', document: canonicalDocument('reference-line') as unknown as Record<string, unknown>, version: 1, footprint: FOOTPRINT },
    { model: 'REF-PLANT', revision: 'UNIVERSAL', document: canonicalDocument('reference-line') as unknown as Record<string, unknown>, version: 1, footprint: FOOTPRINT },
    { model: 'DENIED', revision: 'UNIVERSAL', document: null, openStatus: 403, openBody: { message: 'forbidden' } },
    { model: 'CYCLE', revision: 'UNIVERSAL', document: cyclic as unknown as Record<string, unknown>, version: 1, footprint: FOOTPRINT },
  ]);
  await backend.install(context);
  return {
    snapshot: () => {
      const host = backend.snapshotFor(HOST_MODEL, HOST_REVISION);
      return {
        host: host.document as unknown as CadDocument,
        hostVersion: host.version,
      };
    },
    changeSource(endX: number) {
      backend.replaceDocument(
        'REF-PLANT',
        'R1',
        seedFootprint(canonicalDocument('reference-line', endX) as unknown as Record<string, unknown>, FOOTPRINT),
      );
    },
    setSourceAvailable(value: boolean) {
      backend.setAvailable('REF-PLANT', 'R1', value);
    },
  };
}

async function openXrefs(page: import('@playwright/test').Page) {
  await page.getByTitle(/^BLOCK\/INSERT:/).click();
  await page.getByTestId('cad-library-tab-xrefs').click();
  await expect(page.getByTestId('cad-xref-palette')).toBeVisible();
}

test('tenant Xrefs attach, compare, reload, unload, bind, detach and preserve honest DXF behavior', async ({ context, page }, testInfo) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsMaster(context);
  const backend = await installCadBackend(context);
  await page.goto('/studio');
  await expect(page.getByTestId('cad-native-entity-host-line')).toBeVisible();
  await openXrefs(page);

  await page.getByTestId('cad-xref-asset').fill('DENIED');
  await page.getByTestId('cad-xref-name').fill('Forbidden drawing');
  await page.getByTestId('cad-xref-attach').click();
  await expect(page.getByTestId('cad-xref-message')).toContainText('Permission denied');

  await page.getByTestId('cad-xref-asset').fill('REF-PLANT');
  await page.getByTestId('cad-xref-revision').fill('R1');
  await page.getByTestId('cad-xref-name').fill('Plant shell');
  await page.getByTestId('cad-xref-x').fill('2000');
  await page.getByTestId('cad-xref-y').fill('1500');
  await page.getByTestId('cad-xref-scale').fill('1.5');
  await page.getByTestId('cad-xref-attach').click();
  let row = page.getByTestId('cad-xref-row-REF-PLANT');
  await expect(row).toContainText('loaded');
  await expect(row).toContainText('REF-PLANT@R1');
  await expect(page.getByTestId('cad-xref-graph')).toContainText(`${HOST_MODEL}@${HOST_REVISION} → REF-PLANT`);

  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(() => backend.snapshot().hostVersion).toBe(1);
  const stored = backend.snapshot().host;
  expect(stored.externalReferences).toHaveLength(1);
  expect(stored.externalReferences[0]).toMatchObject({ assetId: 'REF-PLANT', revision: 'R1', mode: 'attachment', loaded: true, sourceVersion: 1 });
  expect(stored.externalReferences[0].uri).toMatch(/^tenant-layout:\/\//);
  expect(stored.externalReferences[0].contentHash).toMatch(/^[0-9a-f]{64}$/);
  expect(stored.entities.some((entity) => entity.id === stored.externalReferences[0].insertId && entity.type === 'insert')).toBe(true);

  await page.reload();
  await expect(page.getByTestId('cad-native-entity-host-line')).toBeVisible();
  await openXrefs(page);
  row = page.getByTestId('cad-xref-row-REF-PLANT');
  await expect(row).toBeVisible();

  backend.changeSource(10_500);
  await row.getByRole('button', { name: 'Compare' }).click();
  await expect(page.getByTestId('cad-xref-comparison')).toContainText('Version compare 1 → 2');
  await expect(page.getByTestId('cad-xref-comparison')).toContainText('~1 modified');
  await expect(row).toContainText('stale');
  await page.screenshot({ path: testInfo.outputPath('xref-stale-compare.png'), fullPage: true, scale: 'css' });
  await row.getByRole('button', { name: 'Reload' }).click();
  await expect(row).toContainText('v2');
  await expect(row).toContainText('loaded');

  backend.setSourceAvailable(false);
  await row.getByRole('button', { name: 'Compare' }).click();
  await expect(row).toContainText('missing');
  // ADAPTACIÓN R3 (documentada): el mock del origen respondía un 404 crudo que
  // el backend REAL nunca produce — el GET del layout legacy jamás 404ea por
  // modelo inexistente (devuelve el layout vacío), y el adaptador v1 conserva
  // esa semántica. Con la fuente retirada el editor recibe un layout sin
  // documento canónico y ese es el mensaje real de producción; el estado de la
  // fila sigue siendo 'missing' (aserción de arriba, intacta).
  await expect(page.getByTestId('cad-xref-message')).toContainText('no canonical CAD document');
  backend.setSourceAvailable(true);
  await row.getByRole('button', { name: 'Reload' }).click();
  await expect(row).toContainText('loaded');

  await row.getByRole('button', { name: 'Unload' }).click();
  await expect(row).toContainText('unloaded');
  await row.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(row).toContainText('loaded');

  await page.getByTitle(/Exportar a DXF/).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar DXF' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  const imported = importDxfPrimitives(await readFile(path!, 'utf8'));
  expect(imported.blocks.some((block) => block.name.includes('XREF|'))).toBe(true);
  expect(imported.inserts.some((insert) => insert.block.includes('XREF|'))).toBe(true);

  await row.getByRole('button', { name: 'Bind' }).click();
  await expect(page.getByTestId('cad-xref-row-REF-PLANT')).not.toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('cad-xref-row-REF-PLANT')).toBeVisible();
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByTestId('cad-xref-row-REF-PLANT')).not.toBeVisible();

  await page.getByTestId('cad-xref-mode').selectOption('overlay');
  await page.getByTestId('cad-xref-asset').fill('REF-PLANT');
  await page.getByTestId('cad-xref-attach').click();
  row = page.getByTestId('cad-xref-row-REF-PLANT');
  await expect(row).toContainText('overlay');
  await row.getByRole('button', { name: 'Detach' }).click();
  await expect(row).not.toBeVisible();

  await page.getByTestId('cad-xref-asset').fill('CYCLE');
  await page.getByTestId('cad-xref-name').fill('Cyclic drawing');
  await page.getByTestId('cad-xref-mode').selectOption('attachment');
  await page.getByTestId('cad-xref-attach').click();
  await expect(page.getByTestId('cad-xref-message')).toContainText('Xref cycle');
});
