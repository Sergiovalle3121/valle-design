import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { CadV1Backend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * EL ALZADO DE UNA PLANTA DE ARQUITECTURA, CON OCULTA EXACTA.
 *
 * ## Qué estaba roto, medido
 *
 * `docs/competitive/distancia-autocad-completo-20260901.md`, defecto (c): «el
 * único camino con oculta exacta (FLATSHOT) RECHAZA los muros, así que el
 * modelo del arquitecto no puede usarlo». Era literal: la orden recogía sólo
 * entidades `solid3d`, y una planta de arquitectura no tiene ninguna — sus
 * muros son objetos de planta a los que el visor 3D ya les da altura desde su
 * catálogo de arquetipos. El resultado: «no hay ningún sólido que aplanar»
 * sobre un modelo lleno de muros.
 *
 * ## Lo que este golden fija
 *
 * Que teclear `UCS X 90` (el SCU de alzado) y `FLATSHOT` sobre una planta de
 * MUROS deje el bloque del aplanado con sus líneas EN EL DOCUMENTO QUE RECIBE
 * EL SERVIDOR. Y que el mueble sin altura declarada no desaparezca en silencio:
 * la orden lo cuenta.
 */
const HOST_MODEL = 'AXOS-CAD-STUDIO';
const HOST_REVISION = 'UNIVERSAL';
const FOOTPRINT = { footprintW: 12_000, footprintH: 9_000, unit: 'mm', gridSize: 100 };

function planta(): CadDocument {
  const muro = (id: string, x: number, y: number, w: number, h: number) => ({
    id, type: 'box', kind: 'wall', x, y, w, h, rotation: 0, layer: '0', shape: 'rect',
  });
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [
      // Dos muros en L, como cualquier planta: uno al frente y otro detrás, para
      // que la oculta tenga algo que resolver.
      muro('muro-frente', 0, 0, 6_000, 150),
      muro('muro-fondo', 0, 4_000, 6_000, 150),
      // Una PUERTA en el muro del frente: en un alzado es un HUECO, no un
      // bloque de 2,20 m plantado encima del muro.
      { id: 'puerta', type: 'box', kind: 'door', x: 2_000, y: -175, w: 900, h: 500, rotation: 0, layer: '0', shape: 'rect' },
      // Un mueble cuyo `kind` no declara altura: tiene que quedarse fuera Y
      // contarse, no desaparecer.
      { id: 'mueble', type: 'box', kind: 'kind-inexistente', x: 1_000, y: 1_000, w: 1_200, h: 600, rotation: 0, layer: '0', shape: 'rect' },
    ],
    history: [],
    modelSpace: { entityIds: ['muro-frente', 'muro-fondo', 'puerta', 'mueble'] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
  } as unknown as CadDocument;
}

async function installCadBackend(context: BrowserContext) {
  const backend = new CadV1Backend([
    {
      model: HOST_MODEL, revision: HOST_REVISION, version: 0, footprint: FOOTPRINT,
      document: planta() as unknown as Record<string, unknown>,
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

test('FLATSHOT aplana una planta de MUROS y deja el alzado en el documento del servidor', async ({
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

  // ---- a. El SCU de alzado: girar 90° alrededor de X --------------------
  await type(page, 'UCS');
  await type(page, 'X');
  await type(page, '90');

  // ---- b. FLATSHOT sobre la planta entera --------------------------------
  await type(page, 'FLATSHOT');
  // El punto se señala con el ratón, que es como se hace: teclear coordenadas
  // bajo un SCU inclinado es otra conversación.
  {
    const caja = (await page.getByTestId('cad-canvas').boundingBox())!;
    await page.mouse.click(caja.x + caja.width * 0.35, caja.y + caja.height * 0.6);
  }

  await expect(log, 'el aplanado cuenta sus líneas en vez de decir «Hecho»').toContainText(
    /FLATSHOT (creó|reemplazó) .*línea\(s\) vista\(s\)/,
  );
  await expect(log, 'la puerta se resta como HUECO, y se cuenta').toContainText(
    /1 hueco\(s\) restado\(s\)/,
  );
  await expect(log, 'y lo que se quedó fuera, con su motivo').toContainText(/1 fuera/);
  await expect(log).toContainText(/no declara altura/);

  // ---- c. Y está en el DOCUMENTO QUE RECIBE EL SERVIDOR -------------------
  await saveAndSettle(page, {
    snapshot: () => ({ version: backend.snapshotFor(HOST_MODEL, HOST_REVISION).version }),
  });
  const guardado = backend.snapshotFor(HOST_MODEL, HOST_REVISION).document as unknown as CadDocument;

  const bloque = (guardado.blocks ?? []).find((definicion) => /aplanado/i.test(definicion.name));
  expect(bloque, 'el bloque del aplanado viaja en el documento canónico').toBeTruthy();
  const lineas = bloque!.entities.filter((entidad) => entidad.type === 'line');
  expect(lineas.length, 'con líneas de verdad dentro').toBeGreaterThan(3);

  // El alzado de un muro de 3.000 mm de alto mide 3.000 en el dibujo: es la
  // altura del catálogo con la que el visor 3D ya lo levanta.
  const ys = lineas.flatMap((linea) => {
    const l = linea as Extract<CadDocument['entities'][number], { type: 'line' }>;
    return [l.start.y, l.end.y];
  });
  const alto = Math.max(...ys) - Math.min(...ys);
  expect(alto, `el alzado mide la altura del muro (${alto})`).toBeGreaterThan(2_900);
  expect(alto).toBeLessThan(3_100);

  // El HUECO de la puerta está de verdad en el alzado: hay vértices a la altura
  // de su dintel (2.200) que un muro entero no tendría.
  const alturaDelDintel = ys.filter((y) => Math.abs(y - 2_200) < 5).length;
  expect(
    alturaDelDintel,
    `el dintel de la puerta aparece en el alzado (${alturaDelDintel} extremos a 2.200)`,
  ).toBeGreaterThan(0);

  // Y hay una inserción del bloque, no sólo la definición.
  const insercion = guardado.entities.find(
    (entidad) => entidad.type === 'insert' && /aplanado|block:/i.test(entidad.block),
  );
  expect(insercion, 'el aplanado se INSERTA, no se queda de definición huérfana').toBeTruthy();
});
