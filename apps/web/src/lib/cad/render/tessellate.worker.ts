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
 *
 * ## Aquí es donde el kernel de curvas se enchufa al producto
 *
 * El teselado de arcos, círculos, elipses y splines lo hace
 * `curve-kernel-tessellation.ts` por LOTES contra `lib/cad/wasm`; el resto sigue
 * saliendo del registro de adaptadores. Y el BINARIO se calienta desde aquí, no
 * desde el hilo principal, por dos razones: este es el hilo donde el teselado se
 * paga de verdad en el navegador, y bajarlo aquí no le roba ni un cuadro al que
 * atiende el ratón. Mientras la descarga viaja, el motor JavaScript sirve los
 * lotes —misma geometría, más despacio—, que es la degradación que el fallback
 * cerrado del kernel promete.
 */
import type { CadNativeEntity } from "../entity-runtime";
import type { CadDocument } from "../cad-document";
import {
  tessellateCadEntitiesWithCurveKernel,
  warmCadRenderCurveKernel,
} from "./curve-kernel-tessellation";
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
 *
 * Desde el cableado del kernel el cuerpo vive en
 * `curve-kernel-tessellation.ts`: la firma, el orden de los resultados y la
 * regla de omisión son los mismos, y con el motor por defecto —el de
 * JavaScript— las coordenadas son las MISMAS, no unas parecidas. Esta función
 * se queda como puerta porque es la que media docena de módulos y specs
 * importan, y porque un `postMessage` no tiene dónde poner un kernel.
 */
export function tessellateCadEntityBatch(
  entities: readonly CadNativeEntity[],
  segments: readonly number[],
  document?: CadDocument,
  origin: CadRenderOrigin = CAD_RENDER_ORIGIN_ZERO,
): { results: CadTessellatedEntityPayload[]; transfer: ArrayBufferLike[] } {
  const { results, transfer } = tessellateCadEntitiesWithCurveKernel(
    entities,
    segments,
    document,
    origin,
  );
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
  // Calentar el binario, sin esperarlo. El `catch` está por si el entorno ni
  // siquiera tiene `fetch`: `warmCadRenderCurveKernel` ya devuelve el motor
  // JavaScript ante cualquier fallo de red, así que llegar aquí significa que
  // el worker no puede bajar NADA — y aun así tiene que seguir teselando.
  void warmCadRenderCurveKernel().catch(() => undefined);
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
