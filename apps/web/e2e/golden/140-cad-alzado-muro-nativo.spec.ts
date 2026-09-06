import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { CadV1Backend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * T-33 · FLATSHOT SOBRE EL MURO NATIVO — no sólo el heredado.
 *
 * ## Qué estaba roto, medido
 *
 * El golden 92 ya fijó que `FLATSHOT` aplana una planta de muros — pero sobre
 * el muro HEREDADO (`{type:'box', kind:'wall'}`), y `grep -n '92-cad-alzado'
 * docs/competitive/rubric.json` no encuentra ninguna fila: ese golden no es
 * evidencia de ninguna capacidad cobrada. La entidad que el comando `WALL`
 * emite HOY es otra por completo — `type: "wall"`, la paramétrica del esquema
 * 6 — y ésa caía por el mismo filtro que una línea o un texto:
 * `flatshot-solids.ts:181-192` descartaba todo lo que no fuera
 * `solid3d`/`box`/`station` ANTES de llegar a `volumeFor`. Un arquitecto que
 * dibuja con `WALL` (la orden BIM del producto, no el `box` de compatibilidad)
 * no podía sacar un alzado de su propio modelo.
 *
 * ## Lo que este golden fija
 *
 * Tres muros NATIVOS en L, uno con una puerta alojada. `UCS X 90` + `FLATSHOT`
 * deja el bloque del aplanado con ARISTAS DEL MURO —a su altura real, no la de
 * un catálogo de arquetipos— en el documento que recibe el servidor, y el
 * hueco de la puerta se resta dejando su dintel.
 */
const HOST_MODEL = 'AXOS-CAD-STUDIO';
const HOST_REVISION = 'UNIVERSAL';
const FOOTPRINT = { footprintW: 12_000, footprintH: 9_000, unit: 'mm', gridSize: 100 };

function planta(): CadDocument {
  const pared = (id: string, x0: number, y0: number, x1: number, y1: number) => ({
    id, type: 'wall',
    start: { x: x0, y: y0, z: 0 }, end: { x: x1, y: y1, z: 0 },
    thickness: 200, height: 2_700,
    layer: '0',
  });
  return {
    meta: { version: 1, schema: 9, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [
      // Tres muros en L, con una esquina compartida entre m1 y m2: el caso de
      // toda planta de arquitectura.
      pared('m1', 0, 0, 5_000, 0),
      pared('m2', 5_000, 0, 5_000, 3_500),
      pared('m3', 0, 0, 0, -2_500),
      // Una puerta alojada en m1: en el alzado es un HUECO con su dintel, no
      // un bloque plantado encima del muro.
      {
        id: 'puerta', type: 'opening', kind: 'door', hostId: 'm1',
        position: 2_000, width: 900, height: 2_100, sill: 0,
        swing: 'left', hinge: 'start', layer: '0',
      },
    ],
    history: [],
    modelSpace: { entityIds: ['m1', 'm2', 'm3', 'puerta'] },
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

test('FLATSHOT aplana muros NATIVOS (WALL) y deja el alzado en el documento del servidor', async ({
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

  // ---- c. Y está en el DOCUMENTO QUE RECIBE EL SERVIDOR -------------------
  await saveAndSettle(page, {
    snapshot: () => ({ version: backend.snapshotFor(HOST_MODEL, HOST_REVISION).version }),
  });
  const guardado = backend.snapshotFor(HOST_MODEL, HOST_REVISION).document as unknown as CadDocument;

  const bloque = (guardado.blocks ?? []).find((definicion) => /aplanado/i.test(definicion.name));
  expect(bloque, 'el bloque del aplanado viaja en el documento canónico').toBeTruthy();
  const lineas = bloque!.entities.filter((entidad) => entidad.type === 'line');
  expect(lineas.length, 'con líneas de verdad dentro: las ARISTAS del muro').toBeGreaterThan(3);

  // El alzado de un muro NATIVO de 2.700 mm de alto mide 2.700 en el dibujo:
  // su propia altura, sin pasar por ningún catálogo de arquetipos del visor.
  const ys = lineas.flatMap((linea) => {
    const l = linea as Extract<CadDocument['entities'][number], { type: 'line' }>;
    return [l.start.y, l.end.y];
  });
  const alto = Math.max(...ys) - Math.min(...ys);
  expect(alto, `el alzado mide la altura del MURO, no la de un catálogo (${alto})`).toBeGreaterThan(2_600);
  expect(alto).toBeLessThan(2_800);

  // El HUECO de la puerta está de verdad en el alzado: hay vértices a la
  // altura de su dintel (2.100) que un muro entero no tendría.
  const alturaDelDintel = ys.filter((y) => Math.abs(y - 2_100) < 5).length;
  expect(
    alturaDelDintel,
    `el dintel de la puerta aparece en el alzado (${alturaDelDintel} extremos a 2.100)`,
  ).toBeGreaterThan(0);

  // Y hay una inserción del bloque, no sólo la definición.
  const insercion = guardado.entities.find(
    (entidad) => entidad.type === 'insert' && /aplanado|block:/i.test(entidad.block),
  );
  expect(insercion, 'el aplanado se INSERTA, no se queda de definición huérfana').toBeTruthy();
});
