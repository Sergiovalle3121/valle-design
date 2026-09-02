import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * OLA 3 — la línea de comandos existe y DIBUJA.
 *
 * Hasta este cambio no había ninguna forma de teclear una orden. Lo que el
 * producto llamaba «línea de comandos» era un copiloto en lenguaje natural:
 * se escribía prosa, se pulsaba *Preview* y después *Aplicar*. Escribir `L` no
 * hacía nada porque `LINE` no existía como nombre en ningún sitio.
 *
 * Este golden fija el gesto de AutoCAD entero contra el producto de verdad:
 *
 *   L ⏎ · 0,0 ⏎ · @2000,0 ⏎ · @0,1500 ⏎ · C ⏎   → polilínea cerrada de 3 lados
 *   Espacio                                      → repite el último comando
 *   Esc                                          → cancela sin escribir nada
 *
 * Lo que se afirma es el DOCUMENTO CANÓNICO, no el aspecto del diálogo: qué
 * entidades nacieron, con qué coordenadas y en qué capa. Un diálogo que imprime
 * el prompt correcto y no crea geometría no prueba nada.
 *
 * Se teclea con el LIENZO enfocado, sin pulsar la caja: la primera tecla la
 * enfoca (editor-keyboard.ts, fase 0) e Intro devuelve el foco. Es lo que hace
 * que Supr y Ctrl+Z sigan siendo del dibujo entre orden y orden.
 */
function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [],
    history: [], modelSpace: { entityIds: [] }, paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
  };
}

async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 12_000, footprintH: 10_000, unit: 'mm', gridSize: 100,
  });
}

/**
 * Teclea con el LIENZO enfocado, como en AutoCAD: sin clic previo. La primera
 * tecla enfoca la caja (editor-keyboard.ts, fase 0) y el navegador inserta el
 * carácter; Intro envía la orden y DEVUELVE el foco al lienzo. `keyboard.type`,
 * no `press('Shift+2')`: medido que éste produce «2».
 */
async function type(page: Page, value: string) {
  const input = page.getByTestId('cad-command-input');
  await expect(input).not.toBeFocused();
  await page.keyboard.type(value);
  await expect(input).toHaveValue(value);
  await page.keyboard.press('Enter');
  await expect(input).not.toBeFocused();
}

/** Espera a que el EDITOR reconozca las entidades creadas hasta ahora. */
async function expectNativeCount(page: Page, total: number) {
  await expect(page.getByTestId('cad-native-document-count')).toHaveText(
    `Native ${total}`,
  );
}

test('la línea de comandos dibuja: L, coordenadas relativas, Cerrar, Espacio repite y Esc cancela', async ({
  context,
  page,
}) => {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');

  const commandLine = page.getByTestId('cad-command-line');
  await expect(commandLine).toBeVisible();

  // --- el alias resuelve y el prompt aparece ---------------------------------
  await type(page, 'L');
  const prompt = page.getByTestId('cad-command-prompt');
  await expect(prompt).toBeVisible();
  // El prompt de AutoCAD, con su opción entre corchetes y el atajo destacado.
  await expect(prompt).toContainText('punto');

  // --- se dibuja por coordenadas --------------------------------------------
  await type(page, '0,0');
  await type(page, '@2000,0');
  // Con un solo tramo trazado sólo cabe deshacerlo: cerrar todavía no significa
  // nada, y ofrecerlo sería mentir sobre lo que la orden acepta.
  await expect(page.getByTestId('cad-command-keyword-desHacer')).toBeVisible();
  await expect(page.getByTestId('cad-command-keyword-Cerrar')).toHaveCount(0);
  await type(page, '@0,1500');
  // Con dos tramos ya hay contorno que cerrar, y aparece la opción.
  await expect(page.getByTestId('cad-command-keyword-Cerrar')).toBeVisible();

  // --- Cerrar remata el contorno --------------------------------------------
  await type(page, 'C');
  await expect(prompt).toBeHidden();

  // Tres vértices encadenados y cerrados son TRES segmentos: 0,0 → 2000,0 →
  // 2000,1500 → 0,0. Es la comprobación que distingue «cerrar» de «terminar».
  await expectNativeCount(page, 3);

  // --- Ctrl+Z sigue siendo del lienzo aunque se acabe de teclear ---------------
  // Sin el blur tras Intro, Ctrl+Z era el historyUndo del navegador dentro de
  // la caja (medido) y el dibujo no se enteraba.
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('cad-native-document-count')).not.toHaveText('Native 3');
  await page.keyboard.press('Control+Shift+z');
  await expectNativeCount(page, 3);
  // --- Espacio DESDE EL LIENZO repite el último comando ----------------------
  await page.keyboard.press('Space');
  await expect(prompt).toBeVisible();
  // --- y Espacio durante LINE vale por Intro (termina el comando) ------------
  await type(page, '5000,5000');
  await type(page, '@1000,0');
  await page.keyboard.press('Space');
  await expect(prompt).toBeHidden();
  await expectNativeCount(page, 4);
  // --- Esc desde el lienzo cancela sin escribir --------------------------------
  await page.keyboard.press('Space');
  await expect(prompt).toBeVisible();
  await type(page, '7000,7000');
  await page.keyboard.press('Escape');
  await expect(prompt).toBeHidden();
  await expectNativeCount(page, 4);

  // --- lo dibujado es geometría canónica y persiste --------------------------
  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document.entities;
  expect(saved).toHaveLength(4);
  expect(saved.every((entity) => entity.type === 'line')).toBe(true);
  expect(saved.map((entity) => entity.layer)).toEqual(['0', '0', '0', '0']);
  // El contorno cerrado: cada segmento arranca donde acabó el anterior y el
  // último vuelve al origen. Si «Cerrar» sólo hubiera terminado el comando,
  // aquí habría dos segmentos y ninguno volvería a 0,0.
  const ends = saved.map((entity) =>
    entity.type === 'line' ? [entity.start, entity.end] : null,
  );
  expect(ends[2]?.[1]).toMatchObject({ x: 0, y: 0 });
});
