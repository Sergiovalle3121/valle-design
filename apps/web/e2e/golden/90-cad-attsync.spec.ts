import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { CadV1Backend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * ATTSYNC: REDEFINIR EL CAJETÍN Y QUE LAS LÁMINAS SE ENTEREN.
 *
 * ## Qué estaba roto, medido
 *
 * Un despacho define su cajetín como bloque con sus atributos y lo inserta en
 * cuarenta láminas. A media obra añade `REVISION` y quita una etiqueta que ya
 * no usa. Las referencias que YA estaban se quedan como estaban: sin la
 * etiqueta nueva y con la vieja dentro, que viaja en el archivo y sale en las
 * extracciones de datos. En AutoCAD eso lo arregla `ATTSYNC`; aquí la orden no
 * existía —`0 apariciones` en el registro— y hacerlo a mano son cuarenta
 * ediciones que nadie hace.
 *
 * ## Lo que este golden fija
 *
 * Que teclear `ATTSYNC` deje las referencias al día EN EL DOCUMENTO QUE RECIBE
 * EL SERVIDOR: el valor escrito intacto, la etiqueta nueva con su valor por
 * defecto, la huérfana fuera y el atributo constante con el valor de la
 * definición. Y que el renglón diga QUÉ cambió, no «Hecho».
 */
const HOST_MODEL = 'AXOS-CAD-STUDIO';
const HOST_REVISION = 'UNIVERSAL';
const FOOTPRINT = { footprintW: 12_000, footprintH: 9_000, unit: 'mm', gridSize: 100 };

function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [
      // Dos referencias del MISMO cajetín, las dos desfasadas y de forma
      // distinta: una escribió su proyecto, la otra no.
      {
        id: 'cajetin-1', type: 'insert', block: 'block:cajetin', layer: '0',
        insertion: { x: 1_000, y: 1_000, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0,
        attributes: { PROYECTO: 'Nave industrial', OBSOLETO: 'sobra' },
      },
      {
        id: 'cajetin-2', type: 'insert', block: 'block:cajetin', layer: '0',
        insertion: { x: 6_000, y: 1_000, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0,
        attributes: { PROYECTO: '-', ESCALA: '1:100' },
      },
    ],
    history: [],
    modelSpace: { entityIds: ['cajetin-1', 'cajetin-2'] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [
      {
        id: 'block:cajetin',
        name: 'CAJETIN',
        basePoint: { x: 0, y: 0, z: 0 },
        entities: [],
        // La definición YA redefinida: `REVISION` es nueva, `OBSOLETO` ya no
        // está, y `ESCALA` es constante.
        attributes: {
          PROYECTO: { defaultValue: '-', position: { x: 0, y: 0, z: 0 }, height: 250 },
          REVISION: { defaultValue: 'P01', position: { x: 0, y: 400, z: 0 }, height: 180 },
          ESCALA: { defaultValue: '1:50', constant: true },
        },
      },
    ],
    constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
  } as unknown as CadDocument;
}

async function installCadBackend(context: BrowserContext) {
  const backend = new CadV1Backend([
    {
      model: HOST_MODEL, revision: HOST_REVISION, version: 0, footprint: FOOTPRINT,
      document: seedDocument() as unknown as Record<string, unknown>,
    },
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

test('ATTSYNC pone al día los atributos de las referencias en el documento que recibe el servidor', async ({
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

  // ---- a. Tecleada, acotada al bloque por su nombre ----------------------
  await type(page, 'ATTSYNC');
  await type(page, 'CAJETIN');

  // ---- b. El renglón dice QUÉ cambió, no «Hecho» ------------------------
  await expect(log, 'cuenta cuántas referencias tocó').toContainText(/Sincronizadas 2 de 2 referencia/);
  // «ESCALA» también entra: la primera referencia no la tenía escrita.
  await expect(log, 'y nombra las etiquetas que entran').toContainText(/añadido ESCALA, REVISION/);
  await expect(log, 'y la que sale').toContainText(/retirado OBSOLETO/);

  // ---- c. Y está en el DOCUMENTO QUE RECIBE EL SERVIDOR ------------------
  await saveAndSettle(page, {
    snapshot: () => ({ version: backend.snapshotFor(HOST_MODEL, HOST_REVISION).version }),
  });
  const guardado = backend.snapshotFor(HOST_MODEL, HOST_REVISION).document as unknown as CadDocument;
  const inserts = guardado.entities.filter((entity) => entity.type === 'insert') as Array<
    Extract<CadDocument['entities'][number], { type: 'insert' }>
  >;
  expect(inserts, 'siguen siendo dos referencias, no se duplicó ninguna').toHaveLength(2);

  const primero = inserts.find((entity) => entity.id === 'cajetin-1')!;
  expect(primero.attributes?.PROYECTO, 'lo que el dibujante escribió NO se pierde').toBe('Nave industrial');
  expect(primero.attributes?.REVISION, 'la etiqueta nueva entra con su valor por defecto').toBe('P01');
  expect(primero.attributes?.OBSOLETO, 'y la huérfana desaparece del archivo').toBeUndefined();
  expect(primero.attributes?.ESCALA, 'el atributo constante toma el valor de la definición').toBe('1:50');

  const segundo = inserts.find((entity) => entity.id === 'cajetin-2')!;
  expect(segundo.attributes?.ESCALA, 'aunque tuviera otro escrito: constante es constante').toBe('1:50');
  expect(segundo.attributes?.REVISION).toBe('P01');

  // La geometría del atributo sale de la DEFINICIÓN, que es lo que un ATTEDIT
  // no puede arreglar: posición y altura, ya en coordenadas de mundo.
  const colocados = primero.positionedAttributes ?? [];
  expect(colocados.map((atributo) => atributo.tag).sort()).toEqual(['PROYECTO', 'REVISION']);
  const revision = colocados.find((atributo) => atributo.tag === 'REVISION')!;
  expect(revision.height, 'la altura que dice la definición').toBe(180);
  expect(revision.insertion.y, 'y su sitio, ya movido con la referencia').toBe(1_400);

  // ---- d. Correrlo otra vez no vuelve a escribir -------------------------
  const versionTrasSync = backend.snapshotFor(HOST_MODEL, HOST_REVISION).version;
  await type(page, 'ATTSYNC');
  await type(page, 'CAJETIN');
  await expect(log, 'lo que ya está al día se dice, y no deja paso de deshacer').toContainText(
    /ya estaban al día \(2 referencia/,
  );
  expect(
    backend.snapshotFor(HOST_MODEL, HOST_REVISION).version,
    'y el documento del servidor no sube de versión',
  ).toBe(versionTrasSync);
});
