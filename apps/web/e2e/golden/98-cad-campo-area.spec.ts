import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { CadV1Backend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * EL ÁREA QUE SE ENTERA DE QUE MOVIERON EL MURO — EN EL SERVIDOR.
 *
 * ## Qué estaba medido
 *
 * `FIELD`, `UPDATEFIELD`, `DATALINK` y `DATALINKUPDATE` no estaban en el
 * registro: la familia de campos, en 1 de 5. Lo que sí había eran los campos
 * del CAJETÍN, que se resuelven al publicar un conjunto de planos — la mitad
 * del problema. La otra mitad es el área de un local escrita a mano, que deja
 * de ser cierta en cuanto alguien mueve un muro y nadie se entera hasta que el
 * cliente suma.
 *
 * ## Qué fija este golden
 *
 * - un campo de área se coloca sobre el local SELECCIONADO y nace **con su
 *   valor puesto**: un plano tiene que poder imprimirse tal como está;
 * - la expresión viaja en `context.metadata` y el valor en el texto, así que el
 *   documento persistido sabe de dónde salió el número;
 * - y cuando el local cambia, `UPDATEFIELD` lo pone al día — el número nuevo
 *   está en el documento que recibe el servidor, no sólo en un renglón.
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

test('Un campo de área se pone al día cuando el local cambia', async ({ context, page }) => {
  test.setTimeout(240_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-canvas')).toBeVisible();
  const skip = page.getByTestId('cad-guided-tour-skip');
  if (await skip.isVisible().catch(() => false)) await skip.click();

  const log = page.getByTestId('cad-command-line-log');

  // ---- a. Un local de 5 × 5 m --------------------------------------------
  await type(page, 'RECTANG');
  await type(page, '0,0');
  await type(page, '5000,5000');

  // ---- b. Se designa y se le pone su área --------------------------------
  await page.getByTitle(/Selección profesional/).click();
  const palette = page.getByTestId('cad-selection-palette');
  await expect(palette).toBeVisible();
  await palette.getByLabel('Filtrar por tipo').selectOption('polyline');
  await page.getByTestId('cad-quick-select-apply').click();
  await expect(page.getByTestId('cad-selection-count')).toHaveText('1 seleccionados');

  await type(page, 'FIELD');
  await type(page, 'Área');
  await type(page, '2500,2500');
  await expect(log, 'el campo nace CON su valor: 5 × 5 m son 25 m²').toContainText(
    /FIELD: Area = 25\.00 m²/,
  );

  // ---- c. Se agranda el local --------------------------------------------
  // El mismo rectángulo, escalado al doble con la designación que ya había:
  // 25 m² pasan a 100 m².
  await type(page, 'SCALE');
  await type(page, '0,0');
  await type(page, '2');

  // Con el LOCAL todavía designado, UPDATEFIELD trabaja sólo sobre lo
  // designado —como en AutoCAD— y lo dice sin mentir: hay un campo en el
  // dibujo, pero no entre lo elegido.
  await type(page, 'UPDATEFIELD');
  await expect(log, 'no dice «no hay campos», que sería falso').toContainText(
    /Ninguno de los 1 objeto\(s\) designados es un campo, y el dibujo tiene 1/,
  );

  // Se suelta la designación y se actualizan todos.
  await palette.getByRole('button', { name: 'Limpiar' }).click();
  await expect(page.getByTestId('cad-selection-count')).toHaveText('0 seleccionados');
  await type(page, 'UPDATEFIELD');
  await expect(log, 'el campo se entera del cambio').toContainText(
    /UPDATEFIELD — 1 campo\(s\) actualizado\(s\)/,
  );

  // ---- d. En el DOCUMENTO QUE RECIBE EL SERVIDOR -------------------------
  await saveAndSettle(page, {
    snapshot: () => ({ version: backend.snapshotFor(HOST_MODEL, HOST_REVISION).version }),
  });
  const guardado = backend.snapshotFor(HOST_MODEL, HOST_REVISION).document as unknown as CadDocument;
  const campo = guardado.entities.find(
    (entidad) => typeof entidad.context?.metadata?.campo === 'string',
  ) as Extract<CadDocument['entities'][number], { type: 'mtext' }> | undefined;
  expect(campo, 'el campo viaja en el documento canónico').toBeTruthy();
  expect(campo!.type, 'y es un MTEXT: ningún tipo de entidad nuevo').toBe('mtext');
  expect(
    campo!.context!.metadata!.campo,
    'con la EXPRESIÓN en los metadatos: el dibujo sabe de dónde salió el número',
  ).toMatch(/^%<Area:.+>%$/);
  expect(campo!.text, 'y el valor al día en el texto, que es lo que se imprime').toBe('100.00 m²');
});
