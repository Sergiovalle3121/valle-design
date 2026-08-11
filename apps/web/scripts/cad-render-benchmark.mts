#!/usr/bin/env node
/**
 * Benchmark del pipeline de render — LOS DOS CAMINOS, MISMA CORRIDA.
 *
 * Vive APARTE de `cad-corpus-benchmark.mts` a propósito. Aquel script tiene
 * presupuestos BLOQUEANTES, incluido `peakRssBytes`; meterle dentro una corrida
 * de render de 100.000 entidades subiría su RSS y apretaría de rebote un
 * presupuesto que no viene a mover.
 *
 * ## Ahora es BLOQUEANTE, y por qué puede serlo
 *
 * Entró en `report-only` con una justificación explícita: «métrica nueva, sin
 * línea base versionada debajo». Ya cumplió esa versión y su corrida está
 * publicada en `docs/cad/evidence/cad-render-benchmark-100k.json`. Con
 * `src/lib/cad/benchmark/render-baseline.json` debajo —calibrado sobre varias
 * corridas, con su máquina al lado y con guarda de hardware— pasa a bloquear.
 *
 * Las métricas de NAVEGADOR (FPS, llamadas de dibujo, memoria de GPU) son
 * nuevas y siguen en `report-only`: están cumpliendo su versión ahora, en
 * `e2e/performance/cad-render-browser.spec.ts`.
 *
 * Qué se mide aquí: trabajo de CPU en Node. No GPU, no cuadros de navegador, no
 * composición. Eso vive en el spec de navegador.
 *
 * Uso:
 *   npm run benchmark:cad:render --workspace=web
 *   npm run benchmark:cad:render --workspace=web -- --entities 25000 --profile gate-25k
 *   npm run benchmark:cad:render --workspace=web -- --no-enforce
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
} from "../src/lib/cad/benchmark/scenario";
import {
  measureCadLegacyPipeline,
  measureCadNextPipeline,
  measureCadRenderLeak,
} from "../src/lib/cad/render/render-benchmark";
import {
  blockingCadRenderViolations,
  evaluateCadRenderBudget,
  findCadRenderBudgetProfile,
  formatCadRenderVerdict,
} from "../src/lib/cad/benchmark/render-budget";

interface CliOptions {
  entities: number;
  panStops: number;
  leakCycles: number;
  /**
   * Cuántas veces se repite el recorrido del camino NUEVO.
   *
   * Una sola corrida no basta y está medido: tres seguidas en la misma máquina
   * ociosa dieron `firstDetailMs` 811, 1.557 y 931 ms. Publicar cualquiera de
   * las tres como «el número» sería elegir la que conviene. Se publica la
   * MEDIANA y viajan las tres muestras al lado, que es lo que permite discutir
   * la cifra con datos.
   */
  repeat: number;
  profile: string;
  enforce: boolean;
  output?: string;
}

function parseCli(argv: string[]): CliOptions {
  const options: CliOptions = {
    entities: 100_000,
    panStops: 12,
    leakCycles: 3,
    repeat: 3,
    profile: "reference-100k",
    enforce: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--entities") options.entities = Number.parseInt(argv[++index] ?? "", 10);
    else if (argument === "--pan-stops") options.panStops = Number.parseInt(argv[++index] ?? "", 10);
    else if (argument === "--leak-cycles")
      options.leakCycles = Number.parseInt(argv[++index] ?? "", 10);
    else if (argument === "--repeat") options.repeat = Number.parseInt(argv[++index] ?? "", 10);
    else if (argument === "--profile") options.profile = argv[++index] ?? "";
    else if (argument === "--no-enforce") options.enforce = false;
    else if (argument === "--output") options.output = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!Number.isSafeInteger(options.entities) || options.entities < 1)
    throw new Error("--entities must be a positive integer.");
  if (!Number.isSafeInteger(options.repeat) || options.repeat < 1)
    throw new Error("--repeat must be a positive integer.");
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

/**
 * Repite el recorrido y se queda con la MEDIANA por `firstDetailMs`.
 *
 * Mediana y no media: la distribución tiene cola por arriba —una pausa del
 * recolector, otro proceso en la máquina— y la media la seguiría. Tampoco la
 * mejor, que sería elegir la corrida favorable. Las muestras completas van a
 * `variance` para que nadie tenga que fiarse de este párrafo.
 */
const nextRuns = Array.from({ length: options.repeat }, () =>
  measureCadNextPipeline(
    corpus.nativeEntities,
    corpus.document.modelSpace.entityIds,
    scenario,
  ),
);
const next = [...nextRuns].sort((left, right) => left.firstDetailMs - right.firstDetailMs)[
  Math.floor((nextRuns.length - 1) / 2)
];
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
/**
 * Los núcleos que este proceso puede usar, no los que tiene la máquina.
 *
 * Tiene que leerse igual que en `cad-render-baseline.mts` —ver el comentario
 * largo de allí—: si la calibración registra la paralelización disponible y el
 * juicio compara contra el recuento de la máquina, el guardián de hardware
 * compara dos cosas distintas y degrada (o deja de degradar) por accidente.
 */
const availableCpus = os.availableParallelism();

/**
 * Juicio contra la línea base versionada.
 *
 * El perfil se elige por nombre y se COMPRUEBA que su tamaño coincide con el
 * corpus medido: juzgar una corrida de 25.000 entidades contra el presupuesto
 * de 100.000 daría verde siempre, y sería la peor clase de gate —uno que pasa
 * por construcción.
 */
const profile = findCadRenderBudgetProfile(options.profile);
if (options.enforce && !profile)
  throw new Error(
    `No existe el perfil «${options.profile}» en render-baseline.json. Perfiles disponibles: ${
      // Se enumeran en el error para que nadie tenga que abrir el JSON.
      (await import("../src/lib/cad/benchmark/render-budget")).CAD_RENDER_BASELINE.profiles
        .map((entry) => entry.id)
        .join(", ")
    }.`,
  );
if (profile && profile.entities !== options.entities)
  throw new Error(
    `El perfil ${profile.id} está calibrado para ${profile.entities} entidades y se han medido ${options.entities}. Un presupuesto aplicado a otro tamaño no significa nada: usa --profile o --entities.`,
  );

const verdict =
  profile && options.enforce
    ? evaluateCadRenderBudget(
        { entities: options.entities, scenarioStops: scenario.pan.length, next, legacy, leak },
        profile,
        {
          logicalCpuCount: availableCpus,
          totalMemoryBytes: os.totalmem(),
          exposedGc: gcAvailable,
        },
        { next: nextAtFullView, legacy: legacyAtFullView },
      )
    : null;

const evidence = {
  $schema: "urn:valle-design:schema:cad-render-benchmark-evidence:v1",
  schemaVersion: 1,
  benchmarkId: "valle-design-cad-render-pipeline-v1",
  startedAt,
  finishedAt: new Date().toISOString(),
  enforcement: verdict ? verdict.enforcement : "report-only",
  heapMeasurementReliable: gcAvailable,
  enforcementRationale: verdict
    ? `${profile!.enforcementRationale}${verdict.downgradeReason ? ` DEGRADADO EN ESTA CORRIDA: ${verdict.downgradeReason}` : ""}`
    : "Corrida sin juicio de presupuesto (--no-enforce o sin perfil): sólo registra medidas.",
  baseline: profile
    ? {
        profileId: profile.id,
        budgets: profile.budgets,
        invariants: profile.invariants,
        calibratedOn: profile.calibration.environment,
        calibratedAt: profile.calibration.recordedAt,
        runs: profile.calibration.runs,
        marginFactor: profile.calibration.marginFactor,
      }
    : null,
  verdict,
  environment: {
    node: process.version,
    v8: process.versions.v8,
    platform: process.platform,
    architecture: process.arch,
    cpuModel: cpus[0]?.model ?? "unknown",
    logicalCpuCount: availableCpus,
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
  variance: {
    runs: nextRuns.length,
    published: "mediana por firstDetailMs",
    firstDetailMs: nextRuns.map((run) => run.firstDetailMs),
    zoomSettleMs: nextRuns.map((run) => run.zoomSettleMs),
    panFrameP95Ms: nextRuns.map((run) => run.panFrameP95Ms),
  },
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
      "dispersión entre corridas del camino nuevo: se publica la mediana y viajan todas las muestras en `variance`",
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
    `CAD render · ${options.entities} entidades · ${scenario.pan.length} paradas de paneo · mediana de ${nextRuns.length} corridas`,
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

if (verdict) {
  process.stderr.write(`${formatCadRenderVerdict(verdict)}\n\n`);
  const blocking = blockingCadRenderViolations(verdict);
  if (blocking.length > 0) {
    process.stderr.write(
      "El pipeline de render incumple su línea base versionada. Si el cambio es\n" +
        "intencionado y MEJORA los números, recalibra con:\n" +
        "  npm run benchmark:cad:baseline --workspace=web -- --write\n" +
        "y deja el diff del manifiesto delante de quien revise.\n",
    );
    process.exit(1);
  }
}
