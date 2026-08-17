#!/usr/bin/env node
/**
 * Benchmark del perfil «PLANO REAL» — 20.000 entidades de despacho.
 *
 * ## Por qué existe habiendo ya dos benchmarks de CAD
 *
 * `cad-corpus-benchmark.mts` mide índices, selección y serialización sobre un
 * corpus de LINE/CIRCLE/ARC. `cad-render-benchmark.mts` mide el pipeline de
 * render a 100.000 entidades sobre el mismo corpus. Los dos son honestos en lo
 * que dicen medir y ninguno contesta la pregunta que decide si el primer
 * cliente se queda: **¿va fluido un plano de verdad?**
 *
 * 100.000 entidades es un número elegido para presumir escala. Un plano de
 * arquitectura real de un despacho mexicano tiene entre 5.000 y 30.000, y su
 * composición es otra: muchos segmentos cortos de muro, cadenas de cotas,
 * hatch de acabados, rótulos y bloques repetidos. En el corpus de 100.000 esos
 * tipos están literalmente a CERO. Optimizar contra aquel número y publicarlo
 * no dice nada sobre éste.
 *
 * Este benchmark NO sustituye a ninguno de los dos. Se añade, y mide las cinco
 * operaciones que un arquitecto repite todo el día: abrir, panear, hacer zoom,
 * seleccionar (ventana y captura), enganchar (OSNAP) y editar un grupo.
 *
 * Uso:
 *   npm run benchmark:cad:plan --workspace=web
 *   npm run benchmark:cad:plan --workspace=web -- --entities 20000 --repeat 3
 *   npm run benchmark:cad:plan --workspace=web -- --output docs/cad/evidence/x.json
 *
 * ## Qué NO mide, dicho aquí antes que en ningún otro sitio
 *
 * Trabajo de CPU en Node. No hay navegador: ni arranque, ni GPU, ni cuadros por
 * segundo, ni composición, ni subida de atributos. Tampoco red, API,
 * PostgreSQL, autoguardado ni apertura de archivo desde disco. Del texto se
 * mide la petición de quads y no el rasterizado de glifos, porque en Node no
 * hay `<canvas>` y decir lo contrario sería inventárselo.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getHeapStatistics } from "node:v8";
import { serializeCadDocument } from "../src/lib/cad/cad-document";
import {
  CAD_CORPUS_MIXES,
  createCadCorpusMix,
} from "../src/lib/cad/benchmark/corpus-mixes";
import {
  cadDocumentBounds,
  createCadRenderScenario,
} from "../src/lib/cad/benchmark/scenario";
import {
  createCadPlanSelectionIndex,
  createCadPlanSelectionWindows,
  measureCadPlanEdit,
  measureCadPlanSelection,
  measureCadPlanSnap,
  measureCadPlanViewport,
  type CadPlanViewportMeasurement,
} from "../src/lib/cad/benchmark/plan-operations";
import { evaluateCadPlanBudget } from "../src/lib/cad/benchmark/plan-budget";
import { profileCadRenderStages } from "../src/lib/cad/render/render-stage-profile";

interface CliOptions {
  entities: number;
  panStops: number;
  /** Consultas de selección y de OSNAP por corrida. */
  queries: number;
  /**
   * Grupos editados: cada uno es lo que devolvió una ventana.
   *
   * Cuarenta y no una docena porque el percentil se calcula por rango: con 8
   * muestras el p95 ES el máximo, y una sola pausa del recolector decide la
   * cifra. Con 40 quedan fuera las dos peores, que es lo que un p95 significa.
   */
  editGroups: number;
  repeat: number;
  enforce: boolean;
  output?: string;
}

function parseCli(argv: string[]): CliOptions {
  const options: CliOptions = {
    entities: 20_000,
    panStops: 12,
    queries: 200,
    editGroups: 40,
    repeat: 3,
    enforce: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--entities")
      options.entities = Number.parseInt(argv[++index] ?? "", 10);
    else if (argument === "--pan-stops")
      options.panStops = Number.parseInt(argv[++index] ?? "", 10);
    else if (argument === "--queries")
      options.queries = Number.parseInt(argv[++index] ?? "", 10);
    else if (argument === "--edit-groups")
      options.editGroups = Number.parseInt(argv[++index] ?? "", 10);
    else if (argument === "--repeat")
      options.repeat = Number.parseInt(argv[++index] ?? "", 10);
    else if (argument === "--no-enforce") options.enforce = false;
    else if (argument === "--output") options.output = argv[++index];
    else throw new Error(`Argumento desconocido: ${argument}`);
  }
  if (!Number.isSafeInteger(options.entities) || options.entities < 1)
    throw new Error("--entities debe ser un entero positivo.");
  if (!Number.isSafeInteger(options.repeat) || options.repeat < 1)
    throw new Error("--repeat debe ser un entero positivo.");
  return options;
}

const options = parseCli(process.argv.slice(2));
const startedAt = new Date().toISOString();

const mixId = "plano-real" as const;
const definition = CAD_CORPUS_MIXES[mixId];
const corpus = createCadCorpusMix({ mix: mixId, entities: options.entities });
const bounds = cadDocumentBounds(corpus.nativeEntities, corpus.document);
const scenario = createCadRenderScenario(bounds, options.panStops);

/**
 * Apertura de enganche DERIVADA, no inventada.
 *
 * 12 píxeles es la tolerancia de enganche que ya usa el arnés profesional de
 * OSNAP del repositorio. Dividida por los píxeles por unidad de la vista de
 * ZOOM —la vista de trabajo, no el encuadre completo— da la apertura en
 * milímetros de dibujo. Fijarla en milímetros sería un número arbitrario que
 * además cambiaría de significado con cada rueda del ratón.
 */
const SNAP_TOLERANCE_PX = 12;
const apertureMm = SNAP_TOLERANCE_PX / scenario.zoom.pixelsPerUnit;

/**
 * Cursores de OSNAP colocados SOBRE geometría.
 *
 * Un cursor al azar en el papel no engancha nada y mediría el camino vacío, que
 * es el barato. Se toman puntos de entidades repartidas por el documento con un
 * paso primo y se desplazan una fracción de la apertura: el cursor queda cerca
 * pero no encima, que es donde está de verdad la mano de una persona.
 */
function planSnapCursors(count: number): Array<{ x: number; y: number }> {
  const cursors: Array<{ x: number; y: number }> = [];
  const total = corpus.nativeEntities.length;
  for (let query = 0; query < count; query += 1) {
    const entity = corpus.nativeEntities[(query * 7_919) % total];
    const box = cadDocumentBounds([entity], corpus.document);
    cursors.push({
      x: box.minX + apertureMm * 0.3,
      y: box.minY + apertureMm * 0.3,
    });
  }
  return cursors;
}

const selectionWindows = createCadPlanSelectionWindows(
  bounds,
  definition.cellSize,
  options.queries,
);
const snapCursors = planSnapCursors(options.queries);

/**
 * El índice de selección se construye UNA vez y se cronometra aparte: es lo que
 * el editor paga al abrir el documento, no en cada consulta. Meterlo dentro del
 * bucle de consultas repartiría un coste de apertura entre 200 gestos y diría
 * que seleccionar cuesta lo que no cuesta.
 */
const indexBuildStarted = performance.now();
const selectionIndex = createCadPlanSelectionIndex(
  corpus.nativeEntities,
  definition.cellSize,
  corpus.document,
);
const selectionIndexBuildMs =
  Math.round((performance.now() - indexBuildStarted) * 1_000) / 1_000;

/**
 * Los GRUPOS que se editan salen de encerrar habitaciones con la ventana de
 * captura, que es como una persona selecciona antes de mover o borrar. Se
 * descartan las ventanas vacías: un grupo de cero entidades no es una edición.
 */
const editGroups = selectionWindows
  .slice(0, options.editGroups)
  .map((window) =>
    selectionIndex
      .intersecting(window, true, Number.POSITIVE_INFINITY)
      .map((entity) => entity.id),
  )
  .filter((group) => group.length > 0);

/**
 * Repetir y publicar la MEDIANA, con todas las muestras al lado.
 *
 * La máquina de desarrollo tiene seis núcleos y comparte carga; una sola
 * corrida es una anécdota. Se ordena por la métrica que más varía —el reloj de
 * apertura— y se publica la del medio, con la dispersión completa en
 * `variance` para que la cifra se pueda discutir sin fiarse de este párrafo.
 */
function medianRun<T>(runs: T[], by: (run: T) => number): T {
  return [...runs].sort((left, right) => by(left) - by(right))[
    Math.floor((runs.length - 1) / 2)
  ];
}

const viewportRuns: CadPlanViewportMeasurement[] = [];
for (let run = 0; run < options.repeat; run += 1)
  viewportRuns.push(
    measureCadPlanViewport(
      corpus.nativeEntities,
      corpus.document.modelSpace.entityIds,
      scenario,
      corpus.document,
    ),
  );
const viewport = medianRun(viewportRuns, (run) => run.openMs);

const windowRuns = Array.from({ length: options.repeat }, () =>
  measureCadPlanSelection(
    selectionIndex,
    selectionWindows,
    "window",
    definition.cellSize,
  ),
);
const windowSelection = medianRun(windowRuns, (run) => run.latency.p95Ms);

const crossingRuns = Array.from({ length: options.repeat }, () =>
  measureCadPlanSelection(
    selectionIndex,
    selectionWindows,
    "crossing",
    definition.cellSize,
  ),
);
const crossingSelection = medianRun(crossingRuns, (run) => run.latency.p95Ms);

const snapRuns = Array.from({ length: options.repeat }, () =>
  measureCadPlanSnap(selectionIndex, snapCursors, apertureMm, corpus.document),
);
const snapMeasurement = medianRun(snapRuns, (run) => run.latency.p95Ms);

/**
 * La edición se mide con el dibujo ENTERO a la vista: cualquier cosa que se
 * toque es visible, que es el peor caso del camino de invalidación. Con el
 * dibujo lejos, media edición caería fuera de los tiles residentes y no se
 * pagaría — un número mejor, y mentiroso.
 */
const moveRuns = Array.from({ length: options.repeat }, () =>
  measureCadPlanEdit(
    corpus.nativeEntities,
    corpus.document.modelSpace.entityIds,
    scenario.initial,
    editGroups,
    "move",
    definition.cellSize,
    corpus.document,
  ),
);
const moveEdit = medianRun(moveRuns, (run) => run.commitToSettle.p95Ms);

const deleteRuns = Array.from({ length: options.repeat }, () =>
  measureCadPlanEdit(
    corpus.nativeEntities,
    corpus.document.modelSpace.entityIds,
    scenario.initial,
    editGroups,
    "delete",
    definition.cellSize,
    corpus.document,
  ),
);
const deleteEdit = medianRun(deleteRuns, (run) => run.commitToSettle.p95Ms);

/**
 * REPARTO POR ETAPA de la apertura, con la instrumentación de `render-profile`
 * encendida.
 *
 * Es la pregunta que ninguna cifra agregada contesta: de los segundos que tarda
 * en abrir un plano, ¿cuántos son teselar geometría —trabajo irreducible que
 * impone el contenido— y cuántos son el pipeline moviendo cosas de sitio? Sin
 * ese reparto, cualquier optimización sería una apuesta.
 *
 * Se corre SIEMPRE y no bajo bandera, porque en este perfil es justamente el
 * dato que decide si hay algo que optimizar. Pero viaja en su propio campo y
 * NO entra en el juicio de presupuesto: la instrumentación cuesta dos relojes
 * por punto de medida, así que sus tiempos son más altos que los de
 * `measurements` por construcción y compararlos sería un error de lectura.
 */
const stageRun = await profileCadRenderStages({
  entities: corpus.nativeEntities,
  drawOrderIds: corpus.document.modelSpace.entityIds,
  scenario,
  document: corpus.document,
  offThread: "sync",
  reconcile: true,
});
const stageTotal = stageRun.stageTotalMs;
const stageProfile = {
  note: "Instrumentación ENCENDIDA: dos relojes por punto de medida. Estos tiempos NO son comparables con `measurements`; sirven para repartir, no para juzgar.",
  scenarioLabel: stageRun.scenarioLabel,
  openMs: stageRun.firstDetailMs,
  framesToOpen: stageRun.framesToFirstDetail,
  stageTotalMs: stageTotal,
  ms: stageRun.stages.ms,
  calls: stageRun.stages.calls,
  counters: stageRun.stages.counters,
  /**
   * Qué fracción de la apertura explica cada etapa. Es la cifra que decide si
   * hay margen: si teselar domina, el coste lo impone el CONTENIDO del plano y
   * no el orquestador, y tocar el orquestador no compraría nada.
   */
  shareOfExplained: Object.fromEntries(
    Object.entries(stageRun.stages.ms).map(([stage, ms]) => [
      stage,
      stageTotal > 0 ? Math.round((ms / stageTotal) * 1_000) / 10 : 0,
    ]),
  ),
};

const cpus = os.cpus();
const observed = {
  openMs: viewport.openMs,
  selectionIndexBuildMs,
  panFrameP95Ms: viewport.pan.p95Ms,
  zoomFrameP95Ms: viewport.zoom.p95Ms,
  windowSelectionP95Ms: windowSelection.latency.p95Ms,
  crossingSelectionP95Ms: crossingSelection.latency.p95Ms,
  snapP95Ms: snapMeasurement.latency.p95Ms,
  moveCommitToSettleP95Ms: moveEdit.commitToSettle.p95Ms,
  deleteCommitToSettleP95Ms: deleteEdit.commitToSettle.p95Ms,
};
const verdict = evaluateCadPlanBudget(observed);

const evidence = {
  $schema: "urn:valle-design:schema:cad-plan-benchmark-evidence:v1",
  schemaVersion: 1,
  benchmarkId: "valle-design-cad-plan-real-v1",
  startedAt,
  finishedAt: new Date().toISOString(),
  /**
   * REPORT-ONLY en su primera versión, y por la misma doctrina con la que
   * entraron los otros dos benchmarks del repositorio: una métrica sin línea
   * base publicada debajo no puede bloquear a nadie. El presupuesto vive en
   * `plan-budget.ts` y lo hace fallar en LOCAL a través de su spec, que es
   * donde este frente quería que una regresión doliera.
   */
  enforcement: "report-only",
  enforcementRationale:
    "Perfil nuevo: la evidencia se publica y el presupuesto se fija en spec local (plan-budget.spec.ts), no en este script. Los presupuestos están calibrados para esta máquina de desarrollo, NO para el runner de CI.",
  verdict,
  environment: {
    node: process.version,
    v8: process.versions.v8,
    platform: process.platform,
    architecture: process.arch,
    osType: os.type(),
    osRelease: os.release(),
    cpuModel: cpus[0]?.model ?? "unknown",
    /** Hilos que ve Node. El 5500U es de 6 núcleos con 2 hilos cada uno. */
    logicalCpuCount: cpus.length,
    availableParallelism: os.availableParallelism(),
    totalMemoryBytes: os.totalmem(),
    freeMemoryBytesAtStart: os.freemem(),
    heapLimitBytes: getHeapStatistics().heap_size_limit,
    /**
     * La máquina declarada A MANO, además de lo que Node detecta.
     *
     * No es redundante: `os.cpus().length` dice 12 porque cuenta hilos, y quien
     * lea la evidencia dentro de un año necesita saber que detrás hay 6 núcleos
     * físicos de portátil compartidos con otros procesos. Un número de
     * rendimiento sin la máquina al lado no significa nada.
     */
    declaredMachine:
      "AMD Ryzen 5 5500U (6 núcleos físicos / 12 hilos), 7,4 GB de RAM utilizable, Windows 11, portátil de desarrollo con carga vecina",
  },
  corpus: {
    mix: mixId,
    title: definition.title,
    stresses: definition.stresses,
    entities: options.entities,
    entityMix: Object.fromEntries(
      Object.entries(corpus.entityMix).filter(([, count]) => count > 0),
    ),
    cellSizeMm: definition.cellSize,
    layers: definition.layers.length,
    blockDefinitions: corpus.document.blocks.length,
    bounds,
    sha256: createHash("sha256")
      .update(serializeCadDocument(corpus.document))
      .digest("hex"),
    compositionRationale:
      "Modelo declarado, no censo de archivos reales. Derivación completa y supuestos en la cabecera de src/lib/cad/benchmark/corpus-plano-real-builders.ts.",
  },
  scenario: {
    panStops: scenario.pan.length,
    initialPixelsPerUnit: scenario.initial.pixelsPerUnit,
    panPixelsPerUnit: scenario.pan[0]?.pixelsPerUnit ?? null,
    zoomPixelsPerUnit: scenario.zoom.pixelsPerUnit,
    selectionQueries: options.queries,
    selectionWindowSideMm: windowSelection.windowSideMm,
    snapQueries: options.queries,
    snapTolerancePx: SNAP_TOLERANCE_PX,
    snapApertureMm: Math.round(apertureMm * 1_000) / 1_000,
    editGroups: editGroups.length,
    repeatsPerMeasurement: options.repeat,
    published: "mediana entre corridas",
  },
  measurements: {
    viewport,
    selectionIndexBuildMs,
    windowSelection,
    crossingSelection,
    snap: snapMeasurement,
    moveEdit,
    deleteEdit,
  },
  stageProfile,
  variance: {
    runs: options.repeat,
    openMs: viewportRuns.map((run) => run.openMs),
    panFrameP95Ms: viewportRuns.map((run) => run.pan.p95Ms),
    zoomFrameP95Ms: viewportRuns.map((run) => run.zoom.p95Ms),
    windowSelectionP95Ms: windowRuns.map((run) => run.latency.p95Ms),
    crossingSelectionP95Ms: crossingRuns.map((run) => run.latency.p95Ms),
    snapP95Ms: snapRuns.map((run) => run.latency.p95Ms),
    moveCommitToSettleP95Ms: moveRuns.map((run) => run.commitToSettle.p95Ms),
    deleteCommitToSettleP95Ms: deleteRuns.map((run) => run.commitToSettle.p95Ms),
  },
  scope: {
    measured: [
      "apertura del dibujo hasta el primer detalle completo, en cuadros y en reloj de CPU",
      "trabajo de CPU por cuadro al panear y al hacer zoom, con p50 y p95",
      "selección por VENTANA (dentro entero) y por CAPTURA (tocar), sin tope de resultados",
      "OSNAP compuesto como lo compone el editor: índice, escena de enganche y resolutor",
      "edición que invalida geometría: mover y BORRAR los grupos que devolvió una selección",
      "construcción del índice de selección sobre el documento completo, cronometrada aparte",
      "reparto POR ETAPA de la apertura con la instrumentación de render-profile encendida",
    ],
    notMeasured: [
      "arranque del navegador, GPU, llamadas de dibujo, composición y cuadros por segundo",
      "coste de subir atributos a la GPU",
      "rasterizado de glifos: en Node no hay canvas, así que del texto se mide la petición de quads y no el dibujado",
      "red, API, PostgreSQL, apertura desde disco, autoguardado ni CAS",
      "deshacer/rehacer y la memoria retenida por el historial",
      "compatibilidad DWG",
    ],
  },
};

const json = `${JSON.stringify(evidence, null, 2)}\n`;
const target = options.output ?? process.env.CAD_PLAN_BENCHMARK_OUTPUT;
if (target) {
  const resolved = path.resolve(target);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, json, "utf8");
  process.stderr.write(`Evidencia del plano real: ${resolved}\n`);
} else {
  process.stdout.write(json);
}

const fila = (nombre: string, p50: number, p95: number, max: number): string =>
  `  ${nombre.padEnd(34)}${String(p50).padStart(10)}${String(p95).padStart(10)}${String(max).padStart(10)}`;

process.stderr.write(
  [
    "",
    `PLANO REAL · ${options.entities} entidades · mezcla ${mixId} · mediana de ${options.repeat} corridas`,
    `  ${definition.title}`,
    `  ${Object.entries(evidence.corpus.entityMix)
      .map(([type, count]) => `${type} ${count}`)
      .join(" · ")}`,
    "",
    `  operación                                p50       p95       máx`,
    fila("cuadro al panear", viewport.pan.p50Ms, viewport.pan.p95Ms, viewport.pan.maxMs),
    fila("cuadro al hacer zoom", viewport.zoom.p50Ms, viewport.zoom.p95Ms, viewport.zoom.maxMs),
    fila(
      `selección ventana (${windowSelection.hitsP50} ent.)`,
      windowSelection.latency.p50Ms,
      windowSelection.latency.p95Ms,
      windowSelection.latency.maxMs,
    ),
    fila(
      `selección captura (${crossingSelection.hitsP50} ent.)`,
      crossingSelection.latency.p50Ms,
      crossingSelection.latency.p95Ms,
      crossingSelection.latency.maxMs,
    ),
    fila(
      `OSNAP (${snapMeasurement.resolved}/${snapMeasurement.queries} enganchan)`,
      snapMeasurement.latency.p50Ms,
      snapMeasurement.latency.p95Ms,
      snapMeasurement.latency.maxMs,
    ),
    fila(
      `MOVE grupo (${moveEdit.entitiesPerGroupP50} ent.) commit→asentado`,
      moveEdit.commitToSettle.p50Ms,
      moveEdit.commitToSettle.p95Ms,
      moveEdit.commitToSettle.maxMs,
    ),
    fila(
      `BORRAR grupo (${deleteEdit.entitiesPerGroupP50} ent.) commit→asentado`,
      deleteEdit.commitToSettle.p50Ms,
      deleteEdit.commitToSettle.p95Ms,
      deleteEdit.commitToSettle.maxMs,
    ),
    "",
    `  apertura ${viewport.openMs} ms en ${viewport.framesToOpen} cuadros · índice de selección ${selectionIndexBuildMs} ms`,
    `  en reposo tras el zoom: ${viewport.detailedAtRest} detalladas de ${viewport.visibleAtRest} visibles · ${viewport.segmentsAtRest} segmentos`,
    `  apertura de enganche ${evidence.scenario.snapApertureMm} mm (${SNAP_TOLERANCE_PX} px al zoom de trabajo)`,
    `  MOVE liberó ${moveEdit.evictedTilesTotal} tiles · BORRAR liberó ${deleteEdit.evictedTilesTotal} · quedan ${deleteEdit.totalEntitiesAfterEdits} entidades`,
    "",
    `  REPARTO POR ETAPA de la apertura (instrumentación encendida, no comparable con lo de arriba)`,
    ...Object.entries(stageProfile.ms)
      .sort(([, left], [, right]) => right - left)
      .map(
        ([stage, ms]) =>
          `    ${stage.padEnd(18)}${String(ms).padStart(10)} ms   ${String(
            stageProfile.shareOfExplained[stage],
          ).padStart(5)} %   ${String(stageProfile.calls[stage as keyof typeof stageProfile.calls]).padStart(7)} llamadas`,
      ),
    `    ${"TOTAL explicado".padEnd(18)}${String(stageTotal).padStart(10)} ms de ${stageProfile.openMs} ms de reloj`,
    "",
    `  ${verdict.passed ? "DENTRO" : "FUERA"} del presupuesto del perfil (report-only en el script; el gate está en plan-budget.spec.ts)`,
    ...verdict.violations.map(
      (violation) =>
        `    ${violation.metric}: ${violation.observed} ms supera ${violation.budget} ms`,
    ),
    "",
    `  Medida de CPU en Node sobre ${evidence.environment.declaredMachine}.`,
    "  No es GPU, ni cuadros de navegador, ni FPS, ni red.",
    "",
  ].join("\n"),
);

if (options.enforce && !verdict.passed) process.exitCode = 1;
