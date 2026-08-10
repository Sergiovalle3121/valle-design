/**
 * El presupuesto de viewport se comprueba a sí mismo.
 *
 * `cad-viewport-100k.spec.ts` sólo corre con `CAD_PERF_E2E=1` y necesita un
 * navegador; este spec corre siempre dentro de `npm test`. Lo que vigila no es
 * el rendimiento —eso lo mide el otro— sino que el MANIFIESTO no mienta:
 *
 * - que ningún presupuesto bloqueante esté por debajo de la peor corrida de su
 *   propia calibración, que es como nace un gate intermitente;
 * - que el objetivo sea SIEMPRE al menos tan exigente como el gate, porque un
 *   «objetivo» más flojo que lo que ya se exige no es un objetivo;
 * - que el suelo de fidelidad no baje nunca de lo observado — es un trinquete,
 *   y bajarlo sería volver a bendecir el muestreo por la puerta de atrás.
 */
import assert from "node:assert/strict";
import {
  CAD_VIEWPORT_BASELINE,
  evaluateCadViewportExperience,
  findCadViewportProfile,
  formatCadViewportVerdict,
} from "./viewport-budget";

assert.equal(CAD_VIEWPORT_BASELINE.schemaVersion, 1);
assert.equal(CAD_VIEWPORT_BASELINE.profiles.length, 2);

const TIMING_KEYS = [
  "canonicalReadyMs",
  "detailReadyMs",
  "frameLatencyMs",
  "zoomReplanMs",
  "zoomSettleMs",
] as const;

/** Nombre de la métrica observada que corresponde a cada presupuesto. */
const OBSERVED_KEY: Record<(typeof TIMING_KEYS)[number], string> = {
  canonicalReadyMs: "canonicalReadyMs",
  detailReadyMs: "detailReadyMs",
  frameLatencyMs: "frameLatencyMs",
  zoomReplanMs: "zoomReplanMs",
  zoomSettleMs: "zoomSettleMs",
};

for (const profile of CAD_VIEWPORT_BASELINE.profiles) {
  assert.ok(profile.calibration.runs >= 3, `${profile.id}: menos de 3 corridas`);
  assert.ok(profile.calibration.marginFactor >= 1.5, `${profile.id}: margen justo`);
  assert.ok(
    profile.targetBlockedBy.length > 10,
    `${profile.id}: un objetivo sin dueño es una lista de deseos`,
  );
  assert.ok(
    Object.keys(profile.calibration.environment).length > 0,
    `${profile.id}: un número sin su máquina no es una línea base`,
  );
  assert.ok(
    profile.calibratedProjects.length > 0,
    `${profile.id}: sin proyectos calibrados, el gate no sabe dónde puede morder`,
  );

  for (const key of TIMING_KEYS) {
    const gate = profile.gate[key];
    const target = profile.target[key];
    // Los dos niveles tienen que hablar de las MISMAS métricas: un objetivo con
    // `null` donde el gate tiene número escondería la brecha en vez de medirla.
    assert.equal(
      gate === null,
      target === null,
      `${profile.id}/${key}: gate y objetivo no coinciden en si la métrica existe`,
    );
    if (gate === null || target === null) continue;
    assert.ok(
      target <= gate,
      `${profile.id}/${key}: el objetivo (${target}) es MÁS FLOJO que el gate (${gate})`,
    );
    const samples = profile.calibration.observed[OBSERVED_KEY[key]] ?? [];
    assert.ok(samples.length > 0, `${profile.id}/${key}: sin muestras de calibración`);
    assert.ok(
      gate >= Math.max(...samples),
      `${profile.id}/${key}: gate ${gate} por debajo de la peor corrida ${Math.max(...samples)}; así nace un gate intermitente`,
    );
  }

  for (const key of ["minDetailedFractionAtOpen", "minDetailedFractionAfterZoom"] as const) {
    const gate = profile.gate[key];
    const target = profile.target[key];
    assert.ok(gate >= 0 && gate <= 1, `${profile.id}/${key}: fracción fuera de [0,1]`);
    // Al revés que los tiempos: aquí MÁS es mejor, así que el objetivo debe ser
    // mayor o igual que el suelo del gate.
    assert.ok(
      target >= gate,
      `${profile.id}/${key}: el objetivo (${target}) pide MENOS fidelidad que el gate (${gate})`,
    );
  }
}

// El objetivo declarado tiene que ser fidelidad TOTAL en los dos perfiles. Si
// alguien lo bajara, el gate podría subir hasta él y el muestreo volvería a
// estar bendecido — que es exactamente el defecto del presupuesto anterior.
for (const profile of CAD_VIEWPORT_BASELINE.profiles)
  assert.equal(
    profile.target.minDetailedFractionAtOpen,
    1,
    `${profile.id}: el objetivo de fidelidad al abrir tiene que ser 1,0`,
  );

const large = findCadViewportProfile("viewport-100k");
assert.ok(large);

// ANCLA ABSOLUTA sobre el defecto que este trabajo vino a quitar: el
// presupuesto anterior exigía `initialRendered <= 2.500`, un TECHO. Se
// comprueba que dibujar TODO lo visible ya no incumple nada.
const perfect = evaluateCadViewportExperience(
  {
    canonicalReadyMs: 1,
    detailReadyMs: 1,
    frameLatencyMs: 1,
    zoomReplanMs: 1,
    zoomSettleMs: 1,
    visibleAtOpen: 100_000,
    detailedAtOpen: 100_000,
    visibleAfterZoom: 68_200,
    detailedAfterZoom: 68_200,
  },
  large,
);
assert.deepEqual(
  perfect.gateViolations,
  [],
  "dibujar las 100.000 entidades visibles NO puede incumplir el presupuesto; el techo de 2.500 lo hacía",
);
assert.deepEqual(perfect.targetGaps, [], "con fidelidad 1,0 y tiempos ideales no queda brecha");
assert.equal(perfect.detailedFractionAtOpen, 1);

// Y el muestreo de hoy sí produce brecha: 2.500 de 100.000 no alcanza el
// objetivo, y eso tiene que salir impreso en cada corrida.
const sampled = evaluateCadViewportExperience(
  {
    canonicalReadyMs: 1,
    detailReadyMs: 1,
    frameLatencyMs: 1,
    zoomReplanMs: 1,
    zoomSettleMs: 1,
    visibleAtOpen: 100_000,
    detailedAtOpen: 2_500,
    visibleAfterZoom: 68_200,
    detailedAfterZoom: 2_500,
  },
  large,
);
assert.deepEqual(sampled.gateViolations, [], "el muestreo de hoy no debe romper el gate");
assert.ok(
  sampled.targetGaps.some((gap) => gap.metric === "detailedFractionAtOpen"),
  "el muestreo de hoy TIENE que aparecer como brecha con el objetivo",
);

// En un proyecto NO calibrado los tiempos se registran y no bloquean, pero el
// suelo de fidelidad sigue bloqueando: cuántas entidades se dibujan no depende
// del navegador.
const slowUncalibrated = evaluateCadViewportExperience(
  {
    canonicalReadyMs: 10_000_000,
    detailReadyMs: 10_000_000,
    frameLatencyMs: 10_000,
    zoomReplanMs: 10_000_000,
    zoomSettleMs: 10_000_000,
    visibleAtOpen: 100_000,
    detailedAtOpen: 1_000,
    visibleAfterZoom: 68_200,
    detailedAfterZoom: 2_500,
  },
  large,
  "firefox",
);
assert.equal(slowUncalibrated.timingEnforcement, "report-only");
assert.ok(slowUncalibrated.timingDowngradeReason);
assert.ok(
  slowUncalibrated.reportedOnly.length >= 4,
  "los tiempos de un proyecto sin calibrar tienen que quedar REGISTRADOS, no desaparecer",
);
assert.deepEqual(
  slowUncalibrated.gateViolations.map((violation) => violation.metric),
  ["detailedFractionAtOpen"],
  "en un proyecto sin calibrar sólo bloquea la fidelidad",
);
assert.equal(
  evaluateCadViewportExperience(
    {
      canonicalReadyMs: 10_000_000,
      detailReadyMs: 10_000_000,
      frameLatencyMs: 10_000,
      zoomReplanMs: 10_000_000,
      zoomSettleMs: 10_000_000,
      visibleAtOpen: 100_000,
      detailedAtOpen: 2_500,
      visibleAfterZoom: 68_200,
      detailedAfterZoom: 2_500,
    },
    large,
    "chromium",
  ).timingEnforcement,
  "blocking",
  "en el proyecto calibrado los tiempos SÍ bloquean",
);

// Menos fidelidad que la observada sí rompe: el suelo es un trinquete.
const worse = evaluateCadViewportExperience(
  {
    canonicalReadyMs: 1,
    detailReadyMs: 1,
    frameLatencyMs: 1,
    zoomReplanMs: 1,
    zoomSettleMs: 1,
    visibleAtOpen: 100_000,
    detailedAtOpen: 1_000,
    visibleAfterZoom: 68_200,
    detailedAfterZoom: 2_500,
  },
  large,
);
assert.ok(
  worse.gateViolations.some((violation) => violation.metric === "detailedFractionAtOpen"),
  "dibujar MENOS que la línea base tiene que romper el gate",
);

console.log(
  `ok CAD viewport budget: ${CAD_VIEWPORT_BASELINE.profiles.length} perfiles · ` +
    `suelo de fidelidad 10k ${findCadViewportProfile("viewport-10k")!.gate.minDetailedFractionAtOpen} · ` +
    `100k ${large.gate.minDetailedFractionAtOpen} (objetivo ${large.target.minDetailedFractionAtOpen})\n` +
    formatCadViewportVerdict(sampled),
);
