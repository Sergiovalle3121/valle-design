import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { fitFootprint } from '../fixtures/camera-preset';
import { saveAndSettle } from '../fixtures/cad-save';
import { worldPoint } from '../fixtures/world-point';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * RECONOCIMIENTO: lo que un usuario de AutoCAD busca con los ojos y con los
 * dedos, y que la prueba de los diez segundos no cubre.
 *
 * El golden 85 mide los diez gestos del informe. Éste mide los otros tres
 * reflejos que la auditoría del 1 de septiembre dejó abiertos y la Ola 1 cierra:
 *
 *   · un ICONO POR COMANDO en la cinta (había uno por panel: veintiséis
 *     órdenes de «Modificar» con la misma llave inglesa);
 *   · el SELECTOR DE ESCALA DE ANOTACIÓN de la barra de estado, y que mover el
 *     selector cambie de verdad lo que mide un rótulo anotativo en el modelo;
 *   · Ctrl+2 y Ctrl+3, los dos atajos de paleta que faltaban del juego.
 *
 * Y el doble clic sobre un TEXT, que el 85 sólo comprueba sobre un MTEXT.
 *
 * Todo se afirma sobre el DOM real o sobre el documento que recibe el
 * servidor; ninguna aserción mira una captura.
 */
function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [
      {
        id: 'rotulo',
        type: 'text',
        x: 2_000,
        y: 2_000,
        text: 'SALA',
        height: 999,
        layer: '0',
        // Anotativa: 2,5 mm sobre el papel, que es la altura de la norma
        // mexicana para un rótulo de local.
        context: { metadata: { annotativeHeightMm: 2.5 } },
      },
    ],
    history: [], modelSpace: { entityIds: ['rotulo'] }, paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
  } as unknown as CadDocument;
}

async function openPlan(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 8_000, footprintH: 6_000, unit: 'mm', gridSize: 100,
  });
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-canvas')).toBeVisible();
  const skip = page.getByTestId('cad-guided-tour-skip');
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.getByTitle(/Vista de plano 2D/).click();
  await fitFootprint(page);
  return backend;
}

/** La huella del dibujo del icono de un botón de la cinta: su primer `path`. */
async function iconOf(page: Page, command: string): Promise<string> {
  const button = page.getByTestId(`cad-ribbon-command-${command}`);
  await expect(button).toBeVisible();
  return (
    (await button.locator('svg').first().innerHTML()) || `sin-svg-${command}`
  );
}

test('la cinta da un icono por comando, la barra de estado da la escala de anotación y Ctrl+2/3 abren sus paletas', async ({
  context,
  page,
}) => {
  test.setTimeout(240_000);
  const backend = await openPlan(context, page);

  // ── 1 · UN ICONO POR COMANDO, no uno por panel ────────────────────────────
  //
  // Se comparan órdenes DEL MISMO PANEL: si el icono siguiera saliendo del
  // panel, las tres serían idénticas y esta aserción es la única que lo ve.
  const dibujo = await Promise.all([iconOf(page, 'LINE'), iconOf(page, 'CIRCLE'), iconOf(page, 'ARC')]);
  expect(new Set(dibujo).size, 'LINE, CIRCLE y ARC son del panel Dibujo y no pueden compartir icono').toBe(3);
  const modificar = await Promise.all([
    iconOf(page, 'MOVE'),
    iconOf(page, 'COPY'),
    iconOf(page, 'ROTATE'),
    iconOf(page, 'TRIM'),
    iconOf(page, 'ERASE'),
  ]);
  expect(new Set(modificar).size, 'las cinco órdenes más usadas de Modificar tampoco').toBe(5);

  // ── 2 · EL SELECTOR DE ESCALA DE ANOTACIÓN ────────────────────────────────
  const escala = page.getByTestId('cad-status-annotation-scale');
  await expect(escala, 'la barra de estado tiene el selector de escala de anotación').toBeVisible();
  await expect(escala, 'y arranca en 1:50, la escala por defecto de un despacho mexicano').toHaveValue('50');

  // Elegir 1:100 tiene que CAMBIAR el documento: 2,5 mm de papel son 250
  // unidades de modelo a 1:100 (y 125 a 1:50). Se afirma sobre lo que el
  // servidor recibe, no sobre el aspecto del rótulo.
  await escala.selectOption('100');
  await saveAndSettle(page, backend);
  const guardado = backend.snapshot().document.entities.find((entity) => entity.id === 'rotulo');
  expect((guardado as unknown as { height: number }).height, '2,5 mm a 1:100 son 250 unidades de modelo').toBeCloseTo(250, 6);

  // ── 3 · Ctrl+2 y Ctrl+3 ───────────────────────────────────────────────────
  const log = page.getByTestId('cad-command-line-log');
  await page.mouse.click(
    Math.round((await page.getByTestId('cad-canvas').boundingBox())!.x + 60),
    Math.round((await page.getByTestId('cad-canvas').boundingBox())!.y + 60),
  );
  await page.keyboard.press('Control+2');
  await expect(log, 'Ctrl+2 arranca el DesignCenter').toContainText(/ADCENTER|origen/i);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+3');
  await expect(log, 'Ctrl+3 arranca las paletas de herramientas').toContainText(/paleta/i);
  await page.keyboard.press('Escape');

  // ── 4 · DOBLE CLIC SOBRE UN TEXT ──────────────────────────────────────────
  //
  // El golden 85 lo comprueba sobre un MTEXT (editor de párrafo); aquí sobre el
  // TEXT de una línea, que abre DDEDIT con el objeto ya designado — y ésa es la
  // diferencia que importa: dos clics NO tienen que pedir «Designe el objeto».
  await fitFootprint(page);
  const sobreRotulo = await worldPoint(page, { x: 2_100, y: 1_950 });
  await page.mouse.dblclick(sobreRotulo.x, sobreRotulo.y);
  await expect(
    page.getByTestId('cad-command-prompt'),
    'el doble clic sobre un TEXT pide el texto nuevo, no que se designe lo que ya se señaló',
  ).toContainText('texto');
});
