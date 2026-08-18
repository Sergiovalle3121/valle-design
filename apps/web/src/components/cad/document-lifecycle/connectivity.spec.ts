/**
 * Contrato de `observeCadSaveFlush`, sin navegador y sin editor.
 *
 * Lo que se afirma aquí es la POLÍTICA: qué momentos fuerzan la subida de un
 * cambio pendiente y cuál de ellos, además, frena la salida de la pestaña. El
 * golden `apps/web/e2e/real/cad-offline-multitab.spec.ts` comprueba que esa
 * política se cumple contra la API real y PostgreSQL; este spec comprueba que
 * la política es la que decimos, y es el que fallaría en un segundo si alguien
 * quitara el oyente de `online` por parecerle redundante. No lo es: es el único
 * momento que no depende de que haya alguien delante de la pantalla.
 */
import { strict as assert } from "node:assert";
import { observeCadSaveFlush, type CadSaveFlushBridge } from "./connectivity";

type Listener = (event: unknown) => void;

class FakeHost {
  readonly listeners = new Map<string, Set<Listener>>();
  visibilityState = "visible";

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: unknown = {}): void {
    for (const listener of [...(this.listeners.get(type) ?? [])])
      listener(event);
  }

  count(): number {
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }
}

interface Harness {
  windowHost: FakeHost;
  documentHost: FakeHost;
  bridge: CadSaveFlushBridge;
  calls: string[];
  dirty: { value: boolean };
  stop: () => void;
}

function harness(dirty = true): Harness {
  const windowHost = new FakeHost();
  const documentHost = new FakeHost();
  const calls: string[] = [];
  const state = { value: dirty };
  const bridge: CadSaveFlushBridge = {
    isDirty: () => state.value,
    scheduleAutosave: () => void calls.push("schedule"),
    flush: async () => void calls.push("flush"),
  };
  const stop = observeCadSaveFlush(bridge, {
    window: windowHost,
    document: documentHost,
  });
  return { windowHost, documentHost, bridge, calls, dirty: state, stop };
}

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

function registersEveryMoment() {
  const { windowHost, documentHost, stop } = harness();
  for (const type of ["beforeunload", "pagehide", "online"])
    ok(
      (windowHost.listeners.get(type)?.size ?? 0) === 1,
      `falta el oyente de ${type}`,
    );
  ok(
    (documentHost.listeners.get("visibilitychange")?.size ?? 0) === 1,
    "falta el oyente de visibilitychange",
  );
  stop();
  ok(
    windowHost.count() === 0 && documentHost.count() === 0,
    "el desmontaje tiene que retirar TODOS los oyentes",
  );
}

/** EL DEFECTO QUE CERRÓ ESTE MÓDULO: sin red que vuelva, nadie reintenta. */
function reconnectionResumesPendingWork() {
  const { windowHost, calls, stop } = harness(true);
  windowHost.emit("online");
  assert.deepEqual(
    calls,
    ["schedule", "flush"],
    "al volver la red hay que REPROGRAMAR con la versión CAS vigente y vaciar la cola",
  );
  checks += 1;
  stop();
}

/** Y si no había nada sucio, volver la red no gasta una petición. */
function reconnectionIsSilentWhenClean() {
  const { windowHost, calls, stop } = harness(false);
  windowHost.emit("online");
  assert.deepEqual(calls, [], "sin trabajo pendiente no se toca el servidor");
  checks += 1;
  stop();
}

function unloadWarnsOnlyWithPendingWork() {
  const dirty = harness(true);
  let prevented = 0;
  dirty.windowHost.emit("beforeunload", {
    preventDefault: () => void (prevented += 1),
  });
  ok(prevented === 1, "con trabajo pendiente la salida se frena");
  ok(
    dirty.calls.includes("flush"),
    "y además se intenta subir antes de irse",
  );
  dirty.stop();

  const clean = harness(false);
  let untouched = 0;
  clean.windowHost.emit("beforeunload", {
    preventDefault: () => void (untouched += 1),
  });
  ok(
    untouched === 0 && clean.calls.length === 0,
    "sin nada pendiente cerrar la pestaña no molesta a nadie",
  );
  clean.stop();
}

function hiddenTabFlushesAndVisibleDoesNot() {
  const { documentHost, calls, stop } = harness(true);
  documentHost.visibilityState = "visible";
  documentHost.emit("visibilitychange");
  ok(calls.length === 0, "una pestaña visible no fuerza nada");
  documentHost.visibilityState = "hidden";
  documentHost.emit("visibilitychange");
  assert.deepEqual(
    calls,
    ["schedule", "flush"],
    "ocultarse sí: puede ser lo último que haga esa pestaña",
  );
  checks += 1;
  stop();
}

function pageHideAlwaysFlushes() {
  const { windowHost, calls, stop } = harness(true);
  windowHost.emit("pagehide");
  assert.deepEqual(calls, ["schedule", "flush"]);
  checks += 1;
  stop();
}

/**
 * El vaciado del desmontaje no es cosmético: la petición pendiente pertenece
 * al documento que se abandona, y el editor va a reapuntar sus referencias al
 * siguiente en cuanto este efecto se limpie.
 */
function teardownFlushesTheAbandonedDocument() {
  const { calls, stop } = harness(true);
  stop();
  assert.deepEqual(calls, ["flush"]);
  checks += 1;
}

/** Sin `window` (render en servidor) no explota: no hay nada que observar. */
function serverRenderIsANoop() {
  const stop = observeCadSaveFlush(
    {
      isDirty: () => true,
      scheduleAutosave: () => assert.fail("no debería programarse nada"),
      flush: async () => assert.fail("no debería vaciarse nada"),
    },
    null,
  );
  stop();
  checks += 1;
}

/** Un `flush` que rechaza no puede tumbar al que dispara el evento. */
function rejectedFlushIsSwallowed() {
  const windowHost = new FakeHost();
  const documentHost = new FakeHost();
  const stop = observeCadSaveFlush(
    {
      isDirty: () => true,
      scheduleAutosave: () => undefined,
      flush: () => Promise.reject(new Error("sin red")),
    },
    { window: windowHost, document: documentHost },
  );
  windowHost.emit("online");
  stop();
  checks += 1;
}

registersEveryMoment();
reconnectionResumesPendingWork();
reconnectionIsSilentWhenClean();
unloadWarnsOnlyWithPendingWork();
hiddenTabFlushesAndVisibleDoesNot();
pageHideAlwaysFlushes();
teardownFlushesTheAbandonedDocument();
serverRenderIsANoop();
rejectedFlushIsSwallowed();

console.log(`connectivity.spec.ts ✅ ${checks} comprobaciones`);
