import { expect, test, type Page } from '@playwright/test';

/**
 * Golden 231 — MODO ESENCIAL ESCONDE, NO BORRA: todo sigue a un paso.
 *
 * Sin cinta, cada comando del registro se alcanza por Ctrl+K (y por la línea
 * de comandos). Se comprueba con una muestra fija de veinte comandos que NO
 * están en la barra esencial, por su nombre canónico y, para los de la barra,
 * por su rótulo en español («Deshacer» encuentra U, «Muro» encuentra WALL).
 * El botón «Buscar» de la barra abre la misma paleta; no se crea ningún
 * envoltorio nuevo (los goldens 107/119/190 la localizan por su placeholder).
 */

const MUESTRA = [
  'ROTATE', 'TRIM', 'OFFSET', 'HATCH', 'LAYER', 'PLOT', 'MIRROR', 'ARRAY', 'FILLET', 'CHAMFER',
  'BLOCK', 'INSERT', 'DIST', 'LIST', 'UCS', 'FLATSHOT', 'DSETTINGS', 'LAYOUT', 'MTEXT', 'TABLE',
];

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

test('en Esencial Ctrl+K alcanza los comandos que la barra no enseña, y el rótulo en español encuentra los de la barra', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 769 });
  await navegadorNuevo(page);
  await page.goto('/demo');
  await expect(page.getByTestId('cad-canvas')).toBeVisible({ timeout: 60_000 });
  const saltar = page.getByTestId('cad-guided-tour-skip');
  if (await saltar.count()) await saltar.click();
  await expect(page.getByTestId('cad-ribbon')).toHaveCount(0);

  const buscador = page.getByPlaceholder('Buscar comando, herramienta o símbolo...');
  await page.keyboard.press('Control+k');
  await expect(buscador).toBeVisible();
  const primerResultado = buscador.locator('xpath=ancestor::div[2]').locator('button').first();
  // El texto del botón pega rótulo y descripción sin separador, y el rótulo va
  // primero: se ancla al inicio para exigir coincidencia exacta de nombre.
  const empiezaPor = (nombre: string) => new RegExp(`^${nombre}(?=[A-ZÁÉÍÓÚÑ(]|$)`);

  for (const nombre of MUESTRA) {
    await buscador.fill(nombre);
    await expect(primerResultado, `«${nombre}» aparece primero al buscarlo`).toHaveText(empiezaPor(nombre));
  }
  for (const [rotulo, nombre] of [
    ['Deshacer', 'U'],
    ['Rehacer', 'REDO'],
    ['Muro', 'WALL'],
    ['Borrar', 'ERASE'],
  ] as const) {
    await buscador.fill(rotulo);
    await expect(primerResultado, `«${rotulo}» encuentra ${nombre}`).toHaveText(empiezaPor(nombre));
  }
  await buscador.fill('Ajustar todo');
  await expect(primerResultado, 'las acciones de la paleta flotante siguen en Ctrl+K aunque la paleta no esté').toContainText(/Ajustar/);
  await page.keyboard.press('Escape');
  await expect(buscador).toBeHidden();

  await page.getByTestId('cad-essential-search').click();
  await expect(buscador, 'el botón «Buscar» de la barra abre la misma paleta').toBeVisible();
  await page.keyboard.press('Escape');
});
