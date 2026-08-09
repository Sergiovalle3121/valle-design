#!/usr/bin/env node
/**
 * Benchmark del pipeline de render — LOS DOS CAMINOS, MISMA CORRIDA.
 *
 * Vive APARTE de `cad-corpus-benchmark.mts` a propósito. Aquel script tiene
 * presupuestos BLOQUEANTES, incluido `peakRssBytes`; meterle dentro una corrida
 * de render de 100.000 entidades subiría su RSS y apretaría de rebote un
 * presupuesto que este PR no viene a mover. La regla de escenificación es
 * explícita: una métrica nueva entra REGISTRADA Y NO BLOQUEANTE, y nunca en el
 * mismo PR que aprieta una vieja. Así que aquí no hay presupuestos: hay medidas,
 * y las dos columnas al lado para poder compararlas.
 *
 * Qué se mide: trabajo de CPU en Node. No GPU, no cuadros de navegador, no
 * composición. Los números de navegador siguen viviendo en
 * `e2e/performance/cad-viewport-100k.spec.ts` y sólo se moverán cuando el
 * pipeline esté enchufado al editor, que es un PR posterior.
 *
 * Uso:
 *   npm run benchmark:cad:render --workspace=web
 *   npm run benchmark:cad:render --workspace=web -- --entities 25000
 *   npm run benchmark:cad:render --workspace=web -- --output evidence.json
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getHeapStatistics } from "node:v8";
import { createCadBenchmarkCorpus } from "../src/lib/cad/benchmark/corpus";
import {
  cadDocumentBounds,
  createCadRenderScenario,
  measureCadLegacyPipeline,
  measureCadNextPipeline,
  measureCadRenderLeak,
} from "../src/lib/cad/render/render-benchmark";

interface CliOptions {
  entities: number;
  panStops: number;
  leakCycles: number;
  output?: string;
}

function parseCli(argv: string[]): CliOptions {
  const options: CliOptions = { entities: 100_000, panStops: 12, leakCycles: 3 };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--entities") options.entities = Number.parseInt(argv[++index] ?? "", 10);
    else if (argument === "--pan-stops") options.panStops = Number.parseInt(argv[++index] ?? "", 10);
    else if (argument === "--leak-cycles")
      options.leakCycles = Number.parseInt(argv[++index] ?? "", 10);
    else if (argument === "--output") options.output = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!Number.isSafeInteger(options.entities) || options.entities < 1)
    throw new Error("--entities must be a positive integer.");
  return options;
}

const options = parseCli(process.argv.slice(2));

/**
 * La prueba de fuga necesita poder forzar el recolector: sin `--expose-gc` el
 * número mide ruido de arena, no memoria retenida. La bandera entra por
 * `NODE_OPTIONS` desde el script de npm, que es la única vía que ATRAVIESA el
 * lanzador de `tsx` —éste vuelve a arrancar node por su cuenta y no propaga los
 * argumentos de la línea de órdenes. Se intentó que el proceso se relanzase a sí
 * mismo con la bandera y el resultado fue una bomba de bifurcación: el hijo
 * tampoco la recibía y volvía a relanzarse.
 *
 * Si aun así falta, se avisa y se sigue: una medida declarada como poco fiable
 * es más útil que ninguna medida, y mucho más que una fiable de mentira.
 */
const gcAvailable = typeof (globalThis as { gc?: () => void }).gc === "function";
if (!gcAvailable)
  process.stderr.write(
    "AVISO: sin --expose-gc. heapGrowthMb incluye basura sin recoger y NO es comparable con una corrida que sí la tenga.\n",
  );

const startedAt = new Date().toISOString();
const corpus = createCadBenchmarkCorpus({ entities: options.entities });
const bounds = cadDocumentBounds(corpus.nativeEntities);
const scenario = createCadRenderScenario(bounds, options.panStops);

const next = measureCadNextPipeline(
  corpus.nativeEntities,
  corpus.document.modelSpace.entityIds,
  scenario,
);
const legacy = measureCadLegacyPipeline(corpus.nativeEntities, scenario);
// La vista completa es donde el muestreo del camino anterior se ve sin discutir.
const restScenario = { initial: scenario.initial, pan: [], zoom: scenario.initial };
const nextAtFullView = measureCadNextPipeline(
  corpus.nativeEntities,
  corpus.document.modelSpace.entityIds,
  restScenario,
);
const legacyAtFullView = measureCadLegacyPipeline(corpus.nativeEntities, restScenario);
const leak = measureCadRenderLeak(
  corpus.nativeEntities,
  corpus.document.modelSpace.entityIds,
  { initial: scenario.initial, pan: scenario.pan.slice(0, 4), zoom: scenario.zoom },
  options.leakCycles,
);

const cpus = os.cpus();
const evidence = {
  $schema: "urn:valle-design:schema:cad-render-benchmark-evidence:v1",
  schemaVersion: 1,
  benchmarkId: "valle-design-cad-render-pipeline-v1",
  startedAt,
  finishedAt: new Date().toISOString(),
  enforcement: "report-only",
  heapMeasurementReliable: gcAvailable,
  enforcementRationale:
    "Métrica nueva. Entra registrada y NO bloqueante hasta tener una línea base versionada debajo; ningún presupuesto existente se toca en el mismo PR.",
  environment: {
    node: process.version,
    v8: process.versions.v8,
    platform: process.platform,
    architecture: process.arch,
    cpuModel: cpus[0]?.model ?? "unknown",
    logicalCpuCount: cpus.length,
    totalMemoryBytes: os.totalmem(),
    heapLimitBytes: getHeapStatistics().heap_size_limit,
    exposedGc: gcAvailable,
  },
  corpus: {
    entities: options.entities,
    entityMix: corpus.entityMix,
    bounds,
    sha256: createHash("sha256")
      .update(`${options.entities}:${JSON.stringify(bounds)}`)
      .digest("hex"),
  },
  scenario: {
    panStops: scenario.pan.length,
    initialPixelsPerUnit: scenario.initial.pixelsPerUnit,
    panPixelsPerUnit: scenario.pan[0]?.pixelsPerUnit ?? null,
    zoomPixelsPerUnit: scenario.zoom.pixelsPerUnit,
  },
  measurements: { next, legacy, nextAtFullView, legacyAtFullView, leak },
  comparison: {
    detailedAtFullViewNext: nextAtFullView.detailedAtRest,
    detailedAtFullViewLegacy: legacyAtFullView.detailedAtRest,
    visibleAtFullView: nextAtFullView.visibleAtRest,
    panFrameP95Ratio:
      legacy.panFrameP95Ms > 0
        ? Math.round((legacy.panFrameP95Ms / Math.max(next.panFrameP95Ms, 1e-6)) * 100) / 100
        : null,
    firstDetailRatio:
      next.firstDetailMs > 0
        ? Math.round((legacy.firstDetailMs / next.firstDetailMs) * 100) / 100
        : null,
  },
  scope: {
    measured: [
      "trabajo de CPU de teselado, agrupación en lotes y culling para un guion determinista de apertura, paneo y zoom",
      "entidades detalladas en reposo frente a entidades visibles, en los dos caminos",
      "crecimiento del montón tras ciclos completos de abrir, panear, hacer zoom y cerrar",
    ],
    notMeasured: [
      "GPU, llamadas de dibujo reales, composición del navegador y cuadros por segundo",
      "coste de subir atributos a la GPU",
      "rasterizado de glifos: en Node no hay canvas, así que el atlas de texto no entra en esta corrida",
      "red, API, PostgreSQL ni autoguardado",
    ],
  },
};

const json = `${JSON.stringify(evidence, null, 2)}\n`;
const target = options.output ?? process.env.CAD_RENDER_BENCHMARK_OUTPUT;
if (target) {
  const resolved = path.resolve(target);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, json, "utf8");
  process.stderr.write(`CAD render benchmark evidence: ${resolved}\n`);
} else {
  process.stdout.write(json);
}

process.stderr.write(
  [
    "",
    `CAD render · ${options.entities} entidades · ${scenario.pan.length} paradas de paneo`,
    "  métrica                        nuevo            anterior",
    `  detalladas en reposo (vista completa)   ${String(nextAtFullView.detailedAtRest).padEnd(12)} ${legacyAtFullView.detailedAtRest} de ${nextAtFullView.visibleAtRest} visibles`,
    `  firstDetailMs                  ${String(next.firstDetailMs).padEnd(16)} ${legacy.firstDetailMs}`,
    `  zoomSettleMs                   ${String(next.zoomSettleMs).padEnd(16)} ${legacy.zoomSettleMs}`,
    `  panFrameP95Ms  (n=${next.panFrameSamples})       ${String(next.panFrameP95Ms).padEnd(16)} ${legacy.panFrameP95Ms} (n=${legacy.panFrameSamples})`,
    `  zoomFrameP95Ms (n=${next.zoomFrameSamples})       ${String(next.zoomFrameP95Ms).padEnd(16)} ${legacy.zoomFrameP95Ms} (n=1)`,
    `  peor cuadro al panear (ms)     ${String(next.panFrameMaxMs).padEnd(16)} ${legacy.panFrameMaxMs}`,
    `  heapGrowthMb (${leak.cycles} ciclos)        ${leak.heapGrowthMb}  [${leak.samplesMb.join(" → ")}]`,
    "",
    "Medida de CPU en Node. No es GPU, ni cuadros de navegador, ni FPS.",
    "",
  ].join("\n"),
);
