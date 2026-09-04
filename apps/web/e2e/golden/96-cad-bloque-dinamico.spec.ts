import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { CadV1Backend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * LA PUERTA QUE SE ESTIRA SIN REDIBUJARLA — EN EL SERVIDOR.
 *
 * ## Qué estaba medido
 *
 * `src/lib/cad/dynamic-blocks.ts` existía desde antes de esta campaña —683
 * líneas, dos familias, spec verde— y NADIE lo importaba: ni un comando ni un
 * panel. Un arquitecto no podía colocar una sola puerta paramétrica. Y de
 * dieciocho nombres de la familia de bloques dinámicos de AutoCAD sondeados
 * contra el registro, existían **2**.
 *
 * ## Qué fija este golden
 *
 * Que la capacidad se alcanza TECLEANDO y que el resultado está en el documento
 * que recibe el servidor:
 *
 * - la puerta se coloca con sus parámetros y los lleva ENCIMA, en
 *   `context.metadata`, así que sigue siendo paramétrica después de guardar;
 * - cambiar el claro **no la mueve ni la vuelve a insertar**: mismo id, misma
 *   inserción, otra definición materializada — que es exactamente lo que
 *   distingue un bloque dinámico de borrar y poner otro;
 * - y la GEOMETRÍA cambia de verdad: el barrido de la hoja pasa de 900 a 1.000.
 *
 * Nada mira una captura.
 */
const HOST_MODEL = 'AXOS-CAD-STUDIO';
const HOST_REVISION = 'UNIVERSAL';
const FOOTPRINT = { footprintW: 20_000, footprintH: 20_000, unit: 'mm', gridSize: 100 };

function planoVacio(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [
      { id: '0', name: '0', color: '#ffffff', visible: true, locked: false },
      { id: 'architecture', name: 'architecture', color: '#cbd5f5', visible: true, locked: false },
    ],
    entities: [],
    history: [],
    modelSpace: { entityIds: [] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
  } as unknown as CadDocument;
}

async function installCadBackend(context: BrowserContext) {
  const backend = new CadV1Backend([
    {
      model: HOST_MODEL, revision: HOST_REVISION, version: 0, footprint: FOOTPRINT,
      document: planoVacio() as unknown as Record<string, unknown>,
    },
  ]);
  await backend.install(context);
  return backend;
}

async function type(page: Page, value: string) {
  const input = page.getByTestId('cad-command-input');
  await page.keyboard.type(value);
  await expect(input).toHaveValue(value);
  await page.keyboard.press('Enter');
}

async function enter(page: Page) {
  await page.keyboard.press('Enter');
}

const arcoDe = (documento: CadDocument, bloqueId: string): number | null => {
  const definicion = (documento.blocks ?? []).find((bloque) => bloque.id === bloqueId);
  const arco = definicion?.entities.find((entidad) => entidad.type === 'arc');
  return arco && arco.type === 'arc' ? arco.radius : null;
};

test('Una puerta paramétrica se coloca tecleando y se estira sin moverla ni redibujarla', async ({
  context,
  page,
}) => {
  test.setTimeout(240_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-canvas')).toBeVisible();
  const skip = page.getByTestId('cad-guided-tour-skip');
  if (await skip.isVisible().catch(() => false)) await skip.click();

  const log = page.getByTestId('cad-command-line-log');

  // ---- a. La puerta, con sus cuatro parámetros ----------------------------
  await type(page, 'BLOQUEDIN');
  await type(page, 'puerta-abatible');
  await type(page, '900');   // claro
  await type(page, '90');    // apertura
  await enter(page);         // muro: el que propone la familia
  await type(page, '0');     // sentido: sin espejo
  await type(page, '3000,2000');
  await expect(log, 'la orden dice qué colocó y con qué valores').toContainText(
    /BLOQUEDIN: Puerta abatible paramétrica — Claro 900/,
  );

  await saveAndSettle(page, {
    snapshot: () => ({ version: backend.snapshotFor(HOST_MODEL, HOST_REVISION).version }),
  });
  const primero = backend.snapshotFor(HOST_MODEL, HOST_REVISION).document as unknown as CadDocument;
  const puerta = primero.entities.find((entidad) => entidad.type === 'insert') as
    | Extract<CadDocument['entities'][number], { type: 'insert' }>
    | undefined;
  expect(puerta, 'la puerta viaja en el documento canónico').toBeTruthy();
  expect(
    puerta!.context?.metadata?.['din:familia'],
    'con su FAMILIA encima: sigue siendo paramétrica después de guardar',
  ).toBe('puerta-abatible');
  expect(puerta!.context?.metadata?.['din:claro'], 'y el claro que se tecleó').toBe(900);
  expect(arcoDe(primero, puerta!.block), 'el barrido de la hoja mide el claro').toBe(900);

  const idOriginal = puerta!.id;
  const bloqueOriginal = puerta!.block;
  const insercionOriginal = JSON.stringify(puerta!.insertion);

  // ---- b. Se selecciona con la paleta y se le cambia el claro -------------
  await page.getByTitle(/Selección profesional/).click();
  const palette = page.getByTestId('cad-selection-palette');
  await expect(palette).toBeVisible();
  await palette.getByLabel('Filtrar por tipo').selectOption('insert');
  await page.getByTestId('cad-quick-select-apply').click();
  await expect(page.getByTestId('cad-selection-count')).toHaveText('1 seleccionados');

  await type(page, 'BLOQUEDINSET');
  await type(page, 'claro');
  await type(page, '1000');
  await expect(log, 'y lo dice: el bloque no se movió ni se volvió a insertar').toContainText(
    /BLOQUEDINSET: Puerta abatible paramétrica Claro = 1000.*no se movió ni se volvió a insertar/,
  );

  // ---- c. En el servidor: mismo bloque, otra geometría -------------------
  await saveAndSettle(page, {
    snapshot: () => ({ version: backend.snapshotFor(HOST_MODEL, HOST_REVISION).version }),
  });
  const guardado = backend.snapshotFor(HOST_MODEL, HOST_REVISION).document as unknown as CadDocument;
  const despues = guardado.entities.find((entidad) => entidad.id === idOriginal) as
    | Extract<CadDocument['entities'][number], { type: 'insert' }>
    | undefined;
  expect(despues, 'sigue siendo LA MISMA entidad: no se borró y se puso otra').toBeTruthy();
  expect(
    JSON.stringify(despues!.insertion),
    'y NO se movió, que es lo que distingue estirar de volver a insertar',
  ).toBe(insercionOriginal);
  expect(despues!.context?.metadata?.['din:claro'], 'el parámetro cambió').toBe(1_000);
  expect(despues!.block, 'y apunta a otra definición materializada').not.toBe(bloqueOriginal);
  expect(
    arcoDe(guardado, despues!.block),
    'cuya GEOMETRÍA es otra: el barrido de la hoja mide ahora 1.000',
  ).toBe(1_000);
  expect(
    guardado.entities.filter((entidad) => entidad.type === 'insert').length,
    'y sigue habiendo UNA puerta, no dos',
  ).toBe(1);
});
