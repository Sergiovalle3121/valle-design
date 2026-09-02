import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import type { CadDocument, CadEntity } from '../../src/lib/cad/cad-document';
import { importDxfPrimitives } from '../../src/lib/cad/dxf-import';

/**
 * FASE 1 — el informe de pérdidas se ve ANTES de descargar.
 *
 * El flujo era: generar Blob → `a.click()` → cerrar el modal → decir «Layout
 * exportado» → y SÓLO entonces calcular qué se había perdido. El usuario
 * recibía el fichero y el mensaje de éxito antes de saber que contenía menos
 * de lo que dibujó, y con el modal ya cerrado no quedaba dónde leer el detalle.
 *
 * Aquí se fija el orden invertido: las pérdidas se calculan con el mismo
 * alcance, selección, capas y opciones con los que se exportaría, se muestran
 * con su entidad y su severidad, y sólo después puede haber descarga.
 */

function document(entities: CadEntity[]): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [],
    unsupportedEntities: [], lossManifest: [], publications: [],
  };
}

/** Una línea plana: nada que perder en DXF. */
const flatLine: CadEntity = {
  id: 'flat', type: 'line',
  start: { x: 1_000, y: 1_000, z: 0 },
  end: { x: 5_000, y: 1_000, z: 0 },
  layer: '0',
};

/**
 * Un MTEXT ELEVADO. Desde la Ola C (2026-09-02) la cota de LINE, CIRCLE, ARC,
 * ELLIPSE y SPLINE viaja en el DXF (30/31), así que una línea elevada ya no
 * pierde nada y no hay informe que enseñar: antes este golden usaba una LINE a
 * z = 150 y el preflight se quedó sin motivo (medido en CI sobre 7bd0176). Un
 * texto sí se escribe sobre el plano del suelo: su cota se aplana a 0 y eso es
 * una degradación real, conocida y declarada.
 */
const elevatedNote: CadEntity = {
  id: 'elevated', type: 'mtext',
  insertion: { x: 1_000, y: 3_000, z: 150 },
  text: 'NIVEL +0.15',
  layer: '0',
};

async function openStudio(context: BrowserContext, page: Page, entities: CadEntity[]) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadStudioBackend<CadDocument>(context, document(entities), {
    footprintW: 12_000, footprintH: 10_000, unit: 'mm', gridSize: 100,
  });
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();
  return backend;
}

async function openExportModal(page: Page) {
  await page.getByTitle(/Exportar a DXF/).click();
  await expect(page.getByTestId('cad-dxf-download')).toBeVisible();
}

const manifest = (page: Page) => page.getByTestId('cad-dxf-loss-manifest');

/** Pulsa descargar y afirma que NO se produce ninguna descarga. */
async function expectNoDownload(page: Page) {
  let downloaded = false;
  const record = () => { downloaded = true; };
  page.on('download', record);
  await page.getByTestId('cad-dxf-download').click();
  // Margen suficiente para que una descarga real hubiese llegado.
  await page.waitForTimeout(1_500);
  page.off('download', record);
  expect(downloaded, 'no debe descargarse nada antes del preflight').toBe(false);
}

/* ══════════════════════════════════════════════════════════════════════════
   1. Con pérdidas: el manifiesto primero, la descarga después
   ══════════════════════════════════════════════════════════════════════════ */

test('a lossy DXF export shows its manifest before any download happens', async ({ context, page }) => {
  test.setTimeout(180_000);
  await openStudio(context, page, [flatLine, elevatedNote]);
  await openExportModal(page);

  await test.step('1. la primera pulsación NO descarga: enseña el informe', async () => {
    await expect(manifest(page)).toHaveCount(0);
    await expectNoDownload(page);

    await expect(manifest(page)).toBeVisible();
    // El modal sigue abierto: el detalle tiene dónde leerse.
    await expect(page.getByTestId('cad-dxf-download')).toBeVisible();
  });

  await test.step('2. el informe nombra la entidad, su severidad y el motivo', async () => {
    const rows = page.getByTestId('cad-dxf-loss-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('elevated');
    await expect(rows.first()).toContainText('warning');
    await expect(rows.first()).toContainText(/elevación Z/i);
    // Una degradación no bloquea; sólo tiene que verse antes.
    await expect(manifest(page)).toHaveAttribute('data-blocking', 'false');
    await expect(page.getByTestId('cad-dxf-download')).toBeEnabled();
  });

  await test.step('3. tras verlo, la descarga sí ocurre y conserva lo representable', async () => {
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('cad-dxf-download').click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).not.toBeNull();

    const dxf = await readFile(path!, 'utf8');
    const reimported = importDxfPrimitives(dxf);
    const lines = reimported.primitives.filter((primitive) => primitive.kind === 'line');
    expect(lines).toHaveLength(1);
    expect([lines[0].points[0].x, lines[0].points[1].x]).toEqual([1_000, 5_000]);
    // Exactamente lo que el informe anunció: el rótulo viaja (MTEXT con su
    // texto) y su Z no (código 30 = 0). Se lee el fichero, no una relectura:
    // el lector de primitivas deja el MTEXT al lector canónico.
    const mtextAt = dxf.indexOf('\nMTEXT\n');
    expect(mtextAt, 'el DXF lleva el MTEXT').toBeGreaterThan(-1);
    const mtext = dxf.slice(mtextAt, mtextAt + 600);
    expect(mtext).toContain('NIVEL +0.15');
    expect(mtext).toMatch(/\n30\n0\n/);
    expect(mtext).not.toMatch(/\n30\n150\n/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. Sin pérdidas: descarga directa, sin informe ni confirmación
   ══════════════════════════════════════════════════════════════════════════ */

test('a clean DXF export downloads on the first click with no manifest', async ({ context, page }) => {
  test.setTimeout(180_000);
  await openStudio(context, page, [flatLine]);
  await openExportModal(page);

  await expect(manifest(page)).toHaveCount(0);
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('cad-dxf-download').click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();

  // Un DXF limpio no inventa un informe.
  await expect(manifest(page)).toHaveCount(0);

  const reimported = importDxfPrimitives(await readFile(path!, 'utf8'));
  expect(reimported.primitives.filter((primitive) => primitive.kind === 'line')).toHaveLength(1);
});

/* ══════════════════════════════════════════════════════════════════════════
   3. Un contorno CERRADO sobrevive el viaje de ida y vuelta por el producto
   ══════════════════════════════════════════════════════════════════════════ */

test('a closed polyline exports as closed and reimports as closed', async ({ context, page }) => {
  test.setTimeout(180_000);
  const closedPolyline: CadEntity = {
    id: 'room', type: 'polyline',
    vertices: [
      { x: 1_000, y: 1_000, z: 0 },
      { x: 5_000, y: 1_000, z: 0 },
      { x: 5_000, y: 4_000, z: 0 },
      { x: 1_000, y: 4_000, z: 0 },
    ],
    closed: true,
    layer: '0',
  };
  await openStudio(context, page, [closedPolyline]);
  await openExportModal(page);

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('cad-dxf-download').click();
  const download = await downloadPromise;
  const text = await readFile((await download.path())!, 'utf8');

  // El bit 1 del grupo 70 viaja en el fichero, no un vértice repetido.
  expect(text).toMatch(/\n\s*70\n\s*1\s*\n/);
  expect((text.match(/\bVERTEX\b/g) ?? []).length).toBe(4);

  const reimported = importDxfPrimitives(text);
  const contour = reimported.primitives.find(
    (primitive) => primitive.kind === 'polyline' || primitive.kind === 'rect',
  );
  expect(contour).toBeDefined();
  expect(contour!.closed).toBe(true);
  expect(contour!.points).toHaveLength(4);
  expect(contour!.points.map((point) => [point.x, point.y])).toEqual([
    [1_000, 1_000],
    [5_000, 1_000],
    [5_000, 4_000],
    [1_000, 4_000],
  ]);
});
