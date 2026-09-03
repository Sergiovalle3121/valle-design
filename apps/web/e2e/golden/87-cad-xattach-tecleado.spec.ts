import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { CadV1Backend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import { fitFootprint } from '../fixtures/camera-preset';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * XATTACH ADJUNTA. Tecleado, y sin pasar por el panel.
 *
 * ## Qué estaba roto, medido
 *
 * `docs/execution/BACKLOG.md` P1-2 y el informe de distancia lo decían con las
 * mismas palabras: «XATTACH por línea de comandos no puede adjuntar». La orden
 * estaba entera —elegir dibujo, adjuntar o superponer, punto, escala y giro— y
 * terminaba explicando que el editor no le pasaba la biblioteca del inquilino.
 * Era honesto y era inútil: el panel de referencias externas SÍ adjunta desde
 * hace campañas, así que el producto sabía hacerlo y la línea de comandos no
 * podía pedirlo.
 *
 * ## Lo que este golden fija
 *
 * Que teclear la orden entera deje la referencia en el DOCUMENTO QUE RECIBE EL
 * SERVIDOR, con su activo, su revisión y su modo. Y que sea el MISMO camino que
 * el panel: una sola función de adjuntado (`cadStudioAttachXref`), no dos que
 * puedan divergir.
 *
 * Y que cuando el activo no existe, la línea de comandos lo DIGA con el motivo
 * que dio el servidor, en vez de callar o de afirmar que adjuntó algo.
 */
const HOST_MODEL = 'AXOS-CAD-STUDIO';
const HOST_REVISION = 'UNIVERSAL';
const FOOTPRINT = { footprintW: 12_000, footprintH: 9_000, unit: 'mm', gridSize: 100 };

function canonicalDocument(id: string): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [{ id, type: 'line', start: { x: 1_000, y: 1_000, z: 0 }, end: { x: 8_000, y: 5_000, z: 0 }, layer: '0' }],
    history: [], modelSpace: { entityIds: [id] }, paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
  };
}

async function installCadBackend(context: BrowserContext) {
  const backend = new CadV1Backend([
    { model: HOST_MODEL, revision: HOST_REVISION, document: canonicalDocument('host-line') as unknown as Record<string, unknown>, version: 0, footprint: FOOTPRINT },
    { model: 'PLANTA-BASE', revision: 'R3', document: canonicalDocument('base-line') as unknown as Record<string, unknown>, version: 1, footprint: FOOTPRINT },
    { model: 'NO-EXISTE', revision: 'UNIVERSAL', document: null, openStatus: 404, openBody: { message: 'not found' } },
  ]);
  await backend.install(context);
  return backend;
}

/** Teclea con el LIENZO enfocado, como en AutoCAD: sin clic previo. */
async function type(page: Page, value: string) {
  const input = page.getByTestId('cad-command-input');
  await page.keyboard.type(value);
  await expect(input).toHaveValue(value);
  await page.keyboard.press('Enter');
}

async function enter(page: Page) {
  await page.keyboard.press('Enter');
}

test('XATTACH tecleado trae el dibujo del inquilino y lo deja referenciado en el documento guardado', async ({
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
  await page.getByTitle(/Vista de plano 2D/).click();
  await fitFootprint(page);

  const log = page.getByTestId('cad-command-line-log');
  const prompt = page.getByTestId('cad-command-prompt');

  // ---- a. La orden pide el dibujo aunque el estudio no publique una lista ---
  await type(page, 'XATTACH');
  await expect(prompt, 'sin biblioteca publicada, XATTACH pide el activo en vez de rendirse').toContainText(
    'activo@revisión',
  );

  // ---- b. El diálogo entero, tecleado -------------------------------------
  await type(page, 'PLANTA-BASE@R3');
  await expect(prompt, 'y ofrece adjuntar o superponer').toContainText(/[Ss]uperponer|[Aa]djuntar/);
  await enter(page); // adjuntar, el defecto
  await type(page, '2000,1500'); // punto de inserción
  await enter(page); // escala 1
  await enter(page); // giro 0

  // ---- c. Se dice que se está trayendo, y DESPUÉS que llegó ---------------
  await expect(log, 'el renglón inmediato no afirma que ya esté adjuntado').toContainText('Trayendo PLANTA-BASE@R3');
  await expect(log, 'y el veredicto llega cuando de verdad llegó').toContainText(
    /PLANTA-BASE@R3 referenciado como adjunto/,
  );

  // ---- d. Y está en el DOCUMENTO QUE RECIBE EL SERVIDOR --------------------
  await saveAndSettle(page, {
    snapshot: () => ({ version: backend.snapshotFor(HOST_MODEL, HOST_REVISION).version }),
  });
  const guardado = backend.snapshotFor(HOST_MODEL, HOST_REVISION).document as unknown as CadDocument;
  const referencia = guardado.externalReferences.find((entry) => entry.assetId?.startsWith('PLANTA-BASE'));
  expect(referencia, 'la referencia externa viaja en el documento canónico').toBeTruthy();
  expect(referencia!.mode).toBe('attachment');

  // ---- e. Un activo que no existe se dice con el motivo del servidor ------
  await type(page, 'XATTACH');
  await type(page, 'NO-EXISTE');
  await enter(page);
  await type(page, '3000,3000');
  await enter(page);
  await enter(page);
  await expect(log, 'el motivo del servidor viaja entero hasta el diálogo').toContainText(
    /No se pudo referenciar NO-EXISTE/,
  );
});
