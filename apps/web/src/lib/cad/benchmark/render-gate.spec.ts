/**
 * El gate BLOQUEANTE del pipeline de render.
 *
 * ## Por qué el gate vive en un spec y no sólo en un script
 *
 * `npm run benchmark:cad:render` no lo ejecuta nadie en CI: el workflow corre
 * `benchmark:cad:smoke` y `benchmark:cad:scale`, no éste. Un presupuesto que
 * sólo se comprueba cuando alguien se acuerda de teclearlo no es bloqueante,
 * es decorativo. El paso «Web specs (tsx)» sí existe y ya corre todos los
 * `src/**\/*.spec.ts`, así que poner el gate aquí lo hace bloquear de verdad
 * sin tocar el workflow —que además está fuera del alcance de este trabajo.
 *
 * El perfil `gate-25k` existe por eso: 100.000 entidades tres veces no caben en
 * el presupuesto por spec, y 25.000 sí con margen de sobra. El perfil
 * `reference-100k` se juzga con EL MISMO evaluador desde el script, así que el
 * número de CI y el de la evidencia publicada no pueden divergir de criterio.
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

/**
 * Se REPITE LA MEDIDA, nunca la aserción.
 *
 * Esta técnica no es mía: la demostró T11 en #65 sobre este mismo repositorio,
 * y su aritmética es la razón por la que hace falta aquí. El ruido de
 * planificación es ABSOLUTO —una pausa del recolector cuesta lo mismo a
 * cualquier medida— pero el coste real de este pipeline es pequeño, así que un
 * hipo de 5 ms apenas mueve un número de 70 ms y DUPLICA uno de 6 ms. Con los
 * cuatro núcleos saturados, ninguna estadística salva una medida de reloj de
 * pared tomada una sola vez: lo midieron, 5 de 12 corridas caían.
 *
 * Repetir la medida y juzgar la MEDIANA es distinto de reintentar la aserción.
 * Reintentar la aserción esconde una regresión real —basta con que una de tres
 * corridas pase—; la mediana exige que la MAYORÍA de las corridas estén dentro
 * del presupuesto, así que un pipeline de verdad más lento sigue cayendo.
 *
 * Y la separación importa: las INVARIANTES no se medianizan. No dependen del
 * reloj, así que se exigen en TODAS las corridas — que es más estricto que
 * exigirlas en una.
 */
const GATE_RUNS = 3;
const runs = Array.from({ length: GATE_RUNS }, () => runProfile(gate));
const host = {
  logicalCpuCount: os.cpus().length,
  totalMemoryBytes: os.totalmem(),
  exposedGc: typeof (globalThis as { gc?: () => void }).gc === "function",
};

// Invariantes: en TODAS las corridas.
for (const [index, run] of runs.entries()) {
  const invariantVerdict = evaluateCadRenderBudget(run, gate, host, run.fullView);
  const invariantViolations = blockingCadRenderViolations(invariantVerdict).filter(
    (violation) => violation.kind === "invariant",
  );
  assert.deepEqual(
    invariantViolations.map((violation) => violation.message),
    [],
    `Corrida ${index + 1}/${GATE_RUNS}: el pipeline rompió una INVARIANTE. Esto no es ruido de reloj.`,
  );
}

// Tiempos: la corrida MEDIANA por firstDetailMs.
const measured = [...runs].sort(
  (left, right) => left.next.firstDetailMs - right.next.firstDetailMs,
)[Math.floor((runs.length - 1) / 2)];
const verdict = evaluateCadRenderBudget(measured, gate, host, measured.fullView);
console.log(
  `muestras firstDetailMs: [${runs.map((run) => run.next.firstDetailMs).join(" · ")}] → mediana ${measured.next.firstDetailMs}`,
);
console.log(
  `muestras panFrameP95Ms: [${runs.map((run) => run.next.panFrameP95Ms).join(" · ")}]`,
);
console.log(formatCadRenderVerdict(verdict));

const blocking = blockingCadRenderViolations(verdict);
assert.deepEqual(
  blocking.map((violation) => violation.message),
  [],
  `El pipeline de render incumple su línea base versionada.\n${formatCadRenderVerdict(verdict)}\n` +
    `Si el cambio es intencionado y MEJORA los números, recalibra con:\n` +
    `  npm run benchmark:cad:baseline --workspace=web -- --write\n` +
    `y deja el diff del manifiesto delante de quien revise.`,
);

console.log(
  `ok CAD render gate: ${gate.id} · ${measured.entities} entidades · ` +
    `firstDetail ${measured.next.firstDetailMs} ms (tope ${gate.budgets.nextFirstDetailMs}) · ` +
    `panP95 ${measured.next.panFrameP95Ms} ms (tope ${gate.budgets.nextPanFrameP95Ms}) · ` +
    `detalladas ${measured.fullView.next.detailedAtRest} frente a ${measured.fullView.legacy.detailedAtRest} del camino anterior`,
);
