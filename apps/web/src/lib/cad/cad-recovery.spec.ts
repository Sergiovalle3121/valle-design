import assert from "node:assert/strict";
import test from "node:test";
import {
  cadRecoveryScopeKey,
  CadRecoveryBlockedError,
  matchesCadRecoveryDocument,
  openDatabaseRequestSettled,
  stampCadRecoveryEntry,
  type OpenDatabaseRequestLike,
} from "./cad-recovery";
import { orderCadRecoveryCandidates } from "./cad-recovery-journal";

const base = {
  tenantId: "tenant-a",
  userId: "user-a",
  buildingId: "building-a",
  projectId: "project-a",
  model: "AX:1000",
  revision: "A/1",
};

test("builds a stable encoded recovery key", () => {
  assert.equal(cadRecoveryScopeKey(base), cadRecoveryScopeKey({ ...base }));
  assert.match(cadRecoveryScopeKey(base), /AX%3A1000/);
  assert.match(cadRecoveryScopeKey(base), /A%2F1/);
});

test("isolates recovery by tenant, user, workspace and drawing identity", () => {
  const original = cadRecoveryScopeKey(base);
  for (const change of [
    { tenantId: "tenant-b" },
    { userId: "user-b" },
    { buildingId: "building-b" },
    { projectId: "project-b" },
    { model: "AX-2000" },
    { revision: "B" },
  ]) {
    assert.notEqual(cadRecoveryScopeKey({ ...base, ...change }), original);
  }
});

/**
 * T-75(c): sin `onblocked`, un `indexedDB.open` con versión nueva no
 * dispara ni `onsuccess` ni `onerror` mientras otra pestaña tenga abierta
 * la versión anterior — la promesa se queda sin asentar PARA SIEMPRE. Node
 * no tiene `indexedDB` (ni este repo trae un polyfill), así que la prueba
 * construye la forma mínima que `openDatabaseRequestSettled` consume
 * (ver su interfaz) para disparar el `onblocked` que un navegador real
 * dispararía — es lo más cerca del defecto real que se puede probar sin
 * DOM ni un navegador.
 */
function fakeOpenRequest(): OpenDatabaseRequestLike {
  return {
    result: {} as IDBDatabase,
    error: null,
    onupgradeneeded: null,
    onsuccess: null,
    onerror: null,
    onblocked: null,
  };
}

test("T-75(c): onblocked rechaza con un error identificable, no cuelga la promesa", async () => {
  const request = fakeOpenRequest();
  const opening = openDatabaseRequestSettled(request);
  assert.ok(request.onblocked, "el cableado tiene que registrar un manejador onblocked");
  request.onblocked!();
  await assert.rejects(opening, CadRecoveryBlockedError);
});

test("T-75(c): el mensaje del bloqueo es un aviso legible, no un código interno", async () => {
  const request = fakeOpenRequest();
  const opening = openDatabaseRequestSettled(request);
  request.onblocked!();
  try {
    await opening;
    assert.fail("se esperaba que la apertura bloqueada rechazara");
  } catch (error) {
    assert.ok(error instanceof CadRecoveryBlockedError);
    assert.match((error as Error).message, /otra pestaña/iu);
    assert.doesNotMatch((error as Error).message, /\[object|undefined|NaN/iu);
  }
});

test("T-75(c): onsuccess llegando DESPUÉS del bloqueo no revienta (resolver un settled es un no-op)", async () => {
  const request = fakeOpenRequest();
  const opening = openDatabaseRequestSettled(request);
  request.onblocked!();
  await assert.rejects(opening, CadRecoveryBlockedError);
  // La otra pestaña cerró y el navegador retoma la apertura: no debe lanzar
  // ni cambiar el resultado ya asentado.
  assert.doesNotThrow(() => request.onsuccess!());
});

test("T-75(c): el camino feliz (sin bloqueo) sigue resolviendo con la base de datos", async () => {
  const request = fakeOpenRequest();
  const opening = openDatabaseRequestSettled(request);
  request.onsuccess!();
  const database = await opening;
  assert.equal(database, request.result);
});

/**
 * Revisión de T-72(h): el registro de emergencia que escribe la frontera de
 * error lleva el ÚLTIMO documento que viajó al servidor. Sellado con la hora
 * de la caída era el más nuevo de su carril —todo el orden del diario es por
 * `savedAtMs`— y se ponía por delante del checkpoint que la cola del editor
 * escribió después con ediciones sin guardar: `loadCadRecovery` devolvía el
 * documento rancio y el aviso ni se enseñaba. Sellado con la hora del
 * guardado que capturó, ese checkpoint sigue siendo el primero.
 */
const LANE = "lane-propio";
const SCOPE_KEY = cadRecoveryScopeKey(base);
const SAVED_AT_MS = 1_000;
const CRASHED_AT_MS = 2_000;
/** Checkpoint de la cola, escrito DESPUÉS del guardado y con ediciones nuevas. */
const laterCheckpoint = {
  key: `${SCOPE_KEY}:l:${LANE}:j:00000001:1500`,
  scopeKey: SCOPE_KEY,
  lane: LANE,
  savedAtMs: 1_500,
  journalSequence: 1,
  editGeneration: 7,
};

test("T-72(h) rev.: el registro de emergencia lleva la hora del guardado, no la de la caída", () => {
  const stamp = stampCadRecoveryEntry(
    [laterCheckpoint],
    SCOPE_KEY,
    LANE,
    { savedAtMs: SAVED_AT_MS },
    CRASHED_AT_MS,
  );
  assert.equal(stamp.savedAtMs, SAVED_AT_MS);
  assert.match(stamp.key, new RegExp(`:${SAVED_AT_MS}$`), "la clave termina en el sello estampado");
  const crash = { ...stamp, scopeKey: SCOPE_KEY, lane: LANE, editGeneration: 0 };
  const [first] = orderCadRecoveryCandidates([crash, laterCheckpoint], LANE);
  assert.equal(
    first.key,
    laterCheckpoint.key,
    "el checkpoint con ediciones sin guardar sigue siendo el que se ofrece primero",
  );
});

test("T-72(h) rev.: sin sello explícito manda el reloj de la escritura (los checkpoints de la cola no cambian)", () => {
  assert.equal(
    stampCadRecoveryEntry([laterCheckpoint], SCOPE_KEY, LANE, {}, CRASHED_AT_MS).savedAtMs,
    CRASHED_AT_MS,
  );
  // Un sello que no es un número no vale como override: cae al reloj.
  assert.equal(
    stampCadRecoveryEntry([], SCOPE_KEY, LANE, { savedAtMs: Number.NaN }, CRASHED_AT_MS).savedAtMs,
    CRASHED_AT_MS,
  );
});

test("T-72(h) rev.: la secuencia avanza sobre el MÁXIMO del carril propio, no sobre el más reciente por reloj", () => {
  // Tras el de emergencia (seq 2, sello viejo) el carril tiene 1 y 2; con el
  // «más reciente por reloj» (seq 1) el siguiente checkpoint repetiría el 2.
  const crash = { lane: LANE, journalSequence: 2 };
  const otherTab = { lane: "otra-pestana", journalSequence: 9 };
  assert.equal(
    stampCadRecoveryEntry([laterCheckpoint, crash, otherTab], SCOPE_KEY, LANE).journalSequence,
    3,
  );
  assert.equal(stampCadRecoveryEntry([], SCOPE_KEY, LANE).journalSequence, 1);
  assert.equal(
    stampCadRecoveryEntry([{ journalSequence: 4 }], SCOPE_KEY, "-").journalSequence,
    5,
    "los registros sin carril cuentan en el carril heredado",
  );
});

/**
 * Revisión de T-75(b): el editor escribe con el `projectId` del documento en
 * la clave y la pantalla de error del estudio no lo conoce (es lo que el
 * servidor no devolvió). Su búsqueda por clave exacta nunca coincidía, así
 * que el botón siempre decía «no hay ningún punto de recuperación».
 */
const documentScope = {
  tenantId: base.tenantId,
  userId: base.userId,
  model: base.model,
  revision: base.revision,
};

test("T-75(b) rev.: con y sin proyecto la clave exacta es distinta — por eso existe la búsqueda por documento", () => {
  assert.notEqual(cadRecoveryScopeKey(base), cadRecoveryScopeKey(documentScope));
});

test("T-75(b) rev.: la búsqueda por documento acepta la clave escrita bajo cualquier edificio/proyecto", () => {
  for (const written of [
    base,
    { ...base, buildingId: null, projectId: "project-z" },
    { ...base, buildingId: "building-z", projectId: null },
    documentScope,
  ]) {
    assert.ok(
      matchesCadRecoveryDocument(cadRecoveryScopeKey(written), documentScope),
      `debe coincidir: ${cadRecoveryScopeKey(written)}`,
    );
  }
});

test("T-75(b) rev.: la búsqueda por documento no cruza tenant, usuario, modelo ni revisión", () => {
  for (const change of [
    { tenantId: "tenant-b" },
    { userId: "user-b" },
    { model: "AX-2000" },
    // Dos puntos dentro del modelo van percent-codificados: no desplazan
    // los trozos ni cuelan un prefijo compartido.
    { model: "AX:1000:x" },
    { revision: "B" },
  ]) {
    assert.equal(
      matchesCadRecoveryDocument(cadRecoveryScopeKey({ ...base, ...change }), documentScope),
      false,
      `no debe coincidir: ${JSON.stringify(change)}`,
    );
  }
  assert.equal(matchesCadRecoveryDocument("basura", documentScope), false);
  assert.equal(matchesCadRecoveryDocument(`${SCOPE_KEY}:extra`, documentScope), false);
});
