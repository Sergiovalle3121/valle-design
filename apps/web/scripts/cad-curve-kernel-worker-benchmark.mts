#!/usr/bin/env node
/**
 * Benchmark del CABLEADO del kernel Rust/WASM (A.4) — kernel activado frente a
 * desactivado, en el MISMO proceso, sobre el MISMO corpus, por el camino que
 * de verdad lo usa: `tessellateCadEntityBatch` (`tessellate.worker.ts`), en
 * lotes del tamaño real que viaja por `postMessage`
 * (`CAD_RENDER_OFFTHREAD_BATCH_MAX_ENTITIES`).
 *
 * ## Por qué esto y no otra corrida de `cad-render-benchmark.mts`
 *
 * Aquel script mide el pipeline SÍNCRONO (`pipeline.ts` → `tessellateCadEntity`),
 * que es exactamente el camino que ADR-0003 y esta tarea prohíben tocar
 * primero. El kernel sólo está cableado en el carril fuera de hilo, así que la
 * única medida honesta de «con kernel contra sin kernel» es llamar a la MISMA
 * función que llama el worker, con y sin el kernel — no reinventar el
 * pipeline entero para ejercitar dos líneas de código.
 *
 * ## Qué mide y qué NO mide
 *
 * Mide trabajo de CPU en Node: teselar un corpus determinista (línea, círculo,
 * arco — el mismo generador que `cad-render-benchmark.mts` ya usa) en lotes de
 * 512 entidades, la unidad real que cruza `postMessage`. NO mide GPU, cuadros
 * de navegador, ni composición — eso es exactamente lo que ADR-0003 prohíbe
 * afirmar («60 FPS») a partir de una medida de Node, y aquí no se afirma.
 *
 * ## Por qué se cita el SUELO (`speedupFloor`) y no la mediana
 *
 * Mismo criterio que `docs/cad/evidence/wasm-parity.json`: en una máquina con
 * vecinos la mediana puede caer del lado favorable por suerte de planificación
 * del sistema operativo; el peor caso de las corridas no.
 *
 * Uso:
 *   npx tsx scripts/cad-curve-kernel-worker-benchmark.mts
 *   npx tsx scripts/cad-curve-kernel-worker-benchmark.mts -- --entities 40000 --output ../docs/cad/evidence/x.json
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { createCadBenchmarkCorpus } from "../src/lib/cad/benchmark/corpus";
import { cadPercentile, cadRound3 } from "../src/lib/cad/benchmark/scenario";
import { cadDocumentBounds } from "../src/lib/cad/render/render-benchmark";
import { tessellateCadEntityBatch } from "../src/lib/cad/render/tessellate.worker";
import {
  cadRenderOriginFromBounds,
  cadRenderSegmentBudget,
  type CadRenderLodTier,
} from "../src/lib/cad/render/tessellation-cache";
import { CAD_RENDER_OFFTHREAD_BATCH_MAX_ENTITIES } from "../src/lib/cad/render/pipeline-offthread";
import { createCadCurveKernel, type CadCurveKernel } from "../src/lib/cad/wasm/curve-kernel";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const root = path.resolve(webRoot, "../..");

interface CliOptions {
  entities: number;
  repeat: number;
  batchSize: number;
  output?: string;
}

function parseCli(argv: string[]): CliOptions {
  const options: CliOptions = {
    // Mismo tamaño por defecto que `cad-render-benchmark.mts`: comparable con
    // la evidencia ya publicada de ese script.
    entities: 100_000,
    repeat: 5,
    batchSize: CAD_RENDER_OFFTHREAD_BATCH_MAX_ENTITIES,
    output: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--entities") options.entities = Number.parseInt(argv[++index] ?? "", 10);
    else if (argument === "--repeat") options.repeat = Number.parseInt(argv[++index] ?? "", 10);
    else if (argument === "--batch-size") options.batchSize = Number.parseInt(argv[++index] ?? "", 10);
    else if (argument === "--output") options.output = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!Number.isSafeInteger(options.entities) || options.entities < 1)
    throw new Error("--entities must be a positive integer.");
  if (!Number.isSafeInteger(options.repeat) || options.repeat < 1)
    throw new Error("--repeat must be a positive integer.");
  if (!Number.isSafeInteger(options.batchSize) || options.batchSize < 1)
    throw new Error("--batch-size must be a positive integer.");
  return options;
}

const options = parseCli(process.argv.slice(2));

const wasmPath = path.resolve(root, "apps/web/public/wasm/valle-cad-kernel.wasm");
const wasmBytes = readFileSync(wasmPath);
const kernel = await createCadCurveKernel(new Uint8Array(wasmBytes));
if (kernel.backend !== "wasm")
  throw new Error(
    `El binario del árbol no cargó como kernel wasm (${kernel.fallbackReason}). ` +
      "Compílalo con: node scripts/wasm/build-kernel.mjs",
  );

const corpus = createCadBenchmarkCorpus({ entities: options.entities });
const bounds = cadDocumentBounds(corpus.nativeEntities);
const origin = cadRenderOriginFromBounds(bounds);
// Tres escalones de LOD repartidos por índice: el mismo reparto de detalle que
// un documento real trae mezclado dentro de un solo lote de worker, en vez de
// un `steps` uniforme que no ejercita el agrupado por `steps` del cableado.
const TIERS: readonly CadRenderLodTier[] = [0, 1, 2];
const segments = corpus.nativeEntities.map((_, index) => cadRenderSegmentBudget(TIERS[index % 3]));

interface BatchRunStats {
  totalMs: number;
  batches: number;
  perBatchP50Ms: number;
  perBatchP95Ms: number;
  perBatchMaxMs: number;
}

function runOnce(kernelForRun: CadCurveKernel | null): BatchRunStats {
  const perBatchMs: number[] = [];
  const started = performance.now();
  for (let start = 0; start < corpus.nativeEntities.length; start += options.batchSize) {
    const end = Math.min(start + options.batchSize, corpus.nativeEntities.length);
    const batchStarted = performance.now();
    tessellateCadEntityBatch(
      corpus.nativeEntities.slice(start, end),
      segments.slice(start, end),
      undefined,
      origin,
      kernelForRun,
    );
    perBatchMs.push(performance.now() - batchStarted);
  }
  return {
    totalMs: cadRound3(performance.now() - started),
    batches: perBatchMs.length,
    perBatchP50Ms: cadPercentile(perBatchMs, 0.5),
    perBatchP95Ms: cadPercentile(perBatchMs, 0.95),
    perBatchMaxMs: cadRound3(Math.max(0, ...perBatchMs)),
  };
}

// Una corrida de calentamiento por motor, descartada: JIT y caché de código
// wasm no están calientes en la primera pasada y medirla distorsiona el suelo.
runOnce(null);
runOnce(kernel);

const withoutKernelRuns = Array.from({ length: options.repeat }, () => runOnce(null));
const withKernelRuns = Array.from({ length: options.repeat }, () => runOnce(kernel));

const median = (values: readonly number[]): number =>
  [...values].sort((left, right) => left - right)[Math.floor((values.length - 1) / 2)];

const withoutKernelTotals = withoutKernelRuns.map((run) => run.totalMs);
const withKernelTotals = withKernelRuns.map((run) => run.totalMs);
const speedupPerRun = withoutKernelTotals.map((total, index) =>
  cadRound3(total / Math.max(withKernelTotals[index], 1e-6)),
);

const cpus = os.cpus();
const evidence = {
  $schema: "urn:valle-design:schema:cad-curve-kernel-worker-benchmark:v1",
  schemaVersion: 1,
  benchmarkId: "valle-design-cad-curve-kernel-worker-wiring-v1",
  startedAt: new Date().toISOString(),
  enforcement: "report-only",
  enforcementRationale:
    "Métrica nueva sin línea base versionada: no bloquea. El gate de paridad numérica " +
    "(curve-kernel-parity.spec.ts) sí bloquea y es el que impide que el cableado divergiera del " +
    "camino sin kernel.",
  adr: "docs/adr/0003-native-kernel-and-rust-wasm-entry-gate.md",
  flagState: "APAGADA por defecto en producción — CadTessellateWorkerRequest.curveKernel es undefined " +
    "salvo que quien construye la petición lo active explícitamente. Este benchmark la activa a mano " +
    "para medir el cableado, no describe el comportamiento por defecto.",
  environment: {
    node: process.version,
    v8: process.versions.v8,
    platform: process.platform,
    architecture: process.arch,
    cpuModel: cpus[0]?.model ?? "desconocido",
    logicalCpuCount: cpus.length,
    availableParallelism: os.availableParallelism?.() ?? cpus.length,
    totalMemoryBytes: os.totalmem(),
  },
  corpus: {
    entities: options.entities,
    entityMix: corpus.entityMix,
    bounds,
    origin,
    note:
      "Generador de línea/círculo/arco de `benchmark/corpus.ts`, el mismo que usa " +
      "`cad-render-benchmark.mts` — circle+arc son las familias que el kernel agrupa; line pasa " +
      "por el camino sin kernel dentro del MISMO lote, igual que en producción.",
  },
  method: {
    entryPoint: "tessellateCadEntityBatch(entities, segments, document, origin, kernel)",
    batchSize: options.batchSize,
    batchSizeSource: "CAD_RENDER_OFFTHREAD_BATCH_MAX_ENTITIES — el tope real de un mensaje de worker",
    lodTiersInterleaved: [...TIERS],
    repeat: options.repeat,
    warmupRunsDiscarded: 1,
    aggregation: "mediana de las corridas por totalMs; speedupPerRun y speedupFloor por corrida",
  },
  withoutKernel: {
    runs: withoutKernelRuns,
    medianTotalMs: median(withoutKernelTotals),
    totalsMs: withoutKernelTotals,
  },
  withKernel: {
    backend: kernel.backend,
    abi: kernel.abi,
    runs: withKernelRuns,
    medianTotalMs: median(withKernelTotals),
    totalsMs: withKernelTotals,
  },
  speedupMedian: cadRound3(median(withoutKernelTotals) / Math.max(median(withKernelTotals), 1e-6)),
  speedupPerRun,
  speedupFloor: cadRound3(Math.min(...speedupPerRun)),
  citeThisNumber:
    "speedupFloor, no speedupMedian — mismo criterio que docs/cad/evidence/wasm-parity.json: el " +
    "peor caso de las corridas es defendible con máquina compartida, la mediana puede caer del " +
    "lado favorable por suerte de planificación del sistema operativo.",
  interpretation:
    "El número de aquí es MODESTO comparado con el ×2–×4 de wasm-parity.json, y la diferencia es " +
    "honesta, no ruido: aquel benchmark tesela 100.000 arcos EN UNA SOLA llamada al kernel; éste " +
    "los reparte en lotes de 512 entidades —el tope real de un mensaje de worker— y dentro de cada " +
    "lote los subdivide otra vez por familia y por `steps` (LOD mezclado), así que cada llamada real " +
    "al kernel tesela decenas de curvas, no cientos de miles. La frontera JS↔wasm se paga por " +
    "llamada; con grupos pequeños esa cuota se amortiza peor. Con corpus más chicos (≤60k) la " +
    "dispersión entre corridas incluso cruza 1× en alguna muestra — la mejora es real pero pequeña " +
    "a esta granularidad, y NO respalda extrapolar el ×2–×4 del kernel aislado al camino de " +
    "producción. Esto es exactamente el tipo de brecha que ADR-0003 exige medir antes de considerar " +
    "activar la bandera por defecto.",
  scope: {
    measured: [
      "trabajo de CPU en Node de tessellateCadEntityBatch, con y sin el kernel wasm, en el mismo proceso",
      "el camino REAL del cableado: lotes de CAD_RENDER_OFFTHREAD_BATCH_MAX_ENTITIES entidades, LOD " +
        "mezclado dentro de cada lote, agrupado por familia y por steps tal como lo hace " +
        "cadKernelCurvePayloads",
    ],
    notMeasured: [
      "FPS ni cuadros de navegador — ADR-0003 prohíbe afirmar 60 FPS a partir de una medida de Node, " +
        "y aquí no se afirma ningún número de FPS",
      "GPU, composición ni postMessage/clonado estructural real (eso lo mide cad-render-benchmark.mts " +
        "--stages)",
      "el camino síncrono principal (pipeline.ts → tessellateCadEntity): no lleva el kernel y esto no lo mide",
    ],
  },
  finishedAt: new Date().toISOString(),
};

const json = `${JSON.stringify(evidence, null, 2)}\n`;
const target = options.output ?? path.resolve(root, "docs/cad/evidence/cad-curve-kernel-worker-benchmark.json");
const resolved = path.resolve(target);
mkdirSync(path.dirname(resolved), { recursive: true });
writeFileSync(resolved, json, "utf8");

process.stderr.write(
  [
    "",
    `cad-curve-kernel-worker-benchmark · ${options.entities} entidades · lotes de ${options.batchSize} · ${options.repeat} corridas`,
    `  sin kernel  mediana ${evidence.withoutKernel.medianTotalMs} ms  [${withoutKernelTotals.join(", ")}]`,
    `  con kernel  mediana ${evidence.withKernel.medianTotalMs} ms  [${withKernelTotals.join(", ")}]`,
    `  speedup     mediana ${evidence.speedupMedian}×  suelo (citar este) ${evidence.speedupFloor}×`,
    `  evidencia → ${path.relative(root, resolved).replaceAll(path.sep, "/")}`,
    "",
  ].join("\n"),
);
