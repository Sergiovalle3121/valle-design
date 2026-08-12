/**
 * Carril de teselado FUERA de hilo del pipeline de render.
 *
 * El planificador ya troceaba el trabajo en cuadros de 4 ms, pero el trabajo
 * seguía siendo del hilo principal: cargar un plano denso era una carga
 * progresiva a costa de robarle cuadros al ratón. Este carril lleva la
 * contabilidad de lo que el pipeline delega en el worker: qué tiles esperan
 * una respuesta, qué época del contenido pidió cada lote y de dónde salió el
 * último teselado servido. El pipeline decide QUÉ pedir; aquí vive el CÓMO se
 * espera sin mentir.
 *
 * Las dos propiedades que este módulo defiende:
 *
 * - **Asentado honesto**: un tile con petición en vuelo cuenta como trabajo
 *   pendiente aunque el planificador esté vacío. Decir «asentado» con teselado
 *   volando haría que el indicador (y los goldens que lo leen) declarasen
 *   listo un dibujo a medias.
 * - **Ninguna respuesta tardía miente**: una respuesta pedida antes de una
 *   edición (`invalidateEpoch`) se descarta entera —sembrarla resucitaría la
 *   geometría de ANTES— y el tile se reencola para pedir de nuevo.
 */
import type { CadDocument } from "../cad-document";
import type { CadNativeEntity } from "../entity-runtime";
import {
  tessellateCadEntitiesOffThread,
  type CadTessellateOffThreadResult,
} from "./tessellate-worker-client";
import type { CadTessellatedEntityPayload } from "./tessellate.worker";
import type { CadRenderLodTier } from "./tessellation-cache";

/**
 * Tope del LOTE que viaja al worker de teselado, en segmentos ESTIMADOS.
 *
 * Es más grande que el trozo de materialización (2.048) a propósito: el lote
 * del worker no es trabajo del hilo principal, es prefetch, y cada petición
 * paga un viaje de ida y vuelta de `postMessage`. La estimación por entidad es
 * `cadRenderSegmentBudget(tier)` — SOBRESTIMA las líneas (1 segmento real
 * contra 8–128 estimados) e infraestima polilíneas densas, pero para
 * dimensionar un lote basta: el error sólo mueve cuántas entidades van por
 * mensaje, no qué geometría sale.
 */
export const CAD_RENDER_OFFTHREAD_BATCH_SEGMENT_BUDGET = 16_384;
/** Tope duro de entidades por mensaje: acota el coste de clonado estructurado. */
export const CAD_RENDER_OFFTHREAD_BATCH_MAX_ENTITIES = 512;

/**
 * Teselador fuera del hilo principal. La firma es la del cliente del worker;
 * inyectable para que los specs de Node puedan ejercitar el camino asíncrono
 * (completado fuera de orden, ediciones en vuelo) sin un `Worker` real.
 */
export type CadOffThreadTessellator = (
  entities: readonly CadNativeEntity[],
  segments: readonly number[],
  document?: CadDocument,
) => Promise<CadTessellateOffThreadResult>;

/**
 * De dónde salió el último teselado fuera de hilo servido.
 *
 * `sync` significa «todo se teseló en el hilo principal» — el arranque, Node,
 * o un pipeline con el worker apagado. `worker` y `fallback` son los valores
 * que declara el cliente del worker, sin adornar. Se publica hasta el DOM para
 * que un golden pueda afirmar que el worker CORRE de verdad en el navegador:
 * si el empaquetado del worker se rompiera, el cliente caería a la reserva en
 * silencio y el dibujo seguiría saliendo — idéntico y más lento. Ese silencio
 * es exactamente lo que un cableado medido pero no ejecutado ya causó una vez.
 */
export type CadRenderTessellationSource = "sync" | "worker" | "fallback";

/**
 * ¿Puede esta entidad teselarse SIN el documento al lado?
 *
 * El único adaptador cuyo `renderer.paths` consume el documento es el INSERT
 * (resuelve su bloque); todo lo demás tesela con la entidad sola. Y clonar el
 * documento entero en cada `postMessage` —a 100.000 entidades, megabytes por
 * lote— anularía la ganancia del worker completa. Así que el documento NO
 * viaja nunca: los INSERT se quedan en el hilo principal (en el editor ya van
 * excluidos del pipeline por lotes, los dibuja `buildCadInsertBatches`) y el
 * resto va al worker con la garantía de producir la MISMA geometría que la
 * reserva síncrona, que es lo que su spec afirma coordenada a coordenada.
 */
export function cadEntityTessellatesWithoutDocument(entity: CadNativeEntity): boolean {
  return entity.type !== "insert";
}

/**
 * Resuelve el teselador efectivo: el inyectado si se pasó, el cliente del
 * worker cuando `Worker` existe (navegador) y `null` cuando no (Node, los
 * specs, entornos sin workers) — que es el camino síncrono de siempre.
 */
export function resolveCadOffThreadTessellator(
  option: CadOffThreadTessellator | null | undefined,
): CadOffThreadTessellator | null {
  if (option !== undefined) return option;
  return typeof Worker === "undefined" ? null : tessellateCadEntitiesOffThread;
}

/** Lote listo para viajar: entidades, su escalón y su presupuesto de segmentos. */
export interface CadOffThreadBatch {
  entities: CadNativeEntity[];
  segments: number[];
  tierByEntity: Map<string, CadRenderLodTier>;
}

export interface CadOffThreadHooks {
  /** Siembra un teselado que llegó a tiempo (época vigente). */
  seed(payload: CadTessellatedEntityPayload, tier: CadRenderLodTier): void;
  /** La petición terminó —bien o mal—: reencolar el tile si sigue interesando. */
  finished(tileId: string): void;
}

export class CadOffThreadTessellationLane {
  private tessellator: CadOffThreadTessellator | null;
  /**
   * Tiles con una petición de teselado EN VUELO. Cuentan como trabajo
   * pendiente —`settled` los espera— y bloquean pedidos duplicados del mismo
   * tile: `setView` reencola los tiles visibles incompletos y sin esta guarda
   * cada reencuadre dispararía otra petición para un tile que ya espera una.
   */
  private readonly inflight = new Set<string>();
  /**
   * Época del CONTENIDO. Sube en cada `replace`/`invalidate`/`dispose`; una
   * respuesta sembrada con una época vieja podría resucitar la geometría de
   * ANTES de una edición, así que se descarta entera y el tile se reencola
   * para pedir de nuevo. Es el mismo papel que `generation` cumple en el
   * planificador, pero para el contenido en vez de para la vista.
   */
  private epoch = 0;
  private sourceValue: CadRenderTessellationSource = "sync";

  constructor(tessellator: CadOffThreadTessellator | null) {
    this.tessellator = tessellator;
  }

  /** ¿Hay teselador? Si no, el pipeline usa el camino síncrono de siempre. */
  get active(): boolean {
    return this.tessellator !== null;
  }

  get pending(): number {
    return this.inflight.size;
  }

  get source(): CadRenderTessellationSource {
    return this.sourceValue;
  }

  has(tileId: string): boolean {
    return this.inflight.has(tileId);
  }

  /** El contenido cambió: las respuestas pedidas antes dejan de valer. */
  invalidateEpoch(): void {
    this.epoch += 1;
  }

  /**
   * `replace`/`dispose`: además de invalidar la época, las peticiones en vuelo
   * dejan de contar como pendiente — su respuesta ya no reconstruirá nada.
   */
  reset(): void {
    this.epoch += 1;
    this.inflight.clear();
  }

  request(tileId: string, batch: CadOffThreadBatch, hooks: CadOffThreadHooks): void {
    const tessellator = this.tessellator;
    if (!tessellator) return;
    const epoch = this.epoch;
    this.inflight.add(tileId);
    tessellator(batch.entities, batch.segments)
      .then((outcome) => {
        this.inflight.delete(tileId);
        this.sourceValue = outcome.source;
        if (epoch === this.epoch) {
          // Sembrar EN ORDEN INVERSO no es capricho: la caché desaloja por
          // LRU desde lo más antiguo, y si un lote patológico no cupiera
          // entero, lo que debe sobrevivir es la ENTIDAD DEL CURSOR — la que
          // el siguiente trozo materializa. Sembrada la última, es la más
          // reciente, y cada viaje al worker garantiza avanzar al menos una
          // entidad en vez de pedir el mismo lote para siempre.
          for (let index = outcome.results.length - 1; index >= 0; index -= 1) {
            const payload = outcome.results[index];
            const tier = batch.tierByEntity.get(payload.entityId);
            if (tier === undefined) continue;
            hooks.seed(payload, tier);
          }
        }
        // Con época vieja NO se siembra, pero el tile se reencola igual: la
        // reconstrucción pedirá un lote fresco. Dejarlo sin reencolar lo
        // dejaría incompleto para siempre, porque su tarea ya se consumió.
        hooks.finished(tileId);
      })
      .catch(() => {
        // El cliente real nunca rechaza —cae él mismo a la reserva síncrona—,
        // así que esto es un teselador inyectado roto. Reserva limpia: el
        // pipeline sigue entero por el camino síncrono.
        this.inflight.delete(tileId);
        this.tessellator = null;
        hooks.finished(tileId);
      });
  }
}
