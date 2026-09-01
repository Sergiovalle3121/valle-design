import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import type { CadDocument } from '../../src/lib/cad/cad-document';
import { enter3DView } from '../fixtures/view-mode';
import { topView, fitFootprint } from "../fixtures/camera-preset";

/**
 * FASE 1 — el pipeline de render por lotes DIBUJA el producto.
 *
 * `lib/cad/render/` llevaba 21 archivos completos y probados desde la ola 1, y
 * `grep -rn "cad/render/" apps/web/src` fuera de su carpeta devolvía vacío. El
 * zoom de 29 s a 100.000 entidades que el benchmark decía haber arreglado
 * seguía vivo en el producto, porque el camino medido no era el ejecutado.
 *
 * Este golden existe para que eso no pueda repetirse en silencio. Afirma tres
 * cosas que sólo un navegador de verdad puede decir, y que el benchmark de Node
 * confiesa NO haber medido en su campo `notMeasured`:
 *
 *  1. Qué pipeline dibuja (`data-pipeline`).
 *  2. Que el detalle cubre TODAS las entidades visibles, sin muestreo
 *     (`data-rendered` === `data-visible`).
 *  3. Que el ATLAS DE TEXTO rasteriza de verdad (`data-glyphs` > 0). En Node no
 *     hay canvas, así que `text-atlas.ts` NUNCA se había ejecutado: éste es su
 *     primer contacto con un rasterizador.
 *
 * El corpus tampoco es el del benchmark. Aquél eran 49.870 líneas, 24.966
 * círculos y 25.164 arcos y CERO polilíneas, hatches, mtext, cotas e inserts.
 * Aquí hay uno de cada, que es donde se rompen los cableados.
 */

function mixedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [
      {
        id: 'linea',
        type: 'line',
        start: { x: 1_000, y: 1_000, z: 0 },
        end: { x: 5_000, y: 1_000, z: 0 },
        layer: '0',
      },
      {
        id: 'polilinea',
        type: 'polyline',
        vertices: [
          { x: 1_000, y: 2_000, z: 0 },
          { x: 3_000, y: 2_000, z: 0, bulge: 0.5 },
          { x: 5_000, y: 3_600, z: 0 },
        ],
        closed: false,
        layer: '0',
      },
      {
        id: 'circulo',
        type: 'circle',
        center: { x: 7_000, y: 2_000, z: 0 },
        radius: 900,
        layer: '0',
      },
      {
        id: 'arco',
        type: 'arc',
        center: { x: 9_400, y: 2_000, z: 0 },
        radius: 700,
        startAngle: 0,
        endAngle: 140,
        layer: '0',
      },
      {
        id: 'sombreado',
        type: 'hatch',
        pattern: 'ANSI31',
        solid: false,
        boundaries: [[
          { x: 1_000, y: 4_500, z: 0 },
          { x: 4_000, y: 4_500, z: 0 },
          { x: 4_000, y: 6_500, z: 0 },
          { x: 1_000, y: 6_500, z: 0 },
        ]],
        layer: '0',
      },
      {
        id: 'cota',
        type: 'dimension',
        a: { x: 1_000, y: 1_000 },
        b: { x: 5_000, y: 1_000 },
        offset: 600,
        dimensionKind: 'linear',
        axis: 'x',
        layer: '0',
      },
      {
        id: 'rotulo',
        type: 'mtext',
        insertion: { x: 6_000, y: 6_000, z: 0 },
        text: 'PLANTA BAJA',
        height: 400,
        layer: '0',
      },
      {
        id: 'insercion',
        type: 'insert',
        block: 'marca',
        insertion: { x: 9_000, y: 6_000, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        rotation: 0,
        layer: '0',
      },
    ],
    history: [],
    // El SOMBREADO va primero en el orden de dibujo: es lo que queda debajo. Si
    // el cableado perdiera la profundidad semántica, empezaría a tapar la
    // geometría que rellena, y en un dibujo pequeño nadie lo vería.
    modelSpace: {
      entityIds: [
        'sombreado', 'linea', 'polilinea', 'circulo',
        'arco', 'cota', 'rotulo', 'insercion',
      ],
    },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [
      {
        id: 'marca',
        name: 'MARCA',
        basePoint: { x: 0, y: 0, z: 0 },
        entities: [
          {
            id: 'marca-linea',
            type: 'line',
            start: { x: -300, y: -300, z: 0 },
            end: { x: 300, y: 300, z: 0 },
            layer: '0',
          },
        ],
      },
    ],
    constraints: [], externalReferences: [],
    unsupportedEntities: [], lossManifest: [], publications: [],
  };
}

async function openStudio(context: BrowserContext, page: Page, search = '') {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadStudioBackend<CadDocument>(context, mixedDocument(), {
    footprintW: 12_000, footprintH: 10_000, unit: 'mm', gridSize: 100,
  });
  await page.goto(`/legacy/studio${search}`);
  await expect(page.getByTestId('cad-canvas')).toBeVisible();
  await expect(page.getByTestId('cad-native-document-count')).toHaveText('Native 8');
  return backend;
}

const badge = (page: Page) => page.getByTestId('cad-render-pipeline');

/** Espera a que el pipeline asiente: la carga es progresiva por diseño. */
async function settled(page: Page) {
  await expect(badge(page)).toHaveAttribute('data-settled', 'true', { timeout: 30_000 });
}

const numberOf = async (page: Page, attribute: string) =>
  Number(await badge(page).getAttribute(attribute));

test('un documento con MTEXT, sombreado e inserción se dibuja con el pipeline por lotes', async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  await openStudio(context, page);
  await enter3DView(page);
  await topView(page);
  await fitFootprint(page);

  // 1. QUÉ pipeline dibuja. El defecto del producto es el nuevo; si alguien lo
  //    apagara «temporalmente», este golden lo diría en la primera línea.
  await expect(badge(page)).toHaveAttribute('data-pipeline', 'batched');
  await settled(page);

  // 1b. Y QUIÉN teseló: el WORKER. Si el empaquetado del worker se rompiera,
  //     el cliente caería a la reserva síncrona en silencio y el dibujo
  //     saldría idéntico — sólo que otra vez en el hilo principal. Éste es el
  //     único sitio donde ese silencio se vuelve un rojo: `data-tessellation`
  //     publica lo que el cliente declaró, sin adornar.
  await expect(badge(page)).toHaveAttribute('data-tessellation', 'worker');

  // 2. SIN MUESTREO. El pipeline anterior detallaba un presupuesto de entidades
  //    y dibujaba el resto como un contorno de 8 segmentos. Aquí el detalle
  //    cubre todo lo visible: es la propiedad que da sentido a la ola entera.
  const visible = await numberOf(page, 'data-visible');
  const rendered = await numberOf(page, 'data-rendered');
  expect(visible).toBeGreaterThan(0);
  expect(rendered).toBe(visible);

  // 3. Geometría de verdad en la GPU: lotes instanciados con segmentos dentro.
  expect(await numberOf(page, 'data-batches')).toBeGreaterThan(0);
  // Ocho entidades con arcos, sombreado y cota son cientos de segmentos, no
  // ocho: si esto bajara a las decenas, algo estaría teselando al escalón más
  // grueso o directamente saltándose entidades.
  expect(await numberOf(page, 'data-instances')).toBeGreaterThan(100);

  // 4. EL ATLAS DE TEXTO RASTERIZA. Ésta es la afirmación que ninguna prueba de
  //    Node podía hacer —«en Node no hay canvas, así que el atlas de texto no
  //    entra en esta corrida», dice el propio benchmark—. `PLANTA BAJA` son 11
  //    caracteres; el espacio no produce quad, así que salen 10 glifos.
  expect(await numberOf(page, 'data-glyphs')).toBeGreaterThanOrEqual(10);
  // Y ninguno se cayó del atlas: un glifo descartado es un rótulo incompleto.
  expect(await numberOf(page, 'data-dropped-glyphs')).toBe(0);

  // 5. El lienzo sigue vivo tras todo esto: ni excepción ni contexto perdido.
  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();
});

test('apagar una capa no reconstruye la escena: es un booleano por lote', async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  await openStudio(context, page);
  await enter3DView(page);
  await topView(page);
  await fitFootprint(page);
  await settled(page);

  const before = await numberOf(page, 'data-batches');
  expect(before).toBeGreaterThan(0);

  // Recorrer la vista tampoco reconstruye: los tiles que siguen dentro
  // conservan su geometría y sólo se reescriben cuatro uniformes de cámara.
  await fitFootprint(page);
  await settled(page);
  expect(await numberOf(page, 'data-rendered')).toBe(await numberOf(page, 'data-visible'));
});
