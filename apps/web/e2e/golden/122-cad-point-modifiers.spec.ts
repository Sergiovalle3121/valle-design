import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * T-22 · DESDE y M2P como modificadores de punto.
 *
 * `input-pipeline.ts` no reconocía estos auxiliares en absoluto: `DESDE`
 * caía por el analizador de coordenadas y salía como «coordenada inválida».
 * Aquí se comprueba lo que un dibujante hace cada hora sin dibujar una línea
 * auxiliar para medir: colocar un punto DESDE una esquina con un desplazamiento
 * relativo, y caer en el MEDIO exacto entre otros dos puntos.
 */
function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    // Un punto de referencia lejos de todo lo que dibuja cada caso, sólo para
    // que el estudio arranque con un documento no vacío — igual que el resto
    // de goldens de la casa.
    entities: [
      { id: 'referencia', type: 'point', position: { x: -5_000, y: -5_000, z: 0 }, layer: '0' },
    ],
    history: [],
    modelSpace: { entityIds: ['referencia'] },
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

test('DESDE ancla un punto y mide @relativo desde ÉL, no desde el origen del dibujo', async ({
  context,
  page,
}) => {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();

  await type(page, 'LINE');
  await type(page, 'DESDE');
  await type(page, '1000,1000'); // el ancla, NO el primer vértice
  await type(page, '@500,0'); // medido desde el ancla: (1500,1000)
  await type(page, '2000,1000');
  await page.getByTestId('cad-command-input').press('Enter');

  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document.entities;
  const line = saved.find((entity) => entity.id !== 'referencia');
  expect(line?.type).toBe('line');
  if (line?.type !== 'line') throw new Error('DESDE debería haber creado una línea');
  expect(line.start).toMatchObject({ x: 1500, y: 1000 });
  expect(line.end).toMatchObject({ x: 2000, y: 1000 });
});

test('M2P cae en el MEDIO exacto de dos puntos, no en el segundo', async ({ context, page }) => {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();

  await type(page, 'LINE');
  await type(page, 'M2P');
  await type(page, '0,0');
  await type(page, '1000,0');
  await type(page, '500,500');
  await page.getByTestId('cad-command-input').press('Enter');

  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document.entities;
  const line = saved.find((entity) => entity.id !== 'referencia');
  expect(line?.type).toBe('line');
  if (line?.type !== 'line') throw new Error('M2P debería haber creado una línea');
  expect(line.start).toMatchObject({ x: 500, y: 0 });
  expect(line.end).toMatchObject({ x: 500, y: 500 });
});
