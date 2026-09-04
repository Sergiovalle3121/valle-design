import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { CadV1Backend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * GRABAR UNA VEZ, REPETIR — Y EN EL SERVIDOR.
 *
 * ## Qué estaba medido
 *
 * Sondeados treinta y seis nombres de la familia de automatización de AutoCAD
 * contra el registro: **4 de 36**, y la familia de grabación —ACTRECORD,
 * ACTSTOP, ACTMANAGER, ACTUSERINPUT, ACTUSERMESSAGE— en **0 de 5**.
 *
 * ## Qué fija este golden
 *
 * Que el circuito entero existe TECLEADO y que lo repetido llega al documento
 * que recibe el servidor:
 *
 * - se graba una orden real, con sus coordenadas;
 * - `ACTSTOP` devuelve el macro como un `.scr` LEGIBLE en el diálogo —no un
 *   formato opaco—, con su cabecera;
 * - `ACTMANAGER` lo repite, y la geometría repetida **está en el documento
 *   persistido**, no sólo en un renglón que dice que se repitió;
 * - y el macro NO se graba a sí mismo: sigue habiendo un macro, no dos.
 */
const HOST_MODEL = 'AXOS-CAD-STUDIO';
const HOST_REVISION = 'UNIVERSAL';
const FOOTPRINT = { footprintW: 20_000, footprintH: 20_000, unit: 'mm', gridSize: 100 };

function planoVacio(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
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

test('Un muro se graba una vez y se repite: lo repetido llega al servidor', async ({
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

  // ---- a. Se graba un muro tipo -----------------------------------------
  await type(page, 'ACTRECORD');
  await type(page, 'muro tipo');
  await expect(log, 'el grabador dice que está grabando y qué guarda').toContainText(
    /ACTRECORD: grabando «muro tipo»/,
  );

  await type(page, 'LINE');
  await type(page, '0,0');
  await type(page, '4000,0');
  await enter(page);

  // ---- b. ACTSTOP devuelve un .scr legible -------------------------------
  await type(page, 'ACTSTOP');
  await expect(log, 'dice qué grabó y cuánto').toContainText(
    /ACTSTOP: «muro tipo» grabado con 1 orden\(es\)/,
  );
  await expect(log, 'y devuelve el macro como guión, con su cabecera').toContainText(
    /Grabado con ACTRECORD el \d{4}-\d{2}-\d{2}: 1 orden\(es\)/,
  );
  await expect(log, 'diciendo que es un script normal, no un formato opaco').toContainText(
    /se puede leer, editar y ejecutar con SCRIPT/,
  );

  // ---- c. Se repite ------------------------------------------------------
  await type(page, 'ACTMANAGER');
  await type(page, 'muro tipo');
  await expect(log, 'y se repite por la misma puerta que un .scr').toContainText(
    /ACTMANAGER: «muro tipo» repetido/,
  );

  // El macro sigue siendo UNO: repetirlo no se graba a sí mismo.
  await type(page, 'ACTMANAGER');
  await enter(page);
  await expect(log, 'sigue habiendo un solo macro en la sesión').toContainText(
    /Macros de esta sesión: muro tipo \(1 orden\(es\)\)\./,
  );

  // ---- d. En el DOCUMENTO QUE RECIBE EL SERVIDOR -------------------------
  await saveAndSettle(page, {
    snapshot: () => ({ version: backend.snapshotFor(HOST_MODEL, HOST_REVISION).version }),
  });
  const guardado = backend.snapshotFor(HOST_MODEL, HOST_REVISION).document as unknown as CadDocument;
  const lineas = guardado.entities.filter((entidad) => entidad.type === 'line') as Extract<
    CadDocument['entities'][number],
    { type: 'line' }
  >[];
  expect(lineas.length, 'DOS muros: el grabado y el repetido').toBe(2);
  for (const linea of lineas) {
    expect(linea.start.x, 'los dos arrancan donde decía el macro').toBe(0);
    expect(linea.end.x, 'y terminan a 4 m: la coordenada grabada se repitió tal cual').toBe(4_000);
  }
});
