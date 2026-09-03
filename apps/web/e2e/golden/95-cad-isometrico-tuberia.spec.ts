import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { CadV1Backend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * LA TUBERÍA EN 3D Y SU ISOMÉTRICO — EN EL SERVIDOR.
 *
 * ## Qué estaba medido
 *
 * `docs/competitive/rubric.json`, criterio `toolset-plant3d.tuberia`, tras la
 * primera mitad de la Ola 6: *«La tubería está en 2D con su número, servicio y
 * especificación… el ruteo 3D por especificación y la generación de isométricos
 * no existen.»* La fila quedó en 2/4 exactamente por esto.
 *
 * ## Qué fija este golden
 *
 * Se teclea una ruta que SUBE —dos tramos horizontales y un montante— y después
 * `PIDISO`, y se afirma sobre el DOCUMENTO QUE RECIBE EL SERVIDOR:
 *
 * - que la ruta es una polilínea con COTA en cada vértice, y que el montante
 *   está ahí sin que nadie lo dibujara: cambiar de elevación lo mete;
 * - que el isométrico existe como geometría en su capa, con las longitudes
 *   VERDADERAS rotuladas —12,00 m, 3,00 m, 9,00 m— que es lo que una cota del
 *   dibujo no podría decir sobre una proyección;
 * - que la LISTA DE MATERIALES viaja como TABLE del documento, con su límite
 *   escrito en el título;
 * - y que la HOJA existe, con su ventana: un isométrico sin hoja es geometría
 *   en un rincón del modelo.
 *
 * Nada mira una captura.
 */
const HOST_MODEL = 'AXOS-CAD-STUDIO';
const HOST_REVISION = 'UNIVERSAL';
const FOOTPRINT = { footprintW: 40_000, footprintH: 40_000, unit: 'mm', gridSize: 100 };
const LINEA = '6"-P-1001-CS150';

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

test('Una tubería se tiende con su cota y sale de ahí un isométrico con su lista y su hoja', async ({
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

  // ---- a. La ruta, que arranca a +2.000 y sube a +5.000 -------------------
  await type(page, 'PIDROUTE');
  await type(page, '6"');
  await type(page, 'P');
  await type(page, 'CS150');
  await type(page, '2000');            // elevación de arranque
  await type(page, '0,0');
  await type(page, '12000,0');
  await type(page, 'E');               // Elevación: el montante sale solo
  await type(page, '5000');
  await type(page, '12000,9000');
  await enter(page);
  await expect(log, 'el número lo pone el dibujo y el desnivel se dice').toContainText(
    /PIDROUTE: 6"-P-1001-CS150.*cotas de 2000 a 5000/,
  );

  // ---- b. La lista de materiales, sacada del modelo -----------------------
  await type(page, 'PIDMTO');
  // 12 + 3 (montante) + 9 = 24 m. Medidos en 3D: en planta serían 21.
  await expect(log, 'los metros salen de la geometría 3D, no de la planta').toContainText(
    /24\.00 m de tubo/,
  );
  await expect(log, 'y los codos se deducen: el del giro y el del montante').toContainText(
    /Codo 90° 6" CS150: 2 pz/,
  );
  await expect(log, 'con su límite, que no se calla').toContainText(
    /Sin espesor, diámetro exterior, peso, clave de compra ni precio/,
  );

  // ---- c. El isométrico, con su hoja --------------------------------------
  await type(page, 'PIDISO');
  await enter(page);                   // una sola línea con ruta 3D: Intro la acepta
  await expect(log, 'la orden dice qué hoja hizo y con qué').toContainText(
    /PIDISO: isométrico de 6"-P-1001-CS150 en la hoja «ISO-6"-P-1001-CS150»/,
  );
  await expect(log, 'y declara que no está a escala, que es lo que lo hace legible').toContainText(
    /Sin escala: las longitudes rotuladas son las verdaderas/,
  );

  // ---- d. Todo en el DOCUMENTO QUE RECIBE EL SERVIDOR ---------------------
  await saveAndSettle(page, {
    snapshot: () => ({ version: backend.snapshotFor(HOST_MODEL, HOST_REVISION).version }),
  });
  const guardado = backend.snapshotFor(HOST_MODEL, HOST_REVISION).document as unknown as CadDocument;

  const ruta = guardado.entities.find(
    (entidad) => entidad.context?.metadata?.['pl:ruta'] === '3D',
  ) as Extract<CadDocument['entities'][number], { type: 'polyline' }> | undefined;
  expect(ruta, 'la ruta viaja en el documento canónico').toBeTruthy();
  expect(ruta!.type, 'y es una POLILÍNEA: ningún tipo de entidad nuevo').toBe('polyline');
  expect(ruta!.context!.metadata!['pl:linea'], 'con su número de línea').toBe(LINEA);
  expect(
    ruta!.vertices.map((vertice) => [vertice.x, vertice.y, vertice.z]),
    'cuatro vértices: los tres tecleados y el del MONTANTE, que nadie dibujó',
  ).toEqual([
    [0, 0, 2_000],
    [12_000, 0, 2_000],
    [12_000, 0, 5_000],
    [12_000, 9_000, 5_000],
  ]);

  const isoTubo = guardado.entities.filter((entidad) => entidad.layer === 'ISO-TUB');
  expect(isoTubo.length, 'el trazo del isométrico está en su capa').toBeGreaterThan(0);
  const rotulos = guardado.entities.flatMap((entidad) =>
    entidad.type === 'mtext' && entidad.layer === 'ISO-ROT' ? [entidad.text] : [],
  );
  for (const esperado of ['12.00 m', '3.00 m', '9.00 m'])
    expect(rotulos, `la longitud VERDADERA ${esperado} está rotulada`).toContain(esperado);
  expect(rotulos, 'y el norte, sin el cual no se monta en obra').toContain('N');
  expect(
    rotulos.some((texto) => texto.includes(LINEA) && /SIN ESCALA/.test(texto)),
    'con el título que declara que no está a escala',
  ).toBe(true);

  const tabla = guardado.entities.find((entidad) => entidad.type === 'table') as
    | Extract<CadDocument['entities'][number], { type: 'table' }>
    | undefined;
  expect(tabla, 'la lista de materiales es una TABLE del documento, no un renglón que se pierde').toBeTruthy();
  const titulo = tabla!.cells.find((celda) => celda.row === 0)?.text ?? '';
  expect(titulo, 'que dice de qué línea es').toContain(LINEA);
  expect(titulo, 'y lleva su límite dentro, que es lo que se imprime').toContain(
    'Sin espesor, diámetro exterior, peso, clave de compra ni precio',
  );
  const filas = tabla!.cells.filter((celda) => celda.column === 0).map((celda) => celda.text);
  expect(filas.some((texto) => /^Tubo 6"$/.test(texto)), `el tubo está en el cuadro: ${filas.join(' | ')}`).toBe(true);
  expect(filas.some((texto) => /^Codo 90° 6"$/.test(texto)), 'y los codos también').toBe(true);

  const hoja = (guardado.paperSpaces ?? []).find((espacio) => espacio.name === `ISO-${LINEA}`);
  expect(hoja, 'la HOJA del isométrico existe: sin ella es geometría en un rincón').toBeTruthy();
  expect((hoja!.viewports ?? []).length, 'con su ventana: una hoja sin ventana es papel').toBe(1);
  expect(
    guardado.layers.some((capa) => capa.name === 'ISO-TUB') &&
      guardado.layers.some((capa) => capa.name === 'ISO-ROT'),
    'y las capas están en la TABLA del documento, no sólo en las entidades',
  ).toBe(true);
});
