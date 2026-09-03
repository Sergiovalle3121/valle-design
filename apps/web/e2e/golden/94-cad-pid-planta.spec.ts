import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { CadV1Backend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * EL P&ID DE PLANTA, TECLEADO ENTERO — Y EN EL SERVIDOR.
 *
 * ## Qué estaba medido
 *
 * `docs/competitive/distancia-autocad-completo-20260903.md`: «**Plant 3D =
 * 0 %**», re-medido el 3 de septiembre sondeando catorce nombres de la familia
 * contra el registro —PLANTPROJECT, PIPESPEC, ISOGEN, PLANTPID, PIDLINE,
 * LINENUMBER, EQUIPMENT, NOZZLE, VALVEADD, INSTRUMENT, SPECEDITOR,
 * PLANTDATAMANAGER, ROUTEPIPE, ISOCONFIG— con **cero aciertos**.
 *
 * ## Qué fija este golden, y por qué no es «dos comandos más»
 *
 * Un P&ID es dos cosas a la vez: LÍNEAS con su número —`6"-P-1001-CS150`, la
 * clave de la que cuelgan el isométrico, la lista de líneas, la requisición y
 * la prueba hidrostática— y EQUIPOS con su etiqueta —`P-101`—. Una sola de las
 * dos no es un entregable.
 *
 * Y hay algo que el P&ID de AutoCAD **no puede** dar: el metrado. Su diagrama
 * es esquemático, no está a escala, y la longitud de tubería se saca aparte.
 * Aquí la línea es una polilínea del mismo dibujo: **el plano sabe cuánto
 * mide**, y `PIDLIST` lo dice sin salir del diagrama.
 *
 * Se teclea la cadena entera y se afirma sobre el DOCUMENTO QUE RECIBE EL
 * SERVIDOR: que las líneas son polilíneas con su marca —ningún tipo de entidad
 * nuevo—, que el correlativo lo puso el DIBUJO, que el equipo nació CON su
 * etiqueta en los atributos del `INSERT`, que el bloque quedó definido en el
 * documento y que las capas están en la tabla. Nada mira una captura.
 */
const HOST_MODEL = 'AXOS-CAD-STUDIO';
const HOST_REVISION = 'UNIVERSAL';
const FOOTPRINT = { footprintW: 40_000, footprintH: 40_000, unit: 'mm', gridSize: 100 };

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

/** Intro a secas: acepta el valor por defecto o termina la secuencia de puntos. */
async function enter(page: Page) {
  await page.keyboard.press('Enter');
}

test('Un P&ID se traza tecleado: la línea lleva su número, el equipo su etiqueta y el metrado sale del plano', async ({
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

  // ---- a. La línea de proceso, 12 m de 6" ---------------------------------
  // Las coordenadas se TECLEAN: el plano está en milímetros, así que 12.000
  // unidades son 12 m, y ése es el metrado que después se afirma.
  await type(page, 'PIDLINE');
  await type(page, '6"');
  await type(page, 'P');
  await type(page, 'CS150');
  await type(page, '0,0');
  await type(page, '12000,0');
  await enter(page);
  await expect(log, 'el correlativo lo pone el dibujo y arranca en 1001').toContainText(
    /PIDLINE: 6"-P-1001-CS150/,
  );

  // ---- b. La segunda del mismo servicio continúa la cuenta ----------------
  await type(page, 'PIDLINE');
  await type(page, '4"');
  await type(page, 'P');
  await type(page, 'CS150');
  await type(page, '12000,0');
  await type(page, '12000,8000');
  await enter(page);
  await expect(log, 'la segunda es la 1002, no otra 1001').toContainText(
    /PIDLINE: 4"-P-1002-CS150/,
  );

  // ---- c. El equipo nace CON su etiqueta ----------------------------------
  // `B` elige la bomba; el Intro acepta el prefijo `P` que propone el símbolo.
  await type(page, 'PIDEQUIP');
  await type(page, 'B');
  await enter(page);
  await type(page, '20000,20000');
  await expect(log, 'colocar y etiquetar son un solo acto: la bomba sale P-101').toContainText(
    /PIDEQUIP: Bomba centrífuga P-101/,
  );
  await expect(log, 'y el bloque se define en el dibujo, no se supone').toContainText(
    /bloque PID-BOMBA definido en el dibujo/,
  );

  // ---- d. El metrado, que un P&ID de AutoCAD no puede dar -----------------
  await type(page, 'PIDLIST');
  await expect(log, 'la longitud sale del PLANO: 12 m la primera').toContainText(
    /6"-P-1001-CS150 \(12\.0 m\)/,
  );
  await expect(log, 'y 8 m la segunda').toContainText(/4"-P-1002-CS150 \(8\.0 m\)/);
  await expect(log, 'sin inventar errores donde no los hay').toContainText(/sin hallazgos/);
  await expect(log, 'y con el límite en el mismo renglón: la especificación la aprueba la ingeniería').toContainText(
    /NO se comprueba contra el catálogo del proyecto/,
  );

  // ---- e. La lista de equipos cuenta lo que hay ---------------------------
  await type(page, 'PIDEQUIPLIST');
  await expect(log, 'un equipo, con su etiqueta').toContainText(/1 equipo\(s\): P-101/);

  // ---- f. Un diámetro que no se compra, cazado ANTES de la requisición ----
  await type(page, 'PIDLINE');
  await type(page, '5"');
  await type(page, 'V');
  await type(page, 'CS150');
  await type(page, '0,15000');
  await type(page, '3000,15000');
  await enter(page);
  await type(page, 'PIDLIST');
  await expect(log, 'el 5" no existe en catálogo comercial, y se dice').toContainText(
    /DIÁMETRO NO COMERCIAL/,
  );

  // ---- g. Y todo está en el DOCUMENTO QUE RECIBE EL SERVIDOR --------------
  await saveAndSettle(page, {
    snapshot: () => ({ version: backend.snapshotFor(HOST_MODEL, HOST_REVISION).version }),
  });
  const guardado = backend.snapshotFor(HOST_MODEL, HOST_REVISION).document as unknown as CadDocument;

  const lineas = guardado.entities.filter(
    (entidad) => typeof entidad.context?.metadata?.['pl:linea'] === 'string',
  );
  expect(lineas.length, 'las tres líneas viajan en el documento canónico').toBe(3);
  expect(
    lineas.every((entidad) => entidad.type === 'polyline'),
    'y son POLILÍNEAS: la campaña no añadió ningún tipo de entidad',
  ).toBe(true);
  expect(
    lineas.map((entidad) => entidad.context!.metadata!['pl:linea']).sort(),
    'con el número compuesto que puso el dibujo, no el usuario',
  ).toEqual(['4"-P-1002-CS150', '5"-V-1001-CS150', '6"-P-1001-CS150']);
  expect(
    lineas.every((entidad) => entidad.layer === 'TU-PROC'),
    'en la capa de proceso, que la orden dio de alta sola',
  ).toBe(true);
  expect(
    guardado.layers.some((capa) => capa.name === 'TU-PROC'),
    'y la capa está en la TABLA del documento, no sólo en las entidades',
  ).toBe(true);

  // El metrado que PIDLIST anunció se comprueba sobre la GEOMETRÍA guardada:
  // 12.000 + 8.000 unidades de un dibujo en milímetros son 20 m de proceso.
  const proceso = lineas.filter(
    (entidad) => entidad.context!.metadata!['pl:servicio'] === 'P',
  );
  const recorrido = proceso.reduce((total, entidad) => {
    const puntos = (entidad as Extract<CadDocument['entities'][number], { type: 'polyline' }>).vertices;
    let tramo = 0;
    for (let i = 1; i < puntos.length; i += 1)
      tramo += Math.hypot(puntos[i].x - puntos[i - 1].x, puntos[i].y - puntos[i - 1].y);
    return total + tramo;
  }, 0);
  expect(recorrido, `el recorrido de proceso guardado son 20 m en milímetros (${recorrido})`).toBeCloseTo(
    20_000,
    -1,
  );

  const bomba = guardado.entities.find(
    (entidad) => entidad.type === 'insert' && entidad.block === 'PID-BOMBA',
  ) as Extract<CadDocument['entities'][number], { type: 'insert' }> | undefined;
  expect(bomba, 'la bomba viaja como INSERT, que es lo que abre cualquier despacho').toBeTruthy();
  expect(bomba!.attributes?.TAG, 'con su etiqueta en los ATRIBUTOS del bloque').toBe('P-101');
  expect(bomba!.layer, 'en la capa de equipos').toBe('TU-EQ');
  expect(
    (guardado.blocks ?? []).some((bloque) => bloque.id === 'PID-BOMBA'),
    'y la DEFINICIÓN del bloque está en el documento: el símbolo no es una promesa',
  ).toBe(true);
  expect(
    guardado.layers.some((capa) => capa.name === 'TU-EQ'),
    'con su capa en la tabla',
  ).toBe(true);
});
