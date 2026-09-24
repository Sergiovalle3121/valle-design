import { expect, test, type Page } from '@playwright/test';
import { chooseDemoStart } from "../fixtures/demo-start";

/**
 * Golden 227 — MODO ESENCIAL: una sola barra, cinta fuera de la vista.
 *
 * Tanda 1 del encargo del 22-sep-2026: quien abre /demo por primera vez (o una
 * cuenta que nunca abrió el estudio) ve UNA barra con doce herramientas con
 * icono y rótulo —Seleccionar, Muro, Puerta, Ventana, Línea, Rectángulo,
 * Círculo, Texto, Cota, Borrar, Deshacer, Rehacer—, no la cinta de 66
 * comandos. Esencial ESCONDE, no borra: el interruptor «Pro» devuelve la cinta
 * tal cual estaba (sus preferencias no se tocan) y `?cadUi=pro` la fuerza sin
 * persistir nada, que es como los goldens de Pro siguen midiendo /demo.
 *
 * Lo que se mide, en DOM:
 *  1. Sin parámetro y con contexto limpio: no hay `cad-ribbon`, hay
 *     `cad-essential-bar` de ≤56 px debajo de la fila superior, con los doce
 *     botones visibles y sus rótulos en español.
 *  2. La barra despacha comandos DEL MOTOR: Línea abre el prompt y el cursor
 *     vivo; Muro es WALL (no el muro heredado, que crea activos que Puerta y
 *     Ventana no reconocen).
 *  3. El interruptor cambia a Pro, la cinta vuelve desplegada, la elección
 *     sobrevive a un reload; «Más herramientas» también lleva a Pro.
 *  4. `?cadUi=pro` gana a la preferencia y NO se persiste.
 */

/**
 * Un navegador nuevo DE VERDAD: se retira la preferencia «pro» que
 * `playwright.config.ts` siembra para el resto de la suite (allí está el
 * porqué). Se hace una sola vez, antes de abrir el estudio, para medir el
 * arranque que ve una visita real a vallecad.com/demo.
 */
async function navegadorNuevo(page: Page) {
  await page.goto('/');
  await page.evaluate(() => {
    try {
      window.localStorage.removeItem('valle:cad:ui-mode:v1'); // preferencia de interfaz
    } catch {
      /* sin almacenamiento no hay nada que retirar */
    }
  });
}

const HERRAMIENTAS: Array<[string, string]> = [
  ['select', 'Seleccionar'],
  ['wall', 'Muro'],
  ['door', 'Puerta'],
  ['window', 'Ventana'],
  ['line', 'Línea'],
  ['rect', 'Rectángulo'],
  ['circle', 'Círculo'],
  ['text', 'Texto'],
  ['dim', 'Cota'],
  ['erase', 'Borrar'],
  ['undo', 'Deshacer'],
  ['redo', 'Rehacer'],
];

test('en /demo el estudio arranca en Esencial: una barra de doce herramientas y ninguna cinta', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 769 });
  await navegadorNuevo(page);
  await page.goto('/demo');
  await chooseDemoStart(page);
  await expect(page.getByTestId('cad-canvas')).toBeVisible({ timeout: 60_000 });
  const saltar = page.getByTestId('cad-guided-tour-skip');
  if (await saltar.count()) await saltar.click();

  await expect(page.getByTestId('cad-ribbon'), 'la cinta no se monta en Esencial').toHaveCount(0);
  await expect(page.getByTestId('cad-ribbon-tab-inicio')).toHaveCount(0);
  await expect(page.getByTestId('cad-ribbon-collapse')).toHaveCount(0);

  const barra = page.getByTestId('cad-essential-bar');
  await expect(barra).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Herramientas esenciales' })).toBeVisible();
  const caja = (await barra.boundingBox())!;
  const fila = (await page.getByTestId('cad-top-toolbar').boundingBox())!;
  expect(caja.height, 'la barra mide como mucho 56 px').toBeLessThanOrEqual(56);
  expect(caja.y, 'la barra va debajo de la fila superior, no encima del lienzo').toBeGreaterThanOrEqual(fila.y + fila.height - 1);
  expect(fila.height, 'la fila superior conserva su alto (golden 19)').toBeLessThanOrEqual(40);

  for (const [id, rotulo] of HERRAMIENTAS) {
    const boton = page.getByTestId(`cad-essential-tool-${id}`);
    await expect(boton, `botón «${rotulo}» visible`).toBeVisible();
    await expect(boton, `botón «${rotulo}» con su rótulo a la vista`).toContainText(rotulo);
  }

  // 2. Despacha comandos del motor.
  await page.getByTestId('cad-essential-tool-line').click();
  await expect(page.getByTestId('cad-command-prompt')).toContainText(/primer punto|empieza la línea/i);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('cad-command-prompt')).toHaveCount(0);
  await page.getByTestId('cad-essential-tool-wall').click();
  await expect(page.getByTestId('cad-command-prompt'), 'Muro es WALL del motor').toContainText(/muro/i);
  await page.keyboard.press('Escape');

  // 3. El interruptor lleva a Pro y la elección se recuerda.
  const interruptor = page.getByTestId('cad-ui-mode-switch');
  await expect(interruptor).toBeVisible();
  await expect(interruptor).toHaveAttribute('aria-checked', 'false');
  await interruptor.click();
  await expect(page.getByTestId('cad-ribbon')).toBeVisible();
  await expect(page.getByTestId('cad-ribbon')).toHaveAttribute('data-collapsed', 'false');
  await expect(barra).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('cad-canvas')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('cad-ribbon'), 'Pro sobrevive al reload').toBeVisible();
  // La cinta vuelve tal cual estaba: desplegada y en su pestaña. Esencial no
  // tocó sus preferencias, sólo dejó de pintarla.
  await expect(page.getByTestId('cad-ribbon')).toHaveAttribute('data-collapsed', 'false');
  await expect(page.getByTestId('cad-ribbon-panels-inicio')).toBeVisible();

  // De vuelta a Esencial con el mismo interruptor; «Más herramientas» vuelve a Pro.
  await page.getByTestId('cad-ui-mode-switch').click();
  await expect(barra).toBeVisible();
  await page.getByTestId('cad-essential-more').click();
  await expect(page.getByTestId('cad-ribbon')).toBeVisible();
});

test('?cadUi=pro fuerza la cinta en /demo sin persistir la preferencia', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 769 });
  await navegadorNuevo(page);
  await page.goto('/demo?cadUi=pro');
  await chooseDemoStart(page);
  await expect(page.getByTestId('cad-canvas')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('cad-ribbon')).toBeVisible();
  await expect(page.getByTestId('cad-essential-bar')).toHaveCount(0);
  // La URL no escribe la preferencia: al volver sin parámetro, Esencial otra vez.
  await page.goto('/demo');
  await expect(page.getByTestId('cad-canvas')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('cad-essential-bar')).toBeVisible();
  await expect(page.getByTestId('cad-ribbon')).toHaveCount(0);
});
