/**
 * P0-2 · precisión float32 con coordenadas grandes (UTM), convertida de sonda
 * a gate: antes del origen flotante de escena, el error medido a magnitud
 * 10⁷ era 0,375 unidades de dibujo (37,5 cm en metros UTM). El criterio del
 * backlog es ≤1e-3 a esa magnitud; este spec lo exige en CI en vez de dejarlo
 * en un JSON que nadie vuelve a mirar.
 */
import assert from "node:assert/strict";
import {
  CAD_LARGE_COORDINATE_MAGNITUDES,
  measureCadLargeCoordinatePrecisionSuite,
} from "./large-coordinate-precision";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

const CAD_LARGE_COORDINATE_ERROR_BUDGET = 1e-3;

const reports = measureCadLargeCoordinatePrecisionSuite();
assert.equal(reports.length, CAD_LARGE_COORDINATE_MAGNITUDES.length);

for (const report of reports) {
  assert.ok(
    report.maxAbsErrorDrawingUnits <= CAD_LARGE_COORDINATE_ERROR_BUDGET,
    `«${report.label}» (offset ${report.offset}): error ${report.maxAbsErrorDrawingUnits} supera el ` +
      `presupuesto de ${CAD_LARGE_COORDINATE_ERROR_BUDGET} unidades de dibujo`,
  );
  assert.equal(
    report.exportRoundTripError,
    0,
    `«${report.label}»: la exportación (float64 puro) no puede perder nada`,
  );
}
ok(
  true,
  `las ${reports.length} magnitudes (hasta ${reports[reports.length - 1]!.offset}) quedan dentro de ` +
    `${CAD_LARGE_COORDINATE_ERROR_BUDGET} unidades de error, y la exportación en 0`,
);

// El caso que justifica el arreglo: sin origen flotante, a 10⁷ el error medido
// era 0,375 — 375× el presupuesto. Ancla numérica para que este spec no pase
// «por casualidad» con un presupuesto que nadie ejercitó de verdad.
const worst = reports[reports.length - 1]!;
assert.equal(worst.offset, 10_000_000);
assert.ok(
  worst.maxAbsErrorDrawingUnits < 0.375,
  `a 10⁷ el error (${worst.maxAbsErrorDrawingUnits}) tiene que quedar muy por debajo del 0,375 medido ` +
    `antes del origen flotante, o el spec no estaría ejercitando el arreglo`,
);
ok(true, `a magnitud 10⁷ el error bajó a ${worst.maxAbsErrorDrawingUnits} unidades (antes, 0,375)`);

console.log(
  `large-coordinate-precision: ${checks} comprobaciones verdes — error máximo ` +
    `${Math.max(...reports.map((report) => report.maxAbsErrorDrawingUnits))} unidades en las ` +
    `${reports.length} magnitudes medidas, exportación en 0 en todas.`,
);
