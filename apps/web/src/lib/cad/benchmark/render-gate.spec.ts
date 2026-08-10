/**
 * El gate del pipeline de render — SÓLO AFIRMACIONES DETERMINISTAS.
 *
 * ## Aquí NO se mide el reloj, y es deliberado
 *
 * La primera versión de este archivo juzgaba tiempos: `firstDetailMs`,
 * `panFrameP95Ms`, el asentado del zoom. Estaba mal, y quien lo demostró fue
 * #65 sobre este mismo repositorio con un intermitente REPRODUCIDO en
 * `render-benchmark.spec.ts` —2 de cada 10 corridas— cuya causa es aritmética
 * y no de máquina:
 *
 *   El ruido de planificación es ABSOLUTO —una pausa del recolector cuesta lo
 *   mismo a cualquier medida— pero el coste real de este pipeline es PEQUEÑO.
 *   Un hipo de 5 ms apenas mueve un número de 70 ms y DUPLICA uno de 6 ms.
 *
 * Y su residuo declarado es la parte que decide: con los cuatro núcleos
 * saturados seguía cayendo 5 de 12 **incluso con la mediana puesta**. El
 * `run-specs.mjs` ejecuta 250 specs seguidos; ahí la máquina nunca está
 * tranquila. Un presupuesto de reloj en este runner es un intermitente en la
 * puerta de TODO EL MUNDO, y un gate que la gente desactiva es peor que no
 * tenerlo.
 *
 * ## Dónde vive entonces el presupuesto de tiempo
 *
 * En `scripts/cad-render-benchmark.mts`, que corre como paso propio de CI, en
 * serie, con su propio proceso y `--repeat` para publicar la mediana con todas
 * las muestras. Es el arreglo durable que #65 dejó escrito como pendiente del
 * dueño de #62, y es lo que se hace aquí.
 *
 * ## Lo que SÍ se queda, y por qué no puede parpadear
 *
 * Las INVARIANTES son recuentos de entidades, no milisegundos:
 *
 *   - en reposo, `detailedAtRest == visibleAtRest` — sin muestreo;
 *   - con el dibujo entero a la vista, el pipeline detalla las 25.000;
 *   - el camino anterior sigue detallando como mucho su tope.
 *
 * Ninguna depende del reloj, de la carga ni del navegador. Son las que separan
 * un dibujo lento de un dibujo FALSO, que es lo que el pipeline vino a
 * arreglar, y por eso son las que tienen que bloquear en la puerta común.
 */
import assert from "node:assert/strict";
import os from "node:os";
import { createCadBenchmarkCorpus } from "./corpus";
import { cadDocumentBounds, createCadRenderScenario } from "./scenario";
import {
  measureCadLegacyPipeline,
  measureCadNextPipeline,
  measureCadRenderLeak,
} from "../render/render-benchmark";
import {
  CAD_RENDER_BASELINE,
  blockingCadRenderViolations,
  evaluateCadRenderBudget,
  findCadRenderBudgetProfile,
  formatCadRenderVerdict,
  type CadRenderBudgetProfile,
} from "./render-budget";

// ---------------------------------------------------------------------------
// El manifiesto tiene que decir la verdad sobre sí mismo
// ---------------------------------------------------------------------------

assert.equal(CAD_RENDER_BASELINE.schemaVersion, 1);
assert.ok(CAD_RENDER_BASELINE.profiles.length >= 2);
for (const profile of CAD_RENDER_BASELINE.profiles) {
  assert.ok(profile.calibration.runs >= 3, `${profile.id}: menos de 3 corridas no dan peor caso`);
  assert.ok(profile.calibration.marginFactor >= 1.5, `${profile.id}: margen demasiado justo`);
  assert.ok(
    profile.enforcementRationale.length > 20,
    `${profile.id}: un enforcement sin justificación escrita es un número sin dueño`,
  );
  for (const [metric, samples] of Object.entries(profile.calibration.observed))
    assert.equal(
      samples.length,
      profile.calibration.runs,
      `${profile.id}/${metric}: ${samples.length} muestras para ${profile.calibration.runs} corridas declaradas`,
    );
  // ANCLA ABSOLUTA: el presupuesto tiene que estar POR ENCIMA de la peor
  // corrida observada. Sin esto, «calibrado» podría significar cualquier cosa,
  // incluido un número copiado a mano que ya nacía en rojo.
  for (const [metric, key] of [
    ["next.firstDetailMs", "nextFirstDetailMs"],
    ["next.zoomSettleMs", "nextZoomSettleMs"],
    ["next.panFrameP95Ms", "nextPanFrameP95Ms"],
    ["next.panFrameMaxMs", "nextPanFrameMaxMs"],
  ] as const) {
    const samples = profile.calibration.observed[metric] ?? [];
    const limit = profile.budgets[key];
    assert.ok(
      limit >= Math.max(...samples),
      `${profile.id}/${metric}: presupuesto ${limit} por debajo de la peor corrida ${Math.max(...samples)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// El evaluador: se prueba con casos fabricados ANTES de creerle una medida
// ---------------------------------------------------------------------------

const gate = findCadRenderBudgetProfile("gate-25k");
assert.ok(gate, "falta el perfil gate-25k en la línea base");

const fastHost = {
  logicalCpuCount: gate.hardware.minimumLogicalCpuCount,
  totalMemoryBytes: gate.hardware.minimumTotalMemoryBytes,
  exposedGc: false,
};
const slowHost = {
  logicalCpuCount: Math.max(1, gate.hardware.minimumLogicalCpuCount - 1),
  totalMemoryBytes: gate.hardware.minimumTotalMemoryBytes,
  exposedGc: false,
};

function fabricate(overrides: {
  firstDetailMs?: number;
  detailedAtRest?: number;
  visibleAtRest?: number;
}) {
  const path = {
    pipeline: "next" as const,
    firstDetailMs: overrides.firstDetailMs ?? 1,
    zoomSettleMs: 1,
    panFrameP95Ms: 1,
    zoomFrameP95Ms: 1,
    panFrameMaxMs: 1,
    zoomFrameMaxMs: 1,
    visibleAtRest: overrides.visibleAtRest ?? 10,
    detailedAtRest: overrides.detailedAtRest ?? 10,
    segmentsAtRest: 10,
    framesToFirstDetail: 1,
    panFrameSamples: 1,
    zoomFrameSamples: 1,
  };
  return {
    entities: 25_000,
    scenarioStops: 6,
    next: path,
    legacy: { ...path, pipeline: "legacy" as const },
    leak: {
      cycles: 3,
      heapAfterFirstCycleBytes: 0,
      heapAfterLastCycleBytes: 0,
      heapGrowthMb: 0,
      samplesMb: [0, 0, 0],
    },
  };
}

// Un tiempo por encima del presupuesto es una violación de TIEMPO…
const overBudget = evaluateCadRenderBudget(
  fabricate({ firstDetailMs: gate.budgets.nextFirstDetailMs * 10 }),
  gate,
  fastHost,
);
assert.equal(overBudget.enforcement, "blocking");
assert.equal(blockingCadRenderViolations(overBudget).length, 1);
assert.equal(blockingCadRenderViolations(overBudget)[0].kind, "timing");

// …y en una máquina más pequeña que la de calibración DEJA de bloquear.
const overBudgetSlow = evaluateCadRenderBudget(
  fabricate({ firstDetailMs: gate.budgets.nextFirstDetailMs * 10 }),
  gate,
  slowHost,
);
assert.equal(overBudgetSlow.enforcement, "report-only");
assert.ok(overBudgetSlow.downgradeReason);
assert.equal(blockingCadRenderViolations(overBudgetSlow).length, 0);

// Pero el regreso del MUESTREO bloquea en cualquier máquina. Es la propiedad
// que el pipeline vino a arreglar y no depende del hardware.
const sampled = evaluateCadRenderBudget(
  fabricate({ detailedAtRest: 2_500, visibleAtRest: 25_000 }),
  gate,
  slowHost,
);
assert.equal(sampled.enforcement, "report-only");
assert.equal(blockingCadRenderViolations(sampled).length, 1);
assert.equal(blockingCadRenderViolations(sampled)[0].kind, "invariant");

/**
 * ANCLA ABSOLUTA: en la máquina de CI el perfil tiene que BLOQUEAR.
 *
 * Esto no es una comprobación de adorno; es la que faltaba, y su ausencia costó
 * dos corridas. El paso `benchmark:cad:render` salió VERDE en CI dos veces
 * seguidas sin juzgar nada: la primera degradado por CPU —«2 CPU lógicas frente
 * a las 4 de la calibración»— y la segunda por memoria —«8 GiB frente a los
 * 14 GiB»—. Un gate bloqueante que se auto-degrada donde corre pasa por bueno
 * indefinidamente, porque su síntoma es exactamente el mismo que el del éxito.
 *
 * El modo de fallo es sigiloso y volverá: basta con recalibrar en un equipo más
 * grande que el runner para que el guardián vuelva a apagar los tiempos sin que
 * nadie se entere. Con esta afirmación, recalibrar así ROMPE aquí.
 *
 * Los números son los del runner de CI de este repositorio, medidos en sus
 * propios logs: 2 CPU lógicas y 8 GiB.
 */
const CI_HOST = { logicalCpuCount: 2, totalMemoryBytes: 8 * 1024 ** 3, exposedGc: true };
for (const profile of CAD_RENDER_BASELINE.profiles) {
  const onCi = evaluateCadRenderBudget(fabricate({}), profile, CI_HOST);
  assert.equal(
    onCi.enforcement,
    "blocking",
    `${profile.id}: el guardián de hardware DEGRADA en el runner de CI (2 CPU, 8 GiB) — «${onCi.downgradeReason}». ` +
      `Un presupuesto de tiempo que no bloquea en la única máquina que lo ejecuta no es un presupuesto: es un informe. ` +
      `Recalibra con los núcleos y la memoria del runner, no con los de tu equipo.`,
  );
}

// Sin --expose-gc la fuga NO se juzga, y se dice.
assert.ok(
  evaluateCadRenderBudget(fabricate({}), gate, fastHost).notEvaluated.some((note) =>
    note.includes("leak.heapGrowthMb"),
  ),
);

// ---------------------------------------------------------------------------
// La medida de verdad, contra el perfil versionado
// ---------------------------------------------------------------------------

function runProfile(profile: CadRenderBudgetProfile) {
  const corpus = createCadBenchmarkCorpus({ entities: profile.entities });
  const bounds = cadDocumentBounds(corpus.nativeEntities);
  const scenario = createCadRenderScenario(bounds, profile.panStops);
  const drawOrder = corpus.document.modelSpace.entityIds;
  const restScenario = { initial: scenario.initial, pan: [], zoom: scenario.initial };
  return {
    entities: corpus.nativeEntities.length,
    scenarioStops: scenario.pan.length,
    next: measureCadNextPipeline(corpus.nativeEntities, drawOrder, scenario),
    legacy: measureCadLegacyPipeline(corpus.nativeEntities, scenario),
    leak: measureCadRenderLeak(corpus.nativeEntities, drawOrder, restScenario, 1),
    fullView: {
      next: measureCadNextPipeline(corpus.nativeEntities, drawOrder, restScenario),
      legacy: measureCadLegacyPipeline(corpus.nativeEntities, restScenario),
    },
  };
}

const measured = runProfile(gate);
const host = {
  // `availableParallelism()`, igual que la calibración y el script de juicio:
  // los núcleos que el proceso puede usar, no los que tiene la máquina.
  logicalCpuCount: os.availableParallelism(),
  totalMemoryBytes: os.totalmem(),
  exposedGc: typeof (globalThis as { gc?: () => void }).gc === "function",
};
const verdict = evaluateCadRenderBudget(measured, gate, host, measured.fullView);

/**
 * De todo el veredicto, aquí SÓLO se exigen las invariantes.
 *
 * Los incumplimientos de tiempo se imprimen —para que quien lea el log de CI
 * los vea— pero NO rompen: los juzga `benchmark:cad:render` en su propio paso,
 * en serie y con la mediana de varias corridas. Filtrar por `kind` en vez de
 * dejar de medir mantiene la información y quita el parpadeo.
 */
const invariantViolations = verdict.violations.filter(
  (violation) => violation.kind === "invariant",
);
const timingObservations = verdict.violations.filter(
  (violation) => violation.kind === "timing",
);
console.log(formatCadRenderVerdict(verdict));
if (timingObservations.length > 0)
  console.log(
    `AVISO (no bloquea aquí): ${timingObservations.length} presupuesto(s) de tiempo por encima en esta corrida. ` +
      `El juicio de tiempos es de «npm run benchmark:cad:render», que corre en serie y con mediana. ` +
      `Este spec sólo bloquea invariantes porque el runner de specs no es un entorno de reloj controlado.`,
  );

assert.deepEqual(
  invariantViolations.map((violation) => violation.message),
  [],
  `El pipeline de render rompió una INVARIANTE. Esto no es ruido de reloj: es que ha vuelto el muestreo.\n${formatCadRenderVerdict(verdict)}`,
);

console.log(
  `ok CAD render gate (invariantes): ${gate.id} · ${measured.entities} entidades · ` +
    `en reposo detalladas ${measured.next.detailedAtRest} == visibles ${measured.next.visibleAtRest} · ` +
    `con el dibujo entero a la vista el pipeline detalla ${measured.fullView.next.detailedAtRest} y el anterior ${measured.fullView.legacy.detailedAtRest}. ` +
    `Los TIEMPOS los juzga benchmark:cad:render, no este spec.`,
);
