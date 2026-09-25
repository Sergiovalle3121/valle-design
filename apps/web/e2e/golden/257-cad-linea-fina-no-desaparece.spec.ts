import { expect, test, type Browser } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * Golden 257 — UNA LÍNEA DE UN PÍXEL NO DESAPARECE.
 *
 * Visto el 24-sep-2026 en producción, en una cuenta nueva: se dibuja un
 * rectángulo de 5 × 4 m en un documento en blanco y de sus cuatro lados se ve
 * UNO. El documento estaba bien —al guardarlo, exportarlo o abrirlo en un
 * monitor de densidad 2 salía entero—; lo que fallaba era el rasterizado.
 *
 * El trazo fino ocupa un quad de un píxel y el fragment shader descartaba lo
 * que tuviera «cobertura» menor de 0,35, o sea, todo salvo la franja central
 * de 0,65 px. Si el eje de la línea cae justo en el borde entre dos píxeles
 * —las medidas redondas de un plano lo hacen sin parar: a 28,5 px/m, cada 2 m
 * es un píxel entero—, los dos centros quedan a medio píxel, fuera de la
 * franja, y la línea no pinta nada. En una pantalla de densidad 1 eso le pasa
 * a más de un tercio de las posiciones posibles.
 *
 * El golden abre dos veces el mismo plano, con treinta líneas horizontales
 * cada 250 mm en una capa encendida y luego apagada, y cuenta en la
 * diferencia cuántas líneas se pintaron de verdad. Tienen que ser las treinta.
 */

const LINEAS = 30;
const MARCO = [
  { x: 0, y: 0, z: 0 },
  { x: 12_000, y: 0, z: 0 },
  { x: 12_000, y: 10_000, z: 0 },
  { x: 0, y: 10_000, z: 0 },
];

function seedDocument(rayasVisibles: boolean): CadDocument {
  const rayas = Array.from({ length: LINEAS }, (_, k) => ({
    id: `raya-${k}`,
    type: 'line',
    start: { x: 1_000, y: 1_000 + k * 250, z: 0 },
    end: { x: 11_000, y: 1_000 + k * 250, z: 0 },
    layer: 'RAYAS',
  }));
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [
      { id: '0', name: '0', color: '#ffffff', visible: true, locked: false },
      { id: 'RAYAS', name: 'RAYAS', color: '#ffffff', visible: rayasVisibles, locked: false },
    ],
    entities: [{ id: 'marco', type: 'polyline', vertices: MARCO, closed: true, layer: '0' }, ...rayas],
    history: [],
    modelSpace: { entityIds: ['marco', ...rayas.map((raya) => raya.id)] },
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

async function lienzoDelPlano(
  browser: Browser,
  rayasVisibles: boolean,
): Promise<{ data: number[]; ancho: number; alto: number }> {
  // Densidad 1 a propósito: es la pantalla donde el defecto se ve (y la de la
  // mayoría de los equipos de escritorio).
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  try {
    await installMockBackend(context);
    await loginAsStandaloneOwner(context);
    await installCadStudioBackend<CadDocument>(context, seedDocument(rayasVisibles), {
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
      if (!(canvas instanceof HTMLCanvasElement)) return { data: [], ancho: 0, alto: 0 };
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
      return {
        data: Array.from(ctx.getImageData(0, 0, img.width, img.height).data),
        ancho: img.width,
        alto: img.height,
      };
    });
  } finally {
    await context.close();
  }
}

test('treinta líneas de un píxel cada 250 mm se pintan las treinta', async ({ browser }) => {
  test.setTimeout(240_000);
  const con = await lienzoDelPlano(browser, true);
  const sin = await lienzoDelPlano(browser, false);
  expect(con.data.length, 'las dos aperturas miden el mismo lienzo').toBe(sin.data.length);
  expect(con.data.length).toBeGreaterThan(0);

  // Filas con la línea pintada: se mira una franja central de columnas, lejos
  // de los extremos de las rayas, y una fila cuenta si cambió en casi toda.
  const cambia = (i: number) =>
    Math.abs(con.data[i] - sin.data[i]) > 12 ||
    Math.abs(con.data[i + 1] - sin.data[i + 1]) > 12 ||
    Math.abs(con.data[i + 2] - sin.data[i + 2]) > 12;
  const desde = Math.round(con.ancho * 0.4);
  const hasta = Math.round(con.ancho * 0.6);
  const filas: boolean[] = [];
  for (let y = 0; y < con.alto; y += 1) {
    let cambiadas = 0;
    for (let x = desde; x < hasta; x += 1) if (cambia((y * con.ancho + x) * 4)) cambiadas += 1;
    filas.push(cambiadas > (hasta - desde) * 0.8);
  }
  // Una línea = un tramo de filas consecutivas pintadas.
  let lineas = 0;
  for (let y = 0; y < filas.length; y += 1) if (filas[y] && !filas[y - 1]) lineas += 1;
  expect(
    lineas,
    `de ${LINEAS} líneas horizontales se pintan ${lineas}: las que caen en el borde entre dos píxeles ` +
      'desaparecen. Quien dibuja un rectángulo de medidas redondas ve uno o dos de sus lados.',
  ).toBe(LINEAS);
});
