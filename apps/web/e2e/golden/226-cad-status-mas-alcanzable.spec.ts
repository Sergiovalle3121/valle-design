import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * Golden 226 — el desplegable «Más» de la barra de estado se puede USAR.
 *
 * Desde la ola «estado» los nueve avisos de segundo orden (API en línea,
 * rejilla/forzcursor, modelo·revisión·versión, validación, CAD crítico,
 * holguras, seguridad, DXF e instantáneas) sólo viven dentro de «Más». Ese
 * panel crecía HACIA ARRIBA desde dentro de la fila de estado, y la fila lleva
 * `overflow-x: auto` (una sola línea, sin barra de desplazamiento). En CSS,
 * `overflow-x: auto` obliga a `overflow-y: auto`, así que la fila recortaba al
 * panel por su borde superior: se veía una rendija y ningún botón «Fijar»
 * recibía el clic. Lo detectó la revisión adversaria del candidato del
 * 2026-09-21 (hallazgo «codigo-web», CadStatusBar.tsx:603), y ninguna spec lo
 * medía: `CadStatusBar.spec.ts` sólo lee el fuente.
 *
 * Lo que se mide, en el DOM y no en el fuente:
 *  1. Con «Más» abierto, el panel cabe ENTERO en la ventana (boundingBox dentro
 *     del viewport) y queda por encima de la fila de estado, no dentro de ella.
 *  2. Cada botón «Fijar» responde a `elementFromPoint` en su propio centro: es
 *     el gesto de Playwright para «se puede pulsar» sin fiarse de `isVisible`,
 *     que no tiene en cuenta el recorte por overflow.
 *  3. Fijar el primer aviso lo saca del panel y lo pone en la fila con su
 *     botón «Dejar de fijar»; volver a pulsarlo lo devuelve al panel. Conteos
 *     exactos: N avisos al abrir (N ≥ 3: «API», «rejilla/forzcursor» y
 *     «modelo·revisión·versión» no dependen del documento; los otros seis sólo
 *     aparecen con validación, holguras, seguridad, DXF o instantáneas), N−1
 *     tras fijar uno y N de nuevo al soltarlo.
 *
 * Trinquete: si algún día el panel vuelve a pintarse dentro de la fila, la
 * comprobación 2 lo delata sin depender de píxeles ni de temas.
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

async function openStudio(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 12_000,
    footprintH: 10_000,
    unit: 'mm',
    gridSize: 100,
  });
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-canvas')).toBeVisible();
  const saltar = page.getByTestId('cad-guided-tour-skip');
  if (await saltar.count()) await saltar.click();
}

/** Qué elemento responde en el centro de cada botón «Fijar» del panel. */
async function quienRespondeEnLosPines(page: Page) {
  return page.evaluate(() => {
    const panel = document.getElementById('cad-status-overflow');
    if (!panel) return { pines: 0, ajenos: ['no existe #cad-status-overflow'] };
    const pines = [...panel.querySelectorAll<HTMLElement>('[data-testid^="cad-status-pin-"]')];
    const ajenos: string[] = [];
    for (const pin of pines) {
      const r = pin.getBoundingClientRect();
      const quien = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!quien || !pin.contains(quien)) {
        const nombre = quien
          ? `${quien.tagName.toLowerCase()}${(quien as HTMLElement).dataset?.testid ? `[data-testid="${(quien as HTMLElement).dataset.testid}"]` : ''}`
          : 'nada';
        ajenos.push(`${pin.dataset.testid} (${Math.round(r.left)}, ${Math.round(r.top)}) responde ${nombre}`);
      }
    }
    return { pines: pines.length, ajenos };
  });
}

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
]) {
  test(`a ${viewport.width}×${viewport.height} el desplegable «Más» de la barra de estado cabe en la ventana y sus avisos se pueden fijar`, async ({
    context,
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await openStudio(context, page);

    const trigger = page.getByTestId('cad-status-overflow-trigger');
    await expect(trigger).toBeVisible();
    await trigger.click();
    const panel = page.getByTestId('cad-status-overflow');
    await expect(panel).toBeVisible();

    // 1. Entero en la ventana y por encima de la fila de estado.
    const caja = await panel.boundingBox();
    const fila = await page.locator('.cad-status-bar').first().boundingBox();
    expect(caja, 'el panel «Más» tiene caja').not.toBeNull();
    expect(fila, 'la fila de estado tiene caja').not.toBeNull();
    expect(caja!.y, 'el panel no se sale por arriba').toBeGreaterThanOrEqual(0);
    expect(caja!.x, 'el panel no se sale por la izquierda').toBeGreaterThanOrEqual(0);
    expect(caja!.x + caja!.width, 'el panel no se sale por la derecha').toBeLessThanOrEqual(viewport.width);
    expect(
      caja!.y + caja!.height,
      `el panel (${Math.round(caja!.height)} px de alto) termina ANTES de la fila de estado (y=${Math.round(fila!.y)}): crece hacia arriba, no dentro de la fila`,
    ).toBeLessThanOrEqual(fila!.y + 1);

    // 2. Cada «Fijar» responde en su propio centro: nada lo recorta ni lo tapa.
    const respuesta = await quienRespondeEnLosPines(page);
    expect(
      respuesta.pines,
      'al menos los tres avisos que no dependen del documento viven dentro de «Más»',
    ).toBeGreaterThanOrEqual(3);
    expect(
      respuesta.ajenos,
      `botones «Fijar» que NO reciben el clic en su centro:\n  · ${respuesta.ajenos.join('\n  · ')}`,
    ).toEqual([]);

    // 3. Fijar y dejar de fijar, con conteos exactos.
    const primerPin = panel.locator('[data-testid^="cad-status-pin-"]').first();
    const id = (await primerPin.getAttribute('data-testid'))!.replace('cad-status-pin-', '');
    await primerPin.click();
    await expect(page.getByTestId(`cad-status-unpin-${id}`), 'el aviso fijado aparece en la fila con su botón para dejar de fijar').toBeVisible();
    await expect(panel.locator('[data-testid^="cad-status-pin-"]'), 'queda uno menos dentro de «Más»').toHaveCount(respuesta.pines - 1);
    await page.getByTestId(`cad-status-unpin-${id}`).click();
    await expect(panel.locator('[data-testid^="cad-status-pin-"]'), 'vuelven a ser los mismos').toHaveCount(respuesta.pines);

    // Cerrar deja la fila como estaba: una sola línea, sin el panel en el DOM.
    await trigger.click();
    await expect(panel).toHaveCount(0);
  });
}
