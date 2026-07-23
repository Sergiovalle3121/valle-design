/** Baseline de rendimiento del CAD sobre un plano sintético (CAD-NEXT-050). */
import { strict as assert } from "node:assert";
import { serializeCadDocument, layoutToCadDocument } from "./cad-document";
import { buildSyntheticLayout, runCadPerfBaseline } from "./perf-baseline";

// --- el generador es determinista -------------------------------------------
const a = buildSyntheticLayout({ entities: 100, seed: 7 });
const b = buildSyntheticLayout({ entities: 100, seed: 7 });
assert.equal(
  serializeCadDocument(layoutToCadDocument(a.layout)),
  serializeCadDocument(layoutToCadDocument(b.layout)),
  "misma semilla → mismo plano, byte a byte",
);
const c = buildSyntheticLayout({ entities: 100, seed: 8 });
assert.notEqual(
  serializeCadDocument(layoutToCadDocument(a.layout)),
  serializeCadDocument(layoutToCadDocument(c.layout)),
  "otra semilla → otro plano",
);
assert.ok(a.layout.assets?.some((x) => x.shape === "circle"), "el plano sintético incluye círculos");
assert.ok(a.layout.assets?.some((x) => !x.shape), "y cajas rectangulares");

// --- baseline a 1500 entidades ----------------------------------------------
const result = runCadPerfBaseline({ entities: 1500 });

// Sanidad estructural: todo el trabajo se hizo de verdad.
assert.equal(result.entities, 1500, "1500 assets generados");
assert.ok(result.documentEntities >= 1500, "el documento contiene todas las entidades");
assert.ok(result.serializedBytes > 100_000, "el serializado tiene tamaño real");
assert.equal(result.dxfEntityCount, 1500, "el DXF emite las 1500 geometrías");
assert.equal(
  result.dxfReimportedPrimitives,
  1500,
  "el round-trip DXF recupera las 1500 primitivas",
);
// La rejilla evita solapes: las reglas corren el barrido completo sin ruido.
assert.equal(result.ruleFindings, 0, "plano sintético limpio → 0 hallazgos");

// Cotas holgadas anti-flaky (el hardware de CI varía): ninguna fase debe
// dispararse a decenas de segundos para 1500 entidades.
for (const [phase, ms] of Object.entries(result.timings)) {
  assert.ok(ms >= 0 && ms < 30_000, `${phase} en rango sano (${ms} ms)`);
}

// Registrar los números en la salida de CI: el baseline queda documentado.
console.log(
  `cad perf baseline (1500 entidades): adapt ${result.timings.adaptMs} ms · ` +
    `serialize ${result.timings.serializeMs} ms · rules ${result.timings.rulesMs} ms · ` +
    `dxf-export ${result.timings.dxfExportMs} ms · dxf-import ${result.timings.dxfImportMs} ms · ` +
    `total ${result.timings.totalMs} ms · ${Math.round(result.serializedBytes / 1024)} KiB`,
);
console.log("cad perf-baseline specs passed");
