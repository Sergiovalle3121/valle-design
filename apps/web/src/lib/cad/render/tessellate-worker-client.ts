/**
 * Cliente del POOL de workers de teselado, con camino de reserva síncrono.
 *
 * Antes había UN worker: correcto, pero a 100.000 entidades el detalle entraba
 * en fila india por un solo hilo mientras el resto de núcleos miraban. El pool
 * escala con la máquina —min(4, núcleos − 1), y 1 si el navegador no declara
 * núcleos— sin cambiar nada de lo que el carril de fuera de hilo observa: la
 * firma pública, el `requestId` global que casa respuestas y la reserva
 * síncrona son los mismos.
 *
 * Reglas del pool, en orden de importancia:
 *
 * - **Despacho determinista al menos cargado**: cada petición va al worker con
 *   MENOS peticiones en vuelo; en empate gana el índice menor. Determinista a
 *   propósito: un reparto aleatorio haría irreproducible cualquier fallo que
 *   dependa de qué worker sirvió qué lote.
 * - **La muerte de un worker es LOCAL**: sólo SUS peticiones en vuelo se
 *   rechazan —el `catch` de `tessellateCadEntitiesOffThread` las degrada una a
 *   una a la reserva síncrona, así que el que llama ve geometría igual— y sólo
 *   ÉL se termina. Los demás workers siguen sirviendo lo suyo: un pool entero
 *   terminado por un fallo local convertiría un tropiezo en una regresión de
 *   rendimiento global. El muerto no se reemplaza; si murieran todos, las
 *   peticiones nuevas van directas a la reserva, igual que sin `Worker`.
 * - **Perezoso y una sola vez**: el pool se construye en el primer uso y vive a
 *   nivel de módulo, como vivía el singleton. `disposeCadTessellateWorker` lo
 *   cierra entero (desmontar el editor) y el siguiente uso lo reconstruye.
 *
 * La reserva no es una cortesía: en Node (los specs), en un navegador sin
 * módulos en worker y si un worker muere, el pipeline tiene que seguir dando
 * geometría. Lo importante es que la reserva llama a la MISMA función núcleo
 * que el worker, así que no puede desviarse del camino principal sin que las
 * pruebas lo noten.
 */
import type { CadDocument } from "../cad-document";
import type { CadNativeEntity } from "../entity-runtime";
import {
  tessellateCadEntityBatch,
  type CadTessellateWorkerResponse,
  type CadTessellatedEntityPayload,
} from "./tessellate.worker";
import type { CadTessellation } from "./tessellation-cache";

/**
 * Lo que el pool necesita de un `Worker`, y nada más. Existe para que los
 * specs de Node —donde `Worker` no existe— puedan inyectar workers falsos y
 * ejercitar el despacho, el fuera-de-orden y la muerte parcial de verdad.
 */
export interface CadTessellateWorkerLike {
  postMessage(message: unknown): void;
  addEventListener(
    type: "message",
    listener: (event: { data: CadTessellateWorkerResponse }) => void,
  ): void;
  addEventListener(type: "error", listener: (event: { message?: string }) => void): void;
  terminate(): void;
}

/**
 * Tamaño del pool: min(4, núcleos − 1), nunca menos de 1.
 *
 * El «− 1» le deja un núcleo al hilo principal, que es quien atiende el ratón;
 * el tope de 4 es porque los lotes viajan por `postMessage` con clonado
 * estructurado y a partir de ahí el reparto paga más en serialización de lo
 * que gana en paralelo. Si el navegador no declara núcleos, 1: exactamente el
 * singleton de antes.
 */
export function cadTessellateWorkerPoolSize(hardwareConcurrency?: number): number {
  if (typeof hardwareConcurrency !== "number" || !Number.isFinite(hardwareConcurrency)) return 1;
  return Math.min(4, Math.max(1, Math.floor(hardwareConcurrency) - 1));
}

interface PendingRequest {
  resolve: (results: CadTessellatedEntityPayload[]) => void;
  reject: (reason: Error) => void;
  /** Qué worker sirve esta petición: la muerte de uno sólo rechaza LO SUYO. */
  slot: PoolSlot;
}

interface PoolSlot {
  worker: CadTessellateWorkerLike;
  /** Índice estable de creación: el desempate determinista del despacho. */
  index: number;
  /** Peticiones en vuelo de ESTE worker. Es el criterio de despacho. */
  inflight: number;
  /** Un worker muerto deja de recibir; no se reemplaza hasta el dispose. */
  alive: boolean;
}

/** Fábrica y tamaño inyectables SÓLO para specs; `null` es el camino real. */
export interface CadTessellateWorkerPoolTestOverride {
  createWorker: () => CadTessellateWorkerLike;
  size: number;
}

let pool: PoolSlot[] | null = null;
let nextRequestId = 1;
const pending = new Map<number, PendingRequest>();
let testOverride: CadTessellateWorkerPoolTestOverride | null = null;

/**
 * Sustituye la fábrica de workers para los specs (o la retira con `null`).
 * Cierra el pool vigente para que el siguiente uso construya con la fábrica
 * nueva. NO es API del producto: existe porque en Node no hay `Worker` y las
 * propiedades del pool —despacho, fuera de orden, muerte parcial— sólo se
 * pueden afirmar con workers falsos de resolución manual.
 */
export function setCadTessellateWorkerPoolForTest(
  override: CadTessellateWorkerPoolTestOverride | null,
): void {
  disposeCadTessellateWorker();
  testOverride = override;
}

function attachSlot(slot: PoolSlot): void {
  slot.worker.addEventListener("message", (event) => {
    const request = pending.get(event.data.id);
    if (!request) return;
    pending.delete(event.data.id);
    request.slot.inflight -= 1;
    if (event.data.ok && event.data.results) request.resolve(event.data.results);
    else request.reject(new Error(event.data.error ?? "Falló el worker de teselado CAD."));
  });
  slot.worker.addEventListener("error", (event) => {
    // Muerte LOCAL: se rechaza lo que este worker tenía en vuelo (el catch del
    // que llama degrada cada una a la reserva síncrona) y se termina SÓLO este
    // worker. Los demás siguen sirviendo sus peticiones como si nada.
    const error = new Error(event.message || "Falló el worker de teselado CAD.");
    for (const [id, request] of pending) {
      if (request.slot !== slot) continue;
      pending.delete(id);
      request.reject(error);
    }
    slot.alive = false;
    slot.inflight = 0;
    slot.worker.terminate();
  });
}

function tessellatePool(): PoolSlot[] | null {
  if (pool) return pool;
  const override = testOverride;
  if (!override && typeof Worker === "undefined") return null;
  const size = override
    ? override.size
    : cadTessellateWorkerPoolSize(
        typeof navigator === "undefined" ? undefined : navigator.hardwareConcurrency,
      );
  const slots: PoolSlot[] = [];
  try {
    for (let index = 0; index < size; index += 1) {
      const worker: CadTessellateWorkerLike = override
        ? override.createWorker()
        : new Worker(new URL("./tessellate.worker.ts", import.meta.url), {
            type: "module",
            name: `cad-tessellate-${index}`,
          });
      const slot: PoolSlot = { worker, index, inflight: 0, alive: true };
      attachSlot(slot);
      slots.push(slot);
    }
  } catch {
    // Si el navegador no puede construir workers (sin módulos en worker), no
    // hay pool a medias: se cierra lo creado y todo va por la reserva.
    for (const slot of slots) slot.worker.terminate();
    return null;
  }
  pool = slots;
  return pool;
}

/**
 * El worker vivo con MENOS peticiones en vuelo; empate → índice menor. Con
 * todos muertos (o sin pool) devuelve `null` y el que llama cae a la reserva.
 */
function leastLoadedSlot(): PoolSlot | null {
  const slots = tessellatePool();
  if (!slots) return null;
  let best: PoolSlot | null = null;
  for (const slot of slots) {
    if (!slot.alive) continue;
    if (!best || slot.inflight < best.inflight) best = slot;
  }
  return best;
}

/** Convierte la carga transferida en la forma que consume la caché. */
export function cadTessellationFromPayload(
  payload: CadTessellatedEntityPayload,
): CadTessellation {
  let pointCount = 0;
  let segmentCount = 0;
  const paths = payload.paths.map((xy, index) => {
    const points = xy.length / 2;
    pointCount += points;
    segmentCount += points - 1 + (payload.closed[index] ? 1 : 0);
    return { xy, closed: payload.closed[index] ?? false };
  });
  return { paths, pointCount, segmentCount };
}

export interface CadTessellateOffThreadResult {
  results: CadTessellatedEntityPayload[];
  /** De dónde salió el resultado. El benchmark lo publica sin adornar. */
  source: "worker" | "fallback";
}

export async function tessellateCadEntitiesOffThread(
  entities: readonly CadNativeEntity[],
  segments: readonly number[],
  document?: CadDocument,
): Promise<CadTessellateOffThreadResult> {
  const slot = leastLoadedSlot();
  if (slot) {
    const id = nextRequestId++;
    try {
      const results = await new Promise<CadTessellatedEntityPayload[]>((resolve, reject) => {
        pending.set(id, { resolve, reject, slot });
        slot.inflight += 1;
        slot.worker.postMessage({
          id,
          entities: entities as CadNativeEntity[],
          segments: [...segments],
          document,
        });
      });
      return { results, source: "worker" };
    } catch {
      // Si el rechazo vino del propio `postMessage` (y no del worker), la
      // petición sigue apuntada: se despunta aquí para no dejar carga fantasma.
      const orphan = pending.get(id);
      if (orphan) {
        pending.delete(id);
        orphan.slot.inflight -= 1;
      }
      // Cae a la reserva: mejor teselar en el hilo principal que no dibujar.
    }
  }
  return { results: tessellateCadEntityBatch(entities, segments, document).results, source: "fallback" };
}

/** Cierra el pool entero. Se llama al desmontar el editor. */
export function disposeCadTessellateWorker(): void {
  for (const request of pending.values())
    request.reject(new Error("El worker de teselado CAD se cerró."));
  pending.clear();
  if (pool)
    for (const slot of pool) {
      if (!slot.alive) continue;
      slot.alive = false;
      slot.worker.terminate();
    }
  pool = null;
}
