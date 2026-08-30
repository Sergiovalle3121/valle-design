/**
 * Normalización de barrido: equivalencia exacta con el bucle histórico en el
 * rango sano, y terminación acotada en el rango hostil que colgaba la pestaña.
 */
import { strict as assert } from "node:assert";
import { MAX_SWEEP_DEGREES, normalizeArcSweepDegrees } from "./arc-sweep";
import { tessellateArc } from "./curve-tessellate";

/** El bucle que este módulo sustituye, para el rango donde sí terminaba. */
function sweepConBucle(startDeg: number, endDeg: number): number {
  let sweep = endDeg - startDeg;
  while (sweep <= 0) sweep += 360;
  return sweep;
}

// --- equivalencia con el bucle en el rango sano ------------------------------
const casosSanos: Array<[number, number]> = [
  [0, 90], // barrido simple
  [315, 45], // cruza 0°
  [0, 360], // arco completo
  [0, 0], // barrido 0 → arco completo (convención DXF)
  [90, 90], // ídem, desde otro ángulo
  [360, 0], // -360 → arco completo
  [720, 0], // -720 → arco completo
  [180, -180.5], // negativo no múltiplo
  [0.25, -719.5], // dos vueltas negativas y fracción
  [0, 720], // más de una vuelta declarada: se conserva
  [-45, 400], // inicio negativo
];
for (const [start, end] of casosSanos) {
  assert.equal(
    normalizeArcSweepDegrees(start, end),
    sweepConBucle(start, end),
    `equivalencia con el bucle para (${start}, ${end})`,
  );
}

// --- terminación en el rango hostil ------------------------------------------
// -1e300 + 360 === -1e300 (360 queda bajo el ULP): el bucle no terminaba nunca.
const hostilNegativo = normalizeArcSweepDegrees(0, -1e300);
assert.ok(
  hostilNegativo > 0 && hostilNegativo <= 360,
  `un barrido de -1e300 normaliza a (0, 360], no cuelga: ${hostilNegativo}`,
);
const hostilPositivo = normalizeArcSweepDegrees(0, 1e300);
assert.equal(
  hostilPositivo,
  MAX_SWEEP_DEGREES,
  "un barrido de 1e300 se recorta al tope en vez de pedir 1e298 puntos",
);
for (const roto of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
  assert.ok(
    Number.isNaN(normalizeArcSweepDegrees(0, roto)),
    `ángulo no finito (${roto}) → NaN, que los consumidores convierten en teselación vacía`,
  );
}

// --- el consumidor real: el teselador ya no se cuelga ni estalla -------------
assert.deepEqual(
  tessellateArc({ x: 0, y: 0 }, 10, 0, Number.NaN, 24),
  [],
  "ángulo NaN → arco vacío (conducta previa, conservada)",
);
const arcoHostil = tessellateArc({ x: 0, y: 0 }, 10, 0, -1e300, 24);
assert.ok(
  arcoHostil.length >= 3 && arcoHostil.length <= 25,
  `el arco con fin -1e300 termina y produce un arco acotado (${arcoHostil.length} puntos)`,
);
const arcoGigante = tessellateArc({ x: 0, y: 0 }, 10, 0, 1e300, 24);
assert.ok(
  arcoGigante.length <= (MAX_SWEEP_DEGREES / 360) * 24 + 2,
  `el arco con fin 1e300 queda acotado por el tope (${arcoGigante.length} puntos)`,
);

console.log("cad arc-sweep specs passed");
