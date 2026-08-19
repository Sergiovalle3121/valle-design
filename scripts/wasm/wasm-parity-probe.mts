/**
 * Sonda de paridad y rendimiento del kernel WASM: UNA corrida, volcada a
 * stdout como JSON y nada más.
 *
 * `wasm-parity-evidence.mjs` la ejecuta tres veces en PROCESOS SEPARADOS y
 * publica la mediana. El reparto es el mismo que en la sonda de trazado: aquí
 * vive lo que hay que medir, allí lo que hay que declarar de la máquina.
 *
 * Tres corridas en procesos separados y no tres vueltas dentro del mismo,
 * porque repetir en caliente mide un JIT ya especializado sobre este corpus
 * concreto — que es justo lo que NO le pasa al navegador de un arquitecto
 * abriendo un plano.
 */
import { performance } from "node:perf_hooks";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CAD_ARC_STRIDE,
  CAD_ELLIPSE_STRIDE,
  createCadCurveKernel,
  createCadCurveKernelJs,
  type CadCurveKernel,
} from "../../apps/web/src/lib/cad/wasm/curve-kernel";
import {
  buildCadKernelCorpus,
  CAD_KERNEL_CORPUS_SEED,
  compareCadKernelBatch,
  compareCadKernelCurve,
  mergeCadKernelParity,
  ulpDistance,
  type CadKernelParityReport,
} from "../../apps/web/src/lib/cad/wasm/curve-kernel-corpus";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const wasmPath = path.join(root, "apps/web/public/wasm/valle-cad-kernel.wasm");
const manifestPath = path.join(root, "crates/valle-cad-kernel/kernel-manifest.json");

/** Escalones de teselado que usa el pipeline: 24 dibuja, 96 acerca. */
const STEP_LEVELS = [24, 96] as const;
/** Arcos del lote de rendimiento. Es el orden del plano denso que se estresa. */
const BENCHMARK_ARCS = 100_000;
/** Repeticiones DENTRO de la corrida. La mediana de éstas entra en la mediana de fuera. */
const REPEATS = 5;

const round = (value: number, digits = 6) =>
  Number.isFinite(value) ? Number(value.toFixed(digits)) : value;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const corpus = buildCadKernelCorpus();
const bytes = fs.existsSync(wasmPath) ? fs.readFileSync(wasmPath) : null;
const wasm = await createCadCurveKernel(
  bytes ? new Uint8Array(bytes) : null,
  `no existe ${path.relative(root, wasmPath)}`,
);
const js = createCadCurveKernelJs(null);

if (wasm.backend !== "wasm") {
  // Fallo cerrado: la sonda NO publica una paridad inventada comparando el
  // motor JavaScript consigo mismo. Sale con error y dice por qué.
  process.stderr.write(
    `sonda wasm: el kernel cayó al motor JavaScript (${wasm.fallbackReason}). No hay paridad que medir.\n`,
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Paridad
// ---------------------------------------------------------------------------

function parityForArcs(kernelA: CadCurveKernel, kernelB: CadCurveKernel): CadKernelParityReport[] {
  return STEP_LEVELS.map((steps) => {
    const left = kernelA.tessellateArcs(corpus.arcs, corpus.arcCount, steps);
    const right = kernelB.tessellateArcs(corpus.arcs, corpus.arcCount, steps);
    return compareCadKernelBatch(
      `arc@${steps}`,
      left.counts,
      left.points,
      right.counts,
      right.points,
      corpus.arcs,
      CAD_ARC_STRIDE,
    );
  });
}

function parityForEllipses(
  kernelA: CadCurveKernel,
  kernelB: CadCurveKernel,
): CadKernelParityReport[] {
  return STEP_LEVELS.map((steps) => {
    const left = kernelA.tessellateEllipses(corpus.ellipses, corpus.ellipseCount, steps);
    const right = kernelB.tessellateEllipses(corpus.ellipses, corpus.ellipseCount, steps);
    return compareCadKernelBatch(
      `ellipse@${steps}`,
      left.counts,
      left.points,
      right.counts,
      right.points,
      corpus.ellipses,
      CAD_ELLIPSE_STRIDE,
    );
  });
}

function parityForSplines(
  kernelA: CadCurveKernel,
  kernelB: CadCurveKernel,
): CadKernelParityReport[] {
  const reports: CadKernelParityReport[] = [];
  for (const steps of STEP_LEVELS)
    for (const spline of corpus.splines) {
      const left = kernelA.tessellateSpline(spline.control, spline.degree, spline.knots, steps);
      const right = kernelB.tessellateSpline(spline.control, spline.degree, spline.knots, steps);
      // La escala de una spline es la coordenada mayor de su polígono de
      // control: De Boor es una combinación convexa de esos puntos, así que
      // ninguna coordenada de la curva puede salirse de ese orden de magnitud.
      let scale = 1;
      for (const coordinate of spline.control)
        if (Math.abs(coordinate) > scale) scale = Math.abs(coordinate);
      reports.push(compareCadKernelCurve(`spline@${steps}`, left, right, scale));
    }
  return reports;
}

/**
 * De dónde viene la divergencia, MEDIDA y no supuesta.
 *
 * Se instancia el módulo aparte del cargador de producto porque las sondas
 * `valle_probe_sin` / `valle_probe_cos` son diagnóstico y no forman parte del
 * contrato que el editor usa: exponerlas en la interfaz del kernel sería
 * ensanchar la superficie del producto para servir a un informe.
 */
async function measureTranscendentalDivergence(binary: Uint8Array) {
  const { instance } = await WebAssembly.instantiate(binary, {});
  const probes = instance.exports as unknown as {
    valle_probe_sin?: (x: number) => number;
    valle_probe_cos?: (x: number) => number;
  };
  if (!probes.valle_probe_sin || !probes.valle_probe_cos) return null;
  const SAMPLES = 200_000;
  let maxUlpSin = 0;
  let maxUlpCos = 0;
  let maxAbsolute = 0;
  let identical = 0;
  for (let index = 0; index < SAMPLES; index += 1) {
    // Cuatro vueltas completas centradas en el origen: cubre los cuatro
    // cuadrantes y la reducción de argumento, que es donde dos libm se separan.
    const x = (index / SAMPLES) * Math.PI * 4 - Math.PI * 2;
    const sinWasm = probes.valle_probe_sin(x);
    const cosWasm = probes.valle_probe_cos(x);
    const sinJs = Math.sin(x);
    const cosJs = Math.cos(x);
    if (Object.is(sinWasm, sinJs)) identical += 1;
    if (Object.is(cosWasm, cosJs)) identical += 1;
    maxUlpSin = Math.max(maxUlpSin, ulpDistance(sinJs, sinWasm));
    maxUlpCos = Math.max(maxUlpCos, ulpDistance(cosJs, cosWasm));
    maxAbsolute = Math.max(maxAbsolute, Math.abs(sinJs - sinWasm), Math.abs(cosJs - cosWasm));
  }
  return {
    samples: SAMPLES * 2,
    domain: "x ∈ [−2π, 2π], repartido uniformemente",
    identicalValues: identical,
    maxUlpSin,
    maxUlpCos,
    maxAbsoluteDelta: maxAbsolute,
    criterion:
      "Math.sin/Math.cos de V8 frente a f64::sin/f64::cos de la libm de Rust, leídos de las sondas " +
      "valle_probe_sin y valle_probe_cos del MISMO binario que tesela.",
  };
}

const transcendental = await measureTranscendentalDivergence(new Uint8Array(bytes!));

const arcReports = parityForArcs(js, wasm);
const ellipseReports = parityForEllipses(js, wasm);
const splineReports = parityForSplines(js, wasm);

const parity = {
  arc: arcReports,
  ellipse: ellipseReports,
  spline: mergeCadKernelParity("spline (todas las combinaciones)", splineReports),
  overall: mergeCadKernelParity("total", [...arcReports, ...ellipseReports, ...splineReports]),
};

// ---------------------------------------------------------------------------
// Rendimiento
// ---------------------------------------------------------------------------

/** Lote grande, construido aparte del corpus de paridad y con otra semilla. */
const benchmarkArcs = buildCadKernelCorpus(BENCHMARK_ARCS, 1, CAD_KERNEL_CORPUS_SEED ^ 0x9e3779b9)
  .arcs;

function timeBatch(kernel: CadCurveKernel, steps: number): { samplesMs: number[]; points: number } {
  const samplesMs: number[] = [];
  let points = 0;
  for (let repeat = 0; repeat < REPEATS; repeat += 1) {
    const started = performance.now();
    const batch = kernel.tessellateArcs(benchmarkArcs, BENCHMARK_ARCS, steps);
    samplesMs.push(performance.now() - started);
    points = batch.points.length / 2;
  }
  return { samplesMs, points };
}

const benchmark = STEP_LEVELS.map((steps) => {
  const jsRun = timeBatch(js, steps);
  const wasmRun = timeBatch(wasm, steps);
  const jsMedian = median(jsRun.samplesMs);
  const wasmMedian = median(wasmRun.samplesMs);
  return {
    steps,
    arcs: BENCHMARK_ARCS,
    pointsProduced: jsRun.points,
    javascript: { medianMs: round(jsMedian, 3), samplesMs: jsRun.samplesMs.map((v) => round(v, 3)) },
    wasm: { medianMs: round(wasmMedian, 3), samplesMs: wasmRun.samplesMs.map((v) => round(v, 3)) },
    speedup: round(jsMedian / wasmMedian, 3),
  };
});

wasm.dispose();
js.dispose();

process.stdout.write(
  `${JSON.stringify({
    corpus: {
      seed: CAD_KERNEL_CORPUS_SEED,
      arcs: corpus.arcCount,
      ellipses: corpus.ellipseCount,
      splines: corpus.splines.length,
      stepLevels: [...STEP_LEVELS],
      families: corpus.families,
    },
    manifest: fs.existsSync(manifestPath)
      ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
      : null,
    transcendental,
    parity,
    benchmark,
  })}\n`,
);
