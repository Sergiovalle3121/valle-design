/**
 * Presupuesto de CARGA del estudio — lo que el navegador descarga de verdad.
 *
 * ## Por qué existe además del presupuesto de bundle
 *
 * `scripts/perf/bundle-budget.mjs` mide los `<script src>` del HTML: el JS de
 * primera carga. Es la cifra correcta para la landing y el embudo, donde lo que
 * hay en el HTML es todo lo que hay. Para el estudio NO basta: el editor llega
 * después de la hidratación, en chunks que el HTML no menciona. Medido sólo con
 * el HTML, el estudio parece pesar lo mismo que `/contact`.
 *
 * Esta spec mide lo otro: el JS que el navegador ACABA descargando hasta que el
 * editor está usable, con un navegador real y la red interceptada por el mismo
 * backend hermético que usan los goldens. Lo que se pesa es el cuerpo de cada
 * respuesta `.js` servida por el propio origen — no `transferSize`, que en
 * Playwright vuelve 0 para lo servido desde la caché del proceso.
 *
 * ## Por qué NO lleva la guarda `CAD_PERF_E2E`
 *
 * El resto de `e2e/performance/` se salta salvo con `CAD_PERF_E2E=1`, porque
 * son suites de decenas de minutos que viven en su propio job y que en un PR ni
 * se lanzan. Ésta tarda seis segundos y mide exactamente lo que un PR puede
 * romper sin darse cuenta: un `import` descuidado que devuelve el mundo a la
 * primera carga. Ponerla tras la misma guarda la habría dejado sin correr justo
 * cuando hace falta.
 *
 * ## Qué es un fallo
 *
 * El techo vive en `src/lib/cad/benchmark/frontend-load-baseline.json` con la
 * máquina que lo produjo escrita al lado. Como el resto de presupuestos del
 * repo, es un TRINQUETE: la cifra sólo baja. Si un import descuidado vuelve a
 * meter el mundo en la primera carga, esta spec lo dice antes que el usuario.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadV1Backend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';

// Playwright corre con `apps/web` como cwd (playwright.config.ts vive ahí).
const BASELINE = join(process.cwd(), 'src', 'lib', 'cad', 'benchmark', 'frontend-load-baseline.json');

type Presupuesto = {
  gate: { estudioJsKB: number; landingJsKB: number };
  observado: Record<string, unknown>;
};

const presupuesto = JSON.parse(readFileSync(BASELINE, 'utf8')) as Presupuesto;

function documentoMinimo() {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [
      {
        id: 'linea-carga',
        type: 'line',
        start: { x: 0, y: 0, z: 0 },
        end: { x: 1_000, y: 800, z: 0 },
        layer: '0',
      },
    ],
    history: [],
    modelSpace: { entityIds: ['linea-carga'] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
  };
}

/**
 * Contador de JS que el navegador NECESITA.
 *
 * Cuenta **bytes distintos**: cada URL suma una sola vez, aunque el navegador
 * emita varias respuestas para ella. Esto no es un detalle de estilo. Los tres
 * workers de teselado se crean desde la misma URL, y Playwright emite un evento
 * `response` por cada uno aunque las dos últimas las sirva la caché de memoria
 * (`/_next/static/**` va con `Cache-Control: immutable`). Sumar las repeticiones
 * inflaba el chunk de teselado de 197 KB a 592 KB y habría publicado como
 * "descarga" algo que no cruza la red.
 *
 * `repeticiones` se reporta aparte, como información: una repetición alta señala
 * un patrón de carga que merece mirarse, pero no es peso de bundle.
 */
function contarJs(page: Page, origen: string) {
  const porChunk = new Map<string, number>();
  const repeticiones = new Map<string, number>();
  const pendientes: Promise<void>[] = [];
  page.on('response', (respuesta) => {
    const url = respuesta.url();
    if (!url.startsWith(origen)) return;
    const ruta = new URL(url).pathname;
    if (!ruta.endsWith('.js')) return;
    repeticiones.set(ruta, (repeticiones.get(ruta) ?? 0) + 1);
    if (porChunk.has(ruta)) return;
    porChunk.set(ruta, 0);
    pendientes.push(
      respuesta
        .body()
        .then((cuerpo) => {
          porChunk.set(ruta, cuerpo.byteLength);
        })
        .catch(() => {
          /* una respuesta abortada no suma; el editor no la usó */
        }),
    );
  });
  return {
    async total() {
      await Promise.all(pendientes);
      let bytes = 0;
      for (const v of porChunk.values()) bytes += v;
      return bytes;
    },
    async desglose() {
      await Promise.all(pendientes);
      return [...porChunk.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([ruta, bytes]) => {
          const veces = repeticiones.get(ruta) ?? 1;
          return `${(bytes / 1024).toFixed(1)} KB  ${ruta}${veces > 1 ? `  (servido ${veces}×)` : ''}`;
        });
    },
  };
}

async function backendCad(context: BrowserContext) {
  await installCadV1Backend(context, {
    document: documentoMinimo(),
    model: 'AXOS-CAD-STUDIO',
    revision: 'UNIVERSAL',
    footprint: { footprintW: 12_000, footprintH: 10_000, unit: 'mm', gridSize: 100 },
  });
}

test.describe('Presupuesto de carga del frontend', () => {
  test('la landing no descarga el mundo', async ({ page, baseURL }) => {
    const origen = new URL(baseURL!).origin;
    const js = contarJs(page, origen);
    await page.goto('/');
    // El h1 de la landing: la página es usable cuando su titular está.
    await expect(page.locator('h1').first()).toBeVisible();
    await page.waitForLoadState('networkidle');

    const kb = (await js.total()) / 1024;
    const desglose = await js.desglose();
    console.log(`[carga] landing JS descargado: ${kb.toFixed(1)} KB\n  ${desglose.join('\n  ')}`);

    // Ninguna huella del visor 3D en la landing: el 3D es un clic, no la bienvenida.
    const traeThree = await page.evaluate(() => 'THREE' in globalThis);
    expect(traeThree, 'la landing no debe evaluar three.js').toBe(false);

    expect(
      kb,
      `La landing descarga ${kb.toFixed(1)} KB de JS, por encima del techo de ${presupuesto.gate.landingJsKB} KB`,
    ).toBeLessThanOrEqual(presupuesto.gate.landingJsKB);
  });

  test('el estudio abre sin descargar más de su presupuesto', async ({ context, page, baseURL }) => {
    const origen = new URL(baseURL!).origin;
    await installMockBackend(context);
    await loginAsStandaloneOwner(context);
    await backendCad(context);

    const js = contarJs(page, origen);
    const t0 = Date.now();
    await page.goto('/legacy/studio');
    await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();
    const usable = Date.now() - t0;
    await page.waitForLoadState('networkidle');

    const kb = (await js.total()) / 1024;
    const desglose = await js.desglose();
    console.log(
      `[carga] estudio usable en ${usable} ms, JS descargado: ${kb.toFixed(1)} KB\n  ${desglose.join('\n  ')}`,
    );

    expect(
      kb,
      `El estudio descarga ${kb.toFixed(1)} KB de JS, por encima del techo de ${presupuesto.gate.estudioJsKB} KB`,
    ).toBeLessThanOrEqual(presupuesto.gate.estudioJsKB);
  });
});
