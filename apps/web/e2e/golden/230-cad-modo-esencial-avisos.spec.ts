import { expect, test, type Page } from '@playwright/test';
import { chooseDemoStart } from "../fixtures/demo-start";

/**
 * Golden 230 — MODO ESENCIAL: avisos en lenguaje llano.
 *
 * Hallazgo 10 del primer minuto (22-sep-2026): «Precise la primera esquina o
 * [Chaflán/Elevación/Empalme (F)/Grosor/ANcho]:» es gramática de AutoCAD. En
 * Esencial el MISMO paso del motor se enuncia llano —«Haz clic en la primera
 * esquina del rectángulo»—; no es otro motor: el texto del motor viaja en el
 * `title` del aviso y las opciones entre corchetes siguen disponibles como
 * botones y en Pro. La fila de comandos y el cursor vivo dicen lo mismo.
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

async function abrirDemo(page: Page, query = '') {
  await page.setViewportSize({ width: 1440, height: 769 });
  await navegadorNuevo(page);
  await page.goto(`/demo${query}`);
  await chooseDemoStart(page);
  await expect(page.getByTestId('cad-canvas')).toBeVisible({ timeout: 60_000 });
  const saltar = page.getByTestId('cad-guided-tour-skip');
  if (await saltar.count()) await saltar.click();
}

test('en Esencial el aviso de Rectángulo se lee en llano, conserva el texto del motor en el title y sus opciones como botones', async ({ page }) => {
  test.setTimeout(120_000);
  await abrirDemo(page);
  await page.getByTestId('cad-essential-tool-rect').click();
  const aviso = page.getByTestId('cad-command-prompt');
  await expect(aviso).toContainText(/Haz clic en la primera esquina/);
  await expect(aviso).not.toContainText('[');
  await expect(aviso).toHaveAttribute('title', /Precise la primera esquina o \[/);
  // Las opciones no se borran: siguen como botones Y siguen funcionando. Se
  // pulsa una y el motor avanza de paso, que es lo que prueba que la redacción
  // llana es una SEGUNDA REDACCIÓN del mismo paso y no otro camino.
  const chaflan = page.getByTestId('cad-command-keyword-Chaflán');
  await expect(chaflan, 'las opciones se esconden del texto, no se borran').toBeVisible();
  await chaflan.click();
  await expect(aviso, 'pulsar la opción avanza el comando').not.toContainText(/primera esquina/i);
  await page.keyboard.press('Escape');

  await page.getByTestId('cad-essential-tool-door').click();
  await expect(aviso, 'Puerta sin muros explica el orden de los pasos').toContainText(/Primero dibuja un muro/);
  await page.keyboard.press('Escape');
});

test('con ?cadUi=pro el aviso vuelve a la gramática completa del motor', async ({ page }) => {
  test.setTimeout(120_000);
  await abrirDemo(page, '?cadUi=pro');
  await page.getByTestId('cad-ribbon-command-RECTANG').click();
  await expect(page.getByTestId('cad-command-prompt')).toContainText('Precise la primera esquina o [');
  await page.keyboard.press('Escape');
});
