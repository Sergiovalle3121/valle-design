import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * Golden 233 — DIBUJAS UN CUARTO Y VES SUS METROS.
 *
 * La meta del encargo, literal: «alguien que nunca vio VALLECAD dibuja una
 * habitación cerrada y ve sus m² en 60 segundos o menos». Medido el 2026-09-23
 * sobre la compilación de producción, ese último paso NO EXISTÍA: se dibujaba
 * un rectángulo de 5900 × 4000, entraba en el documento, quedaba designado…
 * y su superficie no aparecía en ninguna parte de la pantalla. La paleta de
 * propiedades —a un clic que nadie da en su primer minuto— decía «BOUNDS 5900
 * × 4000», que es la caja que lo contiene, no los metros cuadrados.
 *
 * Esta prueba fija las dos mitades del arreglo:
 *
 *  1. Al CERRAR la figura, el programa lo dice, y se lee sin desplegar nada:
 *     el diálogo de la línea de órdenes nace plegado a 0 px, así que la última
 *     respuesta se pinta al final del mismo renglón que ya existe.
 *  2. La paleta de propiedades enseña ÁREA y PERÍMETRO en lenguaje de obra,
 *     antes que los bounds, porque es lo que se viene a mirar.
 *
 * Se dibuja POR COORDENADAS y no con el ratón a propósito: 5900 × 4000 mm son
 * 23,60 m² exactos, así que la prueba puede exigir el número y no sólo el
 * formato. Que el ratón dibuja lo comprueba el golden 232.
 */

function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [],
    history: [],
    modelSpace: { entityIds: [] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

async function abrirEstudio(context: BrowserContext, page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 12_000,
    footprintH: 10_000,
    unit: 'mm',
    gridSize: 100,
  });
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-canvas')).toBeVisible({ timeout: 60_000 });
  const saltar = page.getByTestId('cad-guided-tour-skip');
  if (await saltar.count()) await saltar.click();
  await page.waitForTimeout(1_500);
}

/** Teclea una orden y sus puntos, como quien viene de AutoCAD. */
async function teclear(page: Page, pasos: readonly string[]) {
  const entrada = page.getByTestId('cad-command-input');
  await entrada.click();
  for (const paso of pasos) {
    await entrada.fill(paso);
    await entrada.press('Enter');
    await page.waitForTimeout(250);
  }
}

test('al cerrar un cuarto de 5,9 × 4 m, la pantalla dice 23.60 m² sin desplegar nada', async ({ context, page }) => {
  test.setTimeout(150_000);
  await abrirEstudio(context, page);

  // El diálogo de la línea de órdenes está PLEGADO: lo que se lea tiene que
  // leerse así, que es como lo ve quien nunca lo ha desplegado.
  await expect(page.getByTestId('cad-command-line-log')).not.toBeVisible();

  await teclear(page, ['RECTANG', '0,0', '5900,4000']);

  const respuesta = page.getByTestId('cad-command-last-answer');
  await expect(respuesta, 'la última respuesta del programa se queda a la vista').toBeVisible({
    timeout: 15_000,
  });
  await expect(
    respuesta,
    'un cuarto de 5900 × 4000 mm son 23,60 m², y se dicen en metros cuadrados, no en unidades de dibujo',
  ).toHaveText(/23\.60 m²/);
  await expect(respuesta, 'y también su perímetro, en metros').toHaveText(/19\.80 m/);
});

test('la paleta de propiedades enseña área y perímetro, antes que los bounds', async ({ context, page }) => {
  test.setTimeout(150_000);
  await abrirEstudio(context, page);
  await teclear(page, ['RECTANG', '0,0', '5900,4000']);

  // Designar todo deja el rectángulo —lo único que hay— en la paleta.
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(800);
  const riel = page.getByTestId('cad-rail-properties');
  if (await riel.count()) await riel.click();

  const area = page.getByTestId('cad-properties-area');
  await expect(area, 'la paleta dice el área de lo designado').toBeVisible({ timeout: 15_000 });
  await expect(area).toContainText('23.60 m²');
  const paleta = page.getByTestId('cad-properties-palette');
  await expect(paleta, 'y el perímetro, en metros').toContainText('19.80 m');

  // El orden importa: el área va ANTES que los bounds porque es lo que se
  // viene a mirar; «BOUNDS 5900 × 4000» era lo único que se decía hasta hoy.
  const texto = (await paleta.innerText()).replace(/\s+/g, ' ');
  expect(
    texto.indexOf('ÁREA') >= 0 && texto.indexOf('ÁREA') < texto.indexOf('BOUNDS'),
    `el área se lee antes que los bounds (paleta: ${texto.slice(0, 160)})`,
  ).toBe(true);
});
