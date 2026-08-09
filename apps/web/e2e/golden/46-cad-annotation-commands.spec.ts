import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import { buildCadDimensionGeometry } from '../../src/lib/cad/associative-dimension';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * OLA 4 — la anotación se puede TECLEAR, y la cota no miente.
 *
 * Hasta este cambio el modelo tenía MTEXT, HATCH asociativo y `dimension` con
 * sus siete tipos, con adaptadores, grips y regeneración asociativa. Lo que no
 * existía era la puerta: `DLI`, `T` y `H` no resolvían a nada, así que un plano
 * no se podía acotar. Un plano sin cotas no se puede construir.
 *
 * Lo que este golden prueba y NINGUNA spec de Node puede probar:
 *
 *  1. Que los nombres llegan al producto de verdad y dibujan al teclearlos.
 *  2. Que la cota nace ASOCIATIVA al escribir coordenadas que caen sobre los
 *     extremos de una línea —sin ratón, sin captura de objeto— y que esa
 *     asociatividad SOBREVIVE al guardado y a la reapertura.
 *  3. Y lo que de verdad importa: que al estirar la pieza en una sesión NUEVA,
 *     la cota cambia su valor medido. Una cota que no se actualiza es peor que
 *     no tener cota, porque miente con autoridad.
 *
 * Se afirma el DOCUMENTO, no el aspecto: qué entidades hay, con qué puntos de
 * definición, con qué referencias, y qué texto produce la geometría de la cota.
 * Un diálogo que imprime el prompt correcto y no escribe nada no prueba nada.
 */
function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 4, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [
      {
        id: 'wall',
        type: 'line',
        start: { x: 0, y: 0, z: 0 },
        end: { x: 2000, y: 0, z: 0 },
        layer: '0',
      },
      // Una sala cerrada, lejos del muro, para poder sombrear por punto interior.
      {
        id: 'sala',
        type: 'polyline',
        vertices: [
          { x: 4000, y: 2000, z: 0 },
          { x: 6000, y: 2000, z: 0 },
          { x: 6000, y: 4000, z: 0 },
          { x: 4000, y: 4000, z: 0 },
        ],
        closed: true,
        layer: '0',
      },
    ],
    history: [],
    modelSpace: { entityIds: ['wall', 'sala'] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 12_000,
    footprintH: 10_000,
    unit: 'mm',
    gridSize: 100,
  });
}

/** Teclea en la línea de comandos y confirma, como se haría de verdad. */
async function type(page: Page, value: string) {
  const input = page.getByTestId('cad-command-input');
  await input.click();
  await input.fill(value);
  await input.press('Enter');
}

/** La cota del documento persistido, o falla diciendo qué había. */
function savedDimension(document: CadDocument) {
  const dimension = document.entities.find((entity) => entity.type === 'dimension');
  expect(
    dimension,
    `no hay ninguna cota en el documento (${document.entities.map((entity) => entity.type).join(', ')})`,
  ).toBeTruthy();
  if (dimension?.type !== 'dimension') throw new Error('no es una cota');
  return dimension;
}

test('DIMLINEAR, MTEXT y HATCH se teclean; la cota nace asociativa y cambia de valor al estirar la pieza', async ({
  context,
  page,
}) => {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();

  const prompt = page.getByTestId('cad-command-prompt');
  await expect(page.getByTestId('cad-command-line')).toBeVisible();

  // --- DIMLINEAR: el alias resuelve y pide lo suyo ---------------------------
  await type(page, 'DLI');
  await expect(prompt).toContainText('línea de referencia');

  // Los dos orígenes se teclean SOBRE los extremos del muro. No hay ratón ni
  // captura de objeto: el enganche se resuelve por coincidencia de coordenada,
  // que es lo que hace que acotar por teclado dé cotas vivas y no muertas.
  await type(page, '0,0');
  await type(page, '2000,0');
  await expect(prompt).toContainText('línea de cota');
  // Soltada por encima del muro: se mide la distancia HORIZONTAL.
  await type(page, '1000,600');
  await expect(prompt).toBeHidden();

  // --- un rótulo y un sombreado, para que la ola entera se vea usada ----------
  await type(page, 'T');
  await expect(prompt).toContainText('esquina');
  await type(page, '0,1500');
  await type(page, '3000,1000');
  await type(page, 'PLANTA BAJA');
  // En MTEXT cada línea tecleada es un párrafo y Enter con la caja vacía remata,
  // que es el gesto del editor en sitio.
  await page.getByTestId('cad-command-input').press('Enter');
  await expect(prompt).toBeHidden();

  // --- HATCH por punto interior, tecleado ------------------------------------
  await type(page, 'H');
  await expect(prompt).toContainText('punto interior');
  await type(page, '5000,3000');
  await expect(prompt).toBeHidden();

  await expect(page.getByTestId('cad-native-document-count')).toHaveText('Native 5');

  // --- lo escrito persiste, y persiste ENGANCHADO ----------------------------
  await saveAndSettle(page, backend);
  const created = savedDimension(backend.snapshot().document);
  expect(created.dimensionKind).toBe('linear');
  expect(created.axis).toBe('x');
  expect(created.a).toMatchObject({ x: 0, y: 0 });
  expect(created.b).toMatchObject({ x: 2000, y: 0 });
  // `linearDimension` mide el desfase desde el extremo mayor del eje
  // perpendicular: 600 − max(0, 0). Si la línea de cota no cayera donde se
  // soltó, este número sería otro.
  expect(created.offset).toBe(600);
  expect(created.associative).toBe(true);
  expect(created.references).toEqual([
    { entityId: 'wall', anchor: 'start' },
    { entityId: 'wall', anchor: 'end' },
  ]);
  expect(buildCadDimensionGeometry(created)?.label).toBe('2000.00 mm');

  const hatch = backend
    .snapshot()
    .document.entities.find((entity) => entity.type === 'hatch');
  expect(hatch?.type).toBe('hatch');
  if (hatch?.type !== 'hatch') throw new Error('el sombreado no llegó al documento');
  expect(hatch.associative).toBe(true);
  expect(hatch.boundaryRefs).toEqual(['sala']);
  // Ángulo 45 y espaciado derivado del contorno: los valores que el renderizador
  // usa de verdad. Con 0 y 1 el patrón guardado no se parecería al dibujado.
  expect(hatch.angle).toBe(45);
  expect(hatch.scale).toBeCloseTo(Math.hypot(2000, 2000) / 40, 6);
  // El relleno entra al FONDO del orden de dibujo, o taparía la sala.
  expect(backend.snapshot().document.modelSpace.entityIds[0]).toBe(hatch.id);

  const text = backend
    .snapshot()
    .document.entities.find((entity) => entity.type === 'mtext');
  expect(text?.type).toBe('mtext');
  if (text?.type !== 'mtext') throw new Error('el rótulo no llegó al documento');
  expect(text.text).toBe('PLANTA BAJA');
  // Esquina superior izquierda de la caja, normalizada aunque se marcara al revés.
  expect(text.insertion).toMatchObject({ x: 0, y: 1500 });
  expect(text.width).toBe(3000);

  // --- SESIÓN NUEVA: se reabre el dibujo guardado ----------------------------
  // Reabrir es la mitad de la prueba. Una asociatividad que sólo funciona
  // mientras la pestaña sigue abierta no es asociatividad: es una variable viva.
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();
  await expect(page.getByTestId('cad-native-document-count')).toHaveText('Native 5');

  // --- se estira UN extremo del muro; nadie toca la cota ----------------------
  await type(page, 'S');
  await expect(page.getByTestId('cad-command-prompt')).toContainText('esquina');
  // Ventana [1000,−500]–[3000,500]: dentro cae sólo el extremo derecho del muro.
  await type(page, '1000,-500');
  await type(page, '3000,500');
  await type(page, '0,0');
  await type(page, '500,0');
  await expect(page.getByTestId('cad-command-prompt')).toBeHidden();

  // --- y la cota dice el número nuevo ----------------------------------------
  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document;

  const wall = saved.entities.find((entity) => entity.id === 'wall');
  expect(wall?.type).toBe('line');
  if (wall?.type !== 'line') throw new Error('el muro dejó de ser una línea');
  expect(wall.start).toMatchObject({ x: 0, y: 0 });
  expect(wall.end).toMatchObject({ x: 2500, y: 0 });

  const updated = savedDimension(saved);
  // El punto de definición siguió al extremo, sin que nadie tocara la cota.
  expect(updated.a).toMatchObject({ x: 0, y: 0 });
  expect(updated.b).toMatchObject({ x: 2500, y: 0 });
  expect(updated.associationStatus).toBe('associated');
  // Y el TEXTO. Es la aserción que separa «la cota se movió» de «la cota dice la
  // verdad»: con un ancla absoluta, una implementación que arrastrara la
  // geometría y dejara el número viejo fallaría aquí y sólo aquí.
  expect(buildCadDimensionGeometry(updated)?.label).toBe('2500.00 mm');
});
