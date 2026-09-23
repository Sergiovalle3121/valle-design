import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * Golden 232 — LO QUE DIBUJAS SE VE.
 *
 * El defecto más caro que ha tenido este producto, reproducido en producción el
 * 2026-09-22: se pulsa «Línea» en la cinta, se hacen dos clics, se pulsa Enter,
 * la entidad ENTRA en el documento —el contador sube, la paleta de propiedades
 * la describe con sus cotas, el historial ofrece deshacerla— y el lienzo no
 * cambia ni un píxel. Quien dibuja no tiene forma humana de saber que dibujó.
 * El dueño lo resumió así: «el ribbon no sirve, sólo está de adorno».
 *
 * Y su pareja: designar todo (Ctrl+A, el primer atajo de cualquiera que venga
 * de AutoCAD) hacía DESAPARECER el plano de la pantalla.
 *
 * La causa, medida: la niebla de la escena contra la cámara de planta. La
 * niebla acaba a 102 unidades y la cámara ortográfica que dibuja la planta está
 * a 1000, así que todo material estándar salía pintado al 100 % del color de la
 * niebla —idéntico al del fondo— por encima de la geometría por lotes, que sí
 * se veía porque su sombreador propio no tiene niebla. `viewport/plan-fog.ts`
 * guarda los números; `plan-fog.spec.ts`, la aritmética.
 *
 * ## Cómo mide, y por qué así
 *
 * La primera versión contaba píxeles «con tinta» = distintos del color de la
 * esquina. Servía con el defecto puesto —el lienzo estaba vacío del todo— pero
 * deja de discriminar en cuanto la planta vuelve a enseñar su rejilla, su suelo
 * y sus ejes: el lienzo nace entonces con ~219 000 píxeles de tinta y una línea
 * encima sólo mueve 23. Mediría el fondo, no el dibujo.
 *
 * Así que compara contra el LIENZO VACÍO DE ESTA MISMA SESIÓN, guardado dentro
 * del navegador: cuenta los píxeles que CAMBIARON respecto a él. Eso es
 * exactamente «lo que dibujé», sea cual sea el fondo, y la anchura de su caja
 * envolvente dice además que lo pintado tiene forma de línea y no es un
 * parpadeo en una esquina.
 */

function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [],
    history: [],
    modelSpace: { entityIds: [] },
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

async function abrirEstudio(context: BrowserContext, page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 12_000,
    footprintH: 10_000,
    unit: 'mm',
    gridSize: 100,
  });
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-canvas')).toBeVisible({ timeout: 60_000 });
  const saltar = page.getByTestId('cad-guided-tour-skip');
  if (await saltar.count()) await saltar.click();
  await page.waitForTimeout(2_000);
}

/** Cuántas entidades declara el documento canónico. */
async function entidades(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="cad-native-document-count"]');
    const m = (el?.textContent ?? '').match(/\d+/);
    return m ? Number(m[0]) : -1;
  });
}

/** Ancho del recorte que se compara. El alto sale de la misma lectura. */
const ANCHO_MUESTRA = 900;

interface LectorDeLienzo {
  __vacio?: Uint8ClampedArray;
  __leerLienzo: () => Promise<Uint8ClampedArray>;
}

/**
 * Instala en la página el lector del lienzo: `toDataURL` del `<canvas>` real,
 * decodificado y recortado. Mide lo que el usuario ve, no lo que el modelo cree
 * tener. Vive en la página porque son cientos de miles de píxeles y lo único
 * que interesa de ellos es la diferencia.
 */
async function instalarLectorDeLienzo(page: Page, anchoMuestra: number): Promise<void> {
  await page.evaluate((ancho) => {
    (window as unknown as LectorDeLienzo).__leerLienzo = async () => {
      const canvas =
        document.querySelector('[data-testid="cad-canvas"] canvas') ?? document.querySelector('canvas');
      if (!(canvas instanceof HTMLCanvasElement)) return new Uint8ClampedArray();
      const url = canvas.toDataURL('image/png');
      const img = new Image();
      await new Promise<void>((listo, falla) => {
        img.onload = () => listo();
        img.onerror = () => falla(new Error('no se pudo leer el lienzo'));
        img.src = url;
      });
      const anchoReal = Math.min(img.width, ancho);
      const altoReal = Math.min(img.height, 600);
      const lienzo = document.createElement('canvas');
      lienzo.width = anchoReal;
      lienzo.height = altoReal;
      const ctx = lienzo.getContext('2d')!;
      ctx.drawImage(img, 0, 0, anchoReal, altoReal, 0, 0, anchoReal, altoReal);
      return ctx.getImageData(0, 0, anchoReal, altoReal).data;
    };
  }, anchoMuestra);
}

/** Guarda el lienzo actual como referencia de «vacío», dentro del navegador. */
async function recordarLienzoVacio(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const w = window as unknown as LectorDeLienzo;
    w.__vacio = await w.__leerLienzo();
  });
}

interface CambioEnLienzo {
  /** Píxeles que cambiaron respecto al lienzo vacío guardado. */
  readonly pixeles: number;
  /** Anchura de su caja envolvente: una línea es ancha, un parpadeo no. */
  readonly ancho: number;
}

/**
 * Píxeles que CAMBIARON respecto al lienzo vacío de esta sesión. Doce niveles
 * de tolerancia por canal dejan fuera el ruido de compresión y el temblor del
 * antialiasing, y dentro cualquier trazo de verdad.
 */
async function cambioRespectoAlVacio(page: Page, anchoMuestra: number): Promise<CambioEnLienzo> {
  return page.evaluate(async (ancho) => {
    const w = window as unknown as LectorDeLienzo;
    const vacio = w.__vacio;
    const ahora = await w.__leerLienzo();
    if (!vacio || vacio.length === 0 || vacio.length !== ahora.length) return { pixeles: -1, ancho: -1 };
    let pixeles = 0;
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < ahora.length; i += 4) {
      if (
        Math.abs(ahora[i] - vacio[i]) > 12 ||
        Math.abs(ahora[i + 1] - vacio[i + 1]) > 12 ||
        Math.abs(ahora[i + 2] - vacio[i + 2]) > 12
      ) {
        pixeles += 1;
        const x = (i / 4) % ancho;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    return { pixeles, ancho: pixeles ? maxX - minX + 1 : 0 };
  }, anchoMuestra);
}

test('dibujar una línea con la cinta la PINTA en el lienzo, no sólo en el contador', async ({ context, page }) => {
  test.setTimeout(150_000);
  await abrirEstudio(context, page);
  await instalarLectorDeLienzo(page, ANCHO_MUESTRA);
  await recordarLienzoVacio(page);
  const antes = await entidades(page);

  await page.getByTestId('cad-ribbon-command-LINE').click();
  await expect(page.getByTestId('cad-command-prompt')).toBeVisible();

  const caja = (await page.getByTestId('cad-canvas').boundingBox())!;
  const x0 = caja.x + caja.width * 0.3;
  const y0 = caja.y + caja.height * 0.5;
  const x1 = caja.x + caja.width * 0.7;
  await page.mouse.click(x0, y0);
  await page.waitForTimeout(250);
  await page.mouse.click(x1, y0);
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter');
  // El ratón se retira del área de dibujo: lo que quede pintado es la línea, no
  // la previsualización ni el resalte de lo que hubiera bajo el cursor.
  await page.mouse.move(caja.x + 4, caja.y + 4);
  await page.waitForTimeout(1_500);

  await expect
    .poll(() => entidades(page), { message: 'la línea entra en el documento', timeout: 15_000 })
    .toBe(antes + 1);

  const dibujado = await cambioRespectoAlVacio(page, ANCHO_MUESTRA);
  expect(
    dibujado.pixeles,
    `tras dibujar la línea el lienzo cambió ${dibujado.pixeles} píxeles respecto al lienzo ` +
      'vacío: la entidad existe en el documento pero NO se pintó. Quien dibuja no puede verlo.',
  ).toBeGreaterThan(50);
  expect(
    dibujado.ancho,
    `lo pintado abarca ${dibujado.ancho} px de ancho: se espera una línea de lado a lado, no un parpadeo`,
  ).toBeGreaterThan(100);
});

test('designar todo resalta el dibujo, no lo hace desaparecer', async ({ context, page }) => {
  test.setTimeout(150_000);
  await abrirEstudio(context, page);
  await instalarLectorDeLienzo(page, ANCHO_MUESTRA);
  await recordarLienzoVacio(page);

  // Dos líneas, para tener plano que perder.
  const caja = (await page.getByTestId('cad-canvas').boundingBox())!;
  for (const [dx0, dy0, dx1, dy1] of [
    [0.25, 0.4, 0.75, 0.4],
    [0.25, 0.6, 0.75, 0.6],
  ]) {
    await page.getByTestId('cad-ribbon-command-LINE').click();
    await page.mouse.click(caja.x + caja.width * dx0, caja.y + caja.height * dy0);
    await page.waitForTimeout(200);
    await page.mouse.click(caja.x + caja.width * dx1, caja.y + caja.height * dy1);
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
  }
  await page.mouse.move(caja.x + 4, caja.y + 4);
  await page.waitForTimeout(500);
  const conDibujo = await cambioRespectoAlVacio(page, ANCHO_MUESTRA);
  expect(conDibujo.pixeles, 'las dos líneas se ven en el lienzo').toBeGreaterThan(50);

  await page.keyboard.press('Control+a');
  await page.waitForTimeout(1_500);
  const designado = await cambioRespectoAlVacio(page, ANCHO_MUESTRA);
  expect(
    designado.pixeles,
    `antes de designar el dibujo ocupaba ${conDibujo.pixeles} píxeles y después ${designado.pixeles}: ` +
      'designar todo borró el dibujo de la pantalla. Quien lo ve cree que perdió su trabajo.',
  ).toBeGreaterThanOrEqual(Math.round(conDibujo.pixeles * 0.9));
});

test('un clic que resbala 8 px sigue poniendo el punto: así clica una mano real', async ({ context, page }) => {
  test.setTimeout(150_000);
  await abrirEstudio(context, page);
  await instalarLectorDeLienzo(page, ANCHO_MUESTRA);
  await recordarLienzoVacio(page);
  const antes = await entidades(page);

  await page.getByTestId('cad-ribbon-command-LINE').click();
  await expect(page.getByTestId('cad-command-prompt')).toBeVisible();

  // Cada clic se desplaza 8,5 px entre pulsar y soltar: el temblor normal de
  // una mano apoyada en un ratón de mesa. Con el margen viejo de 5 px estos
  // dos clics se descartaban EN SILENCIO y no se dibujaba nada.
  const caja = (await page.getByTestId('cad-canvas').boundingBox())!;
  const y0 = caja.y + caja.height * 0.5;
  for (const x of [caja.x + caja.width * 0.3, caja.x + caja.width * 0.7]) {
    await page.mouse.move(x, y0);
    await page.mouse.down();
    await page.mouse.move(x + 6, y0 + 6, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(250);
  }
  await page.keyboard.press('Enter');
  await page.mouse.move(caja.x + 4, caja.y + 4);
  await page.waitForTimeout(1_500);

  await expect
    .poll(() => entidades(page), { message: 'el clic que resbala también dibuja', timeout: 15_000 })
    .toBe(antes + 1);
  const dibujado = await cambioRespectoAlVacio(page, ANCHO_MUESTRA);
  expect(
    dibujado.pixeles,
    `el lienzo cambió ${dibujado.pixeles} píxeles: la línea de los clics que resbalan tiene que verse igual`,
  ).toBeGreaterThan(50);
});
