import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { CadV1Backend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import {
  createCadColorTable,
  createCadPlotStyle,
  formatCadPlotStyleTable,
} from '../../src/lib/cad/plot/plot-style-table';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * LA TABLA DE PLUMAS DEL DESPACHO, CARGADA Y USADA.
 *
 * ## Qué estaba roto, medido
 *
 * `PAGESETUP Estilos` escribía el nombre de una tabla en la presentación y a
 * partir de ahí `PLOT` se negaba a trazar esa hoja —con razón: sin la tabla, el
 * plano saldría con los grosores equivocados—, porque el estudio no aportaba
 * NINGUNA tabla cargada. Elegir una tabla convertía la hoja en no trazable, y
 * no había forma de cargar ninguna: `importCadPlotStyleTable` existía entero,
 * con su descompresor, y nadie lo llamaba.
 *
 * ## Lo que este golden fija
 *
 * El recorrido completo, tecleado: listar lo que hay, CARGAR el `.ctb` del
 * despacho desde un archivo de verdad, comprobar que aparece, elegirlo con
 * `PAGESETUP Estilos` y trazar. El PDF se lee de sus bytes.
 */
const HOST_MODEL = 'AXOS-CAD-STUDIO';
const HOST_REVISION = 'UNIVERSAL';
const FOOTPRINT = { footprintW: 12_000, footprintH: 9_000, unit: 'mm', gridSize: 100 };

function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [
      { id: 'muro', type: 'line', start: { x: 500, y: 500, z: 0 }, end: { x: 11_000, y: 8_000, z: 0 }, layer: '0' },
    ],
    history: [],
    modelSpace: { entityIds: ['muro'] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
  } as unknown as CadDocument;
}

/** Un `.ctb` de texto plano, escrito con el MISMO formateador del producto. */
function tablaDelDespacho(): string {
  const tabla = createCadColorTable('Estudio-2004');
  // El color 1 con un grosor que se reconoce a simple vista en el informe.
  tabla.styles[0] = createCadPlotStyle({ name: 'Color_1', lineweight: 0.7 });
  return formatCadPlotStyleTable(tabla);
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

test('STYLESMANAGER carga el .ctb del despacho y PLOT lo usa', async ({ context, page }) => {
  test.setTimeout(240_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadBackend(context);
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-canvas')).toBeVisible();
  const skip = page.getByTestId('cad-guided-tour-skip');
  if (await skip.isVisible().catch(() => false)) await skip.click();

  const log = page.getByTestId('cad-command-line-log');

  // ---- a. Listar: las tres de fábrica, con su nombre de archivo ----------
  await type(page, 'STYLESMANAGER');
  await type(page, 'L');
  await expect(log, 'el estudio ya no está sin tablas').toContainText(
    'Tablas de plumas cargadas: acad.ctb, acad.stb, monochrome.ctb',
  );

  // ---- b. Cargar el .ctb del despacho, desde un archivo de verdad --------
  // El selector lo crea la orden al vuelo y se descarta solo si nadie lo
  // atiende, así que se atiende ANTES de teclear.
  const elegido = page.waitForEvent('filechooser', { timeout: 60_000 });
  await type(page, 'STYLESMANAGER');
  await type(page, 'C');
  const selector = await elegido;
  expect(selector.isMultiple(), 'una tabla cada vez').toBe(true);
  await selector.setFiles({
    name: 'Estudio-2004.ctb',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(tablaDelDespacho(), 'latin1'),
  });

  await type(page, 'STYLESMANAGER');
  await type(page, 'L');
  await expect(log, 'la tabla del despacho se suma a las de fábrica').toContainText(
    /Estudio-2004\.ctb/,
  );

  // ---- c. Elegirla y trazar: la hoja SALE ---------------------------------
  await type(page, 'LAYOUT');
  await type(page, 'N'); // Nueva presentación
  await type(page, 'Planta');
  await type(page, 'PSET');
  await type(page, 'E');
  await type(page, 'Estudio-2004.ctb');

  const descarga = page.waitForEvent('download', { timeout: 120_000 });
  await type(page, 'PLOT');
  await type(page, 'T');
  await type(page, 'con-plumas-del-despacho');
  const archivo = await descarga;
  expect(
    archivo.suggestedFilename(),
    'con la tabla del despacho cargada, la hoja se traza',
  ).toBe('con-plumas-del-despacho.pdf');
  const ruta = await archivo.path();
  const bytes = ruta ? await (await import('node:fs/promises')).readFile(ruta) : Buffer.alloc(0);
  expect(bytes.subarray(0, 5).toString('latin1'), 'y es un PDF de verdad').toBe('%PDF-');
});
