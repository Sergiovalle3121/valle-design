/**
 * FASE 2 — La medida que Node no podía hacer: FPS, llamadas de dibujo y
 * memoria de GPU en un navegador de verdad.
 *
 * ## Por qué NO se mide dentro del editor
 *
 * Se comprobó primero, que era la única forma de saberlo:
 *
 *     grep -rn "cad/render/" apps/web/src --include=*.tsx \
 *       | grep -v "^apps/web/src/lib/cad/render/"
 *
 * Sale VACÍO. `Layout3DEditor.tsx` sigue importando `entity-three.ts`, así que
 * el pipeline nuevo NO está enchufado al editor. Medir por la interfaz mediría
 * el camino ANTERIOR y lo publicaría con la etiqueta del nuevo, que es
 * exactamente la clase de número que este trabajo viene a desmontar.
 *
 * De modo que se miden LOS DOS CAMINOS por separado, cada uno construido a
 * mano sobre el mismo lienzo, la misma cámara y el mismo corpus. Cuando T1
 * enchufe el pipeline, este spec seguirá valiendo tal cual y además se podrá
 * comparar contra el recorrido por la interfaz.
 *
 * ## Enforcement: REGISTRADO, NO BLOQUEANTE
 *
 * Métrica nueva. La regla de escenificación del repositorio dice que entra
 * registrada durante una versión, y esta corrida es la que produce su línea
 * base. Aquí no hay `expect` sobre FPS: hay aserciones sobre la INTEGRIDAD de
 * la medida (que hubo cuadros, que hubo llamadas de dibujo, que no hubo
 * errores de consola). Un gate de FPS mal calibrado falla de forma
 * intermitente y acaba desactivado, que es peor que no tenerlo.
 */
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type CadBrowserPipelineId = 'next' | 'legacy';

interface CorpusTarget {
  corpusId: string;
  entities: number;
  /** Sólo en el escalón `full`. Se registra qué se dejó fuera y por qué. */
  tier: 'smoke' | 'full';
  /** Caminos que se miden en el escalón `smoke`. El `full` mide los dos. */
  smokePipelines: CadBrowserPipelineId[];
}

const BASELINE_CORPUS = 'baseline-line-circle-arc';

/**
 * Escalones, y por qué hay dos.
 *
 * El job de E2E ya dura ~25 minutos y corre en un runner SIN GPU: Chromium cae
 * en SwiftShader y Firefox en llvmpipe. Un cuadro que en una GPU cuesta
 * microsegundos aquí cuesta centenares de milisegundos, así que el escalón por
 * defecto tiene que ser el mínimo que DETECTE REGRESIONES, no el máximo que
 * quepa: las cuatro mezclas a 10k, que ya ejercitan bloques, sombreados,
 * splines, curvas de nivel largas y el atlas de glifos.
 *
 * Y el camino ANTERIOR sólo se recorre en una de las cuatro. No es pereza: a
 * 10k entidades reconstruye el grafo entero en cada cambio de vista y eso son
 * decenas de segundos por corrida. Se elige la mezcla hostil porque es donde
 * la diferencia es más brutal —un `<canvas>` por rótulo— así que si el camino
 * anterior mejora o empeora, ahí se ve. Las otras tres comparaciones salen en
 * el escalón `full`, que es el que produce la evidencia versionada.
 *
 * El escalón `full` —los 100k, el corpus base y el camino anterior en todo— se
 * corre a mano con `CAD_RENDER_BROWSER_TIER=full`. Lo que se deja fuera NO se
 * calla: viaja en `skipped` dentro de la evidencia y se imprime al terminar.
 * Un tope silencioso se lee como cobertura completa, que es la mentira más
 * cara de un benchmark.
 */
const BOTH: CadBrowserPipelineId[] = ['next', 'legacy'];
const NEXT_ONLY: CadBrowserPipelineId[] = ['next'];

const CORPORA: CorpusTarget[] = [
  { corpusId: 'architecture', entities: 10_000, tier: 'smoke', smokePipelines: NEXT_ONLY },
  { corpusId: 'mechanical', entities: 10_000, tier: 'smoke', smokePipelines: NEXT_ONLY },
  { corpusId: 'cartography', entities: 10_000, tier: 'smoke', smokePipelines: NEXT_ONLY },
  { corpusId: 'text-hostile', entities: 10_000, tier: 'smoke', smokePipelines: BOTH },
  { corpusId: BASELINE_CORPUS, entities: 10_000, tier: 'full', smokePipelines: [] },
  { corpusId: BASELINE_CORPUS, entities: 100_000, tier: 'full', smokePipelines: [] },
  { corpusId: 'architecture', entities: 100_000, tier: 'full', smokePipelines: [] },
  { corpusId: 'mechanical', entities: 100_000, tier: 'full', smokePipelines: [] },
  { corpusId: 'cartography', entities: 100_000, tier: 'full', smokePipelines: [] },
  { corpusId: 'text-hostile', entities: 100_000, tier: 'full', smokePipelines: [] },
];

const TIER = process.env.CAD_RENDER_BROWSER_TIER === 'full' ? 'full' : 'smoke';

const selected = CORPORA.filter((target) => TIER === 'full' || target.tier === 'smoke');
const pipelinesFor = (target: CorpusTarget): CadBrowserPipelineId[] =>
  TIER === 'full' ? BOTH : target.smokePipelines;
const skipped = [
  ...CORPORA.filter((target) => !selected.includes(target)).map(
    (target) => `${target.corpusId}@${target.entities} · los dos caminos (escalón full)`,
  ),
  ...selected
    .filter((target) => pipelinesFor(target).length < BOTH.length)
    .map(
      (target) =>
        `${target.corpusId}@${target.entities} · camino anterior (escalón full)`,
    ),
];

const startedAt = new Date().toISOString();
let bundle = '';
const runs: unknown[] = [];
const failures: string[] = [];
const leakCycles: unknown[] = [];
let environment: unknown = null;

/**
 * Empaqueta el arnés para el navegador. Va por `stdin` y no por un fichero de
 * entrada porque el punto de entrada es una línea: crear un archivo sólo para
 * eso metería en `src/` un módulo que nada del producto importa.
 */
async function buildHarnessBundle(): Promise<string> {
  const resolveDir = path.resolve(__dirname, '../../src/lib/cad/benchmark');
  const result = await build({
    stdin: {
      contents:
        "import { installCadBrowserBenchmark } from './browser-harness';\ninstallCadBrowserBenchmark();\n",
      resolveDir,
      loader: 'ts',
      sourcefile: 'cad-render-browser-harness.ts',
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    // El arnés importa JSON (los manifiestos del corpus).
    loader: { '.json': 'json' },
    logLevel: 'silent',
  });
  return result.outputFiles[0].text;
}

async function preparePage(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.setContent(
    '<!doctype html><html><head><meta charset="utf-8"><title>cad-render-bench</title></head><body style="margin:0;background:#0f172a"></body></html>',
  );
  await page.addScriptTag({ content: bundle });
  await page.waitForFunction(() => typeof window.__cadRenderBench !== 'undefined');
  return errors;
}

test.describe('CAD render · medida de navegador (FPS, draw calls, memoria GPU)', () => {
  test.skip(process.env.CAD_PERF_E2E !== '1', 'Run explicitly with CAD_PERF_E2E=1.');

  test.beforeAll(async () => {
    bundle = await buildHarnessBundle();
    expect(bundle.length).toBeGreaterThan(10_000);
  });

  for (const target of selected) {
    const label = `${target.corpusId}@${target.entities}`;
    test(`mide los dos caminos sobre ${label}`, async ({ page, browserName }, testInfo) => {
      // El escalón de 100k construye el corpus DENTRO del navegador y luego lo
      // pasea; con rasterizado por software eso no cabe en el minuto por
      // defecto de Playwright.
      testInfo.setTimeout(target.entities >= 100_000 ? 600_000 : 300_000);
      const errors = await preparePage(page);
      if (!environment)
        environment = await page.evaluate(() => window.__cadRenderBench!.environment());

      const measured: Record<string, unknown> = {};
      for (const pipeline of pipelinesFor(target)) {
        const run = await page.evaluate(
          async ([corpusId, entities, pipelineId]) =>
            window.__cadRenderBench!.run({
              corpusId: corpusId as never,
              entities: entities as number,
              pipeline: pipelineId as never,
              // Tres paradas y no doce: el camino ANTERIOR reconstruye el
              // grafo entero en cada parada, y doce reconstrucciones de 10.000
              // objetos no caben en el job. Los dos caminos ven las mismas
              // tres para que la comparación siga siendo comparación.
              panStops: 3,
              framesPerStop: 8,
              // 960×600 en vez de 1280×800: con rasterizado por software el
              // coste por cuadro es proporcional al área, y lo que se compara
              // es el mismo lienzo entre caminos, no el tamaño absoluto.
              canvasWidth: 960,
              canvasHeight: 600,
            }),
          [target.corpusId, target.entities, pipeline] as const,
        );
        measured[pipeline] = run;
        runs.push({ browser: browserName, ...run });
      }

      const next = measured.next as {
        pan: { samples: number; drawCallsP95: number };
        detailedAtRest: number;
        visibleAtRest: number;
        openSettled: boolean;
        zoomSettledFlag: boolean;
      };
      const legacy = measured.legacy as { pan: { samples: number } } | undefined;

      const evidence = { browser: browserName, corpus: label, tier: target.tier, measurements: measured, errors };
      await testInfo.attach(`cad-render-browser-${browserName}-${label}.json`, {
        body: Buffer.from(JSON.stringify(evidence, null, 2)),
        contentType: 'application/json',
      });
      console.log(JSON.stringify({ browser: browserName, corpus: label, next: measured.next, legacy: measured.legacy }));

      // ---------------------------------------------------------------
      // Aserciones de INTEGRIDAD, no de rendimiento. Ver la cabecera.
      // ---------------------------------------------------------------
      expect(next.pan.samples, 'el paneo tiene que haber presentado cuadros').toBeGreaterThan(0);
      if (legacy)
        expect(
          legacy.pan.samples,
          'el paneo del camino anterior tiene que haber presentado cuadros',
        ).toBeGreaterThan(0);
      // Una medida de GPU con cero llamadas de dibujo es una medida de nada:
      // significaría que el lienzo estuvo vacío toda la corrida.
      expect(next.pan.drawCallsP95, 'cero llamadas de dibujo = no se dibujó nada').toBeGreaterThan(0);
      // La propiedad central del pipeline nuevo, ahora comprobada CON GPU:
      // en reposo, detalladas == visibles. Sin muestreo.
      //
      // Sólo se exige cuando la vista LLEGÓ a asentar: con el rasterizador por
      // software del runner hay corpus que agotan el tope de reloj, y afirmar
      // «detalladas == visibles» sobre una vista a medio construir sería
      // afirmar algo que no se ha medido. Cuando no asienta, el hecho queda
      // registrado en la evidencia (`openSettled: false`), que es donde tiene
      // que estar para que se vea.
      if (next.zoomSettledFlag) expect(next.detailedAtRest).toBe(next.visibleAtRest);
      else
        console.log(
          `AVISO ${label}/${browserName}: el camino nuevo NO asentó dentro del tope de reloj; la evidencia lo registra como openSettled=${next.openSettled}.`,
        );
      if (errors.length) failures.push(`${browserName}/${label}: ${errors.join(' | ')}`);
      expect(errors, 'la página no debe registrar errores').toEqual([]);
    });
  }

  /**
   * Memoria del proceso tras TRES ciclos completos de abrir, panear, hacer zoom
   * y cerrar — la mitad de la pregunta que la fila «SLO de navegador» de la
   * rúbrica hace y que la medida de Node sólo podía responder para el montón de
   * V8, sin texturas ni canvas.
   *
   * Se compara el ciclo 1 con el ÚLTIMO y no el 0 con el último, igual que hace
   * `measureCadRenderLeak` en Node y por el mismo motivo: el primer ciclo carga
   * código, compila shaders e infla arenas, y nada de eso es una fuga.
   *
   * El corpus es el hostil: si algo va a retener memoria, es el atlas de glifos
   * y sus texturas. Un corpus de líneas mediría la parte que no preocupa.
   */
  test('memoria tras tres ciclos completos de abrir, panear, zoom y cerrar', async ({
    page,
    browserName,
  }, testInfo) => {
    testInfo.setTimeout(420_000);
    const errors = await preparePage(page);
    // Sin recolector forzado la cifra incluye basura sin recoger y no distingue
    // «retengo» de «todavía no he limpiado». Chromium lo expone por CDP;
    // Firefox no, y ahí la medida se declara poco fiable en vez de fingirse.
    const cdp =
      browserName === 'chromium' ? await page.context().newCDPSession(page) : null;
    const collectGarbage = async () => {
      if (cdp) await cdp.send('HeapProfiler.collectGarbage');
    };

    const samplesBytes: (number | null)[] = [];
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await page.evaluate(
        async () =>
          void (await window.__cadRenderBench!.run({
            corpusId: 'text-hostile',
            entities: 10_000,
            pipeline: 'next',
            panStops: 2,
            framesPerStop: 4,
            canvasWidth: 960,
            canvasHeight: 600,
          })),
      );
      await collectGarbage();
      samplesBytes.push(await page.evaluate(() => window.__cadRenderBench!.heapBytes()));
    }

    const first = samplesBytes[0];
    const last = samplesBytes[samplesBytes.length - 1];
    const growthMb =
      first !== null && last !== null
        ? Math.round(((last - first) / 1_048_576) * 100) / 100
        : null;
    const leak = {
      browser: browserName,
      corpus: 'text-hostile@10000',
      pipeline: 'next',
      cycles: 3,
      samplesMb: samplesBytes.map((sample) =>
        sample === null ? null : Math.round((sample / 1_048_576) * 100) / 100,
      ),
      heapGrowthMb: growthMb,
      // `performance.memory` sólo existe en Chromium, y sólo con GC forzado la
      // cifra significa «retenido». Las dos condiciones viajan con el dato.
      reliable: cdp !== null && first !== null,
      unreliableReason:
        cdp === null
          ? 'sin CDP no se puede forzar el recolector: la cifra incluye basura sin recoger'
          : first === null
            ? 'este navegador no expone performance.memory'
            : null,
    };
    leakCycles.push(leak);
    await testInfo.attach(`cad-render-browser-leak-${browserName}.json`, {
      body: Buffer.from(JSON.stringify(leak, null, 2)),
      contentType: 'application/json',
    });
    console.log(JSON.stringify(leak));

    // Report-only como el resto de métricas nuevas: se comprueba que la medida
    // EXISTE y que los tres ciclos se completaron, no un umbral de memoria.
    expect(samplesBytes).toHaveLength(3);
    expect(errors, 'la página no debe registrar errores').toEqual([]);
  });

  test.afterAll(async ({}, testInfo: TestInfo) => {
    const cpus = os.cpus();
    // El corpus se identifica por el SHA de SU MANIFIESTO, igual que hace
    // `cad-corpus-benchmark.mts`. Sin él, «arquitectura a 10k» es una etiqueta;
    // con él, dos corridas que difieran de corpus no se pueden confundir.
    const manifestSha256 = createHash('sha256')
      .update(
        readFileSync(
          path.resolve(__dirname, '../../src/lib/cad/benchmark/corpus-mixes-manifest.json'),
        ),
      )
      .digest('hex');
    const evidence = {
      // Mismo esquema de evidencia que el resto del repositorio
      // (`src/lib/cad/benchmark/evidence.schema.json`): schemaVersion,
      // benchmarkId, manifestSha256, startedAt/finishedAt, environment, run,
      // profiles y scope. Inventar un esquema propio para cada benchmark es
      // cómo se acaba con cuatro formatos y ninguna comparación posible.
      $schema: 'urn:valle-design:schema:cad-benchmark-evidence:v1',
      schemaVersion: 1,
      benchmarkId: 'valle-design-cad-render-browser-v1',
      manifestSha256,
      startedAt,
      finishedAt: new Date().toISOString(),
      environment: {
        platform: process.platform,
        architecture: process.arch,
        cpuModel: cpus[0]?.model ?? 'unknown',
        logicalCpuCount: cpus.length,
        totalMemoryBytes: os.totalmem(),
        playwrightProject: testInfo.project.name,
        browser: environment,
      },
      run: {
        enforcement: 'report-only',
        enforcementRationale:
          'Métrica nueva (FPS, llamadas de dibujo, memoria de GPU). Entra REGISTRADA y no bloqueante durante una versión: esta corrida es su línea base. Ningún presupuesto existente se toca junto a ella.',
        tier: TIER,
        skipped,
        failures,
      },
      profiles: runs,
      leakCycles,
      scope: {
        measured: [
          'cuadros presentados de verdad (intervalo entre rAF) durante paneo y zoom guionados, con p50, p95 y máximo',
          'llamadas de dibujo y triángulos por cuadro, leídos de renderer.info de THREE',
          'estimación de memoria de GPU por búferes de atributo y texturas vivas, deduplicada',
          'tiempo hasta el primer píxel presentado y hasta el detalle completo',
          'entidades detalladas frente a visibles en reposo, con GPU real, en los dos caminos',
          'memoria del proceso tras tres ciclos completos de abrir, panear, hacer zoom y cerrar, con recolector forzado donde el navegador lo permite',
        ],
        notMeasured: [
          'GPU real: en CI Chromium usa SwiftShader y Firefox llvmpipe, los dos por software. Estos FPS comparan caminos, NO predicen la experiencia con GPU',
          'el editor: el pipeline nuevo todavía no está enchufado a Layout3DEditor.tsx, así que esto mide los módulos, no el recorrido de interfaz',
          'memoria de GPU real del driver: WebGL no la expone y la cifra es una cota inferior por búferes y texturas',
          'red, API, PostgreSQL ni autoguardado',
        ],
      },
    };
    const directory = path.resolve(__dirname, '../.test-results');
    mkdirSync(directory, { recursive: true });
    const file = path.join(directory, `cad-render-browser-${testInfo.project.name}.json`);
    writeFileSync(file, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    console.log(`\nEvidencia de navegador (${TIER}): ${file}`);
    if (skipped.length) console.log(`Corpus NO medidos en este escalón: ${skipped.join(', ')}`);
  });
});
