import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installMockBackend } from '../fixtures/mock-backend';
import { loginAsMaster } from '../fixtures/session';
import { API_ORIGIN } from '../fixtures/constants';
import { importDxfPrimitives } from '../../src/lib/cad/dxf-import';

const MODEL = 'AXOS-CAD-STUDIO';
const REVISION = 'UNIVERSAL';

function canonicalDocument(radius = 120) {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [
      { id: '0', name: '0', color: '#ffffff', visible: true, locked: false },
      { id: 'CURVES', name: 'CURVES', color: '#60a5fa', visible: true, locked: false },
    ],
    entities: [
      {
        id: 'arc-e2e',
        type: 'arc',
        center: { x: 4_000, y: 3_000, z: 0 },
        radius,
        startAngle: 0,
        endAngle: 180,
        layer: 'CURVES',
        context: {
          businessLink: {
            tenantId: 'e2e-tenant',
            entityType: 'asset',
            entityId: 'ASSET-ARC-1',
          },
        },
      },
      {
        id: 'ellipse-e2e',
        type: 'ellipse',
        center: { x: 7_000, y: 4_000, z: 0 },
        majorAxis: { x: 800, y: 200, z: 0 },
        ratio: 0.45,
        startParameter: 0,
        endParameter: 360,
        layer: 'CURVES',
      },
      {
        id: 'spline-e2e',
        type: 'spline',
        degree: 2,
        controlPoints: [
          { x: 2_000, y: 6_000, z: 0 },
          { x: 4_000, y: 8_000, z: 0 },
          { x: 6_000, y: 6_000, z: 0 },
        ],
        knots: [0, 0, 0, 1, 1, 1],
        layer: 'CURVES',
      },
    ],
    history: [],
    modelSpace: { entityIds: ['arc-e2e', 'ellipse-e2e', 'spline-e2e'] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
  };
}

function layout(cadDocument: ReturnType<typeof canonicalDocument>, version: number) {
  return {
    model: MODEL,
    revision: REVISION,
    footprint: { footprintW: 12_000, footprintH: 10_000, unit: 'mm', gridSize: 100 },
    stations: [],
    dxf: null,
    connectors: [],
    assets: [],
    annotations: [],
    cells: [],
    layers: [],
    cadDocument,
    cadDocumentVersion: version,
    approval: { status: 'draft', by: null, at: null, note: null },
  };
}

async function installCadBackend(context: BrowserContext) {
  let currentDocument = canonicalDocument();
  let currentVersion = 0;
  await context.route(`${API_ORIGIN}/line-engineering/layout**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname !== '/line-engineering/layout') return route.fallback();
    if (request.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(layout(currentDocument, currentVersion)),
      });
    }
    if (request.method() === 'PUT') {
      const body = request.postDataJSON() as {
        cadDocument: ReturnType<typeof canonicalDocument>;
        expectedCadDocumentVersion: number;
      };
      if (body.expectedCadDocumentVersion !== currentVersion) {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'cad_document_version_conflict',
            message: 'El dibujo cambió desde la última carga. Recarga y compara antes de guardar.',
            expected: body.expectedCadDocumentVersion,
            current: currentVersion,
          }),
        });
      }
      currentDocument = body.cadDocument;
      currentVersion += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(layout(currentDocument, currentVersion)),
      });
    }
    return route.fallback();
  });
  return {
    snapshot: () => ({ document: currentDocument, version: currentVersion }),
  };
}

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test.describe('Golden path · CAD native entities', () => {
  test.beforeEach(async ({ context }) => {
    await installMockBackend(context);
    await loginAsMaster(context);
  });

  test('edits ARC, undo/redo, saves, reloads and round-trips native DXF', async ({ context, page }) => {
    const backend = await installCadBackend(context);
    const browserErrors = collectBrowserErrors(page);
    await page.goto('/dashboard/cad');

    await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();
    await expect(page.getByTestId('cad-native-entity-list')).toContainText('3');
    await page.getByTestId('cad-native-entity-arc-e2e').click();
    await expect(page.getByTestId('cad-native-properties')).toContainText('ARC');

    const radius = page.getByTestId('cad-native-property-radius');
    await expect(radius).toHaveValue('120');
    await radius.fill('140');
    await radius.blur();
    await expect(radius).toHaveValue('140');

    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('cad-native-property-radius')).toHaveValue('120');
    await page.keyboard.press('Control+Shift+z');
    await expect(page.getByTestId('cad-native-property-radius')).toHaveValue('140');

    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect.poll(() => backend.snapshot().version).toBe(1);
    const storedArc = backend.snapshot().document.entities.find((entity) => entity.id === 'arc-e2e');
    expect(storedArc?.type).toBe('arc');
    if (storedArc?.type === 'arc') {
      expect(storedArc.radius).toBe(140);
      expect(storedArc.context?.businessLink?.entityId).toBe('ASSET-ARC-1');
    }

    await page.reload();
    await page.getByTestId('cad-native-entity-arc-e2e').click();
    await expect(page.getByTestId('cad-native-property-radius')).toHaveValue('140');

    await page.getByTitle(/Exportar a DXF/).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar DXF' }).click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).not.toBeNull();
    const content = await readFile(path!, 'utf8');
    const reimported = importDxfPrimitives(content);
    expect(reimported.warnings).toEqual([]);
    const reimportedArc = reimported.primitives.find((primitive) => primitive.kind === 'arc');
    expect(reimportedArc?.radius).toBe(140);
    expect(reimported.primitives.some((primitive) => primitive.kind === 'ellipse')).toBe(true);
    expect(reimported.primitives.some((primitive) => primitive.kind === 'spline')).toBe(true);
    expect(browserErrors).toEqual([]);
  });

  test('two browser sessions receive one typed revision conflict', async ({ context, page }) => {
    const backend = await installCadBackend(context);
    const second = await context.newPage();
    await Promise.all([page.goto('/dashboard/cad'), second.goto('/dashboard/cad')]);
    await Promise.all([
      page.getByTestId('cad-native-entity-arc-e2e').click(),
      second.getByTestId('cad-native-entity-arc-e2e').click(),
    ]);

    const firstRadius = page.getByTestId('cad-native-property-radius');
    await firstRadius.fill('150');
    await firstRadius.blur();
    const secondRadius = second.getByTestId('cad-native-property-radius');
    await secondRadius.fill('175');
    await secondRadius.blur();

    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect.poll(() => backend.snapshot().version).toBe(1);
    await second.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(second.getByText('El dibujo cambió desde la última carga. Recarga y compara antes de guardar.')).toBeVisible();
    expect(backend.snapshot().version).toBe(1);
    const storedArc = backend.snapshot().document.entities.find((entity) => entity.id === 'arc-e2e');
    expect(storedArc?.type === 'arc' ? storedArc.radius : null).toBe(150);
    await second.close();
  });
});
