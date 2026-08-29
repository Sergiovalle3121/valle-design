/**
 * LATENCIA DE INTERACCIÓN DEL ESTUDIO — la foto que faltaba.
 *
 * El repo medía dos cosas del rendimiento del cliente: cuánto pesa el JavaScript
 * y cuánto tarda el pipeline de escena en teselar. Ninguna de las dos es lo que
 * el usuario llama «va lento». Eso es la latencia de interacción: el intervalo
 * entre soltar el ratón y ver el resultado en pantalla, con todo lo que hay en
 * medio —el trabajo de React incluido— dentro del número.
 *
 * Aquí se mide con la API del navegador (`PerformanceObserver`, `type: "event"`),
 * que es la que define INP, y se resume con `lib/cad/telemetry/interaction-latency.ts`,
 * cuya aritmética tiene su propio spec. Este fichero sólo conduce el ratón y
 * publica lo medido.
 *
 * ## Por qué el techo es generoso y por qué eso no lo hace inútil
 *
 * Este contenedor tiene 4 núcleos y rasteriza WebGL por software. Sus números
 * son TECHOS, no marcas: un p95 aquí no dice cómo va el producto en una máquina
 * de arquitecto. Lo que sí detecta un techo generoso es la regresión gruesa —el
 * render en cascada que alguien reintroduce y multiplica la latencia por cinco—
 * que es exactamente el fallo que nadie ve venir en una revisión de código.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadV1Backend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import {
  resumirLatencia,
  type CadInteraction,
} from '../../src/lib/cad/telemetry/interaction-latency';

const BASELINE = join(
  process.cwd(),
  'src',
  'lib',
  'cad',
  'benchmark',
  'interaction-latency-baseline.json',
);
const presupuesto = JSON.parse(readFileSync(BASELINE, 'utf8')) as {
  gate: { p95Ms: number; peorMs: number };
};

/** Un documento con contenido suficiente para que designar cueste algo. */
function documentoDenso(n: number) {
  const entities = Array.from({ length: n }, (_, i) => ({
    id: `linea-${i}`,
    type: 'line' as const,
    start: { x: (i % 40) * 250, y: Math.floor(i / 40) * 250, z: 0 },
    end: { x: (i % 40) * 250 + 200, y: Math.floor(i / 40) * 250 + 180, z: 0 },
    layer: '0',
  }));
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((e) => e.id) },
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
 * El observador se instala ANTES de que exista la página: `buffered: true` sólo
 * recupera lo que ya ocurrió si el observador existe en ese momento, y las
 * primeras interacciones —las de la carga— son justo las caras.
 */
async function instalarObservador(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __valleInteracciones?: unknown[] };
    w.__valleInteracciones = [];
    try {
      const po = new PerformanceObserver((lista) => {
        for (const e of lista.getEntries()) {
          w.__valleInteracciones!.push({
            nombre: e.name,
            duracion: e.duration,
            inicio: e.startTime,
          });
        }
      });
      po.observe({
        type: 'event',
        buffered: true,
        durationThreshold: 16,
      } as PerformanceObserverInit);
    } catch {
      /* navegador sin la API: la lista queda vacía y el test lo dice */
    }
  });
}

async function backend(context: BrowserContext) {
  await installCadV1Backend(context, {
    document: documentoDenso(400),
    model: 'AXOS-CAD-STUDIO',
    revision: 'UNIVERSAL',
    footprint: { footprintW: 12_000, footprintH: 10_000, unit: 'mm', gridSize: 100 },
  });
}

test('la latencia de interacción del estudio se mide y se publica', async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await backend(context);
  await instalarObservador(page);

  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();

  const lienzo = page.getByTestId('cad-canvas');
  const caja = await lienzo.boundingBox();
  expect(caja, 'el lienzo tiene que tener tamaño').not.toBeNull();
  const cx = caja!.x + caja!.width / 2;
  const cy = caja!.y + caja!.height / 2;

  // Un guion de interacción parecido a lo que hace una persona: designar,
  // arrastrar una ventana de selección, y hacer zoom con la rueda.
  for (let i = 0; i < 12; i += 1) {
    await page.mouse.click(cx + (i % 5) * 30 - 60, cy + (i % 3) * 30 - 30);
  }
  for (let i = 0; i < 4; i += 1) {
    await page.mouse.move(cx - 180, cy - 120);
    await page.mouse.down();
    await page.mouse.move(cx + 180, cy + 120, { steps: 12 });
    await page.mouse.up();
  }
  for (let i = 0; i < 10; i += 1) {
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, i % 2 === 0 ? -120 : 120);
  }
  // Un respiro para que el último pintado entre en la medida.
  await page.waitForTimeout(500);

  const crudas = (await page.evaluate(
    () => (window as unknown as { __valleInteracciones: CadInteraction[] }).__valleInteracciones,
  )) as CadInteraction[];

  // Si el navegador no dio la API, se dice y no se finge un número.
  expect(
    crudas.length,
    'el navegador no entregó ninguna interacción: sin medida no hay veredicto',
  ).toBeGreaterThan(0);

  const informe = resumirLatencia(crudas);
  console.log(
    `[interacción] ${informe.muestras} muestras · p50 ${informe.p50.toFixed(0)} ms · ` +
      `p75 ${informe.p75.toFixed(0)} ms · p95 ${informe.p95.toFixed(0)} ms · peor ${informe.peor.toFixed(0)} ms\n` +
      informe.peores
        .map((p) => `    ${p.duracion.toFixed(0)} ms  ${p.nombre}`)
        .join('\n'),
  );

  expect(
    informe.p95,
    `p95 de interacción ${informe.p95.toFixed(0)} ms sobre un techo de ${presupuesto.gate.p95Ms} ms`,
  ).toBeLessThanOrEqual(presupuesto.gate.p95Ms);
  expect(
    informe.peor,
    `la peor interacción fue ${informe.peor.toFixed(0)} ms sobre un techo de ${presupuesto.gate.peorMs} ms`,
  ).toBeLessThanOrEqual(presupuesto.gate.peorMs);
});
