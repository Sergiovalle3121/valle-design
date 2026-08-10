import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadV1Backend, seedFootprint } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';

const MEDIUM_ENTITY_COUNT = 10_000;
const LARGE_ENTITY_COUNT = 100_000;

function cadDocumentOfSize(entityCount: number) {
  const entities = Array.from({ length: entityCount }, (_, index) => ({
    id: `perf-arc-${String(index).padStart(6, '0')}`,
    type: 'arc' as const,
    center: {
      x: (index % 1_000) * 20 + 10,
      y: Math.floor(index / 1_000) * 20 + 10,
      z: 0,
    },
    radius: 8,
    startAngle: 0,
    endAngle: 180,
    layer: 'PERF',
  }));
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [
      { id: '0', name: '0', color: '#ffffff', visible: true, locked: false },
      { id: 'PERF', name: 'PERF', color: '#60a5fa', visible: true, locked: false },
    ],
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
  };
}

// MIGRACIÓN R3: el corpus 10k/100k se sirve por la superficie v1. NOTA de
// direccionamiento: el mock legacy respondía el corpus a CUALQUIER GET del
// layout con la etiqueta cosmética VD-CAD-PERF; en v1 el adaptador resuelve
// model+revision reales del estudio, así que el corpus se siembra bajo
// AXOS-CAD-STUDIO@UNIVERSAL (misma huella 20 000×2 000, grid 20).
// payloadBytes conserva su significado: bytes del cuerpo de la APERTURA v1
// (documento hidratado incluido) que viaja al navegador.
async function installLargeCadBackend(context: BrowserContext, entityCount = LARGE_ENTITY_COUNT) {
  const footprint = { footprintW: 20_000, footprintH: 2_000, unit: 'mm', gridSize: 20 };
  const cadDocument = seedFootprint(cadDocumentOfSize(entityCount), footprint);
  await installCadV1Backend(context, { document: cadDocument, footprint });
  const openResponseBody = JSON.stringify({ cadDocument, cadDocumentVersion: 0, dxf: null });
  return Buffer.byteLength(openResponseBody);
}

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test.describe('CAD viewport performance · 10k/100k', () => {
  test.skip(process.env.CAD_PERF_E2E !== '1', 'Run explicitly with CAD_PERF_E2E=1.');
  test.setTimeout(180_000);

  test('opens and measures the 10k reference corpus', async ({ context, page }, testInfo) => {
    await installMockBackend(context);
    await loginAsStandaloneOwner(context);
    const payloadBytes = await installLargeCadBackend(context, MEDIUM_ENTITY_COUNT);
    const browserErrors = collectBrowserErrors(page);
    const startedAt = Date.now();

    await page.goto('/legacy/studio');
    await expect(page.getByTestId('cad-native-document-count')).toHaveText(`Native ${MEDIUM_ENTITY_COUNT}`, { timeout: 60_000 });
    const canonicalReadyMs = Date.now() - startedAt;
    const frameLatencyMs = await page.evaluate(() => new Promise<number>((resolve) => {
      const started = performance.now();
      requestAnimationFrame(() => resolve(performance.now() - started));
    }));
    const evidence = {
      corpus: { entities: MEDIUM_ENTITY_COUNT, payloadBytes },
      timingsMs: { canonicalReadyMs, frameLatencyMs },
    };
    await testInfo.attach('cad-viewport-performance-10k.json', {
      body: Buffer.from(JSON.stringify(evidence, null, 2)),
      contentType: 'application/json',
    });
    console.log(JSON.stringify(evidence));

    expect(canonicalReadyMs).toBeLessThan(30_000);
    expect(frameLatencyMs).toBeLessThan(1_000);
    expect(browserErrors).toEqual([]);
  });

  test('loads progressively, remains responsive and replans after zoom', async ({ context, page }, testInfo) => {
    // Plazo propio, más largo que el de la familia: este caso espera DOS veces
    // a que todas las entidades a la vista tengan detalle —al abrir y tras el
    // zoom—, no a que termine un presupuesto de 10.000. Ver las notas junto a
    // cada espera de `data-batching`.
    test.setTimeout(1_200_000);
    await installMockBackend(context);
    await loginAsStandaloneOwner(context);
    const payloadBytes = await installLargeCadBackend(context);
    const browserErrors = collectBrowserErrors(page);
    const startedAt = Date.now();

    await page.goto('/legacy/studio');
    const stats = page.getByTestId('cad-native-render-stats');
    await expect(stats).toHaveAttribute('data-total', String(LARGE_ENTITY_COUNT), { timeout: 120_000 });
    const canonicalReadyMs = Date.now() - startedAt;
    // OJO AL PLAZO, Y A QUÉ MIDE AHORA.
    //
    // `data-batching = false` significaba «el presupuesto de render terminó»,
    // y ese presupuesto DETALLABA 10.000 de las 100.000 entidades: el resto se
    // dibujaba como un contorno de ocho segmentos. Con el pipeline por lotes no
    // hay presupuesto ni contorno — `settled` quiere decir que las 100.000
    // tienen detalle—, así que el plazo dejó de comparar lo mismo.
    //
    // Medido en un runner con WebGL por software: la carga completa se asienta
    // en ~4 min, y la cifra de `data-rendered` sube sin pausa durante todo ese
    // rato, que es exactamente la carga progresiva que este spec afirma. El
    // coste no está en teselar sino en DIBUJAR cien mil entidades sin GPU; en
    // una máquina con GPU real esto es otro orden de magnitud, y es justo lo
    // que ni este spec ni el benchmark de Node pueden medir.
    await expect(stats).toHaveAttribute('data-batching', 'false', { timeout: 360_000 });
    const detailReadyMs = Date.now() - startedAt;
    const initialVisible = Number(await stats.getAttribute('data-visible'));
    const initialRendered = Number(await stats.getAttribute('data-rendered'));

    const frameLatencyMs = await page.evaluate(() => new Promise<number>((resolve) => {
      const started = performance.now();
      requestAnimationFrame(() => resolve(performance.now() - started));
    }));

    const zoomStartedAt = Date.now();
    const canvas = page.locator('canvas').first();
    await canvas.hover();
    await page.mouse.wheel(0, -2_400);
    await expect.poll(async () => Number(await stats.getAttribute('data-visible')), {
      timeout: 30_000,
      message: 'zoom must reduce the spatial-index viewport candidate set',
    }).toBeLessThan(initialVisible);
    // Mismo motivo que el plazo de arriba, y una consecuencia más que conviene
    // tener escrita: al cambiar de escalón de LOD el pipeline LIBERA los tiles
    // residentes y los reconstruye con el detalle nuevo. Acercarse sobre un
    // plano de 100.000 entidades vuelve a teselar las ~68.000 que quedan a la
    // vista, y con más segmentos cada una que en el escalón anterior. Es más
    // trabajo que la carga inicial, no menos.
    await expect(stats).toHaveAttribute('data-batching', 'false', { timeout: 360_000 });
    const zoomSettleMs = Date.now() - zoomStartedAt;
    const zoomVisible = Number(await stats.getAttribute('data-visible'));
    const zoomRendered = Number(await stats.getAttribute('data-rendered'));
    await page.getByTitle(/Selecci.n profesional/).click();
    const palette = page.getByTestId('cad-selection-palette');
    await palette.getByTestId('cad-quick-select-text').fill('perf-arc-099999');
    await palette.getByTestId('cad-quick-select-apply').click();
    await expect(page.getByTestId('cad-selection-count')).toHaveText('1 seleccionados');
    await page.getByTitle(/Selecci.n profesional/).click();
    await expect(page.getByTestId('cad-native-properties')).toContainText('perf-arc-099999');
    const heap = await page.evaluate(() => {
      const memory = (performance as Performance & {
        memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
      }).memory;
      return memory ? {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
      } : null;
    });

    const evidence = {
      corpus: { entities: LARGE_ENTITY_COUNT, payloadBytes },
      timingsMs: { canonicalReadyMs, detailReadyMs, frameLatencyMs, zoomSettleMs },
      initial: { visible: initialVisible, rendered: initialRendered },
      zoom: { visible: zoomVisible, rendered: zoomRendered },
      heap,
    };
    await testInfo.attach('cad-viewport-performance.json', {
      body: Buffer.from(JSON.stringify(evidence, null, 2)),
      contentType: 'application/json',
    });
    console.log(JSON.stringify(evidence));

    /*
     * ESTAS DOS AFIRMACIONES CAMBIARON DE SIGNO, Y HAY QUE LEER POR QUÉ.
     *
     * Antes decían:
     *
     *     expect(initialRendered).toBeLessThanOrEqual(2_500);
     *     expect(zoomRendered).toBeLessThanOrEqual(10_000);
     *
     * Es decir: fijaban como REQUISITO que el editor detallara como mucho 2.500
     * de las 100.000 entidades al abrir, y 10.000 tras el zoom. Ése era el
     * contrato de `planCadNativeRenderBudget`: muestrear un presupuesto y
     * dibujar el resto como un contorno de ocho segmentos. Un plano en el que
     * el 97,5 % de la geometría no está dibujada con su forma real.
     *
     * El pipeline por lotes existe justamente para no hacer eso, y su propio
     * módulo lo dice en la primera línea: «en reposo el número de entidades
     * detalladas es el de las VISIBLES. No 2.500 de 100.000 muestreadas
     * uniformemente. Todas.» Mantener el tope habría sido pedirle al producto
     * que siguiera muestreando.
     *
     * Lo que se afirma ahora es la propiedad NUEVA, que es estrictamente más
     * fuerte: el detalle cubre TODO lo visible, al abrir y después del zoom.
     */
    expect(initialRendered).toBe(initialVisible);
    expect(zoomRendered).toBe(zoomVisible);

    /*
     * Y ESTOS DOS PLAZOS SE ALARGARON, porque ya no miden lo mismo.
     *
     * `detailReadyMs` medía cuánto tardaba en materializarse un presupuesto de
     * 2.500; ahora mide cuánto tardan las 100.000. `zoomSettleMs` medía lo
     * mismo tras el zoom sobre 10.000; ahora son las ~68.000 que quedan a la
     * vista, y encima con más segmentos cada una porque el escalón de LOD es
     * más fino. Medido en este runner, con WebGL POR SOFTWARE:
     *
     *     canonicalReady  10,0 s      (documento listo — sin cambios)
     *     detailReady    293,4 s      100.000 / 100.000 con detalle
     *     zoomSettle     222,8 s       68.200 /  68.200 con detalle
     *     frameLatency     4,8 ms     el hilo principal sigue libre
     *
     * El coste no está en teselar: está en DIBUJAR cien mil entidades sin GPU.
     * Ni este spec ni el benchmark de Node pueden medir la máquina del usuario,
     * y eso sigue sin medirse — está anotado en el PR como lo que es.
     *
     * Lo que NO se ha relajado: el documento sigue teniendo que estar listo en
     * menos de un minuto, el hilo principal sigue teniendo que responder en
     * menos de un segundo, la carga sigue siendo progresiva (el zoom reduce el
     * conjunto candidato mientras tanto) y la consola sigue teniendo que estar
     * limpia.
     */
    expect(canonicalReadyMs).toBeLessThan(60_000);
    expect(detailReadyMs).toBeLessThan(360_000);
    expect(frameLatencyMs).toBeLessThan(1_000);
    expect(zoomSettleMs).toBeLessThan(360_000);
    expect(browserErrors).toEqual([]);
  });
});
