import { expect, test, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadV1Backend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { abrirPanelDerecho } from '../fixtures/docks';

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
  // Ola «armazón»: el appBar (cerrar + título + pestañas de la cinta) es UNA
  // fila de 32 px (`CAD_SHELL_METRICS.appBar`), no la barra de 48/56 más la
  // fila de pestañas aparte de antes. 40 px deja margen para bordes/redondeo
  // sin admitir que vuelva a crecer una segunda fila.
  expect(toolbar!.height).toBeLessThanOrEqual(40);
}

/**
 * EL LIENZO EN REPOSO — el número que de verdad importa. `assertDockedGeometry`
 * mide con una paleta profesional abierta (360 px de panel): un piso de
 * `>420 x >520` era todo lo que decía porque a esa anchura el lienzo nunca se
 * acerca al 74 %. En REPOSO (nada abierto, rieles plegados, cinta desplegada
 * — el estado con el que abre cualquiera) sí hay un contrato real que
 * defender: `cadShellCanvasBox` (`cad-shell-layout.spec.ts`) fija el 74 % a
 * 1440×825; este golden confirma que el DOM real lo cumple, no sólo la
 * función pura.
 */
async function assertLienzoEnReposo(page: Page, viewport: { width: number; height: number }) {
  const canvas = (await page.getByTestId('cad-canvas').boundingBox())!;
  const area = canvas.width * canvas.height;
  const piso = 0.74 * viewport.width * viewport.height;
  expect(
    area,
    `lienzo ${canvas.width}×${canvas.height} = ${Math.round(area)} px² en una ventana de ` +
      `${viewport.width}×${viewport.height} (${Math.round((area / (viewport.width * viewport.height)) * 100)} %); ` +
      `el contrato del armazón exige ≥74 %`,
  ).toBeGreaterThanOrEqual(piso);
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
  // Ola «armazón»: el panel derecho arranca plegado a un riel de iconos; la
  // lista de entidades sólo se MONTA con el panel abierto. Esta prueba no
  // afirma nada sobre el estado por defecto (eso lo hace la de abajo, «el
  // lienzo en reposo…»), así que abrirlo aquí es sólo la señal de que el
  // documento cargó.
  await abrirPanelDerecho(page);
  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();

  await page.getByTitle(/Workspace profesional/).click();
  const workspace = page.getByTestId('cad-workspace-dock');
  await expect(workspace).toContainText('Professional workspace');
  await page.getByTestId('cad-workspace-crosshairPercent').fill('64');
  await page.getByTestId('cad-workspace-pickBoxPx').fill('14');
  await page.getByTestId('cad-workspace-aperturePx').fill('18');
  await page.getByTestId('cad-workspace-shortcut-line').fill('Q');
  await page.getByTestId('cad-workspace-right-click').selectOption('context');
  // Con el muelle de comandos montado una letra suelta es de la línea de
  // comandos (editor-keyboard.ts, fase 0); el atajo personalizado se ejercita
  // con el muelle oculto, el único estado en el que sigue siendo del editor.
  await page.getByTestId('cad-workspace-commandDock').uncheck();
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
  // docs/history/audits/main-rojo-e2e-20260809.md §13: el cuelgue era inanición del
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

test('el lienzo en reposo se lleva el 74 % de la ventana a 1440×825', async ({ context, page }) => {
  test.setTimeout(120_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadBackend(context);
  const viewport = { width: 1440, height: 825 };
  await page.setViewportSize(viewport);
  await page.goto('/legacy/studio');
  // Señal de que el documento cargó. NO es `cad-native-entity-list`: esa
  // lista vive DENTRO del panel derecho y con los rieles plegados de fábrica
  // ni siquiera se monta — pedirla aquí contradecía la aserción de abajo
  // (`cad-right-dock` plegado) en el mismo reposo que esta prueba mide.
  await expect(page.getByTestId('cad-canvas')).toBeVisible();
  // Reposo real: nada abierto. Los rieles arrancan plegados de fábrica
  // (`leftDockCollapsed`/`rightDockCollapsed`) y la cinta, desplegada — el
  // estado en el que abre cualquiera, sin tocar nada.
  await expect(page.getByTestId('cad-left-dock')).toHaveAttribute('data-collapsed', 'true');
  await expect(page.getByTestId('cad-right-dock')).toHaveAttribute('data-collapsed', 'true');
  await expect(page.getByTestId('cad-ribbon')).toHaveAttribute('data-collapsed', 'false');
  await assertLienzoEnReposo(page, viewport);

  // Con la cinta minimizada el contrato sube a 78 % (`cad-shell-layout.spec.ts`).
  await page.getByTestId('cad-ribbon-collapse').click();
  await expect(page.getByTestId('cad-ribbon')).toHaveAttribute('data-collapsed', 'true');
  const canvasMinimizado = (await page.getByTestId('cad-canvas').boundingBox())!;
  const areaMinimizada = canvasMinimizado.width * canvasMinimizado.height;
  expect(areaMinimizada).toBeGreaterThanOrEqual(0.78 * viewport.width * viewport.height);
});
