import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadV1Backend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { enter3DView } from '../fixtures/view-mode';
import { topView, fitFootprint } from "../fixtures/camera-preset";

const cadDocument = {
  meta: { version: 1, schema: 3, unit: 'mm' },
  layers: [
    { id: '0', name: '0', color: '#ffffff', visible: true, locked: false },
    { id: 'CURVES', name: 'CURVES', color: '#60a5fa', visible: true, locked: false },
  ],
  entities: [
    { id: 'selection-arc', type: 'arc', center: { x: 4_000, y: 3_000, z: 0 }, radius: 120, startAngle: 0, endAngle: 180, layer: 'CURVES' },
    { id: 'selection-ellipse', type: 'ellipse', center: { x: 5_000, y: 3_000, z: 0 }, majorAxis: { x: 180, y: 0, z: 0 }, ratio: 0.45, startParameter: 0, endParameter: 360, layer: 'CURVES' },
  ],
  history: [],
  modelSpace: { entityIds: ['selection-arc', 'selection-ellipse'] },
  paperSpaces: [],
  styles: { text: {}, dimension: {}, table: {}, plot: {} },
  blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [],
};

// MIGRACIÓN R3: mock en la superficie v1 real (el adaptador R2 reescribe las
// rutas legacy antes de tocar la red). Mismo documento y huella del origen.
async function installCadBackend(context: BrowserContext, document: object = cadDocument) {
  await installCadV1Backend(context, {
    document: document as Record<string, unknown>,
    footprint: { footprintW: 12_000, footprintH: 10_000, unit: 'mm', gridSize: 100 },
  });
}

const spatialCadDocument = {
  ...cadDocument,
  entities: [
    { id: 'window-contained', type: 'line', start: { x: 2_000, y: 2_000, z: 0 }, end: { x: 2_400, y: 2_400, z: 0 }, layer: 'CURVES' },
    { id: 'crossing-only', type: 'line', start: { x: 2_500, y: 2_200, z: 0 }, end: { x: 4_000, y: 2_200, z: 0 }, layer: 'CURVES' },
    { id: 'lasso-contained', type: 'line', start: { x: 7_000, y: 7_000, z: 0 }, end: { x: 7_400, y: 7_400, z: 0 }, layer: 'CURVES' },
    { id: 'overlap-a', type: 'line', start: { x: 9_000, y: 2_000, z: 0 }, end: { x: 9_500, y: 2_500, z: 0 }, layer: 'CURVES' },
    { id: 'overlap-b', type: 'line', start: { x: 9_000, y: 2_000, z: 0 }, end: { x: 9_500, y: 2_500, z: 0 }, layer: 'CURVES' },
  ],
  modelSpace: { entityIds: ['window-contained', 'crossing-only', 'lasso-contained', 'overlap-a', 'overlap-b'] },
};

async function worldPoint(page: Page, target: { x: number; y: number }) {
  // El recorrido guiado de la primera vez puede tapar un punto de muestreo con
  // su botón «Saltar» (medido en el golden 39); se cierra antes de muestrear.
  const skip = page.getByTestId('cad-guided-tour-skip');
  if (await skip.isVisible().catch(() => false)) await skip.click();
  const canvas = page.getByTestId('cad-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('CAD canvas has no bounding box');
  const coordinate = page.getByTestId('cad-cursor-coordinate');
  const sample = async (x: number, y: number) => {
    await page.mouse.move(x, y);
    await expect.poll(async () => coordinate.getAttribute('data-x')).not.toBe('');
    return {
      x: Number(await coordinate.getAttribute('data-x')),
      y: Number(await coordinate.getAttribute('data-y')),
    };
  };
  const originScreen = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const origin = await sample(originScreen.x, originScreen.y);
  const horizontal = await sample(originScreen.x + 80, originScreen.y);
  const vertical = await sample(originScreen.x, originScreen.y + 80);
  const a = (horizontal.x - origin.x) / 80;
  const b = (vertical.x - origin.x) / 80;
  const c = (horizontal.y - origin.y) / 80;
  const d = (vertical.y - origin.y) / 80;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-9) throw new Error('CAD world/screen transform is singular');
  const wx = target.x - origin.x;
  const wy = target.y - origin.y;
  return {
    x: originScreen.x + (d * wx - b * wy) / determinant,
    y: originScreen.y + (-c * wx + a * wy) / determinant,
  };
}

async function dragWorld(page: Page, points: Array<{ x: number; y: number }>) {
  const screen = [];
  for (const point of points) screen.push(await worldPoint(page, point));
  await page.mouse.move(screen[0]!.x, screen[0]!.y);
  await page.mouse.down();
  for (const point of screen.slice(1)) await page.mouse.move(point.x, point.y, { steps: 8 });
  await page.mouse.up();
}

test('professional selection composes quick, add, previous, last, all and invert', async ({ context, page }) => {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadBackend(context);
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();

  await page.getByTitle(/Selección profesional/).click();
  const palette = page.getByTestId('cad-selection-palette');
  await expect(palette).toBeVisible();
  const count = page.getByTestId('cad-selection-count');

  await palette.getByLabel('Filtrar por tipo').selectOption('arc');
  await page.getByTestId('cad-quick-select-apply').click();
  await expect(count).toHaveText('1 seleccionados');

  await page.getByTestId('cad-selection-operation-add').click();
  await palette.getByLabel('Filtrar por tipo').selectOption('ellipse');
  await page.getByTestId('cad-quick-select-apply').click();
  await expect(count).toHaveText('2 seleccionados');

  await palette.getByRole('button', { name: 'Anterior' }).click();
  await expect(count).toHaveText('1 seleccionados');
  await page.getByTestId('cad-selection-operation-replace').click();
  await palette.getByRole('button', { name: 'Último' }).click();
  await expect(count).toHaveText('1 seleccionados');

  await palette.getByRole('button', { name: 'Todo', exact: true }).click();
  await expect(count).toHaveText('2 seleccionados');
  await palette.getByRole('button', { name: 'Invertir' }).click();
  await expect(count).toHaveText('0 seleccionados');
});

test('professional selection executes window, crossing, lasso and overlap cycling on the canvas', async ({ context, page }) => {
  // Cuatro encuadres de «Vista superior» con sondeo de afín asentada más los
  // arrastres: en un runner lento el total supera los 90 s históricos (el run
  // 31586424841 midió 96 s). El reloj es una suposición sobre la máquina, no
  // parte del contrato; el tope real sigue siendo el del job.
  test.setTimeout(240_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadBackend(context, spatialCadDocument);
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();

  const selectionTool = page.getByTitle(/Selecci.n profesional/);
  const statusCount = page.getByTestId('cad-selection-status-count');
  const setCanvasMode = async (mode: 'pick' | 'window' | 'crossing' | 'lasso', clear = true) => {
    await selectionTool.click();
    const palette = page.getByTestId('cad-selection-palette');
    await expect(palette).toBeVisible();
    if (clear && await palette.getByRole('button', { name: 'Limpiar' }).isEnabled()) await palette.getByRole('button', { name: 'Limpiar' }).click();
    await page.getByTestId(`cad-selection-mode-${mode}`).click();
    await selectionTool.click();
    await expect(palette).toBeHidden();
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await enter3DView(page);
    await topView(page);
    await fitFootprint(page);
  };

  await setCanvasMode('window');
  await dragWorld(page, [{ x: 1_800, y: 1_800 }, { x: 2_600, y: 2_600 }]);
  await expect(statusCount).toHaveText('1 sel');

  await setCanvasMode('crossing');
  await dragWorld(page, [{ x: 1_800, y: 1_800 }, { x: 2_600, y: 2_600 }]);
  await expect(statusCount).toHaveText('2 sel');

  await setCanvasMode('lasso');
  await dragWorld(page, [
    { x: 6_800, y: 6_800 },
    { x: 7_600, y: 6_800 },
    { x: 7_600, y: 7_600 },
    { x: 6_800, y: 7_600 },
    { x: 6_800, y: 6_800 },
  ]);
  await expect(statusCount).toHaveText('1 sel');

  await setCanvasMode('pick');
  const overlap = await worldPoint(page, { x: 9_150, y: 2_150 });
  await page.mouse.click(overlap.x, overlap.y);
  await expect(statusCount).toHaveText('1 sel');
  const properties = page.getByTestId('cad-native-properties');
  await expect(properties).toBeVisible();
  // El panel dejó de enseñar `cad_mt60y4ol_uzfo` donde el usuario mira para
  // saber qué designó: ahora dice «Línea 1» y el identificador técnico viaja
  // en el detalle de la celda. Se lee de ahí, que además es una aserción MÁS
  // exacta que buscar la cadena dentro del texto del panel entero.
  const identificador = properties.locator('[title^="Identificador técnico:"]');
  const first = await identificador.getAttribute('title');
  await page.mouse.click(overlap.x, overlap.y);
  await expect(statusCount).toHaveText('1 sel');
  const second = await identificador.getAttribute('title');
  expect(first).not.toBe(second);
  expect(`${first} ${second}`).toContain('overlap-a');
  expect(`${first} ${second}`).toContain('overlap-b');

  const gripStart = await worldPoint(page, { x: 9_000, y: 2_000 });
  const gripDestination = await worldPoint(page, { x: 8_800, y: 1_800 });
  await page.mouse.move(gripStart.x, gripStart.y);
  await page.mouse.down();
  await page.mouse.move(gripDestination.x, gripDestination.y, { steps: 8 });
  await page.mouse.up();
  const movedX = Number(await page.getByTestId('cad-native-property-startX').inputValue());
  const movedY = Number(await page.getByTestId('cad-native-property-startY').inputValue());
  expect(Math.abs(movedX - 8_800)).toBeLessThan(50);
  expect(Math.abs(movedY - 1_800)).toBeLessThan(50);
});
