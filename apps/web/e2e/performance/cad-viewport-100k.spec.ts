import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { loginAsMaster } from '../fixtures/session';
import { API_ORIGIN } from '../fixtures/constants';

const MEDIUM_ENTITY_COUNT = 10_000;
const LARGE_ENTITY_COUNT = 100_000;

function cadDocumentOfSize(entityCount: number) {
  const entities = Array.from({ length: entityCount }, (_, index) => ({
    id: `perf-arc-${String(index).padStart(6, '0')}`,
    type: 'arc' as const,
    center: {
      x: (index % 1_000) * 20 + 10,
      y: Math.floor(index / 1_000) * 20 + 10,
      z: 0,
    },
    radius: 8,
    startAngle: 0,
    endAngle: 180,
    layer: 'PERF',
  }));
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [
      { id: '0', name: '0', color: '#ffffff', visible: true, locked: false },
      { id: 'PERF', name: 'PERF', color: '#60a5fa', visible: true, locked: false },
    ],
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
  };
}

async function installLargeCadBackend(context: BrowserContext, entityCount = LARGE_ENTITY_COUNT) {
  const cadDocument = cadDocumentOfSize(entityCount);
  const response = JSON.stringify({
    model: 'AXOS-CAD-PERF',
    revision: entityCount === LARGE_ENTITY_COUNT ? '100K' : '10K',
    footprint: { footprintW: 20_000, footprintH: 2_000, unit: 'mm', gridSize: 20 },
    stations: [],
    dxf: null,
    connectors: [],
    assets: [],
    annotations: [],
    cells: [],
    layers: [],
    cadDocument,
    cadDocumentVersion: 0,
    approval: { status: 'draft', by: null, at: null, note: null },
  });
  await context.route(`${API_ORIGIN}/line-engineering/layout**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/line-engineering/layout' || route.request().method() !== 'GET')
      return route.fallback();
    return route.fulfill({ status: 200, contentType: 'application/json', body: response });
  });
  return Buffer.byteLength(response);
}

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test.describe('CAD viewport performance · 10k/100k', () => {
  test.skip(process.env.CAD_PERF_E2E !== '1', 'Run explicitly with CAD_PERF_E2E=1.');
  test.setTimeout(180_000);

  test('opens and measures the 10k reference corpus', async ({ context, page }, testInfo) => {
    await installMockBackend(context);
    await loginAsMaster(context);
    const payloadBytes = await installLargeCadBackend(context, MEDIUM_ENTITY_COUNT);
    const browserErrors = collectBrowserErrors(page);
    const startedAt = Date.now();

    await page.goto('/dashboard/cad');
    await expect(page.getByTestId('cad-native-document-count')).toHaveText(`Native ${MEDIUM_ENTITY_COUNT}`, { timeout: 60_000 });
    const canonicalReadyMs = Date.now() - startedAt;
    const frameLatencyMs = await page.evaluate(() => new Promise<number>((resolve) => {
      const started = performance.now();
      requestAnimationFrame(() => resolve(performance.now() - started));
    }));
    const evidence = {
      corpus: { entities: MEDIUM_ENTITY_COUNT, payloadBytes },
      timingsMs: { canonicalReadyMs, frameLatencyMs },
    };
    await testInfo.attach('cad-viewport-performance-10k.json', {
      body: Buffer.from(JSON.stringify(evidence, null, 2)),
      contentType: 'application/json',
    });
    console.log(JSON.stringify(evidence));

    expect(canonicalReadyMs).toBeLessThan(30_000);
    expect(frameLatencyMs).toBeLessThan(1_000);
    expect(browserErrors).toEqual([]);
  });

  test('loads progressively, remains responsive and replans after zoom', async ({ context, page }, testInfo) => {
    await installMockBackend(context);
    await loginAsMaster(context);
    const payloadBytes = await installLargeCadBackend(context);
    const browserErrors = collectBrowserErrors(page);
    const startedAt = Date.now();

    await page.goto('/dashboard/cad');
    const stats = page.getByTestId('cad-native-render-stats');
    await expect(stats).toHaveAttribute('data-total', String(LARGE_ENTITY_COUNT), { timeout: 120_000 });
    const canonicalReadyMs = Date.now() - startedAt;
    await expect(stats).toHaveAttribute('data-batching', 'false', { timeout: 60_000 });
    const detailReadyMs = Date.now() - startedAt;
    const initialVisible = Number(await stats.getAttribute('data-visible'));
    const initialRendered = Number(await stats.getAttribute('data-rendered'));

    const frameLatencyMs = await page.evaluate(() => new Promise<number>((resolve) => {
      const started = performance.now();
      requestAnimationFrame(() => resolve(performance.now() - started));
    }));

    const zoomStartedAt = Date.now();
    const canvas = page.locator('canvas').first();
    await canvas.hover();
    await page.mouse.wheel(0, -2_400);
    await expect.poll(async () => Number(await stats.getAttribute('data-visible')), {
      timeout: 30_000,
      message: 'zoom must reduce the spatial-index viewport candidate set',
    }).toBeLessThan(initialVisible);
    await expect(stats).toHaveAttribute('data-batching', 'false', { timeout: 30_000 });
    const zoomSettleMs = Date.now() - zoomStartedAt;
    const zoomVisible = Number(await stats.getAttribute('data-visible'));
    const zoomRendered = Number(await stats.getAttribute('data-rendered'));
    await page.getByTitle(/Selecci.n profesional/).click();
    const palette = page.getByTestId('cad-selection-palette');
    await palette.getByTestId('cad-quick-select-text').fill('perf-arc-099999');
    await palette.getByTestId('cad-quick-select-apply').click();
    await expect(page.getByTestId('cad-selection-count')).toHaveText('1 seleccionados');
    await page.getByTitle(/Selecci.n profesional/).click();
    await expect(page.getByTestId('cad-native-properties')).toContainText('perf-arc-099999');
    const heap = await page.evaluate(() => {
      const memory = (performance as Performance & {
        memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
      }).memory;
      return memory ? {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
      } : null;
    });

    const evidence = {
      corpus: { entities: LARGE_ENTITY_COUNT, payloadBytes },
      timingsMs: { canonicalReadyMs, detailReadyMs, frameLatencyMs, zoomSettleMs },
      initial: { visible: initialVisible, rendered: initialRendered },
      zoom: { visible: zoomVisible, rendered: zoomRendered },
      heap,
    };
    await testInfo.attach('cad-viewport-performance.json', {
      body: Buffer.from(JSON.stringify(evidence, null, 2)),
      contentType: 'application/json',
    });
    console.log(JSON.stringify(evidence));

    expect(canonicalReadyMs).toBeLessThan(60_000);
    expect(detailReadyMs).toBeLessThan(90_000);
    expect(frameLatencyMs).toBeLessThan(1_000);
    expect(zoomSettleMs).toBeLessThan(30_000);
    expect(initialRendered).toBeLessThanOrEqual(2_500);
    expect(zoomRendered).toBeLessThanOrEqual(10_000);
    expect(browserErrors).toEqual([]);
  });
});
