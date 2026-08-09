/**
 * Arnés de medida EN EL NAVEGADOR. Lo que Node confesaba no poder medir.
 *
 * ## El agujero que viene a tapar
 *
 * `docs/cad/evidence/cad-render-benchmark-100k.json` publica `firstDetailMs`
 * 750 y `panFrameP95Ms` 7,17 y dice, en su propio campo `notMeasured`, que no
 * ha medido «GPU, llamadas de dibujo reales, composición del navegador y
 * cuadros por segundo» ni «el coste de subir atributos a la GPU» ni el
 * rasterizado de glifos. Son medidas de CPU en Node, y son honestas; pero un
 * pipeline de render que sólo se ha medido sin GPU es una promesa.
 *
 * Aquí hay WebGL de verdad, `requestAnimationFrame` de verdad y un contador de
 * llamadas de dibujo que lo lleva THREE, no nosotros.
 *
 * ## Qué mide, con nombres que no se prestan a confusión
 *
 * - `frameMsP95` es el percentil 95 del INTERVALO ENTRE CUADROS presentados,
 *   no del tiempo de CPU dentro del callback. Incluye composición y espera de
 *   la GPU, que es exactamente lo que Node no ve. `cpuMsP95` va al lado para
 *   poder separar «tardo yo» de «tarda el navegador».
 * - `fpsP95` = 1000 / `frameMsP95`. Es la cifra PESIMISTA: el 5% de los cuadros
 *   va MÁS LENTO que eso. Un gate se calibra contra esta, no contra la media.
 * - `drawCallsP95` sale de `renderer.info.render.calls`, que THREE reinicia en
 *   cada `render()`. No es una estimación nuestra.
 * - `gpuBytesEstimate` recorre el grafo y suma búferes de atributo y texturas.
 *   Es una ESTIMACIÓN: WebGL no expone la memoria real del driver, y decir lo
 *   contrario sería inventárselo. Lo que sí es exacto es la comparación entre
 *   caminos, porque los dos se estiman igual.
 *
 * ## Por qué el camino anterior lleva un tope de textura
 *
 * `buildCadMTextSprite` crea un `<canvas>` por MTEXT: con la mezcla hostil son
 * ~1,6 MB de RGBA por rótulo. Dejarlo correr a 2.000 rótulos son 3,3 GB y el
 * navegador se muere — y un navegador muerto en CI no es una medida, es un
 * test rojo intermitente. Así que se le pone un TOPE explícito y, cuando salta,
 * se registra `truncated` con el número de entidades a las que llegó. Esa cifra
 * ES el resultado: dice a partir de cuántos rótulos el camino anterior deja de
 * caber en la máquina.
 *
 * ## Lo que sigue sin medirse, dicho aquí y no sólo en el JSON
 *
 * No hay GPU real en CI: Chromium usa SwiftShader y Firefox llvmpipe. Los FPS
 * son por tanto de un rasterizador POR SOFTWARE. Sirven para comparar caminos y
 * para detectar regresiones —los dos caminos ven la misma CPU— pero NO son el
 * rendimiento que verá un usuario con GPU. Está en `notMeasured` de la
 * evidencia y en el PR; leerlo como «60 FPS garantizados» sería exactamente el
 * error que este arnés existe para no cometer.
 */
import * as THREE from "three";
import { disposeCadNativeObject } from "../entity-three";
import type { CadBounds } from "../entity-runtime";
import { CadRenderScene } from "../render/scene";
import {
  aimCamera,
  buildLegacyGroup,
  createViewport,
  estimateCadGpuBytes,
} from "./browser-scene-setup";
import { createCadBenchmarkCorpus } from "./corpus";
import { createCadCorpusMix, type CadCorpusMixId } from "./corpus-mixes";
import {
  cadDocumentBounds,
  cadPercentile,
  cadRound3 as round,
  createCadRenderScenario,
  type CadRenderScenario,
} from "./scenario";

/** Identificador del mismo corpus LINE/CIRCLE/ARC que usa la medida de Node. */
export const CAD_BROWSER_BASELINE_CORPUS = "baseline-line-circle-arc";

export type CadBrowserCorpusId = CadCorpusMixId | typeof CAD_BROWSER_BASELINE_CORPUS;

export type CadBrowserPipelineId = "next" | "legacy";

export interface CadBrowserBenchmarkConfig {
  corpusId: CadBrowserCorpusId;
  entities: number;
  pipeline: CadBrowserPipelineId;
  panStops?: number;
  /** Cuadros que se dejan correr en cada parada de paneo, ya asentada. */
  framesPerStop?: number;
  /** Tope de cuadros para asentar una vista. Evita un bucle infinito. */
  settleFrameCap?: number;
  /**
   * Tope de RELOJ para asentar una vista.
   *
   * El tope de cuadros no basta y se comprobó midiendo: la mezcla
   * arquitectónica a 10k tarda tanto por cuadro que 900 cuadros son más de
   * cinco minutos, y el test caducaba sin producir nada. Con este tope la
   * corrida termina siempre y dice `settled: false`, que es un resultado —y
   * uno importante— en vez de un rojo sin datos.
   */
  settleBudgetMs?: number;
  /** Tope de textura del camino anterior. Ver la cabecera del módulo. */
  textureBudgetBytes?: number;
  /**
   * Tope de RELOJ para una construcción del camino anterior.
   *
   * El tope de textura no basta. La mezcla arquitectónica no revienta por
   * memoria sino por tiempo: 3.400 INSERT que expanden su bloque más 1.700
   * cotas y 1.000 rótulos, cada uno con su `<canvas>`, pasan de cinco minutos
   * por reconstrucción y el test caduca sin producir NINGÚN número. Un corte
   * con su cifra al lado —«llegó a N entidades en M ms»— es una medida; un
   * timeout no es nada.
   */
  legacyBuildBudgetMs?: number;
  canvasWidth?: number;
  canvasHeight?: number;
}

export interface CadBrowserFrameStats {
  samples: number;
  frameMsP50: number;
  frameMsP95: number;
  frameMsMax: number;
  cpuMsP50: number;
  cpuMsP95: number;
  cpuMsMax: number;
  /** 1000 / frameMsP95. El 5% de los cuadros va más lento que esto. */
  fpsP95: number;
  /** 1000 / frameMsMax. El PEOR cuadro observado, en FPS. */
  fpsMin: number;
  drawCallsP95: number;
  drawCallsMax: number;
  trianglesP95: number;
}

export interface CadBrowserGpuStats {
  /** Contadores de THREE: objetos vivos, no bytes. */
  geometries: number;
  textures: number;
  programs: number;
  /** Estimación por recorrido del grafo. Ver la cabecera. */
  attributeBytes: number;
  textureBytes: number;
  gpuBytesEstimate: number;
}

export interface CadBrowserRunResult {
  corpusId: CadBrowserCorpusId;
  entities: number;
  pipeline: CadBrowserPipelineId;
  corpusBuildMs: number;
  /** Hasta que el navegador presenta el PRIMER cuadro con algo dentro. */
  firstPixelMs: number;
  /** Hasta que la vista inicial está completamente detallada y presentada. */
  fullDetailMs: number;
  /**
   * Sólo el trabajo de CPU de esos cuadros, sin la espera de presentación.
   *
   * Es la cifra COMPARABLE con `firstDetailMs` de la evidencia de Node.
   * `fullDetailMs` incluye lo que tarda el navegador en presentar cada cuadro,
   * que con un rasterizador por software domina el total y haría parecer una
   * regresión del pipeline lo que es coste del entorno de medida.
   */
  fullDetailCpuMs: number;
  framesToFullDetail: number;
  /**
   * `false` cuando la vista inicial NO llegó a asentar dentro del tope de
   * reloj. Un `fullDetailMs` sin esta bandera al lado se leería como «tardó
   * eso en terminar» cuando en realidad no terminó.
   */
  openSettled: boolean;
  zoomSettleMs: number;
  zoomSettledFlag: boolean;
  pan: CadBrowserFrameStats;
  zoom: CadBrowserFrameStats;
  /**
   * Cuadros EN REPOSO: vista quieta, nada que reconstruir. Responde a la
   * pregunta que ni el paneo ni el zoom responden — «con el dibujo abierto y
   * sin tocar nada, ¿cuánto cuesta cada cuadro?».
   */
  rest: CadBrowserFrameStats;
  /**
   * Reconciliación en reposo. `idleFrames` son cuadros donde no se creó ni
   * liberó ninguna malla; `glyphRebuildFrames`, cuántos de ésos VOLVIERON a
   * construir los quads del texto. Si los dos coinciden y hay glifos, el texto
   * se rehace en cada cuadro aunque no haya cambiado nada.
   */
  restSync: {
    idleFrames: number;
    glyphRebuildFrames: number;
    glyphsPerRebuild: number;
  };
  gpu: CadBrowserGpuStats;
  /** Entidades visibles y DETALLADAS en reposo. La cifra que separa un dibujo lento de uno falso. */
  visibleAtRest: number;
  detailedAtRest: number;
  /** Glifos del atlas (camino nuevo) o sprites de texto (camino anterior). */
  textObjects: number;
  /** true si el tope de textura cortó la construcción. Nunca silencioso. */
  truncated: boolean;
  truncatedAtEntities: number | null;
  truncationReason: string | null;
  /** `performance.memory` si el navegador lo expone (Chromium). */
  usedJsHeapBytes: number | null;
  scenario: {
    panStops: number;
    initialPixelsPerUnit: number;
    panPixelsPerUnit: number;
    zoomPixelsPerUnit: number;
  };
}

export interface CadBrowserEnvironment {
  userAgent: string;
  devicePixelRatio: number;
  hardwareConcurrency: number;
  deviceMemoryGb: number | null;
  webglVendor: string | null;
  webglRenderer: string | null;
  webglVersion: string | null;
  maxTextureSize: number | null;
  jsHeapLimitBytes: number | null;
}

// ---------------------------------------------------------------------------
// Utilidades del bucle de cuadros
// ---------------------------------------------------------------------------

function nextFrame(): Promise<number> {
  return new Promise<number>((resolve) => requestAnimationFrame(resolve));
}

interface FrameSampler {
  frameMs: number[];
  cpuMs: number[];
  drawCalls: number[];
  triangles: number[];
}

function createSampler(): FrameSampler {
  return { frameMs: [], cpuMs: [], drawCalls: [], triangles: [] };
}

function summarize(sampler: FrameSampler): CadBrowserFrameStats {
  const frameMsP95 = cadPercentile(sampler.frameMs, 0.95);
  const frameMsMax = sampler.frameMs.length ? Math.max(...sampler.frameMs) : 0;
  return {
    samples: sampler.frameMs.length,
    frameMsP50: cadPercentile(sampler.frameMs, 0.5),
    frameMsP95,
    frameMsMax: round(frameMsMax),
    cpuMsP50: cadPercentile(sampler.cpuMs, 0.5),
    cpuMsP95: cadPercentile(sampler.cpuMs, 0.95),
    cpuMsMax: round(sampler.cpuMs.length ? Math.max(...sampler.cpuMs) : 0),
    fpsP95: frameMsP95 > 0 ? round(1_000 / frameMsP95) : 0,
    fpsMin: frameMsMax > 0 ? round(1_000 / frameMsMax) : 0,
    drawCallsP95: Math.round(cadPercentile(sampler.drawCalls, 0.95)),
    drawCallsMax: sampler.drawCalls.length ? Math.max(...sampler.drawCalls) : 0,
    trianglesP95: Math.round(cadPercentile(sampler.triangles, 0.95)),
  };
}

// ---------------------------------------------------------------------------
// La corrida
// ---------------------------------------------------------------------------

function buildCorpus(corpusId: CadBrowserCorpusId, entities: number) {
  return corpusId === CAD_BROWSER_BASELINE_CORPUS
    ? createCadBenchmarkCorpus({ entities })
    : createCadCorpusMix({ mix: corpusId, entities });
}

export function readCadBrowserEnvironment(): CadBrowserEnvironment {
  const canvas = document.createElement("canvas");
  const gl = (canvas.getContext("webgl2") ??
    canvas.getContext("webgl")) as WebGLRenderingContext | null;
  const debug = gl?.getExtension("WEBGL_debug_renderer_info") ?? null;
  const memory = (performance as Performance & {
    memory?: { jsHeapSizeLimit: number };
  }).memory;
  return {
    userAgent: navigator.userAgent,
    devicePixelRatio: window.devicePixelRatio,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemoryGb:
      (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
    // Cuando el navegador enmascara el renderer (Firefox lo hace por defecto en
    // algunas configuraciones) se registra `null`, no una cadena inventada.
    webglVendor: debug ? String(gl?.getParameter(debug.UNMASKED_VENDOR_WEBGL)) : null,
    webglRenderer: debug ? String(gl?.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : null,
    webglVersion: gl ? String(gl.getParameter(gl.VERSION)) : null,
    maxTextureSize: gl ? Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) : null,
    jsHeapLimitBytes: memory?.jsHeapSizeLimit ?? null,
  };
}

export async function runCadBrowserBenchmark(
  config: CadBrowserBenchmarkConfig,
): Promise<CadBrowserRunResult> {
  const panStops = config.panStops ?? 8;
  const framesPerStop = config.framesPerStop ?? 10;
  const settleFrameCap = config.settleFrameCap ?? 900;
  const settleBudgetMs = config.settleBudgetMs ?? 45_000;
  const textureBudgetBytes = config.textureBudgetBytes ?? 384 * 1_048_576;
  const legacyBuildBudgetMs = config.legacyBuildBudgetMs ?? 12_000;
  const canvasWidth = config.canvasWidth ?? 1_280;
  const canvasHeight = config.canvasHeight ?? 800;

  const corpusStarted = performance.now();
  const corpus = buildCorpus(config.corpusId, config.entities);
  const corpusBuildMs = round(performance.now() - corpusStarted);
  const bounds = cadDocumentBounds(corpus.nativeEntities, corpus.document);
  const scenario: CadRenderScenario = createCadRenderScenario(
    bounds,
    panStops,
    canvasWidth,
  );
  const viewport = createViewport(bounds);

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  canvas.style.width = `${canvasWidth}px`;
  canvas.style.height = `${canvasHeight}px`;
  document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
  renderer.setPixelRatio(1);
  renderer.setSize(canvasWidth, canvasHeight, false);
  const threeScene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
  threeScene.add(camera);

  const legacyGroup = new THREE.Group();
  let renderScene: CadRenderScene | null = null;
  if (config.pipeline === "next") {
    renderScene = new CadRenderScene({ viewport, document: corpus.document });
    renderScene.replace(
      corpus.nativeEntities,
      corpus.document.modelSpace.entityIds,
      corpus.document,
    );
    threeScene.add(renderScene.group);
  } else {
    threeScene.add(legacyGroup);
  }

  let truncatedAtEntities: number | null = null;
  let truncatedBy: "texture" | "clock" | null = null;
  let truncationPlanned = 0;
  let truncationView = "";
  let viewLabel = "apertura";
  let legacyVisible = 0;
  let legacyDetailed = 0;
  let legacyTextObjects = 0;

  /**
   * Cuadros en reposo cuya reconciliación no creó ni liberó NINGUNA malla —o
   * sea, nada cambió— y aun así volvió a construir los quads del texto.
   *
   * Existe para poder afirmar con una cifra, y no con una lectura del código,
   * que `CadRenderScene.sync()` rehace el texto en cada cuadro.
   */
  let restIdleSyncFrames = 0;
  let restGlyphRebuildFrames = 0;
  let restGlyphsPerRebuild = 0;
  let countingRest = false;

  /** Un cuadro: trabajo del pipeline, reconciliación y dibujo real. */
  function drawFrame(): { drawCalls: number; triangles: number } {
    if (renderScene) {
      renderScene.runFrame();
      const sync = renderScene.sync();
      if (countingRest && sync.created === 0 && sync.disposed === 0) {
        restIdleSyncFrames += 1;
        if (sync.glyphs > 0) {
          restGlyphRebuildFrames += 1;
          restGlyphsPerRebuild = sync.glyphs;
        }
      }
    }
    renderer.render(threeScene, camera);
    return {
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    };
  }

  function applyView(view: { bounds: CadBounds; pixelsPerUnit: number }): void {
    aimCamera(camera, viewport, view, canvasWidth, canvasHeight);
    if (renderScene) {
      renderScene.setView(view, viewport);
      return;
    }
    // El camino anterior no tiene «cambiar la vista»: reconstruye. Es el
    // trabajo que hace de verdad, y por eso su cuadro de paneo cuesta lo que
    // cuesta.
    const result = buildLegacyGroup(
      legacyGroup,
      corpus.nativeEntities,
      corpus.document,
      viewport,
      view,
      textureBudgetBytes,
      legacyBuildBudgetMs,
    );
    legacyVisible = result.visible;
    legacyDetailed = result.detailed;
    legacyTextObjects = result.textObjects;
    // Se queda con la PRIMERA truncación y con el plan de ESA construcción.
    // Mezclar el corte de la apertura con el plan del zoom producía la frase
    // «cortó a 1.415 de 47 entidades planificadas», que no significa nada.
    if (result.truncatedAtEntities !== null && truncatedAtEntities === null) {
      truncatedAtEntities = result.truncatedAtEntities;
      truncatedBy = result.truncatedBy;
      truncationPlanned = result.planned;
      truncationView = viewLabel;
    }
  }

  function settled(): boolean {
    return renderScene ? renderScene.settled : true;
  }

  // --- Apertura -----------------------------------------------------------
  //
  // `applyView` va DENTRO del cronómetro de CPU. En el camino anterior ese
  // "cambiar la vista" ES la reconstrucción entera del grafo, así que dejarlo
  // fuera habría regalado al camino anterior su coste más grande y publicado
  // una comparación que le favorece por un error de instrumentación.
  const openStarted = performance.now();
  let firstPixelMs = 0;
  let framesToFullDetail = 0;
  let fullDetailCpuMs = 0;
  let previousTimestamp = await nextFrame();
  for (let frame = 0; frame < settleFrameCap; frame += 1) {
    const cpuStarted = performance.now();
    if (frame === 0) applyView(scenario.initial);
    drawFrame();
    fullDetailCpuMs += performance.now() - cpuStarted;
    // El cuadro se PRESENTA en el rAF siguiente: hasta entonces sólo se ha
    // enviado a la cola. Ese es el instante honesto del «primer píxel».
    previousTimestamp = await nextFrame();
    framesToFullDetail += 1;
    if (frame === 0) firstPixelMs = round(performance.now() - openStarted);
    if (settled() || performance.now() - openStarted > settleBudgetMs) break;
  }
  const fullDetailMs = round(performance.now() - openStarted);
  const openSettled = settled();

  /** Recorre `frames` cuadros midiendo intervalo presentado y CPU. */
  async function sampleFrames(
    sampler: FrameSampler,
    frames: number,
    before?: () => void,
    stopWhenSettled = false,
    budgetMs = Infinity,
  ): Promise<void> {
    const loopStarted = performance.now();
    for (let frame = 0; frame < frames; frame += 1) {
      const cpuStarted = performance.now();
      if (frame === 0 && before) before();
      const info = drawFrame();
      const cpuMs = performance.now() - cpuStarted;
      const timestamp = await nextFrame();
      sampler.frameMs.push(timestamp - previousTimestamp);
      sampler.cpuMs.push(cpuMs);
      sampler.drawCalls.push(info.drawCalls);
      sampler.triangles.push(info.triangles);
      previousTimestamp = timestamp;
      if (stopWhenSettled && settled()) break;
      if (performance.now() - loopStarted > budgetMs) break;
    }
  }

  // --- Paneo --------------------------------------------------------------
  const panSampler = createSampler();
  for (const [index, stop] of scenario.pan.entries())
    await sampleFrames(
      panSampler,
      framesPerStop,
      () => {
        viewLabel = `parada de paneo ${index + 1}`;
        applyView(stop);
      },
      false,
      settleBudgetMs / 3,
    );

  // --- Zoom ---------------------------------------------------------------
  const zoomSampler = createSampler();
  const zoomStarted = performance.now();
  await sampleFrames(
    zoomSampler,
    settleFrameCap,
    () => {
      viewLabel = "zoom";
      applyView(scenario.zoom);
    },
    true,
    settleBudgetMs / 2,
  );
  const zoomSettleMs = round(performance.now() - zoomStarted);
  const zoomSettledFlag = settled();

  // --- Reposo -------------------------------------------------------------
  const restSampler = createSampler();
  countingRest = true;
  await sampleFrames(restSampler, framesPerStop);
  countingRest = false;

  // --- Cifras en reposo ---------------------------------------------------
  const stats = renderScene?.stats() ?? null;
  const gpuRoot = renderScene ? renderScene.group : legacyGroup;
  const estimate = estimateCadGpuBytes(gpuRoot);
  const memory = (performance as Performance & {
    memory?: { usedJSHeapSize: number };
  }).memory;
  const result: CadBrowserRunResult = {
    corpusId: config.corpusId,
    entities: config.entities,
    pipeline: config.pipeline,
    corpusBuildMs,
    firstPixelMs,
    fullDetailMs,
    fullDetailCpuMs: round(fullDetailCpuMs),
    framesToFullDetail,
    openSettled,
    zoomSettleMs,
    zoomSettledFlag,
    pan: summarize(panSampler),
    zoom: summarize(zoomSampler),
    rest: summarize(restSampler),
    restSync: {
      idleFrames: restIdleSyncFrames,
      glyphRebuildFrames: restGlyphRebuildFrames,
      glyphsPerRebuild: restGlyphsPerRebuild,
    },
    gpu: {
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      programs: renderer.info.programs?.length ?? 0,
      attributeBytes: estimate.attributeBytes,
      textureBytes: estimate.textureBytes,
      gpuBytesEstimate: estimate.attributeBytes + estimate.textureBytes,
    },
    visibleAtRest: stats ? stats.visibleEntities : legacyVisible,
    detailedAtRest: stats ? stats.renderedEntities : legacyDetailed,
    textObjects: stats ? stats.glyphRequests : legacyTextObjects,
    truncated: truncatedAtEntities !== null,
    truncatedAtEntities,
    truncationReason:
      truncatedAtEntities === null
        ? null
        : truncatedBy === "texture"
          ? `En la ${truncationView}, el camino anterior superó ${Math.round(textureBudgetBytes / 1_048_576)} MB de textura tras construir ${truncatedAtEntities} de ${truncationPlanned} entidades planificadas: se cortó a propósito para no matar el navegador.`
          : `En la ${truncationView}, el camino anterior superó ${legacyBuildBudgetMs} ms de reloj tras construir ${truncatedAtEntities} de ${truncationPlanned} entidades planificadas: se cortó a propósito para que la corrida produzca un número en vez de caducar.`,
    usedJsHeapBytes: memory?.usedJSHeapSize ?? null,
    scenario: {
      panStops: scenario.pan.length,
      initialPixelsPerUnit: scenario.initial.pixelsPerUnit,
      panPixelsPerUnit: scenario.pan[0]?.pixelsPerUnit ?? 0,
      zoomPixelsPerUnit: scenario.zoom.pixelsPerUnit,
    },
  };

  // --- Cierre -------------------------------------------------------------
  if (renderScene) renderScene.dispose();
  for (const child of [...legacyGroup.children]) {
    disposeCadNativeObject(child);
    child.removeFromParent();
  }
  legacyGroup.removeFromParent();
  renderer.dispose();
  renderer.forceContextLoss();
  canvas.remove();
  return result;
}

export interface CadBrowserBenchmarkApi {
  environment: () => CadBrowserEnvironment;
  run: (config: CadBrowserBenchmarkConfig) => Promise<CadBrowserRunResult>;
  heapBytes: () => number | null;
}

declare global {
  interface Window {
    __cadRenderBench?: CadBrowserBenchmarkApi;
  }
}

/** Punto de entrada del paquete que Playwright inyecta en la página. */
export function installCadBrowserBenchmark(): void {
  window.__cadRenderBench = {
    environment: readCadBrowserEnvironment,
    run: runCadBrowserBenchmark,
    heapBytes: () =>
      (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
        ?.usedJSHeapSize ?? null,
  };
}
