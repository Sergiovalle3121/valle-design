/**
 * Borrar recuperación es la operación más peligrosa del journal: lo que se
 * borra aquí no está en ningún otro sitio.
 *
 * Había una sola función, `clearCadRecovery(scope)`, y borraba TODO el ámbito.
 * La usaban cuatro sitios con intenciones distintas:
 *
 *   · un guardado que salió bien       → «lo mío ya está en el servidor»
 *   · descartar el borrador ofrecido   → «no quiero ESTE borrador»
 *   · la versión base no coincide      → «esto no es de esta versión»
 *
 * Las tres borraban lo mismo: el ámbito entero, todos los carriles. Guardar en
 * la pestaña A destruía los checkpoints de la pestaña B, que ni siquiera había
 * guardado. Y el tercer caso borraba justo lo que más valía: un borrador local
 * que diverge de lo que el servidor tiene ahora es una RAMA, no basura.
 *
 * Estos specs describen las decisiones puras: qué claves se borran y cómo se
 * clasifica un candidato. La ejecución en IndexedDB las aplica.
 */
import { strict as assert } from "node:assert";
import {
  MAX_GLOBAL_CHECKPOINTS,
  classifyCadRecoveryCandidate,
  planCadRecoveryLaneClear,
  planCadRecoveryPrune,
  type CadRecoveryJournalEntry,
} from "./cad-recovery-journal";

const SCOPE = "cad-recovery-v1:t:u:-:-:m:r";
const OTHER_SCOPE = "cad-recovery-v1:t:u:-:-:otro:r";

function entry(
  lane: string,
  savedAtMs: number,
  editGeneration?: number,
  scopeKey = SCOPE,
): CadRecoveryJournalEntry {
  return {
    key: `${scopeKey}:l:${lane}:g:${editGeneration ?? "-"}:${savedAtMs}`,
    scopeKey,
    lane,
    savedAtMs,
    ...(editGeneration === undefined ? {} : { editGeneration }),
  };
}

// ---------------------------------------------------------------------------
// 1. Un guardado sólo puede borrar checkpoints DE SU CARRIL
// ---------------------------------------------------------------------------

{
  const journal = [
    entry("tab-A", 1_000, 5),
    entry("tab-A", 2_000, 7),
    entry("tab-B", 1_500, 4),
    entry("tab-B", 2_500, 9),
  ];
  // La pestaña A guarda su generación 7.
  const removed = planCadRecoveryLaneClear(journal, SCOPE, "tab-A", 7);
  assert.deepEqual(
    removed.sort(),
    [journal[0].key, journal[1].key].sort(),
    "un guardado borra sus propios checkpoints confirmados",
  );
  for (const key of removed)
    assert.ok(
      !key.includes("tab-B"),
      "guardar en una pestaña NUNCA puede tocar el carril de otra",
    );
}

// ---------------------------------------------------------------------------
// 2. Un checkpoint que capturó una edición POSTERIOR al guardado sobrevive
// ---------------------------------------------------------------------------

{
  // El guardado confirma la generación 7. Mientras estaba en vuelo alguien
  // siguió dibujando y la cola escribió un checkpoint de la generación 8.
  const journal = [
    entry("tab-A", 1_000, 6),
    entry("tab-A", 2_000, 7),
    entry("tab-A", 3_000, 8),
  ];
  const removed = planCadRecoveryLaneClear(journal, SCOPE, "tab-A", 7);
  assert.deepEqual(
    removed.sort(),
    [journal[0].key, journal[1].key].sort(),
    "sólo se borra hasta la generación que el servidor confirmó",
  );
  assert.ok(
    !removed.includes(journal[2].key),
    "la edición posterior al guardado sigue teniendo su red de seguridad",
  );
}

// ---------------------------------------------------------------------------
// 3. Un checkpoint que TERMINA después del guardado no resucita un estado viejo
// ---------------------------------------------------------------------------

{
  // Carrera: la escritura del checkpoint de la generación 6 se confirma DESPUÉS
  // de que el guardado de la 7 haya borrado. Su reloj es el más nuevo del
  // carril, así que por fecha sería el candidato preferido — pero su contenido
  // es anterior a lo que el servidor ya tiene.
  const late = entry("tab-A", 9_999, 6);
  assert.equal(
    classifyCadRecoveryCandidate(late, { serverVersion: 3, savedGeneration: 7 }),
    "confirmed",
    "un checkpoint cuya generación ya está guardada no es trabajo pendiente, por muy reciente que sea su reloj",
  );
}

// ---------------------------------------------------------------------------
// 4. Un borrador basado en vN NO es basura porque el servidor esté en vN+1
// ---------------------------------------------------------------------------

{
  const local = { savedAtMs: 5_000, baseCadDocumentVersion: 4, editGeneration: 12 };
  assert.equal(
    classifyCadRecoveryCandidate(local, { serverVersion: 4, savedGeneration: 3 }),
    "current",
    "misma versión base y trabajo sin guardar: es el borrador de esta versión",
  );
  assert.equal(
    classifyCadRecoveryCandidate(local, { serverVersion: 5, savedGeneration: 3 }),
    "divergent",
    "el servidor avanzó por su cuenta: esto es una RAMA local, no basura que borrar",
  );
  assert.equal(
    classifyCadRecoveryCandidate(local, { serverVersion: 99, savedGeneration: 3 }),
    "divergent",
    "por muchas versiones que haya avanzado el servidor, el trabajo local sigue siendo trabajo",
  );
}

// ---------------------------------------------------------------------------
// 4-bis. Un borrador HEREDADO, sin generación, se sigue ofreciendo
// ---------------------------------------------------------------------------

{
  // Al abrir un documento la generación guardada arranca en 0. Si la ausencia
  // de `editGeneration` se leyese como «generación 0», TODO borrador escrito
  // antes de que el campo existiera se daría por confirmado y dejaría de
  // ofrecerse: los usuarios con un borrador pendiente lo perderían de vista al
  // actualizar. Sin dato se decide por versión, como se decidía antes.
  const inherited = { baseCadDocumentVersion: 4 };
  assert.equal(
    classifyCadRecoveryCandidate(inherited, { serverVersion: 4, savedGeneration: 0 }),
    "current",
    "un borrador heredado sobre la versión vigente se sigue ofreciendo",
  );
  assert.equal(
    classifyCadRecoveryCandidate(inherited, { serverVersion: 9, savedGeneration: 0 }),
    "divergent",
    "y si el servidor avanzó, se ofrece como rama divergente",
  );
}

// ---------------------------------------------------------------------------
// 5. Descartar explícitamente borra ese registro y los anteriores del carril
// ---------------------------------------------------------------------------

{
  const journal = [
    entry("tab-A", 1_000, 2),
    entry("tab-A", 2_000, 4),
    entry("tab-A", 3_000, 6),
    entry("tab-B", 2_000, 4),
  ];
  const removed = planCadRecoveryLaneClear(journal, SCOPE, "tab-A", 4);
  assert.deepEqual(
    removed.sort(),
    [journal[0].key, journal[1].key].sort(),
    "descartar el borrador ofrecido se lleva ese y los más viejos del carril",
  );
  assert.ok(
    !removed.includes(journal[2].key),
    "pero no un checkpoint más nuevo que nadie ha visto todavía",
  );
}

// ---------------------------------------------------------------------------
// 6. Otro ámbito nunca se toca
// ---------------------------------------------------------------------------

{
  const journal = [entry("tab-A", 1_000, 5), entry("tab-A", 1_000, 5, OTHER_SCOPE)];
  const removed = planCadRecoveryLaneClear(journal, SCOPE, "tab-A", 9);
  assert.deepEqual(removed, [journal[0].key], "otro dibujo es otro ámbito");
}

// ---------------------------------------------------------------------------
// 7. Registros heredados sin generación: confirmados sólo dentro de su carril
// ---------------------------------------------------------------------------

{
  const journal = [entry("tab-A", 1_000), entry("tab-B", 1_000)];
  const removed = planCadRecoveryLaneClear(journal, SCOPE, "tab-A", 0);
  assert.deepEqual(
    removed,
    [journal[0].key],
    "un registro previo a las generaciones se da por confirmado por el guardado de SU carril, y sólo de él",
  );
}

// ---------------------------------------------------------------------------
// 8. Un guardado no puede dar por salvado el borrador de una sesión ANTERIOR
// ---------------------------------------------------------------------------

{
  // Las generaciones se reinician al abrir un documento. El borrador que quedó
  // de la sesión de ayer lleva la generación 2; esta sesión guarda la 5. Sin
  // acotar por tiempo, ese 2 <= 5 lo daría por confirmado y lo borraría — y su
  // contenido no ha estado nunca en el servidor.
  const yesterday = entry("tab-A", 1_000, 2);
  const today = entry("tab-A", 9_000, 5);
  const sessionStartedAt = 8_000;

  assert.deepEqual(
    planCadRecoveryLaneClear(
      [yesterday, today],
      SCOPE,
      "tab-A",
      5,
      sessionStartedAt,
    ),
    [today.key],
    "sólo se confirma lo que ESTA sesión escribió",
  );
  assert.deepEqual(
    planCadRecoveryLaneClear([yesterday, today], SCOPE, "tab-A", 5),
    [yesterday.key, today.key],
    "sin acotar por sesión el borrador de ayer se perdería",
  );
}

// ---------------------------------------------------------------------------
// 9. La poda global conserva como mínimo el checkpoint reciente de cada carril
// ---------------------------------------------------------------------------

{
  // Muchos más carriles que el tope global: una pestaña que abre y cierra
  // ventanas no puede dejar a ninguna sin su última red de seguridad.
  const laneCount = MAX_GLOBAL_CHECKPOINTS + 6;
  const journal: CadRecoveryJournalEntry[] = [];
  for (let lane = 0; lane < laneCount; lane += 1)
    journal.push(entry(`lane-${String(lane).padStart(3, "0")}`, 1_000 + lane, lane));

  const removed = new Set(planCadRecoveryPrune(journal, { now: 2_000 }));
  const survivorsByLane = new Set(
    journal.filter((item) => !removed.has(item.key)).map((item) => item.lane),
  );
  assert.equal(
    survivorsByLane.size,
    laneCount,
    "el tope global no puede dejar un carril entero sin su checkpoint más reciente",
  );
}

console.log(
  "cad-recovery lane-clear: borrar es por carril y por generación, y un borrador divergente no se tira",
);
