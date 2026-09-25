import { expect, test, type Browser } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * Golden 256 — LO QUE ESCRIBES SE VE.
 *
 * La captura del estudio que vende el producto (`public/product/estudio-*.png`)
 * enseñaba cotas con sus flechas y sin número, y ni RECÁMARA, ni BAÑO, ni SALA:
 * el atlas de texto EMITÍA los rótulos (`render/text-requests.ts`), la escena
 * montaba su malla (`render/scene.ts`) y los goldens 47 y 80 lo daban por
 * bueno porque cuentan `data-glyphs` —cuántos cuadros hay—, no qué se pinta.
 *
 * Éste mide lo que ve el usuario (el `<canvas>` real, `toDataURL`, como el
 * golden 232) comparando DOS aperturas del mismo plano que sólo difieren en
 * una cosa: el rótulo MTEXT está en una capa visible o en una apagada. Un
 * rectángulo de 12 × 10 m fija la extensión en las dos, así que la cámara es la
 * misma y lo único que puede cambiar de una a otra es el texto. Borrar el
 * rótulo con Ctrl+A no sirve para esto: al vaciar el dibujo la vista se
 * reencuadra y los píxeles cambian aunque el texto nunca se hubiera pintado.
 */

const MARCO = [
  { x: 0, y: 0, z: 0 },
  { x: 12_000, y: 0, z: 0 },
  { x: 12_000, y: 10_000, z: 0 },
  { x: 0, y: 10_000, z: 0 },
];

function seedDocument(rotuloVisible: boolean): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [
      { id: '0', name: '0', color: '#ffffff', visible: true, locked: false },
      { id: 'ROTULOS', name: 'ROTULOS', color: '#ffffff', visible: rotuloVisible, locked: false },
    ],
    entities: [
      { id: 'marco', type: 'polyline', vertices: MARCO, closed: true, layer: '0' },
      {
        id: 'nota',
        type: 'mtext',
        insertion: { x: 2_000, y: 6_000, z: 0 },
        text: 'SALA COMEDOR',
        height: 800,
        layer: 'ROTULOS',
      },
    ],
    history: [],
    modelSpace: { entityIds: ['marco', 'nota'] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as unknown as CadDocument;
}

async function lienzoDelPlano(browser: Browser, rotuloVisible: boolean): Promise<{ data: number[]; ancho: number }> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    await installMockBackend(context);
    await loginAsStandaloneOwner(context);
    await installCadStudioBackend<CadDocument>(context, seedDocument(rotuloVisible), {
      footprintW: 12_000,
      footprintH: 10_000,
      unit: 'mm',
      gridSize: 100,
    });
    const page = await context.newPage();
    await page.goto('/legacy/studio');
    await expect(page.getByTestId('cad-canvas')).toBeVisible({ timeout: 60_000 });
    const saltar = page.getByTestId('cad-guided-tour-skip');
    if (await saltar.count()) await saltar.click();
    const caja = (await page.getByTestId('cad-canvas').boundingBox())!;
    await page.mouse.move(caja.x + 4, caja.y + 4);
    await page.waitForTimeout(3_000);
    return await page.evaluate(async () => {
      const canvas =
        document.querySelector('[data-testid="cad-canvas"] canvas') ?? document.querySelector('canvas');
      if (!(canvas instanceof HTMLCanvasElement)) return { data: [], ancho: 0 };
      const img = new Image();
      await new Promise<void>((listo, falla) => {
        img.onload = () => listo();
        img.onerror = () => falla(new Error('no se pudo leer el lienzo'));
        img.src = canvas.toDataURL('image/png');
      });
      const lienzo = document.createElement('canvas');
      lienzo.width = img.width;
      lienzo.height = img.height;
      const ctx = lienzo.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      return { data: Array.from(ctx.getImageData(0, 0, img.width, img.height).data), ancho: img.width };
    });
  } finally {
    await context.close();
  }
}

test('un MTEXT visible se PINTA en el lienzo: apagar su capa cambia lo que se ve', async ({ browser }) => {
  test.setTimeout(240_000);
  const conRotulo = await lienzoDelPlano(browser, true);
  const sinRotulo = await lienzoDelPlano(browser, false);
  expect(conRotulo.data.length, 'las dos aperturas miden el mismo lienzo').toBe(sinRotulo.data.length);
  expect(conRotulo.data.length).toBeGreaterThan(0);

  let pixeles = 0;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < conRotulo.data.length; i += 4) {
    if (
      Math.abs(conRotulo.data[i] - sinRotulo.data[i]) > 12 ||
      Math.abs(conRotulo.data[i + 1] - sinRotulo.data[i + 1]) > 12 ||
      Math.abs(conRotulo.data[i + 2] - sinRotulo.data[i + 2]) > 12
    ) {
      pixeles += 1;
      const x = (i / 4) % conRotulo.ancho;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
  const ancho = pixeles ? maxX - minX + 1 : 0;
  expect(
    pixeles,
    `un rótulo de 800 mm cambia ${pixeles} píxeles del lienzo al encender su capa: el texto existe en el ` +
      'documento pero NO se pinta. Quien abre el plano no ve ni un nombre de cuarto ni el número de una cota.',
  ).toBeGreaterThan(300);
  expect(ancho, `el rótulo abarca ${ancho} px: se espera la anchura de dos palabras`).toBeGreaterThan(80);
});
