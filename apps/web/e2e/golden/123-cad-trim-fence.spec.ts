import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * T-23 · TRIM sin valla.
 *
 * `modify-edges.ts` sólo ofrecía `Todos` en la fase de recorte: para limpiar
 * los cruces de una retícula de ejes había que designar objeto por objeto,
 * treinta clics en vez de una valla. Este golden arrastra una valla contra
 * DOS objetos a la vez y afirma el recorte de ambos en el documento del
 * servidor, en un solo lote.
 */
function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [
      // Frontera vertical en x=500.
      { id: 'v', type: 'line', start: { x: 500, y: -100, z: 0 }, end: { x: 500, y: 1_100, z: 0 }, layer: '0' },
      // Dos horizontales que la valla va a cruzar en x=100, a la IZQUIERDA
      // de la frontera: ese lado es el que TRIM elimina.
      { id: 'h1', type: 'line', start: { x: 0, y: 100, z: 0 }, end: { x: 1_000, y: 100, z: 0 }, layer: '0' },
      { id: 'h2', type: 'line', start: { x: 0, y: 300, z: 0 }, end: { x: 1_000, y: 300, z: 0 }, layer: '0' },
    ],
    history: [],
    modelSpace: { entityIds: ['v', 'h1', 'h2'] },
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

test('TRIM + Valla recorta DOS objetos que cruza, en un solo lote', async ({ context, page }) => {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();

  const prompt = page.getByTestId('cad-command-prompt');
  await type(page, 'TRIM');
  await type(page, 'Todos');
  await expect(prompt).toContainText('recortar');
  await type(page, 'Valla');
  await type(page, '100,-50');
  await type(page, '100,350');
  // Cierra la valla (Intro) y termina el comando (Intro): dos, como en el
  // spec de Node que ejercita la misma secuencia.
  await page.getByTestId('cad-command-input').press('Enter');
  await page.getByTestId('cad-command-input').press('Enter');
  await expect(prompt).toBeHidden();

  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document.entities;

  const h1 = saved.find((entity) => entity.id === 'h1');
  const h2 = saved.find((entity) => entity.id === 'h2');
  expect(h1?.type).toBe('line');
  expect(h2?.type).toBe('line');
  if (h1?.type !== 'line' || h2?.type !== 'line') throw new Error('h1/h2 deberían seguir siendo líneas');
  // El lado pinchado por la valla (x=100, a la izquierda de la frontera
  // x=500) se elimina de las DOS: sobrevive 500→1000.
  expect(h1.start.x).toBe(500);
  expect(h1.end.x).toBe(1_000);
  expect(h2.start.x).toBe(500);
  expect(h2.end.x).toBe(1_000);
});
