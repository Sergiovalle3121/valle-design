/**
 * Una pestaña no puede desalojar ni suplantar el borrador de otra.
 *
 * El journal se indexaba sólo por ámbito (tenant, usuario, dibujo). Dos
 * pestañas abiertas sobre el mismo dibujo compartían los tres huecos que se
 * conservan, así que la que guardaba más a menudo borraba los checkpoints de la
 * otra; y al recuperar se devolvía el más reciente por reloj, que podía ser el
 * de la ventana equivocada.
 *
 * Ambas reglas vivían dentro de funciones que abren IndexedDB, que en Node no
 * existe: no había forma de probarlas fuera de un E2E. Ahora son puras.
 */
import { strict as assert } from "node:assert";
import {
  LEGACY_LANE,
  MAX_CHECKPOINTS_PER_LANE,
  MAX_GLOBAL_CHECKPOINTS,
  MAX_RECOVERY_AGE_MS,
  orderCadRecoveryCandidates,
  planCadRecoveryPrune,
} from "./cad-recovery-journal";

const SCOPE = "cad-recovery-v1:t:u:-:-:PLANTA:A";
const NOW = 1_760_000_000_000;

/** Checkpoint sintético: carril, antigüedad en segundos y ámbito opcional. */
const at = (lane: string | undefined, secondsAgo: number, scopeKey = SCOPE) => ({
  key: `${scopeKey}:${lane ?? "sin-carril"}:${secondsAgo}`,
  scopeKey,
  savedAtMs: NOW - secondsAgo * 1_000,
  ...(lane === undefined ? {} : { lane }),
});

/* ── EL DEFECTO: la pestaña activa no puede vaciar el carril de la otra ─── */
{
  // A guarda cada pocos segundos; B lleva un rato con trabajo sin confirmar.
  const tabA = [at("A", 1), at("A", 5), at("A", 9), at("A", 13), at("A", 17)];
  const tabB = [at("B", 40), at("B", 80)];
  const removed = new Set(planCadRecoveryPrune([...tabA, ...tabB], { now: NOW }));

  for (const record of tabB) {
    assert.equal(
      removed.has(record.key),
      false,
      "el trabajo sin confirmar de la otra pestaña no puede desaparecer porque ésta guarde más rápido",
    );
  }
  // Y la propia pestaña sigue acotada a sus tres huecos.
  const keptFromA = tabA.filter((record) => !removed.has(record.key));
  assert.equal(keptFromA.length, MAX_CHECKPOINTS_PER_LANE);
  assert.deepEqual(
    keptFromA.map((record) => record.key),
    tabA.slice(0, MAX_CHECKPOINTS_PER_LANE).map((record) => record.key),
    "de cada carril se conservan los MÁS RECIENTES",
  );
}

/* ── La edad sigue mandando, carril propio incluido ──────────────────────── */
{
  const fresh = at("A", 10);
  const ancient = {
    ...at("A", 0),
    key: "viejo",
    savedAtMs: NOW - MAX_RECOVERY_AGE_MS - 1,
  };
  const broken = { ...at("A", 0), key: "roto", savedAtMs: Number.NaN };
  const removed = new Set(planCadRecoveryPrune([fresh, ancient, broken], { now: NOW }));
  assert.equal(removed.has("viejo"), true, "pasada una semana deja de ofrecerse");
  assert.equal(removed.has("roto"), true, "una marca de tiempo ilegible no se conserva");
  assert.equal(removed.has(fresh.key), false);
}

/* ── Modo cuota agotada: un hueco por carril, no un carril superviviente ── */
{
  const entries = [at("A", 1), at("A", 5), at("B", 3), at("B", 9)];
  const removed = new Set(planCadRecoveryPrune(entries, { now: NOW, aggressive: true }));
  const kept = entries.filter((record) => !removed.has(record.key));
  assert.deepEqual(
    kept.map((record) => record.key).sort(),
    [at("A", 1).key, at("B", 3).key].sort(),
    "bajo presión de cuota cada pestaña conserva su último checkpoint, no sólo la más rápida",
  );
}

/* ── El tope global se reparte por rondas, no por reloj ──────────────────── */
{
  // Una pestaña frenética en muchos dibujos, más una lenta con algo reciente.
  const noisy = Array.from({ length: MAX_GLOBAL_CHECKPOINTS + 10 }, (_, index) =>
    at("A", index, `${SCOPE}-${index % 12}`),
  );
  const slow = at("B", 200, `${SCOPE}-lento`);
  const removed = new Set(planCadRecoveryPrune([...noisy, slow], { now: NOW }));
  assert.equal(
    removed.has(slow.key),
    false,
    "el tope global no puede quedarse sólo con la pestaña que más escribe: cada carril entra en la primera ronda",
  );
  const kept = [...noisy, slow].filter((record) => !removed.has(record.key));
  assert.ok(kept.length <= MAX_GLOBAL_CHECKPOINTS, "el journal sigue acotado");
}

/* ── Al recuperar manda el carril propio, no el reloj ────────────────────── */
{
  const mine = at("A", 30);
  const theirs = at("B", 1); // más reciente, pero de otra ventana
  const order = orderCadRecoveryCandidates([theirs, mine], "A");
  assert.equal(
    order[0].key,
    mine.key,
    "quien reabre su pestaña espera SU borrador, no el de una ventana que guardó un segundo más tarde",
  );
  assert.equal(order[1].key, theirs.key, "el de la otra pestaña sigue disponible como respaldo");
}

/* ── Dentro del carril propio, el más reciente primero ───────────────────── */
{
  const order = orderCadRecoveryCandidates([at("A", 50), at("A", 2), at("A", 20)], "A");
  assert.deepEqual(
    order.map((record) => record.savedAtMs),
    [NOW - 2_000, NOW - 20_000, NOW - 50_000],
  );
}

/* ── Los registros anteriores a los carriles siguen siendo recuperables ─── */
{
  const legacy = at(undefined, 10);
  assert.equal(legacy.lane, undefined, "el registro histórico no tiene carril");
  // Una pestaña con carril propio los ve como ajenos, pero los ve.
  assert.equal(orderCadRecoveryCandidates([legacy], "A")[0].key, legacy.key);
  // Y una pestaña sin sessionStorage cae al carril anónimo y los reclama.
  assert.equal(orderCadRecoveryCandidates([legacy], LEGACY_LANE)[0].key, legacy.key);
  assert.equal(
    planCadRecoveryPrune([legacy], { now: NOW }).length,
    0,
    "no se podan por el mero hecho de no llevar carril",
  );
}

/* ── Ámbitos distintos no se estorban ────────────────────────────────────── */
{
  const other = at("A", 1, "cad-recovery-v1:t:u:-:-:OTRO:A");
  const here = Array.from({ length: 5 }, (_, index) => at("A", index + 1));
  const removed = new Set(planCadRecoveryPrune([...here, other], { now: NOW }));
  assert.equal(removed.has(other.key), false, "otro dibujo tiene su propia cuenta");
}

console.log(
  "cad-recovery-journal: carril por pestaña, poda justa y preferencia por el borrador propio",
);
