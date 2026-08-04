import { expect, test, type BrowserContext } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import type { CadDocument, CadEntity } from '../../src/lib/cad/cad-document';

type CadLine = Extract<CadEntity, { type: 'line' }>;

/**
 * Contrato del guardado explícito frente al autosave.
 *
 * El autosave (debounce 2 s) y el guardado manual comparten una cola de un
 * solo escritor y el mismo token CAS. De ahí salen dos invariantes que este
 * spec fija, porque su ausencia dejaba la suite dorada en rojo y, sobre todo,
 * dejaba al usuario sin control explícito sobre su propio dibujo:
 *
 *  1. «Guardar» sigue operable mientras el dibujo sea editable, incluso
 *     después de que el autosave haya limpiado la marca de modificado.
 *     Volver a guardar un estado ya persistido NO crea una versión CAS nueva.
 *  2. Una notificación transitoria nunca intercepta un clic dirigido a la
 *     barra de herramientas que hay debajo.
 */
function canonicalDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: 'WALLS', name: 'WALLS', color: '#a78bfa', visible: true, locked: false }],
    entities: [
      { id: 'save-line', type: 'line', start: { x: 1_000, y: 1_000, z: 0 }, end: { x: 5_000, y: 1_000, z: 0 }, layer: 'WALLS' },
    ],
    history: [], modelSpace: { entityIds: ['save-line'] }, paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
  };
}

async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, canonicalDocument(), {
    footprintW: 12_000, footprintH: 10_000, unit: 'mm', gridSize: 100,
  });
}

const saveButton = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'Guardar', exact: true });

test('explicit save stays available after autosave and never writes a redundant CAS version', async ({ context, page }) => {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');

  await page.getByTestId('cad-native-entity-save-line').click();
  const startX = page.getByTestId('cad-native-property-startX');
  await startX.fill('1500');
  await startX.blur();

  // El autosave persiste solo, sin pasar por el botón.
  await expect.poll(() => backend.snapshot().version).toBe(1);
  await expect(page.getByTestId('cad-save-status')).toHaveText('Guardado');
  expect((backend.snapshot().document.entities[0] as CadLine).start.x).toBe(1_500);

  // Invariante 1a: el control explícito NO queda inerte tras el autosave.
  await expect(saveButton(page)).toBeEnabled();

  // Invariante 1b: guardar lo ya persistido es idempotente — misma versión CAS.
  await saveButton(page).click();
  await expect(page.getByTestId('cad-save-status')).toHaveText('Guardado');
  await page.waitForTimeout(2_500);
  expect(backend.snapshot().version).toBe(1);

  // Una edición nueva sí avanza exactamente una versión.
  await startX.fill('2500');
  await startX.blur();
  await saveButton(page).click();
  await expect.poll(() => backend.snapshot().version).toBe(2);
  expect((backend.snapshot().document.entities[0] as CadLine).start.x).toBe(2_500);

  // Y sobrevive a la reapertura.
  await page.reload();
  await page.getByTestId('cad-native-entity-save-line').click();
  await expect(page.getByTestId('cad-native-property-startX')).toHaveValue('2500');
});

test('a transient toast never intercepts a click aimed at the CAD toolbar', async ({ context, page }) => {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');

  await page.getByTestId('cad-native-entity-save-line').click();
  const startX = page.getByTestId('cad-native-property-startX');
  await startX.fill('1500');
  await startX.blur();
  await saveButton(page).click();

  // El guardado manual emite una tarjeta que flota sobre la barra superior.
  const toast = page.getByText('Layout 3D guardado.');
  await expect(toast).toBeVisible();

  // Con la tarjeta aún visible, el control que queda debajo debe seguir
  // recibiendo el clic: `toPass` falla si el puntero lo intercepta.
  await expect(async () => {
    expect(await toast.isVisible()).toBe(true);
    await saveButton(page).click({ timeout: 1_000 });
  }).toPass({ timeout: 3_000 });

  // El clic atravesó la notificación sin producir una escritura redundante.
  expect(backend.snapshot().version).toBe(1);
});
