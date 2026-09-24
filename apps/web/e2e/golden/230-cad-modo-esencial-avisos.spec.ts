import { expect, test, type Page } from '@playwright/test';

/**
 * Golden 230 — MODO ESENCIAL: avisos en lenguaje llano.
 *
 * Hallazgo 10 del primer minuto (22-sep-2026): «Precise la primera esquina o
 * [Chaflán/Elevación/Empalme (F)/Grosor/ANcho]:» es gramática de AutoCAD. En
 * Esencial el MISMO paso del motor se enuncia llano —«Haz clic en la primera
 * esquina del rectángulo»—; no es otro motor: el mismo texto llano viaja en el
 * `title` del aviso y las opciones siguen disponibles como
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
  await expect(page.getByTestId('cad-canvas')).toBeVisible({ timeout: 60_000 });
  const saltar = page.getByTestId('cad-guided-tour-skip');
  if (await saltar.count()) await saltar.click();
}

test('en Esencial el aviso de Rectángulo se lee en llano y sus opciones siguen funcionando', async ({ page }) => {
  test.setTimeout(120_000);
  await abrirDemo(page);
  await expect(page.getByTestId('cad-command-input')).toHaveAttribute(
    'placeholder', 'Escribe una herramienta o usa los botones de arriba',
  );
  await page.getByTestId('cad-essential-tool-rect').click();
  const aviso = page.getByTestId('cad-command-prompt');
  await expect(aviso).toContainText(/Haz clic en la primera esquina/);
  await expect(aviso).not.toContainText('[');
  await expect(aviso).toHaveAttribute('title', /Haz clic en la primera esquina/);
  await expect(page.getByTestId('cad-command-active')).toHaveText('Rectángulo');
  await expect(page.getByTestId('cad-command-line-log')).toHaveAttribute('aria-hidden', 'true');
  // Las opciones no se borran: siguen como botones Y siguen funcionando. Se
  // pulsa una y el motor avanza de paso, que es lo que prueba que la redacción
  // llana es una SEGUNDA REDACCIÓN del mismo paso y no otro camino.
  const chaflan = page.getByTestId('cad-command-keyword-Chaflán');
  await expect(chaflan, 'las opciones se esconden del texto, no se borran').toBeVisible();
  await expect(chaflan).toHaveText('Cortar esquina');
  await expect(chaflan).toHaveAccessibleName('Cortar esquina');
  await chaflan.click();
  await expect(aviso, 'pulsar la opción avanza el comando').toContainText('Escribe la primera distancia para cortar la esquina');
  await page.keyboard.press('Escape');

  await page.getByTestId('cad-essential-tool-door').click();
  await expect(aviso, 'Puerta sin muros explica el orden de los pasos').toContainText(/Haz clic sobre el muro.*dibuja uno primero/);
  await expect(page.getByTestId('cad-command-active')).toHaveText('Puerta');
  await expect(page.getByTestId('cad-command-input')).toHaveAccessibleName('Entrada de dibujo');
  await expect(page.getByTestId('cad-command-keyword-alTura')).toHaveText('Altura');
  await page.getByTestId('cad-command-line').click({ button: 'right' });
  const menu = page.getByTestId('cad-command-context-menu');
  await expect(menu).toHaveAccessibleName('Opciones de dibujo');
  await expect(menu).toContainText('Opciones de «Puerta»');
  await expect(menu).not.toContainText(/\bDOOR\b/);
  await page.getByTestId('cad-command-input').focus();
  await page.keyboard.press('Escape');
  await page.getByTestId('cad-command-keyword-Anchura').click();
  await expect(aviso).toContainText('Escribe el ancho de la puerta');
  await page.keyboard.press('Escape');
});

test('Muro y Línea hablan en llano también después del primer punto y no anuncian códigos internos', async ({ page }) => {
  test.setTimeout(120_000);
  await abrirDemo(page);
  const canvas = page.getByTestId('cad-canvas');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('El lienzo no tiene medidas');
  const clickInDrawing = async (fractionX: number, fractionY: number) =>
    page.mouse.click(bounds.x + bounds.width * fractionX, bounds.y + bounds.height * fractionY);
  for (const [id, nombre, inicio, siguiente] of [
    ['wall', 'Muro', 'Haz clic donde empieza el muro', 'Haz clic donde sigue el muro'],
    ['line', 'Línea', 'Haz clic donde empieza la línea', 'Haz clic en el siguiente punto'],
  ] as const) {
    await page.getByTestId(`cad-essential-tool-${id}`).click();
    const aviso = page.getByTestId('cad-command-prompt');
    await expect(aviso).toContainText(inicio);
    await expect(aviso).toHaveAttribute('title', new RegExp(inicio));
    await expect(page.getByTestId('cad-command-active')).toHaveText(nombre);
    await expect(page.getByTestId(`cad-essential-tool-${id}`)).not.toHaveAttribute('title', /WALL|LINE/);
    await clickInDrawing(id === 'wall' ? 0.30 : 0.55, id === 'wall' ? 0.35 : 0.55);
    await expect(aviso).toContainText(siguiente);
    expect(await page.getByTestId('cad-command-line').innerText()).not.toMatch(/\b(?:WALL|LINE|Precise|Designe)\b/);
    await expect(page.getByTestId('cad-command-transcript-peek')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('cad-command-input')).not.toHaveAttribute('placeholder', /Espacio repite (?:WALL|LINE)/);
  }
  await page.getByTestId('cad-command-input').fill('L');
  await page.getByTestId('cad-command-input').press('Enter');
  await expect(page.getByTestId('cad-command-active')).toHaveText('Línea');
  await expect(page.getByTestId('cad-command-last-answer')).toHaveText('Línea');
  await page.keyboard.press('Escape');
});

test('con ?cadUi=pro el aviso vuelve a la gramática completa del motor', async ({ page }) => {
  test.setTimeout(120_000);
  await abrirDemo(page, '?cadUi=pro');
  await expect(page.getByTestId('cad-command-input')).toHaveAttribute('placeholder', /Comando: escribe una orden/);
  await page.getByTestId('cad-ribbon-command-RECTANG').click();
  await expect(page.getByTestId('cad-command-prompt')).toContainText('Precise la primera esquina o [');
  await expect(page.getByTestId('cad-command-prompt')).toHaveAttribute('title', /Precise la primera esquina o \[/);
  await page.keyboard.press('Escape');
});
