import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * AUDIT: el dibujo ajeno llega con defectos, y AUDIT los dice antes de tocarlos.
 *
 * Los defectos se siembran en el JSON CANÓNICO, no en un DXF: leer DXF es
 * territorio de la interoperabilidad (otra sesión de esta misma campaña), y
 * una LINE de longitud cero es el mismo defecto exacto llegue por DXF o por
 * el formato canónico — AUDIT no distingue de dónde vino la entidad, sólo
 * mira su geometría. Ver `apps/web/src/lib/cad/audit/geometry.ts`.
 *
 * Lo que este golden fija contra el producto de verdad:
 *
 *   AUDIT ⏎               → cuenta los defectos y PREGUNTA antes de tocar nada
 *   S ⏎                   → confirmado, repara y dice cuánto reparó
 *   AUDIT ⏎ (otra vez)    → un segundo AUDIT no encuentra nada
 */
function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 4, unit: 'mm' },
    layers: [
      { id: '0', name: '0', color: '#ffffff', visible: true, locked: false },
      { id: 'SOBRA', name: 'SOBRA', color: '#00ff00', visible: true, locked: false },
    ],
    entities: [
      { id: 'l-sano', type: 'line', start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 }, layer: '0' },
      { id: 'l-cero', type: 'line', start: { x: 5, y: 5, z: 0 }, end: { x: 5, y: 5, z: 0 }, layer: '0' },
      { id: 'c-cero', type: 'circle', center: { x: 300, y: 300, z: 0 }, radius: 0, layer: '0' },
      {
        id: 'i-huerfano', type: 'insert', block: 'PLANTA-ESTRUCTURAL',
        insertion: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, layer: '0',
      },
    ],
    history: [],
    modelSpace: { entityIds: ['l-sano', 'l-cero', 'c-cero', 'i-huerfano'] },
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

async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 12_000,
    footprintH: 10_000,
    unit: 'mm',
    gridSize: 100,
  });
}

/** Teclea en la línea de comandos y confirma, como se haría de verdad. */
async function type(page: Page, value: string) {
  const input = page.getByTestId('cad-command-input');
  await input.click();
  await input.fill(value);
  await input.press('Enter');
}

async function expectNativeCount(page: Page, total: number) {
  await expect(page.getByTestId('cad-native-document-count')).toHaveText(`Native ${total}`);
}

test('AUDIT cuenta los defectos de un dibujo ajeno, pregunta, y repara sólo al confirmar', async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadBackend(context);
  await page.goto('/legacy/studio');

  await expect(page.getByTestId('cad-command-line')).toBeVisible();
  await expectNativeCount(page, 4);

  const commandLine = page.getByTestId('cad-command-line');
  const prompt = page.getByTestId('cad-command-prompt');

  await test.step('AUDIT informa el conteo y PREGUNTA antes de tocar nada', async () => {
    await type(page, 'AUDIT');
    await expect(prompt).toContainText('AUDIT encontró');
    await expect(prompt).toContainText('¿Reparar automáticamente lo reparable?');
    // Sigue habiendo cuatro entidades: preguntar no es reparar.
    await expectNativeCount(page, 4);
  });

  await test.step('confirmar con S repara de verdad', async () => {
    await type(page, 'S');
    await expect(prompt).toBeHidden();
    // Las tres entidades defectuosas se fueron; la sana se queda. Es la
    // prueba que importa: un AUDIT que "repara" y deja las mismas cuatro
    // entidades sería la mentira exacta que este golden existe para atrapar.
    await expectNativeCount(page, 1);
  });

  await test.step('un segundo AUDIT no encuentra nada', async () => {
    await type(page, 'AUDIT');
    await expect(commandLine).toContainText('no se encontró ningún defecto');
    await expect(prompt).toBeHidden();
    await expectNativeCount(page, 1);
  });
});
