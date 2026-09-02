import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { fitFootprint } from '../fixtures/camera-preset';
import { worldPoint } from '../fixtures/world-point';
import { touchSession, touchTap, touchTwoFingerPan } from '../fixtures/touch';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * ARRASTRAR SOBRE EL FONDO DESIGNA, COMO EN AUTOCAD.
 *
 * Medido antes (Chromium, 2026-09-02): en 2D, modo «pick», un arrastre
 * izquierdo sin Shift alrededor de dos líneas dejaba «0 sel» y la cámara se
 * movía ~2550 unidades; el botón central hacía zoom (MIDDLE=DOLLY de fábrica
 * en OrbitControls). Este golden fija el reparto de AutoCAD:
 *
 *   izq→der sobre el fondo  → ventana (lo que queda dentro)
 *   der→izq sobre el fondo  → cruce (lo que toca)
 *   botón central           → encuadre
 *   dos dedos               → encuadre (un dedo designa por toque)
 *   preferencia «pan»       → el encuadre con izquierdo de antes
 *
 * La cámara se mide con el HUD de coordenadas (`cad-cursor-coordinate`): si el
 * centro del lienzo lee la misma coordenada antes y después, no se movió.
 */
function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [
      { id: 'baja', type: 'line', start: { x: 2_000, y: 2_000, z: 0 }, end: { x: 3_000, y: 2_000, z: 0 }, layer: '0' },
      { id: 'alta', type: 'line', start: { x: 2_000, y: 3_000, z: 0 }, end: { x: 3_000, y: 3_000, z: 0 }, layer: '0' },
    ],
    history: [], modelSpace: { entityIds: ['baja', 'alta'] }, paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
  };
}

async function openPlan(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 8_000, footprintH: 6_000, unit: 'mm', gridSize: 100,
  });
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-canvas')).toBeVisible();
  const skip = page.getByTestId('cad-guided-tour-skip');
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.getByTitle(/Vista de plano 2D/).click();
  await fitFootprint(page);
}

/**
 * Lo que el HUD lee en el centro del lienzo: la firma de la cámara.
 *
 * La lectura sólo vale cuando la cámara está QUIETA: «Ajustar a la planta» y
 * los presets animan la cámara con amortiguación, y una lectura tomada
 * mientras se asienta difiere de la siguiente por menos de un píxel. Medido
 * en CI (ca86fc6, Chromium): tras ajustar y tocar el fondo, 3995,03 contra
 * 3994,21 unidades —0,82 unidades, 0,12 px— y la aserción de «no se movió»
 * (0,5 unidades) lo cantaba como movimiento. Por eso, tras la lectura del
 * destino, se exige que dos lecturas seguidas del MISMO píxel coincidan: si
 * la cámara sigue asentándose, difieren, y se espera.
 */
async function hudAtCenter(page: Page) {
  const box = (await page.getByTestId('cad-canvas').boundingBox())!;
  const center = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  const hud = page.getByTestId('cad-cursor-coordinate');
  const read = async () => `${await hud.getAttribute('data-x')}|${await hud.getAttribute('data-y')}`;
  await page.mouse.move(center.x - 4, center.y - 4);
  const neighbour = await read();
  await page.mouse.move(center.x, center.y);
  await expect.poll(read, { timeout: 15_000 }).not.toBe(neighbour);
  let settled = await read();
  await expect
    .poll(
      async () => {
        await page.mouse.move(center.x - 4, center.y - 4);
        await page.mouse.move(center.x, center.y);
        const again = await read();
        const same = again === settled;
        settled = again;
        return same;
      },
      { message: 'la cámara no se asentó: dos lecturas seguidas del centro difieren', timeout: 15_000 },
    )
    .toBe(true);
  const [x, y] = settled.split('|').map(Number);
  return { center, x, y };
}

async function dragWorld(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, button: 'left' | 'middle' = 'left') {
  const a = await worldPoint(page, from);
  const b = await worldPoint(page, to);
  // El arrastre nace SOBRE EL LIENZO, no sobre un panel que flote encima.
  await expect
    .poll(() => page.evaluate(([x, y]) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-testid="cad-canvas"]') !== null, [a.x, a.y]))
    .toBe(true);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down({ button });
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up({ button });
}

const selection = (page: Page) => page.getByTestId('cad-selection-status-count');

test('arrastrar sobre el fondo designa por ventana o cruce; el botón central y dos dedos encuadran', async ({ context, page }) => {
  test.setTimeout(240_000);
  await openPlan(context, page);

  // ---- a. VENTANA izq→der alrededor de las dos líneas: designa y NO mueve la cámara
  const before = await hudAtCenter(page);
  await dragWorld(page, { x: 1_500, y: 1_500 }, { x: 3_500, y: 3_500 });
  await expect(selection(page)).toContainText('2 sel');
  const afterWindow = await hudAtCenter(page);
  expect(afterWindow.x, 'la cámara no se movió (medido antes: −2550 unidades)').toBeCloseTo(before.x, 0);
  expect(afterWindow.y).toBeCloseTo(before.y, 0);

  // ---- b. CRUCE der→izq que sólo TOCA la línea baja: designa una
  await page.mouse.click(afterWindow.center.x, afterWindow.center.y);
  await expect(selection(page)).toContainText('0 sel');
  await dragWorld(page, { x: 2_500, y: 2_500 }, { x: 1_500, y: 1_500 });
  await expect(selection(page)).toContainText('1 sel');

  // ---- c. BOTÓN CENTRAL: encuadra y no toca la selección
  const beforePan = await hudAtCenter(page);
  await page.mouse.move(beforePan.center.x, beforePan.center.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(beforePan.center.x + 150, beforePan.center.y, { steps: 10 });
  await page.mouse.up({ button: 'middle' });
  const afterPan = await hudAtCenter(page);
  expect(Math.abs(afterPan.x - beforePan.x), 'el botón central encuadra (de fábrica hacía zoom)').toBeGreaterThan(100);
  await expect(selection(page)).toContainText('1 sel');

  // ---- d. DOS DEDOS siguen encuadrando y un TOQUE en el fondo limpia sin mover
  await fitFootprint(page);
  const cdp = await touchSession(page);
  const beforeTouch = await hudAtCenter(page);
  await touchTwoFingerPan(cdp, beforeTouch.center, { x: 120, y: 0 });
  const afterTouch = await hudAtCenter(page);
  expect(Math.abs(afterTouch.x - beforeTouch.x), 'dos dedos arrastran la vista: un dedo nunca abre ventana').toBeGreaterThan(60);
  await fitFootprint(page);
  const beforeTap = await hudAtCenter(page);
  await touchTap(cdp, { x: beforeTap.center.x + 40, y: beforeTap.center.y + 40 });
  await expect(selection(page)).toContainText('0 sel');
  const afterTap = await hudAtCenter(page);
  expect(afterTap.x).toBeCloseTo(beforeTap.x, 0);

  // ---- e. La preferencia «pan» devuelve el encuadre con izquierdo, persistida
  await page.getByTitle(/Workspace profesional/).click();
  await page.getByTestId('cad-workspace-background-drag').selectOption('pan');
  await page.getByLabel('Cerrar panel profesional').click();
  await fitFootprint(page);
  const beforeLegacy = await hudAtCenter(page);
  await dragWorld(page, { x: 1_500, y: 1_500 }, { x: 3_500, y: 3_500 });
  await expect(selection(page)).toContainText('0 sel');
  const afterLegacy = await hudAtCenter(page);
  expect(Math.abs(afterLegacy.x - beforeLegacy.x), 'con «pan» el arrastre izquierdo vuelve a encuadrar').toBeGreaterThan(100);

  // ---- f. «Seleccionar» de la paleta vuelve a la ventana; «Encuadre» al paneo
  await page.getByTestId('cad-toolbar').getByRole('button', { name: 'Seleccionar', exact: true }).click();
  await fitFootprint(page);
  await dragWorld(page, { x: 1_500, y: 1_500 }, { x: 3_500, y: 3_500 });
  await expect(selection(page)).toContainText('2 sel');
  await page.getByTestId('cad-toolbar').getByRole('button', { name: 'Encuadre', exact: true }).click();
  await page.getByTitle(/Workspace profesional/).click();
  await expect(page.getByTestId('cad-workspace-background-drag')).toHaveValue('pan');
});
