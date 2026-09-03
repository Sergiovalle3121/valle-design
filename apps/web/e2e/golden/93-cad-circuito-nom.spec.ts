import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { CadV1Backend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * EL CIRCUITO ELÉCTRICO, NUMERADO Y REVISADO CONTRA LA NOM — EN EL SERVIDOR.
 *
 * ## Qué estaba medido
 *
 * `docs/competitive/distancia-autocad-completo-20260901.md`: «**Electrical ≈
 * 1 %.** Nada. Ni un comando, ni una entidad de cable o componente, ni
 * numeración de conductores». Lo re-medí sondeando catorce nombres de la
 * familia contra el registro: cero aciertos.
 *
 * ## Lo que este golden fija, y por qué importa más que una lista de comandos
 *
 * AutoCAD Electrical numera conductores y saca listas. Lo que NO hace —ni
 * puede, porque sus conductores son esquemáticos y no están a escala— es
 * comprobar si el calibre aguanta la protección y cuánta tensión se cae. Aquí
 * el conductor es una polilínea a escala: **el dibujo sabe cuánto mide**, y la
 * revisión sale del plano.
 *
 * Se teclea la cadena entera —dos tramos de conductor, los datos del circuito,
 * la revisión— y se afirma sobre el DOCUMENTO QUE RECIBE EL SERVIDOR: que el
 * conductor es una polilínea con su marca (nada de entidad nueva), que el
 * número lo puso el dibujo, y que la revisión caza el error con su número. Nada
 * mira una captura.
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

test('Un ramal se traza, se numera solo y la NOM lo revisa con la longitud del plano', async ({
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

  // ---- a. Dos tramos de conductor, 15 m cada uno --------------------------
  // Las coordenadas se TECLEAN: el plano está en milímetros, así que 15.000
  // unidades son 15 m, y la longitud del recorrido es lo que después decide si
  // la caída de tensión se pasa.
  await type(page, 'AEWIRE');
  await type(page, 'C-1');
  await type(page, '12');
  await type(page, '0,0');
  await type(page, '15000,0');
  await enter(page);
  await expect(log, 'el número lo pone el dibujo, y se dice').toContainText(
    /AEWIRE: conductor C-1-1, calibre 12/,
  );

  await type(page, 'AEWIRE');
  await type(page, 'C-1');
  await type(page, '12');
  await type(page, '15000,0');
  await type(page, '15000,15000');
  await enter(page);
  await expect(log, 'el segundo continúa la cuenta del circuito, no repite el 1').toContainText(
    /AEWIRE: conductor C-1-2/,
  );

  // ---- b. Los datos del circuito, en un solo paso -------------------------
  await type(page, 'AECIRCUIT');
  await type(page, 'C-1');
  await type(page, '20');
  await type(page, '127');
  await type(page, 'M');
  await expect(log, 'los DOS conductores quedan marcados de una vez').toContainText(
    /AECIRCUIT: C-1 a 20 A, 127 V, monofásico — 2 conductor\(es\)/,
  );

  // ---- c. La revisión, que es lo que AutoCAD Electrical no puede hacer ----
  await type(page, 'AECHECK');
  await expect(log, 'la caída se calcula con los 30 m que MIDE el plano').toContainText(
    /caída es del 6\.1 % en 30\.0 m/,
  );
  await expect(log, 'y propone el calibre que lo resuelve').toContainText(
    /con 8 AWG bajaría del tope/,
  );
  await expect(log, 'el límite va SIEMPRE: esto no es un certificado').toContainText(
    /No es memorial de cálculo/,
  );

  // ---- d. Subir la protección lo convierte en NO CUMPLE -------------------
  await type(page, 'AECIRCUIT');
  await type(page, 'C-1');
  await type(page, '30');
  await type(page, '127');
  await type(page, 'M');
  await type(page, 'AECHECK');
  await expect(log, 'un 12 AWG con 30 A no cumple, y se dice con los dos números').toContainText(
    /admite hasta 20 A y la protección es de 30 A/,
  );
  await expect(log, 'citando el artículo, para poder cotejarlo con la norma').toContainText(
    /240-4\(D\)/,
  );

  // ---- e. Y todo está en el DOCUMENTO QUE RECIBE EL SERVIDOR --------------
  await saveAndSettle(page, {
    snapshot: () => ({ version: backend.snapshotFor(HOST_MODEL, HOST_REVISION).version }),
  });
  const guardado = backend.snapshotFor(HOST_MODEL, HOST_REVISION).document as unknown as CadDocument;

  const conductores = guardado.entities.filter(
    (entidad) => entidad.context?.metadata?.['ie:circuito'] === 'C-1',
  );
  expect(conductores.length, 'los dos conductores viajan en el documento canónico').toBe(2);
  expect(
    conductores.every((entidad) => entidad.type === 'polyline'),
    'y son POLILÍNEAS: la campaña no añadió ningún tipo de entidad',
  ).toBe(true);
  expect(
    conductores.map((entidad) => entidad.context!.metadata!['ie:numero']).sort(),
    'con sus números, que puso el dibujo y no el usuario',
  ).toEqual(['1', '2']);
  expect(
    conductores.every((entidad) => entidad.context!.metadata!['ie:proteccion'] === '30'),
    'y con la protección que AECIRCUIT estampó en los dos',
  ).toBe(true);
  expect(
    conductores.every((entidad) => entidad.layer === 'IE-CIR'),
    'en la capa del circuito, que la orden dio de alta sola',
  ).toBe(true);
  expect(
    guardado.layers.some((capa) => capa.name === 'IE-CIR'),
    'y la capa está en la tabla del documento, no sólo en las entidades',
  ).toBe(true);

  // La longitud que la revisión usó es la del PLANO: 15.000 + 15.000 unidades
  // de un dibujo en milímetros son 30 m. Se comprueba sobre la geometría
  // guardada, no sobre el renglón que la anunció.
  const recorrido = conductores.reduce((total, entidad) => {
    const puntos = (entidad as Extract<CadDocument['entities'][number], { type: 'polyline' }>).vertices;
    let tramo = 0;
    for (let i = 1; i < puntos.length; i += 1)
      tramo += Math.hypot(puntos[i].x - puntos[i - 1].x, puntos[i].y - puntos[i - 1].y);
    return total + tramo;
  }, 0);
  expect(recorrido, `el recorrido guardado son 30 m en milímetros (${recorrido})`).toBeCloseTo(
    30_000,
    -1,
  );
});
