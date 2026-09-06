import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * T-21 · Ningún prompt de «Designe objetos» acepta palabras clave.
 *
 * El prompt compartido de ERASE/MOVE/COPY sólo declaraba
 * `CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK`: sin `CAD_ACCEPT_KEYWORD`,
 * ninguna de las diez palabras clave de AutoCAD (Todo, Previo, Último,
 * Ventana, Captura, Valla, Vpolígono, Cpolígono, Borrar, Añadir) llegaba
 * siquiera a intentarse. Este golden teclea el gesto exacto de la ficha:
 * `BORRAR` (alias nuevo de ERASE) → `V` (Ventana) → dos esquinas → Intro, y
 * afirma el documento del SERVIDOR, no sólo la línea de comandos.
 */
function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [
      // Cae ENTERA dentro de la ventana (-1000,-1000)-(1500,1000).
      { id: 'dentro', type: 'line', start: { x: 0, y: 0, z: 0 }, end: { x: 1000, y: 0, z: 0 }, layer: '0' },
      // Fuera: su caja se sale por arriba de la ventana.
      { id: 'fuera', type: 'circle', center: { x: 1000, y: 4000, z: 0 }, radius: 300, layer: '0' },
    ],
    history: [],
    modelSpace: { entityIds: ['dentro', 'fuera'] },
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

async function type(page: Page, value: string) {
  const input = page.getByTestId('cad-command-input');
  await input.click();
  await input.fill(value);
  await input.press('Enter');
}

/**
 * Como `type`, pero para el PRIMER comando de la prueba: sus módulos se
 * cargan a demanda (`engine/lazy-commands.ts`) y, si el chunk todavía no
 * llegó, el propio producto contesta «vuelva a teclearlo en un instante» en
 * vez de fingir que hizo algo. Es exactamente lo que haría quien lo teclea
 * de verdad: reintentarlo una vez ya con el módulo puesto.
 */
async function typeFirstCommand(page: Page, value: string) {
  const log = page.getByTestId('cad-command-line-log');
  await type(page, value);
  const stillLoading = await log.getByText('todavía no terminó de cargar').count();
  if (stillLoading > 0) await type(page, value);
}

test('BORRAR → V (Ventana) → dos esquinas → Intro designa por palabra clave y borra sólo lo encerrado', async ({
  context,
  page,
}) => {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();

  const prompt = page.getByTestId('cad-command-prompt');
  await typeFirstCommand(page, 'BORRAR');
  await expect(prompt).toContainText('Designe objetos');
  await type(page, 'V');
  await type(page, '-1000,-1000');
  await type(page, '1500,1000');
  // La ventana resuelve y el prompt REPITE «Designe objetos», exactamente
  // como AutoCAD: una ventana AÑADE a la designación, no la termina. Hace
  // falta el Intro explícito de la ficha para cerrar el comando.
  await expect(prompt).toContainText('Designe objetos');
  await page.getByTestId('cad-command-input').press('Enter');
  await expect(prompt).toBeHidden();

  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document.entities;

  expect(saved.map((entity) => entity.id)).toEqual(['fuera']);
});

test('Todo, seguido de Intro, designa el dibujo entero', async ({ context, page }) => {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();

  const prompt = page.getByTestId('cad-command-prompt');
  await typeFirstCommand(page, 'ERASE');
  await type(page, 'Todo');
  await expect(prompt).not.toBeHidden();
  await page.getByTestId('cad-command-input').press('Enter');
  await expect(prompt).toBeHidden();

  await saveAndSettle(page, backend);
  expect(backend.snapshot().document.entities).toHaveLength(0);
});
