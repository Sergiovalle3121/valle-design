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
 * De momento el puntero NO pasa por el motor: se dibuja tecleando. Esa frontera
 * es deliberada y está explicada en `Layout3DEditor.tsx`, junto al montaje.
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

/** Teclea en la línea de comandos y confirma, como se haría de verdad. */
async function type(page: Page, value: string) {
  const input = page.getByTestId('cad-command-input');
  await input.click();
  await input.fill(value);
  await input.press('Enter');
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

  // --- Espacio repite el último comando --------------------------------------
  const input = page.getByTestId('cad-command-input');
  await input.click();
  await input.press('Space');
  await expect(prompt).toBeVisible();

  // --- Esc cancela sin escribir ----------------------------------------------
  await type(page, '5000,5000');
  await input.press('Escape');
  await expect(prompt).toBeHidden();
  await expectNativeCount(page, 3);

  // --- lo dibujado es geometría canónica y persiste --------------------------
  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document.entities;
  expect(saved).toHaveLength(3);
  expect(saved.every((entity) => entity.type === 'line')).toBe(true);
  expect(saved.map((entity) => entity.layer)).toEqual(['0', '0', '0']);
  // El contorno cerrado: cada segmento arranca donde acabó el anterior y el
  // último vuelve al origen. Si «Cerrar» sólo hubiera terminado el comando,
  // aquí habría dos segmentos y ninguno volvería a 0,0.
  const ends = saved.map((entity) =>
    entity.type === 'line' ? [entity.start, entity.end] : null,
  );
  expect(ends[2]?.[1]).toMatchObject({ x: 0, y: 0 });
});
