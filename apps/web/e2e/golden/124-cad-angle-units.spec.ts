import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * T-25 · Un ángulo tecleado respeta ANGBASE/ANGDIR (y AUNITS).
 *
 * Antes de este arreglo, `<45` y el ángulo de una coordenada polar
 * (`@100<45`) se leían SIEMPRE en grados decimales puros, cero al este,
 * antihorario — ignorando la tabla de variables por completo. Un despacho
 * que trabaja con el norte como cero (`ANGBASE 90`) y mide en sentido horario
 * (`ANGDIR 1`, el que usa un teodolito) tecleaba un ángulo y el trazo salía
 * girado a un lado que no era el suyo.
 *
 * Aquí se fija con SETVAR de verdad —la ruta que un dibujante usa— y una
 * coordenada polar relativa: con `ANGBASE 90` y `ANGDIR 1`, `@100<0` debe
 * apuntar exactamente al NORTE del mundo, no al este.
 */
function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    // Punto de referencia lejos de todo, sólo para que el estudio no arranque
    // con un documento vacío — igual que el resto de goldens de la casa.
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

test('con ANGBASE 90 y ANGDIR horario, @100<0 apunta al norte del mundo, no al este', async ({
  context,
  page,
}) => {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();
  const log = page.getByTestId('cad-command-line-log');

  // El cero apunta al norte, y se mide en sentido horario — como un
  // teodolito, y al revés del este-antihorario por defecto.
  await type(page, 'SETVAR');
  await type(page, 'ANGBASE');
  await type(page, '90');
  await expect(log).toContainText('ANGBASE = 90');
  await type(page, 'SETVAR');
  await type(page, 'ANGDIR');
  await type(page, '1');
  await expect(log).toContainText('ANGDIR = 1');

  await type(page, 'LINE');
  await type(page, '0,0');
  // «0» en el sistema del usuario es SU cero — el norte, con ANGBASE 90 — así
  // que el segundo vértice debe caer en (0,100), no en (100,0).
  await type(page, '@100<0');
  await page.getByTestId('cad-command-input').press('Enter');

  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document.entities;
  const line = saved.find((entity) => entity.id !== 'referencia');
  expect(line?.type).toBe('line');
  if (line?.type !== 'line') throw new Error('debería haberse creado una línea');
  expect(line.start).toMatchObject({ x: 0, y: 0 });
  expect(line.end.x).toBeCloseTo(0, 6);
  expect(line.end.y).toBeCloseTo(100, 6);
});

test('sin ANGBASE/ANGDIR declarados, <45 sigue siendo 45° decimales de siempre', async ({
  context,
  page,
}) => {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();

  await type(page, 'LINE');
  await type(page, '0,0');
  await type(page, '@100<45');
  await page.getByTestId('cad-command-input').press('Enter');

  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document.entities;
  const line = saved.find((entity) => entity.id !== 'referencia');
  expect(line?.type).toBe('line');
  if (line?.type !== 'line') throw new Error('debería haberse creado una línea');
  expect(line.end.x).toBeCloseTo(100 * Math.SQRT1_2, 6);
  expect(line.end.y).toBeCloseTo(100 * Math.SQRT1_2, 6);
});
