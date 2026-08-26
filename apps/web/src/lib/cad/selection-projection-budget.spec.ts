import assert from "node:assert/strict";
import {
  CAD_SELECTION_PROJECTION_LIMIT,
  planCadSelectionProjection,
} from "./selection-projection-budget";

// Selección chica: se proyecta entera, con clave ordenada y estable.
{
  const plan = planCadSelectionProjection(new Set(["b", "a"]));
  assert.equal(plan.suppressed, false);
  assert.deepEqual([...plan.projected].sort(), ["a", "b"]);
  assert.equal(plan.key, "a|b");
  const again = planCadSelectionProjection(new Set(["a", "b"]));
  assert.equal(plan.key, again.key, "el orden de inserción no cambia la clave");
}

// En el límite exacto: todavía se proyecta.
{
  const ids = new Set(
    Array.from({ length: CAD_SELECTION_PROJECTION_LIMIT }, (_, i) => `e${i}`),
  );
  const plan = planCadSelectionProjection(ids);
  assert.equal(plan.suppressed, false);
  assert.equal(plan.projected.size, CAD_SELECTION_PROJECTION_LIMIT);
}

// Una entidad por encima del límite: proyección suprimida, clave constante y
// barata (no ordena cien mil ids), y la selección ORIGINAL queda intacta.
{
  const ids = new Set(
    Array.from({ length: CAD_SELECTION_PROJECTION_LIMIT + 1 }, (_, i) => `e${i}`),
  );
  const plan = planCadSelectionProjection(ids);
  assert.equal(plan.suppressed, true);
  assert.equal(plan.projected.size, 0);
  assert.equal(plan.key, `suppressed:${CAD_SELECTION_PROJECTION_LIMIT + 1}`);
  assert.equal(ids.size, CAD_SELECTION_PROJECTION_LIMIT + 1);
}

// Límite explícito distinto (el editor podría exponerlo como preferencia).
{
  const plan = planCadSelectionProjection(new Set(["a", "b", "c"]), 2);
  assert.equal(plan.suppressed, true);
  assert.equal(plan.projected.size, 0);
}

// A escala 100k la decisión es O(1) en la práctica: la clave suprimida no
// serializa los ids (una clave ordenada de 100k ids costaría decenas de ms).
{
  const ids = new Set(Array.from({ length: 100_000 }, (_, i) => `d${i}`));
  const started = performance.now();
  const plan = planCadSelectionProjection(ids);
  const elapsed = performance.now() - started;
  assert.equal(plan.suppressed, true);
  assert.ok(elapsed < 50, `planificar 100k tardó ${elapsed.toFixed(1)} ms`);
}

console.log("selection-projection-budget.spec OK");
