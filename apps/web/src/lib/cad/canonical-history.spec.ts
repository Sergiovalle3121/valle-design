/**
 * El presupuesto de la historia acota la PROFUNDIDAD, nunca el último paso.
 *
 * Regresión COMMERCIAL-RC1 (fase moveMassive del estrés denso): un documento
 * de 100.000 entidades estima ~51 MB y el presupuesto retenido era de 32 MB —
 * `enforceBudget` expulsaba la entrada RECIÉN grabada, `recordCurrent`
 * devolvía `false` que nadie miraba, y «mover las 100.000» se aplicaba SIN
 * dejar paso de deshacer, en silencio. Este spec fija el suelo de seguridad
 * de datos: el último checkpoint se retiene aunque él solo exceda el
 * presupuesto; el techo sigue gobernando cuántos pasos MÁS se conservan.
 */
import assert from "node:assert/strict";
import { CanonicalHistory } from "./canonical-history";

const big = (tag: string) => ({ tag, blob: "x".repeat(1_000) });

// 1 · Una entrada que por sí sola excede el presupuesto SE RETIENE.
{
  const history = new CanonicalHistory(big("base"), {
    maxEntries: 80,
    maxRetainedBytes: 100, // presupuesto ridículo a propósito
  });
  const kept = history.recordCurrent(big("v1"));
  assert.equal(kept, true, "el último checkpoint nunca se expulsa");
  assert.deepEqual(history.depths(), { undo: 1, redo: 0 });
  const undone = history.undo(big("v2"));
  assert.equal(
    (undone as { tag: string }).tag,
    "v1",
    "deshacer devuelve el estado retenido",
  );
}

// 2 · El presupuesto SIGUE acotando la profundidad: con dos entradas grandes
// sobrevive sólo la más reciente.
{
  const history = new CanonicalHistory(big("base"), {
    maxEntries: 80,
    maxRetainedBytes: 100,
  });
  history.recordCurrent(big("v1"));
  history.recordCurrent(big("v2"));
  assert.deepEqual(
    history.depths(),
    { undo: 1, redo: 0 },
    "la entrada vieja se expulsa; la última queda",
  );
}

// 3 · maxEntries intacto con entradas pequeñas.
{
  const history = new CanonicalHistory(
    { n: 0 },
    { maxEntries: 3, maxRetainedBytes: 32 * 1024 * 1024 },
  );
  for (let n = 1; n <= 10; n += 1) history.recordCurrent({ n });
  assert.deepEqual(history.depths(), { undo: 3, redo: 0 });
}

console.log("canonical-history.spec: el último paso de deshacer nunca se pierde");
