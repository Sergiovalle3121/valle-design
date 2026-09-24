import { expect, test, type Page } from '@playwright/test';
import { chooseDemoStart } from "../fixtures/demo-start";

/**
 * Golden 229 — MODO ESENCIAL: dibujar con el ratón sin pelearse con la herramienta.
 *
 * Reproducido en producción el 2026-09-22 (hallazgo 2 del primer minuto): el
 * rastreo (OTRACK) adquiría puntos con sólo pasar el cursor y luego movía los
 * clics; los modos «extensión» y «cercano» imantaban el cursor a
 * prolongaciones invisibles; la píldora ORTO·DYN·X·Y aparecía encima del
 * lienzo y se comía el primer clic; y lo recién dibujado no se veía distinto.
 *
 * En Esencial, sin pisar los ajustes guardados de esa persona:
 *  1. Sólo extremo y punto medio encendidos; OTRACK apagado.
 *  2. Ningún campo de entrada dinámica se pinta sobre el lienzo durante el
 *     comando; la píldora Terminar/ORTO vive dentro de la barra esencial.
 *  3. Dos clics dibujan una línea, el conteo de entidades sube y lo dibujado
 *     queda designado (resaltado) al terminar.
 *  4. El cuadro de ayudas declara dos modos de catorce (extremo y punto
 *     medio) y «extensión» y «cercano» apagados, sin escribir la preferencia.
 * Con `?cadUi=pro` los ajustes de siempre siguen intactos (OTRACK encendido,
 * entrada dinámica visible).
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

async function conteoNativo(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="cad-native-document-count"]');
    const m = (el?.textContent ?? '').match(/\d+/);
    return m ? Number(m[0]) : -1;
  });
}

test('en Esencial se dibuja con el ratón: snaps útiles, sin rastreo, sin píldora sobre el lienzo, y lo dibujado queda resaltado', async ({ page }) => {
  test.setTimeout(150_000);
  await abrirDemo(page);
  await expect(page.getByTestId('cad-essential-bar')).toBeVisible();

  // 1. Ayudas: OTRACK apagado, OSNAP encendido.
  await page.getByTestId('cad-draft-aids-toggle').click();
  await expect(page.getByTestId('cad-draft-status-otrack')).toHaveAttribute('data-active', 'false');
  await expect(page.getByTestId('cad-draft-status-osnap')).toHaveAttribute('data-active', 'true');
  await page.getByTestId('cad-draft-aids-toggle').click();

  // 3. Dos clics dibujan una línea.
  const lienzo = (await page.getByTestId('cad-canvas').boundingBox())!;
  const x0 = lienzo.x + lienzo.width * 0.35;
  const y0 = lienzo.y + lienzo.height * 0.55;
  const x1 = lienzo.x + lienzo.width * 0.65;
  const y1 = y0;
  const antes = await conteoNativo(page);
  expect(antes, 'el contador de entidades nativas existe en el DOM').toBeGreaterThanOrEqual(0);

  await page.getByTestId('cad-essential-tool-line').click();
  await expect(page.getByTestId('cad-command-prompt')).toBeVisible();
  // La barra dice qué herramienta está armada, y sólo una. En reposo lo dice
  // «Seleccionar»; con Línea abierta, Línea. Sin esto, pulsar una herramienta
  // no cambiaba nada en pantalla y había que leer el aviso del borde inferior.
  await expect(
    page.getByTestId('cad-essential-tool-line'),
    'la herramienta armada se ve encendida',
  ).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId('cad-essential-tool-select')).not.toHaveAttribute('data-active', 'true');
  // 2. Nada flota sobre el lienzo: ni entrada dinámica ni píldora; el centro responde el canvas.
  await expect(page.getByTestId('cad-dynamic-input')).toHaveCount(0);
  const quienEnElCentro = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="cad-canvas"]')!.getBoundingClientRect();
    const el = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
    return el ? `${el.tagName.toLowerCase()}${el.getAttribute('data-testid') ? `[${el.getAttribute('data-testid')}]` : ''}` : 'nada';
  });
  expect(quienEnElCentro, 'en el centro del lienzo responde el canvas, no una píldora').toMatch(/^canvas/);

  await page.mouse.move(x0, y0);
  await page.mouse.click(x0, y0);
  await page.mouse.move(x1, y1);
  await page.mouse.click(x1, y1);
  // Con un tramo en curso, Terminar vive DENTRO de la barra esencial.
  const terminar = page.getByTestId('cad-draft-finish');
  await expect(terminar).toBeVisible();
  const cajaTerminar = (await terminar.boundingBox())!;
  const cajaBarra = (await page.getByTestId('cad-essential-bar').boundingBox())!;
  expect(cajaTerminar.y, 'Terminar está dentro de la barra esencial (no flota sobre el lienzo)').toBeGreaterThanOrEqual(cajaBarra.y - 1);
  expect(cajaTerminar.y + cajaTerminar.height).toBeLessThanOrEqual(cajaBarra.y + cajaBarra.height + 1);
  await page.keyboard.press('Enter');

  await expect
    .poll(() => conteoNativo(page), { message: 'la línea entra en el documento', timeout: 15_000 })
    .toBe(antes + 1);
  // «Queda resaltado» se mide donde se ve: el panel de propiedades nativas
  // sólo se monta cuando hay una entidad designada en el documento canónico.
  // Se abre con el mismo gesto que una persona, por el riel derecho.
  await page.getByTestId('cad-rail-properties').click();
  await expect(
    page.getByTestId('cad-native-properties'),
    'lo recién dibujado queda designado: el panel muestra sus propiedades sin volver a seleccionarlo',
  ).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('cad-rail-properties').click();

  // 4. El preset, leído donde el usuario puede verlo: el cuadro de ayudas dice
  // DOS modos de catorce —extremo y punto medio—, y las dos casillas que
  // imantaban el cursor a geometría invisible («extensión» pega a la
  // prolongación infinita de cualquier segmento; «cercano», al propio
  // segmento) están apagadas. Ésa era la causa del «no puedo hacer clic donde
  // quiero» del 22-sep, no una impresión.
  await page.getByTestId('cad-draft-aids-toggle').click();
  await page.getByTestId('cad-draft-status-settings').click();
  await expect(page.getByTestId('cad-draft-settings')).toBeVisible();
  await expect(page.getByTestId('cad-draft-settings-mode-count')).toHaveText('2/14');
  await expect(page.getByTestId('cad-osnap-mode-endpoint')).toBeChecked();
  await expect(page.getByTestId('cad-osnap-mode-midpoint')).toBeChecked();
  await expect(page.getByTestId('cad-osnap-mode-extension')).not.toBeChecked();
  await expect(page.getByTestId('cad-osnap-mode-nearest')).not.toBeChecked();
  await page.getByTestId('cad-draft-settings-close').click();

  // 5. Y la prueba de que el preajuste NO pisó los ajustes guardados: al pasar
  // a Pro con el interruptor, los catorce modos y el rastreo de esta persona
  // siguen ahí, sin que nadie los haya vuelto a marcar. El preajuste vivía en
  // memoria, no en la preferencia compartida.
  await page.getByTestId('cad-ui-mode-switch').click();
  await expect(page.getByTestId('cad-ribbon')).toBeVisible();
  await page.getByTestId('cad-draft-status-settings').click();
  await expect(page.getByTestId('cad-draft-settings-mode-count')).toHaveText('13/14');
  await expect(page.getByTestId('cad-osnap-mode-extension')).toBeChecked();
  await expect(page.getByTestId('cad-osnap-mode-nearest')).toBeChecked();
  await page.getByTestId('cad-draft-settings-close').click();
  await expect(page.getByTestId('cad-draft-status-otrack')).toHaveAttribute('data-active', 'true');
  await page.keyboard.press('Escape');
});

test('con ?cadUi=pro los ajustes de dibujo de siempre siguen intactos', async ({ page }) => {
  test.setTimeout(120_000);
  await abrirDemo(page, '?cadUi=pro');
  await expect(page.getByTestId('cad-ribbon')).toBeVisible();
  await expect(page.getByTestId('cad-draft-status-otrack')).toHaveAttribute('data-active', 'true');
  await page.getByTestId('cad-ribbon-command-LINE').click();
  await expect(page.getByTestId('cad-dynamic-input')).toBeVisible();
  await page.keyboard.press('Escape');
});
