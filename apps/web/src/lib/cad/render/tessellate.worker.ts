/**
 * Worker de teselado: la aritmética pesada fuera del hilo principal.
 *
 * El planificador ya reparte el trabajo en trozos de 4 ms, así que la interfaz
 * responde aunque todo ocurra en el hilo principal. Lo que el worker añade es
 * distinto: con un lote grande —abrir un documento, cruzar una octava de zoom en
 * un dibujo denso— los 4 ms por cuadro convierten el trabajo en muchos cuadros,
 * y mientras tanto el usuario ve la escena entrar a trozos. Teselando en
 * paralelo esos mismos trozos llegan sin robarle cuadros al hilo que atiende el
 * ratón.
 *
 * Devuelve arrays tipados TRANSFERIBLES: el resultado no se copia al volver, se
 * cede. Copiar un millón de flotantes por lote anularía la ganancia entera.
 */
import { CAD_ENTITY_REGISTRY, type CadNativeEntity } from "../entity-runtime";
import type { CadDocument } from "../cad-document";
import { CAD_RENDER_ORIGIN_ZERO, type CadRenderOrigin } from "./render-origin";

export interface CadTessellateWorkerRequest {
  id: number;
  entities: CadNativeEntity[];
  /** Segmentos por entidad, ya resueltos por el escalón de LOD. */
  segments: number[];
  document?: CadDocument;
  /** Origen flotante a restar antes de empaquetar. Cero si se omite. */
  origin?: CadRenderOrigin;
}

export interface CadTessellatedEntityPayload {
  entityId: string;
  /** Un Float32Array por camino, con las coordenadas x,y intercaladas. */
  paths: Float32Array[];
  closed: boolean[];
}

export interface CadTessellateWorkerResponse {
  id: number;
  ok: boolean;
  results?: CadTessellatedEntityPayload[];
  error?: string;
}

/**
 * Núcleo compartido: lo llama el worker y también el camino de reserva cuando
 * `Worker` no existe (Node, navegadores sin módulos en worker). Tener UNA
 * implementación evita que el camino de reserva se desvíe en silencio del
 * principal, que es como aparecen los fallos que sólo pasan en producción.
 */
export function tessellateCadEntityBatch(
  entities: readonly CadNativeEntity[],
  segments: readonly number[],
  document?: CadDocument,
  origin: CadRenderOrigin = CAD_RENDER_ORIGIN_ZERO,
): { results: CadTessellatedEntityPayload[]; transfer: ArrayBufferLike[] } {
  const results: CadTessellatedEntityPayload[] = [];
  const transfer: ArrayBufferLike[] = [];
  for (let index = 0; index < entities.length; index += 1) {
    const entity = entities[index];
    if (!CAD_ENTITY_REGISTRY.supports(entity)) continue;
    const paths: Float32Array[] = [];
    const closed: boolean[] = [];
    for (const path of CAD_ENTITY_REGISTRY.adapter(entity).renderer.paths(
      entity,
      Math.max(2, Math.floor(segments[index] ?? 32)),
      document,
    )) {
      if (path.points.length < 2) continue;
      const xy = new Float32Array(path.points.length * 2);
      for (let point = 0; point < path.points.length; point += 1) {
        // Misma resta, mismo motivo que `tessellateCadEntity` en
        // `tessellation-cache.ts`: ANTES de tocar el Float32Array, en JS
        // doubles. Las dos implementaciones son independientes (el worker no
        // puede importar la del hilo principal) y tienen que restar el MISMO
        // origen o el camino síncrono y el de worker divergirían en dónde
        // aparece cada entidad.
        xy[point * 2] = path.points[point].x - origin.x;
        xy[point * 2 + 1] = path.points[point].y - origin.y;
      }
      paths.push(xy);
      closed.push(path.closed);
      transfer.push(xy.buffer);
    }
    results.push({ entityId: entity.id, paths, closed });
  }
  return { results, transfer };
}

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<CadTessellateWorkerRequest>) => void) | null;
  postMessage: (
    message: CadTessellateWorkerResponse,
    transfer?: Transferable[],
  ) => void;
  // `document` sólo existe en el hilo principal; su ausencia es lo que
  // distingue a un worker de un módulo importado por una prueba en Node.
  document?: unknown;
};

if (
  typeof workerScope.postMessage === "function" &&
  workerScope.document === undefined
) {
  workerScope.onmessage = (event) => {
    const request = event.data;
    try {
      const { results, transfer } = tessellateCadEntityBatch(
        request.entities,
        request.segments,
        request.document,
        request.origin,
      );
      workerScope.postMessage(
        { id: request.id, ok: true, results },
        transfer as unknown as Transferable[],
      );
    } catch (cause) {
      workerScope.postMessage({
        id: request.id,
        ok: false,
        error:
          cause instanceof Error
            ? cause.message
            : "Falló el worker de teselado CAD.",
      });
    }
  };
}
