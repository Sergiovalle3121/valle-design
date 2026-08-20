/**
 * TRINQUETE del perfil «plano real» a 20.000 entidades.
 *
 * ## Qué defiende este spec
 *
 * Que las cinco operaciones que un arquitecto repite todo el día —panear, hacer
 * zoom, seleccionar por ventana y por captura, enganchar y editar un grupo— no
 * se degraden en silencio. El benchmark completo
 * (`npm run benchmark:cad:plan`) publica la evidencia; este spec es lo que hace
 * que una regresión DUELA en local sin tener que acordarse de correr nada.
 *
 * ## Por qué mide menos que el benchmark
 *
 * El benchmark repite cada medida tres veces con 200 consultas y publica la
 * mediana; aquí se hace UNA pasada en caliente con 120, porque este spec corre
 * dentro de una suite de 300 y no puede costar dos minutos. La contrapartida es
 * que sus muestras son más ruidosas, y por eso el presupuesto tiene el margen
 * que tiene: ver la derivación completa en `plan-budget.ts`. Lo que este spec
 * NO hace es publicar cifras: para eso está el benchmark, con su evidencia y su
 * máquina declarada.
 *
 * ## Por qué los presupuestos son de ESTA máquina
 *
 * Están calibrados sobre el portátil de desarrollo (Ryzen 5 5500U, 6 núcleos,
 * 7,4 GB). Los dos specs de `e2e/performance/` tienen los suyos para el runner
 * de CI de 2 vCPU y no se mezclan: un presupuesto que valga para las dos
 * máquinas o es inútil en una o imposible en la otra.
 *
 * Consecuencia que este spec ahora respeta de verdad: en CI (`process.env.CI`)
 * se ejecutan TODAS las anclas de corrección —composición exacta del corpus,
 * SHA, evidencia publicada, «la medida es de verdad»— pero el veredicto de
 * presupuesto absoluto NO se aplica, porque en un runner compartido de 2 vCPU
 * falló repetidas veces sobre commits que no tocaban ni una línea del web
 * (ruido de vecinos, no regresión). En CI los tiempos los defienden los specs
 * de `e2e/performance/` con presupuestos calibrados para ESE runner.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { serializeCadDocument } from "../cad-document";
import { CAD_CORPUS_MIXES, createCadCorpusMix } from "./corpus-mixes";
import { cadDocumentBounds, createCadRenderScenario } from "./scenario";
import {
  CAD_PLAN_BASELINE,
  CAD_PLAN_BUDGETS,
  evaluateCadPlanBudget,
} from "./plan-budget";
import {
  createCadPlanSelectionIndex,
  createCadPlanSelectionWindows,
  measureCadPlanEdit,
  measureCadPlanSelection,
  measureCadPlanSnap,
  measureCadPlanViewport,
} from "./plan-operations";

const ENTIDADES = 20_000;
const CONSULTAS = 120;
/**
 * CUARENTA grupos, y el número no es decorativo.
 *
 * El percentil se calcula por rango: con 8 muestras, el p95 cae en la octava de
 * ocho — es decir, **el p95 ERA el máximo**, y bastaba una pausa del recolector
 * en un solo grupo para cuadruplicar la cifra. Se vio: la misma medida dio 7,6
 * ms en una corrida y 45,7 ms en la siguiente sin que nada hubiera cambiado.
 *
 * Con 40, el p95 cae en la 38.ª y deja fuera las dos peores, que es lo que un
 * percentil viene a hacer. El coste es ~40 ediciones por operación, que la
 * suite se puede permitir; un gate que depende de si el recolector pasó por
 * ahí no es un gate.
 */
const GRUPOS = 40;

/**
 * Cada medida se hace DOS veces y se descarta la primera.
 *
 * No es maquillaje, y conviene explicar por qué no lo es. La primera pasada
 * paga el calentamiento del compilador de V8: las funciones de selección y de
 * enganche entran interpretadas y sólo tras unos cientos de llamadas se
 * compilan. Con 120 consultas, el p95 cae sobre la sexta peor muestra, y en una
 * pasada fría esas seis peores SON las primeras — se estaría midiendo el JIT,
 * no el motor.
 *
 * El benchmark completo no necesita esto porque repite tres corridas de 200
 * consultas y publica la mediana; aquí se compra el mismo estado estacionario
 * mucho más barato. Lo que se mide en los dos sitios es lo mismo: el coste que
 * paga un usuario en el gesto número mil del día, no en el primero.
 */
function enCaliente<T>(medir: () => T): T {
  medir();
  return medir();
}

const definition = CAD_CORPUS_MIXES["plano-real"];
const corpus = createCadCorpusMix({ mix: "plano-real", entities: ENTIDADES });

// ---------------------------------------------------------------------------
// El corpus ES el perfil: si cambia, el presupuesto deja de significar nada
// ---------------------------------------------------------------------------

/**
 * Anclas ABSOLUTAS de composición. Un SHA solo diría «cambió algo»; el recuento
 * por tipo dice QUÉ cambió, y es lo que impide que alguien toque un generador,
 * re-registre el hash y deje el presupuesto midiendo otro dibujo.
 */
assert.equal(corpus.nativeEntities.length, ENTIDADES);
assert.deepEqual(
  Object.fromEntries(
    Object.entries(corpus.entityMix).filter(([, count]) => count > 0),
  ),
  {
    line: 5_800,
    polyline: 3_000,
    circle: 1_200,
    arc: 1_200,
    hatch: 1_400,
    mtext: 2_000,
    dimension: 2_600,
    insert: 2_800,
  },
  "la composición del plano real a 20.000 es EXACTA, no aproximada",
);
// El SHA ha cambiado TRES veces por subidas del esquema canónico —a 7 (el hueco
// alojado), a 8 (la ventana gráfica con cámara) y a 9 (frozen y layerStates)—
// y las tres veces SÓLO por eso: el único byte distinto del serializado es el
// dígito del esquema. Se comprueba eslabón a eslabón en
// `corpus-sha-provenance.spec.ts`, que revierte 9→8→7→6 sobre el texto de hoy
// y recupera los tres SHA antiguos exactos. El 8 sí escribe una cámara por
// ventana al abrir, pero este corpus no tiene láminas; el 9 no materializa
// nada y este corpus ni congela capas ni trae estados — ese spec comprueba
// ambas coartadas en vez de suponerlas. Ninguna entidad, ningún bloque y
// ninguna coordenada cambian, así que los presupuestos de `plan-budget.ts` NO
// se recalibran: recalibrar por un entero de metadatos daría a los números una
// autoridad de medida que esa corrida no tendría.
assert.equal(
  createHash("sha256").update(serializeCadDocument(corpus.document)).digest("hex"),
  "45407772af70744b0308ee791df9d4885befb3e1ce7c944d37a6a6b66322a2ba",
  "el corpus de 20.000 cambió de contenido: si es intencionado, actualiza este SHA Y vuelve a calibrar plan-budget.ts con una corrida nueva",
);
assert.equal(
  corpus.document.blocks.length,
  4,
  "2.800 INSERT sobre CUATRO definiciones: la asimetría ES el caso arquitectónico",
);

assert.ok(
  CAD_PLAN_BASELINE.entities === ENTIDADES && CAD_PLAN_BASELINE.mix === "plano-real",
  "la línea base declara el mismo perfil que este spec mide",
);

// ---------------------------------------------------------------------------
// La EVIDENCIA publicada tiene que seguir describiendo este perfil
// ---------------------------------------------------------------------------

/**
 * Un esquema declarado que nadie comprueba es decoración. Esto ata el JSON
 * publicado al código: si alguien cambia el benchmark para que deje de declarar
 * la máquina, o el corpus cambia y la evidencia se queda vieja, salta aquí.
 *
 * Se busca la raíz subiendo desde el directorio de trabajo porque la suite
 * puede lanzarse desde `apps/web` o desde la raíz del monorepo, y una ruta
 * relativa fija fallaría en uno de los dos sitios por un motivo que no tiene
 * nada que ver con el rendimiento.
 */
function encontrarEvidencia(): string | null {
  let directory = process.cwd();
  for (let level = 0; level < 6; level += 1) {
    const candidate = path.join(
      directory,
      "docs",
      "cad",
      "evidence",
      "cad-plan-benchmark-20k.json",
    );
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return null;
}

const evidencePath = encontrarEvidencia();
assert.ok(
  evidencePath,
  "falta docs/cad/evidence/cad-plan-benchmark-20k.json: la evidencia publicada es parte del perfil, no un adorno. Genérala con npm run benchmark:cad:plan --workspace=web -- --output docs/cad/evidence/cad-plan-benchmark-20k.json",
);
const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as {
  $schema: string;
  corpus: { sha256: string; entities: number; entityMix: Record<string, number> };
  environment: { node: string; declaredMachine: string; cpuModel: string };
  scope: { measured: string[]; notMeasured: string[] };
  measurements: Record<string, unknown>;
  stageProfile: { shareOfExplained: Record<string, number> };
};
assert.equal(
  evidence.$schema,
  "urn:valle-design:schema:cad-plan-benchmark-evidence:v1",
  "la evidencia declara su esquema",
);
assert.equal(
  evidence.corpus.sha256,
  createHash("sha256").update(serializeCadDocument(corpus.document)).digest("hex"),
  "la evidencia publicada se midió sobre OTRO corpus que el que este spec genera: vuelve a correr el benchmark",
);
assert.equal(evidence.corpus.entities, ENTIDADES);
assert.deepEqual(
  evidence.corpus.entityMix,
  Object.fromEntries(
    Object.entries(corpus.entityMix).filter(([, count]) => count > 0),
  ),
);
// Sin máquina declarada, el número no significa nada. Es la regla que este
// frente vino a imponer, y por eso se comprueba en vez de confiarse.
assert.ok(
  evidence.environment.declaredMachine.length > 30 &&
    evidence.environment.node.startsWith("v"),
  "la evidencia tiene que declarar la máquina y la versión de Node",
);
assert.ok(
  evidence.scope.notMeasured.length >= 4,
  "la evidencia tiene que decir explícitamente qué NO mide",
);
assert.ok(
  evidence.scope.notMeasured.some((line) => /GPU|navegador/i.test(line)) &&
    evidence.scope.notMeasured.some((line) => /red|API/i.test(line)),
  "el alcance negativo tiene que nombrar al menos GPU/navegador y red/API",
);

// ---------------------------------------------------------------------------
// La medida
// ---------------------------------------------------------------------------

const bounds = cadDocumentBounds(corpus.nativeEntities, corpus.document);
const scenario = createCadRenderScenario(bounds, 6);

const indexStarted = performance.now();
const index = createCadPlanSelectionIndex(
  corpus.nativeEntities,
  definition.cellSize,
  corpus.document,
);
const selectionIndexBuildMs = performance.now() - indexStarted;
assert.equal(index.size, ENTIDADES);

const windows = createCadPlanSelectionWindows(
  bounds,
  definition.cellSize,
  CONSULTAS,
);
const viewport = measureCadPlanViewport(
  corpus.nativeEntities,
  corpus.document.modelSpace.entityIds,
  scenario,
  corpus.document,
);
const windowSelection = enCaliente(() =>
  measureCadPlanSelection(index, windows, "window", definition.cellSize),
);
const crossingSelection = enCaliente(() =>
  measureCadPlanSelection(index, windows, "crossing", definition.cellSize),
);

const apertureMm = 12 / scenario.zoom.pixelsPerUnit;
const cursors = Array.from({ length: CONSULTAS }, (_, query) => {
  const entity = corpus.nativeEntities[(query * 7_919) % ENTIDADES];
  const box = cadDocumentBounds([entity], corpus.document);
  return { x: box.minX + apertureMm * 0.3, y: box.minY + apertureMm * 0.3 };
});
const snapMeasurement = enCaliente(() =>
  measureCadPlanSnap(index, cursors, apertureMm, corpus.document),
);

const groups = windows
  .slice(0, GRUPOS)
  .map((window) =>
    index
      .intersecting(window, true, Number.POSITIVE_INFINITY)
      .map((entity) => entity.id),
  )
  .filter((group) => group.length > 0);
assert.ok(
  groups.length >= 30,
  `el p95 de edición necesita muestras de sobra para no ser el máximo; las ventanas sólo dieron ${groups.length} grupos no vacíos`,
);

const moveEdit = measureCadPlanEdit(
  corpus.nativeEntities,
  corpus.document.modelSpace.entityIds,
  scenario.initial,
  groups,
  "move",
  definition.cellSize,
  corpus.document,
);
const deleteEdit = measureCadPlanEdit(
  corpus.nativeEntities,
  corpus.document.modelSpace.entityIds,
  scenario.initial,
  groups,
  "delete",
  definition.cellSize,
  corpus.document,
);

// ---------------------------------------------------------------------------
// Que la medida sea de VERDAD: sin esto, un presupuesto se cumple vacío
// ---------------------------------------------------------------------------

/**
 * Un benchmark que no toca nada pasa cualquier presupuesto. Estas anclas dicen
 * que hubo trabajo: cuadros, entidades seleccionadas, enganches resueltos y
 * tiles liberados. Es la diferencia entre «va rápido» y «no hizo nada».
 */
assert.ok(viewport.framesToOpen > 0, "la apertura no ejecutó ni un cuadro");
assert.ok(
  viewport.pan.samples > 0 && viewport.zoom.samples > 0,
  "el paseo y el zoom deben aportar muestras de cuadro",
);
assert.equal(
  viewport.detailedAtRest,
  viewport.visibleAtRest,
  "en reposo, TODO lo visible tiene que estar detallado: si no, se midió un dibujo a medio hacer",
);
assert.ok(
  viewport.segmentsAtRest > 0,
  "cero segmentos en reposo significa que no se dibujó nada",
);
assert.ok(
  windowSelection.hitsTotal > 0 && crossingSelection.hitsTotal > 0,
  "las ventanas de selección no devolvieron NADA: se midió el camino vacío",
);
assert.ok(
  crossingSelection.hitsTotal >= windowSelection.hitsTotal,
  "la captura toca; la ventana exige dentro entero. La captura no puede devolver menos",
);
assert.ok(
  snapMeasurement.resolved > snapMeasurement.queries * 0.5,
  `OSNAP resolvió ${snapMeasurement.resolved} de ${snapMeasurement.queries}: con menos de la mitad se está midiendo el camino sin candidatos`,
);
assert.ok(
  moveEdit.evictedTilesTotal > 0,
  "mover un grupo no liberó ni un tile: la edición no invalidó geometría",
);
assert.ok(
  deleteEdit.totalEntitiesAfterEdits < ENTIDADES,
  "borrar no quitó entidades del pipeline",
);
assert.equal(
  moveEdit.detailedAtRestAfterEdits,
  moveEdit.visibleAtRestAfterEdits,
  "tras editar, lo visible sigue teniendo que estar detallado",
);

// ---------------------------------------------------------------------------
// El presupuesto
// ---------------------------------------------------------------------------

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

/**
 * El trinquete de presupuesto sólo se aplica fuera de CI: sus números están
 * calibrados para el portátil de desarrollo y en el runner compartido fallaban
 * por ruido ajeno (ver cabecera). Las anclas de corrección de arriba ya
 * corrieron todas; lo único que se relaja aquí es el umbral de milisegundos.
 */
const enMaquinaCalibrada = !process.env.CI;

assert.ok(
  !enMaquinaCalibrada || verdict.passed,
  `El perfil «plano real» de 20.000 entidades se salió de presupuesto en esta máquina:\n${verdict.violations
    .map(
      (violation) =>
        `  ${violation.metric}: ${violation.observed.toFixed(3)} ms supera ${violation.budget} ms`,
    )
    .join(
      "\n",
    )}\nSi el cambio es intencionado y MEJORA los números, vuelve a medir con\n  npm run benchmark:cad:plan --workspace=web -- --output docs/cad/evidence/cad-plan-benchmark-20k.json\ny recalibra CAD_PLAN_BUDGETS con el diff de la evidencia delante de quien revise.`,
);

/**
 * Y al revés: un presupuesto MUY por encima de lo medido ha dejado de defender
 * nada. Si todas las métricas de gesto caen por debajo de un octavo de su
 * presupuesto, es que el motor mejoró mucho y toca apretar el trinquete —el
 * mismo aviso que un gate flojo nunca da y por el que los gates se pudren.
 */
const gestos = [
  ["panFrameP95Ms", observed.panFrameP95Ms, CAD_PLAN_BUDGETS.panFrameP95Ms],
  ["zoomFrameP95Ms", observed.zoomFrameP95Ms, CAD_PLAN_BUDGETS.zoomFrameP95Ms],
  ["snapP95Ms", observed.snapP95Ms, CAD_PLAN_BUDGETS.snapP95Ms],
  [
    "moveCommitToSettleP95Ms",
    observed.moveCommitToSettleP95Ms,
    CAD_PLAN_BUDGETS.moveCommitToSettleP95Ms,
  ],
] as const;
const holgadas = gestos.filter(([, valor, presupuesto]) => valor * 8 < presupuesto);
assert.notEqual(
  enMaquinaCalibrada ? holgadas.length : -1,
  gestos.length,
  `TODAS las operaciones de gesto están ocho veces por debajo de su presupuesto (${holgadas
    .map(([nombre, valor]) => `${nombre} ${valor.toFixed(3)} ms`)
    .join(
      ", ",
    )}). El trinquete ya no defiende nada: vuelve a calibrarlo con una corrida nueva.`,
);

console.log(
  `ok CAD plano real 20k: apertura ${viewport.openMs} ms · índice ${selectionIndexBuildMs.toFixed(0)} ms · ` +
    `paneo p95 ${observed.panFrameP95Ms} ms · zoom p95 ${observed.zoomFrameP95Ms} ms · ` +
    `ventana p95 ${observed.windowSelectionP95Ms} ms (${windowSelection.hitsP50} ent.) · ` +
    `captura p95 ${observed.crossingSelectionP95Ms} ms (${crossingSelection.hitsP50} ent.) · ` +
    `OSNAP p95 ${observed.snapP95Ms} ms (${snapMeasurement.resolved}/${snapMeasurement.queries}) · ` +
    `MOVE p95 ${observed.moveCommitToSettleP95Ms} ms · BORRAR p95 ${observed.deleteCommitToSettleP95Ms} ms`,
);
