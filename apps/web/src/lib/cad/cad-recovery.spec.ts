import assert from "node:assert/strict";
import test from "node:test";
import {
  cadRecoveryScopeKey,
  CadRecoveryBlockedError,
  openDatabaseRequestSettled,
  type OpenDatabaseRequestLike,
} from "./cad-recovery";

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
