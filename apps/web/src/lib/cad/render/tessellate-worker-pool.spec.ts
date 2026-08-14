/**
 * El POOL de workers de teselado, ejercitado con workers FALSOS.
 *
 * En Node no hay `Worker`, así que estas pruebas inyectan una fábrica falsa
 * (la misma vía que usaría un spec de integración) y afirman lo que sólo el
 * pool puede romper y ningún otro spec mira:
 *
 * - el despacho va SIEMPRE al worker con menos peticiones en vuelo, y el
 *   empate lo gana el índice menor — determinista, porque un reparto que
 *   dependa del azar hace irreproducible cualquier fallo de producción;
 * - las respuestas llegan en el orden que les da la gana y cada una resuelve
 *   EXACTAMENTE la petición de su `requestId`, no la más antigua;
 * - la muerte de un worker es LOCAL: sólo sus peticiones degradan a la
 *   reserva síncrona (geometría intacta, `source: "fallback"`), sólo él se
 *   termina, y los demás siguen sirviendo y recibiendo despachos;
 * - con el pool entero muerto, o sin `Worker` global, todo cae a la reserva
 *   síncrona declarándolo — que es el contrato que el carril de fuera de hilo
 *   ya se apoya para no dejar nunca de dibujar.
 */
import assert from "node:assert/strict";
import {
  cadTessellateWorkerPoolSize,
  disposeCadTessellateWorker,
  setCadTessellateWorkerPoolForTest,
  tessellateCadEntitiesOffThread,
  type CadTessellateWorkerLike,
} from "./tessellate-worker-client";
import {
  tessellateCadEntityBatch,
  type CadTessellateWorkerRequest,
  type CadTessellateWorkerResponse,
} from "./tessellate.worker";
import type { CadNativeEntity } from "../entity-runtime";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

/** Deja correr los `then` de las promesas ya resueltas. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * Worker falso de resolución MANUAL: apunta lo que recibe y responde (o
 * muere) cuando el test lo decide. Responde con el MISMO núcleo que el worker
 * real, así que la geometría afirmada abajo es la de producción.
 */
class FakeWorker implements CadTessellateWorkerLike {
  readonly requests: CadTessellateWorkerRequest[] = [];
  terminated = false;
  private readonly messageListeners: Array<
    (event: { data: CadTessellateWorkerResponse }) => void
  > = [];
  private readonly errorListeners: Array<(event: { message?: string }) => void> = [];

  postMessage(message: unknown): void {
    this.requests.push(message as CadTessellateWorkerRequest);
  }

  addEventListener(
    type: "message",
    listener: (event: { data: CadTessellateWorkerResponse }) => void,
  ): void;
  addEventListener(type: "error", listener: (event: { message?: string }) => void): void;
  addEventListener(
    type: "message" | "error",
    listener:
      | ((event: { data: CadTessellateWorkerResponse }) => void)
      | ((event: { message?: string }) => void),
  ): void {
    if (type === "message")
      this.messageListeners.push(
        listener as (event: { data: CadTessellateWorkerResponse }) => void,
      );
    else this.errorListeners.push(listener as (event: { message?: string }) => void);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Responde una petición concreta, en el orden que el test quiera. */
  answer(request: CadTessellateWorkerRequest): void {
    const { results } = tessellateCadEntityBatch(
      request.entities,
      request.segments,
      request.document,
    );
    for (const listener of this.messageListeners)
      listener({ data: { id: request.id, ok: true, results } });
  }

  /** El evento `error` del worker: lo que dispara la muerte local. */
  die(message: string): void {
    for (const listener of this.errorListeners) listener({ message });
  }
}

/** Cada entidad con una `y` propia: la geometría delata a qué petición sirve. */
function lineAt(id: string, y: number): CadNativeEntity {
  return {
    id,
    type: "line",
    start: { x: 0, y, z: 0 },
    end: { x: 100, y, z: 0 },
    layer: "0",
  } as CadNativeEntity;
}

async function main(): Promise<void> {
  // -------------------------------------------------------------------------
  // El tamaño del pool: min(4, núcleos − 1), y 1 cuando el navegador no
  // declara núcleos. Es una función pura para poder afirmarla sin fingir un
  // `navigator` global.
  // -------------------------------------------------------------------------
  assert.equal(cadTessellateWorkerPoolSize(undefined), 1, "sin núcleos declarados: 1");
  assert.equal(cadTessellateWorkerPoolSize(Number.NaN), 1, "núcleos no numéricos: 1");
  assert.equal(cadTessellateWorkerPoolSize(1), 1, "un núcleo: nunca menos de 1");
  assert.equal(cadTessellateWorkerPoolSize(2), 1, "dos núcleos: uno queda para el hilo del ratón");
  assert.equal(cadTessellateWorkerPoolSize(4), 3);
  assert.equal(cadTessellateWorkerPoolSize(8), 4, "el tope es 4 aunque haya más núcleos");
  assert.equal(cadTessellateWorkerPoolSize(32), 4);
  ok(true, "el tamaño del pool es min(4, núcleos − 1) con reserva de 1 sin núcleos declarados");

  // -------------------------------------------------------------------------
  // Despacho determinista al MENOS cargado, con empate al índice menor.
  // -------------------------------------------------------------------------
  const workers: FakeWorker[] = [];
  setCadTessellateWorkerPoolForTest({
    size: 3,
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
  });
  assert.equal(workers.length, 0, "el pool es perezoso: nada se construye antes del primer uso");

  const promises: Array<ReturnType<typeof tessellateCadEntitiesOffThread>> = [];
  for (let index = 0; index < 5; index += 1)
    promises.push(tessellateCadEntitiesOffThread([lineAt(`e${index}`, index * 10)], [2]));
  assert.equal(workers.length, 3, "el primer uso construye el pool entero, y sólo una vez");
  assert.deepEqual(
    workers.map((worker) => worker.requests.map((request) => request.entities[0].id)),
    [["e0", "e3"], ["e1", "e4"], ["e2"]],
    "cada petición fue al worker con menos en vuelo y el empate lo ganó el índice menor",
  );
  ok(true, "5 peticiones se reparten [e0,e3] / [e1,e4] / [e2]: menos-cargado con empate determinista");

  // Al responder, el worker queda menos cargado y el siguiente despacho lo ve.
  workers[1].answer(workers[1].requests[0]);
  const early = await promises[1];
  assert.equal(early.source, "worker");
  assert.equal(early.results[0].entityId, "e1");
  promises.push(tessellateCadEntitiesOffThread([lineAt("e5", 50)], [2]));
  assert.equal(
    workers[1].requests.length,
    3,
    "la respuesta descargó al worker 1 y el siguiente despacho volvió a él",
  );
  assert.equal(workers[1].requests[2].entities[0].id, "e5");
  ok(true, "resolver una petición descuenta la carga y el despacho siguiente lo refleja");

  // -------------------------------------------------------------------------
  // Respuestas FUERA DE ORDEN: cada una resuelve su `requestId`, no la más
  // antigua. La geometría (la `y` de cada línea) delata cualquier cruce.
  // -------------------------------------------------------------------------
  workers[1].answer(workers[1].requests[1]); // e4
  workers[2].answer(workers[2].requests[0]); // e2
  workers[0].answer(workers[0].requests[1]); // e3 antes que e0, mismo worker
  workers[0].answer(workers[0].requests[0]); // e0
  workers[1].answer(workers[1].requests[2]); // e5
  await flush();
  const settled = await Promise.all(promises);
  for (let index = 0; index < settled.length; index += 1) {
    const outcome = settled[index];
    assert.equal(outcome.source, "worker", `e${index} salió del worker`);
    assert.equal(outcome.results.length, 1);
    assert.equal(outcome.results[0].entityId, `e${index}`, `e${index} resolvió SU petición`);
    assert.deepEqual(
      [...outcome.results[0].paths[0]],
      [0, index * 10, 100, index * 10],
      `e${index}: la geometría es la de la entidad pedida, no la de otra respuesta`,
    );
  }
  ok(true, "6 respuestas servidas fuera de orden resuelven cada una su requestId con su geometría");

  // -------------------------------------------------------------------------
  // MUERTE LOCAL: cae un worker con peticiones en vuelo. Sólo las suyas
  // degradan a la reserva síncrona (geometría intacta), sólo él se termina, y
  // los demás siguen sirviendo y recibiendo despachos. Ninguna petición nueva
  // vuelve a tocar al muerto.
  // -------------------------------------------------------------------------
  const survivors = [
    tessellateCadEntitiesOffThread([lineAt("f0", 100)], [2]),
    tessellateCadEntitiesOffThread([lineAt("f1", 110)], [2]),
    tessellateCadEntitiesOffThread([lineAt("f2", 120)], [2]),
  ];
  assert.equal(workers[0].requests[2].entities[0].id, "f0", "con carga a cero, f0 va al índice 0");
  assert.equal(workers[1].requests[3].entities[0].id, "f1");
  assert.equal(workers[2].requests[1].entities[0].id, "f2");

  workers[1].die("worker 1 reventado a propósito");
  await flush();
  const degraded = await survivors[1];
  assert.equal(
    degraded.source,
    "fallback",
    "la petición del worker muerto degrada a la reserva síncrona, no se pierde",
  );
  assert.deepEqual([...degraded.results[0].paths[0]], [0, 110, 100, 110], "y su geometría es la pedida");
  assert.equal(workers[1].terminated, true, "el worker caído se termina");
  assert.equal(workers[0].terminated, false, "los demás NO se terminan");
  assert.equal(workers[2].terminated, false);

  workers[0].answer(workers[0].requests[2]);
  workers[2].answer(workers[2].requests[1]);
  const alive = await Promise.all([survivors[0], survivors[2]]);
  assert.equal(alive[0].source, "worker", "las peticiones de los vivos siguen sirviéndose del worker");
  assert.equal(alive[1].source, "worker");
  ok(true, "la muerte de un worker rechaza SÓLO lo suyo (degradado a reserva) y los demás siguen sirviendo");

  const requestsToDeadWorker = workers[1].requests.length;
  const afterDeath = [
    tessellateCadEntitiesOffThread([lineAt("g0", 200)], [2]),
    tessellateCadEntitiesOffThread([lineAt("g1", 210)], [2]),
  ];
  assert.equal(workers[0].requests[3].entities[0].id, "g0", "el reparto salta al muerto: índice 0");
  assert.equal(workers[2].requests[2].entities[0].id, "g1", "…e índice 2, sin pasar por el 1");
  assert.equal(workers[1].requests.length, requestsToDeadWorker, "el muerto no recibe nada más");
  workers[0].answer(workers[0].requests[3]);
  workers[2].answer(workers[2].requests[2]);
  await Promise.all(afterDeath);
  ok(true, "tras la muerte, el despacho reparte sólo entre los vivos");

  // Con el pool ENTERO muerto no se reconstruye nada: reserva síncrona directa.
  workers[0].die("adiós");
  workers[2].die("adiós");
  const drained = await tessellateCadEntitiesOffThread([lineAt("h0", 300)], [2]);
  assert.equal(drained.source, "fallback", "con todos los workers muertos, la reserva síncrona directa");
  assert.deepEqual([...drained.results[0].paths[0]], [0, 300, 100, 300]);
  assert.equal(workers.length, 3, "el pool NO se reconstruye tras morir: eso es del dispose");
  ok(true, "con el pool entero muerto todo va a la reserva síncrona sin reconstruir workers");

  // -------------------------------------------------------------------------
  // `dispose` con una petición EN VUELO: la petición degrada a la reserva (el
  // que llama nunca ve un rechazo), los workers se terminan y el siguiente
  // uso construye un pool NUEVO — el ciclo de desmontar y volver a montar el
  // editor.
  // -------------------------------------------------------------------------
  const rebuilt: FakeWorker[] = [];
  setCadTessellateWorkerPoolForTest({
    size: 2,
    createWorker: () => {
      const worker = new FakeWorker();
      rebuilt.push(worker);
      return worker;
    },
  });
  const inflight = tessellateCadEntitiesOffThread([lineAt("i0", 400)], [2]);
  assert.equal(rebuilt.length, 2, "el pool nuevo se construye con la fábrica nueva");
  disposeCadTessellateWorker();
  const afterDispose = await inflight;
  assert.equal(afterDispose.source, "fallback", "dispose degrada lo en vuelo a la reserva, sin rechazos");
  assert.equal(rebuilt[0].terminated, true, "dispose termina el pool entero");
  assert.equal(rebuilt[1].terminated, true);
  const remountedPromise = tessellateCadEntitiesOffThread([lineAt("i1", 410)], [2]);
  assert.equal(rebuilt.length, 4, "el uso siguiente al dispose construye un pool nuevo");
  rebuilt[2].answer(rebuilt[2].requests[0]);
  const remounted = await remountedPromise;
  assert.equal(remounted.source, "worker");
  ok(true, "dispose termina el pool, degrada lo en vuelo y el siguiente uso reconstruye");

  // -------------------------------------------------------------------------
  // Sin fábrica inyectada y sin `Worker` global (Node): el camino síncrono de
  // siempre, declarado como `fallback`. Es el contrato que los specs del
  // pipeline y el carril de fuera de hilo ya se apoyan.
  // -------------------------------------------------------------------------
  setCadTessellateWorkerPoolForTest(null);
  assert.equal(typeof Worker, "undefined", "esta prueba sólo vale donde no hay Worker global");
  const nodeFallback = await tessellateCadEntitiesOffThread([lineAt("j0", 500)], [2]);
  assert.equal(nodeFallback.source, "fallback", "sin Worker global el cliente lo declara, no lo disimula");
  assert.deepEqual([...nodeFallback.results[0].paths[0]], [0, 500, 100, 500]);
  ok(true, "sin Worker global el cliente cae al camino síncrono y lo declara en `source`");

  console.log(
    `tessellate-worker-pool: ${checks} comprobaciones verdes — el despacho al menos-cargado es determinista, las respuestas fuera de orden resuelven su requestId, la muerte de un worker degrada sólo lo suyo mientras los demás sirven, y sin pool todo cae a la reserva síncrona declarada.`,
  );
}

void main();
