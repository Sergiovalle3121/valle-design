/**
 * Cliente del worker de teselado, con camino de reserva síncrono.
 *
 * La reserva no es una cortesía: en Node (los specs), en un navegador sin
 * módulos en worker y si el worker muere, el pipeline tiene que seguir dando
 * geometría. Lo importante es que la reserva llama a la MISMA función núcleo que
 * el worker, así que no puede desviarse del camino principal sin que las
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

interface PendingRequest {
  resolve: (results: CadTessellatedEntityPayload[]) => void;
  reject: (reason: Error) => void;
}

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, PendingRequest>();

function tessellateWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./tessellate.worker.ts", import.meta.url), {
      type: "module",
      name: "cad-tessellate",
    });
    worker.addEventListener("message", (event: MessageEvent<CadTessellateWorkerResponse>) => {
      const request = pending.get(event.data.id);
      if (!request) return;
      pending.delete(event.data.id);
      if (event.data.ok && event.data.results) request.resolve(event.data.results);
      else request.reject(new Error(event.data.error ?? "Falló el worker de teselado CAD."));
    });
    worker.addEventListener("error", (event) => {
      const error = new Error(event.message || "Falló el worker de teselado CAD.");
      for (const request of pending.values()) request.reject(error);
      pending.clear();
      worker?.terminate();
      worker = null;
    });
    return worker;
  } catch {
    worker = null;
    return null;
  }
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
  const activeWorker = tessellateWorker();
  if (activeWorker) {
    const id = nextRequestId++;
    try {
      const results = await new Promise<CadTessellatedEntityPayload[]>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        activeWorker.postMessage({
          id,
          entities: entities as CadNativeEntity[],
          segments: [...segments],
          document,
        });
      });
      return { results, source: "worker" };
    } catch {
      pending.delete(id);
      // Cae a la reserva: mejor teselar en el hilo principal que no dibujar.
    }
  }
  return { results: tessellateCadEntityBatch(entities, segments, document).results, source: "fallback" };
}

/** Cierra el worker. Se llama al desmontar el editor. */
export function disposeCadTessellateWorker(): void {
  for (const request of pending.values())
    request.reject(new Error("El worker de teselado CAD se cerró."));
  pending.clear();
  worker?.terminate();
  worker = null;
}
