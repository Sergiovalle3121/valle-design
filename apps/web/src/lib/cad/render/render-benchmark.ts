/**
 * Arnés de medida del pipeline de render — LOS DOS CAMINOS EN LA MISMA CORRIDA.
 *
 * ## Qué mide y qué NO mide
 *
 * Mide el TRABAJO DE CPU que hace cada pipeline ante un guion de apertura,
 * paneo y zoom: teselar, agrupar en lotes y decidir qué entra en la vista. No
 * mide GPU, ni composición del navegador, ni cuadros reales — esto corre en
 * Node, y decir «cuadros por segundo» desde Node sería inventárselo. Los números
 * de navegador viven en `e2e/performance/cad-viewport-100k.spec.ts` y sólo se
 * mueven cuando el pipeline esté enchufado al editor.
 *
 * Se dice tan claro porque la comparación es contundente y la tentación de
 * llamarla «FPS» es real. Lo que estas cifras demuestran es lo que gobiernan:
 * el hilo principal deja de bloquearse, y el número de entidades detalladas
 * pasa de ser una muestra a ser todas.
 *
 * ## Por qué corren los dos caminos en la misma ejecución
 *
 * Comparar contra un número apuntado la semana pasada, en otra máquina, no
 * compara nada. Aquí ambos caminos ven el MISMO corpus determinista, el mismo
 * guion de vistas y el mismo proceso, uno detrás de otro.
 */
import { performance } from "node:perf_hooks";
import { CAD_ENTITY_REGISTRY, type CadNativeEntity } from "../entity-runtime";
import type { CadDocument } from "../cad-document";
import { planCadNativeRenderBudget } from "../native-render-budget";
import { CadRenderPipeline, type CadRenderView } from "./pipeline";
import { CadTessellationCache } from "./tessellation-cache";
import {
  cadDocumentBounds,
  cadPercentile,
  cadRound3,
  createCadRenderScenario,
  type CadRenderScenario,
} from "../benchmark/scenario";

/**
 * El guion y las cajas del dibujo viven en `benchmark/scenario.ts` desde que
 * hay una medida de NAVEGADOR que tiene que recorrer exactamente el mismo
 * camino. Se reexportan aquí para que nada de lo que ya los importaba desde
 * este módulo tenga que cambiar de sitio — y para que quede escrito que Node y
 * navegador comparten guion, que es lo que hace comparables los dos números.
 */
export {
  cadDocumentBounds,
  createCadRenderScenario,
  type CadRenderScenario,
} from "../benchmark/scenario";

/** Segmentos que pedía `buildCadNativeObject` por entidad, fijos para todo. */
export const CAD_LEGACY_RENDER_SEGMENTS = 96;

export interface CadRenderPathMeasurement {
  pipeline: "next" | "legacy";
  /** Milisegundos hasta que la vista inicial está completamente detallada. */
  firstDetailMs: number;
  /** Milisegundos hasta que la vista asienta tras el zoom. */
  zoomSettleMs: number;
  /** p95 del trabajo de CPU por cuadro durante el paneo. */
  panFrameP95Ms: number;
  /** p95 del trabajo de CPU por cuadro durante el zoom. */
  zoomFrameP95Ms: number;
  /** El peor cuadro observado. Un p95 bueno con un p100 atroz sigue tirando. */
  panFrameMaxMs: number;
  zoomFrameMaxMs: number;
  /** Entidades visibles en reposo tras el zoom. */
  visibleAtRest: number;
  /** Entidades DETALLADAS en reposo. Debe ser igual a `visibleAtRest`. */
  detailedAtRest: number;
  /** Segmentos materializados en reposo. */
  segmentsAtRest: number;
  /** Cuadros que hicieron falta para asentar la vista inicial. */
  framesToFirstDetail: number;
  /**
   * Cuántos cuadros entraron en cada percentil.
   *
   * Un p95 sobre dos muestras ES el máximo, y presentarlo como percentil sin
   * decir cuántas muestras hay invita a leerlo como si fuera robusto. El número
   * viaja al lado del percentil para que nadie tenga que deducirlo.
   */
  panFrameSamples: number;
  zoomFrameSamples: number;
}

export interface CadRenderLeakMeasurement {
  cycles: number;
  heapAfterFirstCycleBytes: number;
  heapAfterLastCycleBytes: number;
  heapGrowthMb: number;
  /** Muestras por ciclo, para que el número no sea una caja negra. */
  samplesMb: number[];
}

export interface CadRenderBenchmarkResult {
  entities: number;
  scenarioStops: number;
  next: CadRenderPathMeasurement;
  legacy: CadRenderPathMeasurement;
  leak: CadRenderLeakMeasurement;
}

const percentile = cadPercentile;
const round = cadRound3;

/** Recorre el guion con el pipeline nuevo, midiendo cuadro a cuadro. */
export function measureCadNextPipeline(
  entities: readonly CadNativeEntity[],
  drawOrderIds: readonly string[],
  scenario: CadRenderScenario,
  document?: CadDocument,
): CadRenderPathMeasurement {
  const pipeline = new CadRenderPipeline({ document });
  pipeline.replace(entities, drawOrderIds, document);

  const openStarted = performance.now();
  pipeline.setView(scenario.initial);
  let framesToFirstDetail = 0;
  while (!pipeline.settled) {
    pipeline.runFrame();
    framesToFirstDetail += 1;
  }
  const firstDetailMs = round(performance.now() - openStarted);

  const panFrames: number[] = [];
  for (const stop of scenario.pan) {
    pipeline.setView(stop);
    do {
      const frameStarted = performance.now();
      pipeline.runFrame();
      panFrames.push(performance.now() - frameStarted);
    } while (!pipeline.settled);
  }

  const zoomFrames: number[] = [];
  const zoomStarted = performance.now();
  pipeline.setView(scenario.zoom);
  do {
    const frameStarted = performance.now();
    pipeline.runFrame();
    zoomFrames.push(performance.now() - frameStarted);
  } while (!pipeline.settled);
  const zoomSettleMs = round(performance.now() - zoomStarted);

  const stats = pipeline.stats();
  const measurement: CadRenderPathMeasurement = {
    pipeline: "next",
    firstDetailMs,
    zoomSettleMs,
    panFrameP95Ms: percentile(panFrames, 0.95),
    zoomFrameP95Ms: percentile(zoomFrames, 0.95),
    panFrameMaxMs: round(Math.max(0, ...panFrames)),
    zoomFrameMaxMs: round(Math.max(0, ...zoomFrames)),
    visibleAtRest: stats.visibleEntities,
    detailedAtRest: stats.renderedEntities,
    segmentsAtRest: stats.instances,
    framesToFirstDetail,
    panFrameSamples: panFrames.length,
    zoomFrameSamples: zoomFrames.length,
  };
  pipeline.dispose();
  return measurement;
}

interface LegacyRebuildResult {
  ms: number;
  visible: number;
  rendered: number;
  segments: number;
}

/**
 * Reproduce el trabajo del camino anterior para una vista: plan de presupuesto
 * (con su MUESTREO) más `renderer.paths(entity, 96)` por cada entidad del plan,
 * que es exactamente lo que hacía `buildCadNativeObject` antes de crear el
 * `THREE.Line`. No se crean objetos THREE porque en Node no hay contexto WebGL;
 * lo que se compara es el trabajo de CPU, que es el que ambos caminos sí hacen.
 */
function measureLegacyRebuild(
  entities: readonly CadNativeEntity[],
  view: CadRenderView,
  document?: CadDocument,
): LegacyRebuildResult {
  const started = performance.now();
  const visible = entities.filter((entity) => {
    const bounds = CAD_ENTITY_REGISTRY.adapter(entity).bounds.bounds(entity, document);
    return (
      bounds.minX <= view.bounds.maxX &&
      bounds.maxX >= view.bounds.minX &&
      bounds.minY <= view.bounds.maxY &&
      bounds.maxY >= view.bounds.minY
    );
  });
  const plan = planCadNativeRenderBudget(entities, [], undefined, {
    visibleEntities: visible,
  });
  let segments = 0;
  for (const entity of plan.entities) {
    for (const path of CAD_ENTITY_REGISTRY.adapter(entity).renderer.paths(
      entity,
      CAD_LEGACY_RENDER_SEGMENTS,
      document,
    )) {
      if (path.points.length < 2) continue;
      segments += path.points.length - 1 + (path.closed ? 1 : 0);
    }
  }
  return {
    ms: performance.now() - started,
    visible: visible.length,
    rendered: plan.rendered,
    segments,
  };
}

/**
 * Recorre el MISMO guion con el camino anterior. Un cuadro del camino anterior
 * es la reconstrucción entera: no estaba troceado, y por eso su p95 por cuadro
 * y su tiempo de asentamiento coinciden.
 */
export function measureCadLegacyPipeline(
  entities: readonly CadNativeEntity[],
  scenario: CadRenderScenario,
  document?: CadDocument,
): CadRenderPathMeasurement {
  const open = measureLegacyRebuild(entities, scenario.initial, document);
  const panFrames: number[] = [];
  for (const stop of scenario.pan)
    panFrames.push(measureLegacyRebuild(entities, stop, document).ms);
  const zoom = measureLegacyRebuild(entities, scenario.zoom, document);
  return {
    pipeline: "legacy",
    firstDetailMs: round(open.ms),
    zoomSettleMs: round(zoom.ms),
    panFrameP95Ms: percentile(panFrames, 0.95),
    zoomFrameP95Ms: round(zoom.ms),
    panFrameMaxMs: round(Math.max(0, ...panFrames)),
    zoomFrameMaxMs: round(zoom.ms),
    visibleAtRest: zoom.visible,
    detailedAtRest: zoom.rendered,
    segmentsAtRest: zoom.segments,
    framesToFirstDetail: 1,
    panFrameSamples: panFrames.length,
    zoomFrameSamples: 1,
  };
}

function forceGc(): void {
  const runtime = globalThis as typeof globalThis & { gc?: () => void };
  runtime.gc?.();
}

/**
 * Prueba de FUGA: tres ciclos completos de abrir, panear, hacer zoom y cerrar.
 * Si la caché de teselado perdiera su tope, o los tiles que salen de la vista no
 * se liberaran, el montón crecería ciclo a ciclo. Se compara el ciclo 1 con el
 * último y no el 0 con el último a propósito: el primer ciclo carga código,
 * infla arenas y calienta estructuras que no son fuga.
 */
export function measureCadRenderLeak(
  entities: readonly CadNativeEntity[],
  drawOrderIds: readonly string[],
  scenario: CadRenderScenario,
  cycles = 3,
  document?: CadDocument,
): CadRenderLeakMeasurement {
  const samples: number[] = [];
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    const pipeline = new CadRenderPipeline({
      document,
      cache: new CadTessellationCache({ maxPoints: 1_000_000, maxEntries: 60_000 }),
    });
    pipeline.replace(entities, drawOrderIds, document);
    pipeline.setView(scenario.initial);
    pipeline.settle();
    for (const stop of scenario.pan) {
      pipeline.setView(stop);
      pipeline.settle();
    }
    pipeline.setView(scenario.zoom);
    pipeline.settle();
    pipeline.dispose();
    forceGc();
    samples.push(process.memoryUsage().heapUsed);
  }
  const first = samples[0] ?? 0;
  const last = samples[samples.length - 1] ?? 0;
  return {
    cycles,
    heapAfterFirstCycleBytes: first,
    heapAfterLastCycleBytes: last,
    heapGrowthMb: round((last - first) / 1_048_576),
    samplesMb: samples.map((sample) => round(sample / 1_048_576)),
  };
}

export function runCadRenderBenchmark(options: {
  entities: readonly CadNativeEntity[];
  drawOrderIds: readonly string[];
  document?: CadDocument;
  panStops?: number;
  leakCycles?: number;
}): CadRenderBenchmarkResult {
  const bounds = cadDocumentBounds(options.entities, options.document);
  const scenario = createCadRenderScenario(bounds, options.panStops ?? 12);
  const next = measureCadNextPipeline(
    options.entities,
    options.drawOrderIds,
    scenario,
    options.document,
  );
  const legacy = measureCadLegacyPipeline(options.entities, scenario, options.document);
  const leak = measureCadRenderLeak(
    options.entities,
    options.drawOrderIds,
    scenario,
    options.leakCycles ?? 3,
    options.document,
  );
  return {
    entities: options.entities.length,
    scenarioStops: scenario.pan.length,
    next,
    legacy,
    leak,
  };
}
