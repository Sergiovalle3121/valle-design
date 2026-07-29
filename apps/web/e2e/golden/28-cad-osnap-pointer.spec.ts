import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { loginAsMaster } from '../fixtures/session';
import { API_ORIGIN } from '../fixtures/constants';

const cadDocument = {
  meta: { version: 1, schema: 3, unit: 'mm' },
  layers: [
    { id: '0', name: '0', color: '#ffffff', visible: true, locked: false },
    { id: 'SNAP', name: 'SNAP', color: '#60a5fa', visible: true, locked: false },
  ],
  entities: [
    { id: 'snap-horizontal', type: 'line', start: { x: 3_000, y: 3_000, z: 0 }, end: { x: 5_000, y: 3_000, z: 0 }, layer: 'SNAP' },
    { id: 'snap-vertical', type: 'line', start: { x: 4_500, y: 2_500, z: 0 }, end: { x: 4_500, y: 4_000, z: 0 }, layer: 'SNAP' },
    { id: 'snap-arc', type: 'arc', center: { x: 8_000, y: 5_000, z: 0 }, radius: 1_000, startAngle: 0, endAngle: 359.99, layer: 'SNAP' },
  ],
  history: [], modelSpace: { entityIds: ['snap-horizontal', 'snap-vertical', 'snap-arc'] }, paperSpaces: [],
  styles: { text: {}, dimension: {}, table: {}, plot: {} }, blocks: [], constraints: [],
  externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
};

async function installCadBackend(context: BrowserContext) {
  await context.route(`${API_ORIGIN}/line-engineering/layout**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/line-engineering/layout' || route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      model: 'AXOS-CAD-STUDIO', revision: 'UNIVERSAL',
      footprint: { footprintW: 12_000, footprintH: 10_000, unit: 'mm', gridSize: 100 },
      stations: [], dxf: null, connectors: [], assets: [], annotations: [], cells: [], layers: [],
      cadDocument, cadDocumentVersion: 0,
      approval: { status: 'draft', by: null, at: null, note: null },
    }) });
  });
}

async function worldPoint(page: Page, target: { x: number; y: number }) {
  const box = await page.getByTestId('cad-canvas').boundingBox();
  if (!box) throw new Error('CAD canvas has no bounding box');
  const coordinate = page.getByTestId('cad-cursor-coordinate');
  const sample = async (x: number, y: number) => {
    await page.mouse.move(x, y);
    await expect.poll(async () => coordinate.getAttribute('data-x')).not.toBe('');
    return { x: Number(await coordinate.getAttribute('data-x')), y: Number(await coordinate.getAttribute('data-y')) };
  };
  const screen = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const origin = await sample(screen.x, screen.y);
  const horizontal = await sample(screen.x + 80, screen.y);
  const vertical = await sample(screen.x, screen.y + 80);
  const a = (horizontal.x - origin.x) / 80; const b = (vertical.x - origin.x) / 80;
  const c = (horizontal.y - origin.y) / 80; const d = (vertical.y - origin.y) / 80;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-9) throw new Error('CAD world/screen transform is singular');
  const wx = target.x - origin.x; const wy = target.y - origin.y;
  return { x: screen.x + (d * wx - b * wy) / determinant, y: screen.y + (-c * wx + a * wy) / determinant };
}

test('LINE pointer HUD proves endpoint, midpoint, intersection, perpendicular and tangent OSNAP', async ({ context, page }) => {
  test.setTimeout(90_000);
  await installMockBackend(context);
  await loginAsMaster(context);
  await installCadBackend(context);
  await page.goto('/dashboard/cad');
  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();
  await page.getByTitle(/Vista superior/).click();
  await page.getByTitle(/Ajustar a la planta/).click();

  const probe = async (step: string, anchor: { x: number; y: number }, target: { x: number; y: number }, label: string) => {
    await test.step(step, async () => {
      await page.getByRole('button', { name: 'Line', exact: true }).click();
      const anchorScreen = await worldPoint(page, anchor);
      await page.mouse.click(anchorScreen.x, anchorScreen.y);
      const targetScreen = await worldPoint(page, target);
      await page.mouse.move(targetScreen.x, targetScreen.y);
      await expect(page.getByTestId('cad-live-prompt')).toContainText(label);
      await page.keyboard.press('Escape');
    });
  };

  await probe('8. Endpoint', { x: 1_000, y: 1_000 }, { x: 3_000, y: 3_000 }, 'extremo');
  await probe('9. Midpoint', { x: 1_000, y: 1_000 }, { x: 4_000, y: 3_000 }, 'medio');
  await probe('10. Intersection', { x: 1_000, y: 1_000 }, { x: 4_500, y: 3_000 }, 'intersección');
  await probe('11. Perpendicular', { x: 3_500, y: 5_000 }, { x: 3_500, y: 3_000 }, 'perpendicular');
  await probe('12. Tangent', { x: 8_000, y: 8_000 }, { x: 8_943, y: 5_333 }, 'tangente');
});
