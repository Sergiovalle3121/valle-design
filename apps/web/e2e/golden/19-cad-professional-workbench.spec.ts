import { expect, test, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadV1Backend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';

const cadDocument = {
  meta: { version: 1, schema: 3, unit: 'mm' },
  layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
  entities: [{ id: 'workbench-line', type: 'line', start: { x: 2_000, y: 2_000, z: 0 }, end: { x: 8_000, y: 5_000, z: 0 }, layer: '0' }],
  history: [], modelSpace: { entityIds: ['workbench-line'] }, paperSpaces: [],
  styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
  blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
};

// MIGRACIÓN R3: mock en la superficie v1 real; la biblioteca de bloques vacía
// la sirve el propio fixture (GET /v1/cad/blocks → {items: []}).
async function installCadBackend(context: BrowserContext) {
  await installCadV1Backend(context, {
    document: cadDocument,
    footprint: { footprintW: 12_000, footprintH: 10_000, unit: 'mm', gridSize: 100 },
  });
}

async function assertDockedGeometry(page: Page) {
  const canvas = await page.getByTestId('cad-canvas').boundingBox();
  const right = await page.getByTestId('cad-right-dock').boundingBox();
  const toolbar = await page.getByTestId('cad-top-toolbar').boundingBox();
  expect(canvas).not.toBeNull();
  expect(right).not.toBeNull();
  expect(toolbar).not.toBeNull();
  expect(canvas!.width).toBeGreaterThan(420);
  expect(canvas!.height).toBeGreaterThan(520);
  expect(canvas!.x + canvas!.width).toBeLessThanOrEqual(right!.x + 1);
  expect(toolbar!.height).toBeLessThanOrEqual(52);
}

async function capture(page: Page, testInfo: TestInfo, label: string) {
  await page.screenshot({ path: testInfo.outputPath(`${label}.png`), fullPage: true, scale: 'css' });
}

test.use({ deviceScaleFactor: 2 });

test('professional workbench persists, scales and keeps every palette outside the drawing', async ({ context, page }, testInfo) => {
  // 5 viewports hasta 3840×2160 con deviceScaleFactor 2 son framebuffers de
  // hasta 7680×4320 en SwiftShader: el runner de CI (2 núcleos, GL por
  // software) necesita más que los 180 s históricos para el MISMO contrato.
  test.setTimeout(420_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadBackend(context);
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();

  await page.getByTitle(/Workspace profesional/).click();
  const workspace = page.getByTestId('cad-workspace-dock');
  await expect(workspace).toContainText('Professional workspace');
  await page.getByTestId('cad-workspace-crosshairPercent').fill('64');
  await page.getByTestId('cad-workspace-pickBoxPx').fill('14');
  await page.getByTestId('cad-workspace-aperturePx').fill('18');
  await page.getByTestId('cad-workspace-shortcut-line').fill('Q');
  await page.getByTestId('cad-workspace-right-click').selectOption('context');
  await page.getByLabel('Cerrar panel profesional').click();

  const canvas = page.getByTestId('cad-canvas');
  const canvasBox = await canvas.boundingBox();
  await page.mouse.move(canvasBox!.x + canvasBox!.width / 2, canvasBox!.y + canvasBox!.height / 2);
  await expect(page.getByTestId('cad-crosshair')).toHaveCSS('display', 'block');
  await expect(page.getByTestId('cad-pick-box')).toHaveCSS('width', '14px');
  await expect(page.getByTestId('cad-snap-aperture')).toHaveCSS('width', '36px');
  await page.mouse.click(canvasBox!.x + canvasBox!.width / 2, canvasBox!.y + canvasBox!.height / 2, { button: 'right' });
  await expect(page.getByTestId('cad-context-menu')).toBeVisible();
  await page.getByRole('menuitem', { name: 'Enter / terminar' }).click();
  await page.keyboard.press('q');
  await expect(page.getByText('Tool: line')).toBeVisible();

  await page.reload();
  await page.getByTitle(/Workspace profesional/).click();
  await expect(page.getByTestId('cad-workspace-crosshairPercent')).toHaveValue('64');
  await expect(page.getByTestId('cad-workspace-shortcut-line')).toHaveValue('Q');
  await page.getByLabel('Theme').selectOption('light');
  await expect(page.locator('[data-color-scheme="light"]')).toBeVisible();
  await capture(page, testInfo, 'workbench-light-en');
  await page.getByLabel('Theme').selectOption('dark');
  await expect(page.locator('[data-color-scheme="dark"]')).toBeVisible();

  await context.addCookies([{ name: 'valle_locale', value: 'es', domain: 'localhost', path: '/', sameSite: 'Lax' }]);
  await page.reload();
  await page.getByTitle(/Workspace profesional/).click();
  await expect(page.getByTestId('cad-workspace-dock')).toContainText('Workspace profesional');
  await capture(page, testInfo, 'workbench-dark-es');
  await page.getByLabel('Cerrar panel profesional').click();

  await page.getByTitle(/^BLOCK\/INSERT:/).click();
  await expect(page.getByTestId('cad-block-palette')).toBeVisible();
  await assertDockedGeometry(page);
  const paletteBox = await page.getByTestId('cad-block-palette').boundingBox();
  const dockBox = await page.getByTestId('cad-right-dock').boundingBox();
  expect(paletteBox!.x).toBeGreaterThanOrEqual(dockBox!.x);
  expect(paletteBox!.x + paletteBox!.width).toBeLessThanOrEqual(dockBox!.x + dockBox!.width + 1);
  await page.getByLabel('Cerrar panel profesional').click();

  const viewports = [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
    { width: 3840, height: 2160 },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.getByTitle(/Workspace profesional/).click();
    await assertDockedGeometry(page);
    await capture(page, testInfo, `workbench-${viewport.width}x${viewport.height}-dark-es`);
    await page.getByLabel('Cerrar panel profesional').click();
  }

  // El contrato del perfil presentación —docks ocultos, canvas a sangre— es
  // independiente de la resolución, así que se mide a 1920. Medirlo a 3840 con
  // deviceScaleFactor 2 obligaba a SwiftShader a redimensionar el framebuffer
  // a 7680×4320 con el bucle de render continuo en marcha: cada frame tarda
  // segundos, las comprobaciones de Playwright (que van sobre rAF) se mueren de
  // hambre y el clic de cierre agota los 180 s. Es la «familia B» de
  // docs/audits/main-rojo-e2e-20260809.md §13: el cuelgue era inanición del
  // hilo principal, no un canvas desmontado (el div es incondicional).
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByTitle(/Workspace profesional/).click();
  await page.getByTestId('cad-workspace-profile-presentation').click();
  await page.getByLabel('Cerrar panel profesional').click();
  await expect(page.getByTestId('cad-left-dock')).toBeHidden();
  await expect(page.getByTestId('cad-right-dock')).toBeHidden();
  const presentationCanvas = await canvas.boundingBox();
  expect(presentationCanvas!.width).toBeGreaterThan(1_850);
});
