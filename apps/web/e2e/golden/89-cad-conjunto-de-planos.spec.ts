import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { CadV1Backend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { createCadPaperSpace } from '../../src/lib/cad/paper-space';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * EL CONJUNTO DE PLANOS, PUBLICADO DE VERDAD Y TECLEADO.
 *
 * ## Qué estaba roto, medido
 *
 * `lib/cad/sheet-set/` lleva campañas escrito y probado —numeración
 * automática, campos resueltos, publicación por lotes a un único PDF paginado
 * con portada—; `plot-host.ts` sabía atender `{kind:"publish"}` contra bytes de
 * PDF reales; y `PUBLISH` y `SHEETSET` llegan al registro real. Y aun así,
 * teclearlos en el estudio respondía SIEMPRE lo mismo:
 *
 *     El conjunto de planos set:nave no está cargado en este estudio.
 *
 * Porque nadie aportaba el puente `sheetSet()`: `grep -rn sheetSet src/` sólo
 * lo encontraba en su propia interfaz y en su propio spec. Es el `P1-8` del
 * BACKLOG y el mismo defecto que la ola anterior cerró en `XATTACH`.
 *
 * ## Lo que este golden fija, y dónde lo mira
 *
 * - `SHEETSET Listar` enseña las hojas que vienen DEL SERVIDOR, no de un
 *   conjunto inventado en el cliente.
 * - `SHEETSET Renumerar` deja los números nuevos en el cuerpo del PUT que el
 *   SERVIDOR recibe, con su `expectedVersion` — no en una copia local.
 * - `PUBLISH` entrega UN PDF con una página por hoja, y sus bytes se leen.
 *
 * Nada mira una captura, y ninguna afirmación se apoya en el estado del
 * cliente: o está en lo que recibió el servidor, o está en el archivo.
 */
const HOST_MODEL = 'AXOS-CAD-STUDIO';
const HOST_REVISION = 'UNIVERSAL';
const FOOTPRINT = { footprintW: 12_000, footprintH: 9_000, unit: 'mm', gridSize: 100 };
const METADATA = {
  project: 'Nave industrial',
  drawingNumber: 'A-0001',
  title: 'Planta',
  sheetNumber: 'S-001',
  revision: 'P01',
  discipline: 'Arquitectura',
};

function documentWithLayout(entityId: string, layoutId: string, name: string): CadDocument {
  const layout = createCadPaperSpace({
    id: layoutId,
    name,
    order: 0,
    modelBounds: { x: 0, y: 0, width: 12_000, height: 9_000 },
    unit: 'mm',
    metadata: METADATA,
  });
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [
      { id: entityId, type: 'line', start: { x: 500, y: 500, z: 0 }, end: { x: 11_000, y: 8_000, z: 0 }, layer: '0' },
    ],
    history: [],
    modelSpace: { entityIds: [entityId] },
    paperSpaces: [layout],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
  } as unknown as CadDocument;
}

async function installCadBackend(context: BrowserContext) {
  const backend = new CadV1Backend([
    {
      model: HOST_MODEL, revision: HOST_REVISION, version: 0, footprint: FOOTPRINT,
      document: documentWithLayout('host-line', 'layout:host', 'Trabajo') as unknown as Record<string, unknown>,
    },
    {
      model: 'PLANTA', revision: 'R1', version: 1,
      document: documentWithLayout('planta-line', 'layout:planta', 'Planta baja') as unknown as Record<string, unknown>,
    },
    {
      model: 'ALZADOS', revision: 'R1', version: 1,
      document: documentWithLayout('alzado-line', 'layout:alzado', 'Alzado norte') as unknown as Record<string, unknown>,
    },
  ]);
  await backend.install(context);
  // El conjunto vive en SU tabla, con su versión, como el `.dst` de AutoCAD.
  // Los números nacen desordenados a propósito: así `Renumerar` tiene algo que
  // arreglar y el golden puede afirmar el resultado en vez de un no-cambio.
  backend.registerSheetSet({
    id: 'set:nave',
    name: 'Nave industrial',
    fields: { PROJECT: 'Nave industrial' },
    numbering: { prefix: 'A-', start: 101, step: 1, padding: 0, suffix: '' },
    sheets: [
      {
        id: 'sh-1', order: 0, documentId: backend.idFor('PLANTA', 'R1'), layoutId: 'layout:planta',
        title: 'Planta baja', number: 'A-999', revision: 'P01',
      },
      {
        id: 'sh-2', order: 1, documentId: backend.idFor('ALZADOS', 'R1'), layoutId: 'layout:alzado',
        title: 'Alzado norte', number: 'A-998', revision: 'P01',
      },
    ],
    version: 4,
  });
  return backend;
}

/** Teclea con el LIENZO enfocado, como en AutoCAD: sin clic previo. */
async function type(page: Page, value: string) {
  const input = page.getByTestId('cad-command-input');
  await page.keyboard.type(value);
  await expect(input).toHaveValue(value);
  await page.keyboard.press('Enter');
}

test('PUBLISH y SHEETSET tecleados trabajan sobre el conjunto que está en el servidor', async ({
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

  // ---- a. Listar trae el conjunto del SERVIDOR ----------------------------
  await type(page, 'SHEETSET');
  await type(page, 'set:nave');
  await type(page, 'I'); // Índice: el listado de hojas
  await expect(log, 'primero dice que lo está trayendo, sin fingir que ya lo tiene').toContainText(
    'Trayendo el conjunto de planos set:nave',
  );
  await expect(log, 'y después enseña lo que vino del servidor').toContainText('«Nave industrial» — 2 hoja(s)');
  await expect(log).toContainText('Planta baja');
  await expect(log).toContainText('Alzado norte');

  // ---- b. Renumerar deja los números en el cuerpo que RECIBE el servidor --
  await type(page, 'SHEETSET');
  await type(page, 'set:nave');
  await type(page, 'R'); // Renumerar
  await expect(log, 'el renglón cuenta los números que salieron').toContainText('Renumerado «Nave industrial»');
  await expect
    .poll(() => backend.sheetSetSaves.length, { timeout: 30_000 })
    .toBeGreaterThan(0);
  const guardado = backend.sheetSetSaves[0];
  expect(guardado.sheetSetId, 'se guarda el conjunto que se pidió').toBe('set:nave');
  expect(guardado.body.expectedVersion, 'y con el CAS que traía, nunca a ciegas').toBe(4);
  const hojas = guardado.body.sheets as Array<{ id: string; number: string }>;
  expect(
    hojas.map((hoja) => `${hoja.id}:${hoja.number}`),
    'los números desordenados del servidor salen ordenados desde 101',
  ).toEqual(['sh-1:A-101', 'sh-2:A-102']);

  // ---- c. PUBLISH entrega UN PDF, y se leen sus bytes --------------------
  const descarga = page.waitForEvent('download', { timeout: 120_000 });
  await type(page, 'PUBLISH');
  await type(page, 'set:nave');
  await page.keyboard.press('Enter'); // todas las hojas
  const archivo = await descarga;
  expect(archivo.suggestedFilename(), 'el archivo se llama como el conjunto').toBe('Nave industrial.pdf');
  const ruta = await archivo.path();
  const bytes = ruta ? await (await import('node:fs/promises')).readFile(ruta) : Buffer.alloc(0);
  expect(bytes.length, 'y trae contenido de verdad').toBeGreaterThan(1_000);
  expect(bytes.subarray(0, 5).toString('latin1'), 'es un PDF').toBe('%PDF-');
  // Dos hojas MÁS la portada con el índice del juego, que va encendida por
  // defecto (`sheet-set-publish.ts`): tres páginas, contadas sobre el ARCHIVO
  // y no sobre el renglón que las anuncia. El flujo del PDF entregado va
  // COMPRIMIDO —así se entrega—, así que lo que
  // se cuenta aquí es la estructura de objetos, que no lo está. El contenido de
  // la portada lo afirma `sheet-set-cover.spec.ts`, sobre el plan y sin red.
  const paginas = (bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  expect(paginas, `portada + una página por hoja publicada (${paginas})`).toBe(3);
  await expect(log, 'y el renglón dice cuántas salieron').toContainText(/Publicado Nave industrial\.pdf: 3 página/);
});
