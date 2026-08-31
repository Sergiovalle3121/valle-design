/**
 * Orquestador del pipeline de render por lotes y por tiles.
 *
 * Junta las cuatro piezas —índice de tiles, caché de teselado con LOD,
 * planificador con presupuesto y constructor de lotes— y sostiene la propiedad
 * que da sentido a todo el trabajo:
 *
 *   **En reposo, el número de entidades detalladas es el de las VISIBLES.**
 *
 * No «2.500 de 100.000 muestreadas uniformemente». Todas. `renderedEntities`
 * frente a `visibleEntities` es la cifra que hay que mirar en el benchmark, y la
 * que separa un dibujo lento de un dibujo falso.
 *
 * ## Cómo se reparte el trabajo
 *
 * - **Panear** cambia el conjunto de tiles visibles. Los que salen se liberan;
 *   los que entran se encolan. Los que siguen dentro NO SE TOCAN: su geometría
 *   ya está en la GPU y sus uniformes de cámara se actualizan con cuatro
 *   números. Ese es el motivo de que un paneo pueda caber en un cuadro.
 * - **Hacer zoom** puede cambiar el escalón de LOD. Se cuantiza el zoom a
 *   octavas (`log2(pixelsPerUnit)`) para que una rueda de ratón no invalide la
 *   escena entera en cada muesca; cuando la octava cambia, los tiles residentes
 *   se reconstruyen, y la caché de teselado hace que reconstruir sea barato
 *   porque el escalón nuevo casi siempre ya se calculó antes.
 * - **Editar** entra por `invalidate(affectedEntityIds)`, que es lo que devuelve
 *   el ejecutor de comandos. No hace falta adivinar qué cambió ni vaciar nada
 *   más que los tiles tocados.
 *
 * En el NAVEGADOR, además, el teselado de esos trozos corre en un worker: el
 * trozo que falta se pide por `postMessage`, la espera no ocupa cuadro y la
 * respuesta siembra la caché y reencola el tile. En Node y sin `Worker` el
 * camino es el síncrono de siempre — mismos números de segmentos, misma
 * geometría, como afirma el spec del worker coordenada a coordenada.
 *
 * Puro respecto a THREE: produce lotes en arrays tipados. Quien lo consume los
 * sube a la GPU con `line-batch-three.ts`.
 */
import {
  CAD_ENTITY_REGISTRY,
  CadSpatialIndex,
  type CadBounds,
  type CadNativeEntity,
} from "../entity-runtime";
import { CadRenderDependencyLane } from "./pipeline-dependents";
import type { CadDocument } from "../cad-document";
import {
  CadRenderTileIndex,
  diffCadTiles,
  suggestCadTileSize,
  type CadTileId,
} from "./tile-index";
import {
  CadTessellationCache,
  cadRenderLodTier,
  cadRenderSegmentBudget,
  tessellateCadEntity,
  type CadRenderLodTier,
  type CadTessellationCacheStats,
} from "./tessellation-cache";
import {
  CadLineBatchBuilder,
  cadDrawOrderDepth,
  cadLineStyleKey,
  type CadLineBatch,
  type CadLineStyle,
} from "./line-batch";
import { CadRenderScheduler, type CadRenderFrameResult } from "./render-scheduler";
import {
  CadOffThreadTessellationLane,
  cadEntityTessellatesWithoutDocument,
  collectCadOffThreadBatch,
  resolveCadOffThreadTessellator,
  type CadOffThreadHooks,
  type CadOffThreadTessellator,
  type CadRenderTessellationSource,
} from "./pipeline-offthread";
import { cadTessellationFromPayload } from "./tessellate-worker-client";
import type { CadTextQuadRequest } from "./text-atlas";
import { cadRenderCount, cadRenderMark, cadRenderStage } from "./render-profile";
import { defaultCadRenderStyle } from "./render-style";
import { CAD_RENDER_ORIGIN_ZERO, cadPaperSpaceEntityIds, cadRenderOriginFromBounds, unionCadBounds, type CadRenderOrigin } from "./render-origin";

export type { CadOffThreadTessellator, CadRenderTessellationSource, CadRenderOrigin };
export {
  CAD_RENDER_DEFAULT_COLOR,
  CAD_RENDER_DEFAULT_HALF_WIDTH_PX,
} from "./render-style";

/**
 * Segmentos que materializa como mucho una tarea del planificador.
 *
 * El átomo de trabajo NO puede ser el tile entero. Un tile con 256 arcos en el
 * escalón fino son ~33.000 puntos, y producirlos cuesta más de 20 ms: la
 * garantía de progreso del planificador —siempre ejecuta al menos una tarea—
 * convierte ese tile en un cuadro de 20 ms por muy bien afinado que esté el
 * presupuesto de 4 ms. Se midió así en el arnés antes de trocear.
 *
 * El tope va en SEGMENTOS y no en entidades porque el coste depende del nivel
 * de detalle: 256 entidades son triviales en el escalón grueso y carísimas en el
 * fino. Contando segmentos, el trozo se adapta solo al zoom.
 */
export const CAD_RENDER_CHUNK_SEGMENT_BUDGET = 2_048;

export interface CadRenderView {
  /** Rectángulo de dibujo visible, ya con overscan. De `cadViewBounds`. */
  bounds: CadBounds;
  /** El zoom. De `CadView.pixelsPerUnit`. */
  pixelsPerUnit: number;
}

export type CadRenderStyleResolver = (entity: CadNativeEntity) => CadLineStyle;

export interface CadRenderPipelineOptions {
  tileSize?: number;
  frameBudgetMs?: number;
  cache?: CadTessellationCache;
  now?: () => number;
  style?: CadRenderStyleResolver;
  document?: CadDocument;
  /**
   * Teselador fuera de hilo. Sin especificar, se usa el cliente del worker
   * cuando `Worker` existe (navegador) y el camino síncrono cuando no (Node,
   * los specs, entornos sin workers). `null` fuerza el camino síncrono.
   */
  offThread?: CadOffThreadTessellator | null;
  /** Índice del carril de dependientes. Inyectable para medir su coste. */
  neighborhood?: CadSpatialIndex;
  /**
   * Clava el presupuesto por cuadro en `frameBudgetMs` en vez de adaptarlo al
   * cuadro real. Existe para MEDIR la diferencia entre las dos políticas en la
   * misma corrida; el editor no lo usa. Ver `render-scheduler.ts`.
   */
  fixedFrameBudget?: boolean;
}

export interface CadRenderPipelineStats {
  totalEntities: number;
  /** Entidades que caen dentro de la vista. Sin muestrear. */
  visibleEntities: number;
  /** Entidades ya materializadas como instancias residentes. */
  renderedEntities: number;
  visibleTiles: number;
  residentTiles: number;
  batches: number;
  instances: number;
  glyphRequests: number;
  pendingTasks: number;
  /** true cuando no queda trabajo: es el momento en que se mide «en reposo». */
  settled: boolean;
  zoomOctave: number;
  /** Último origen del teselado fuera de hilo. Ver el tipo. */
  tessellation: CadRenderTessellationSource;
  cache: CadTessellationCacheStats;
}

export interface CadRenderViewUpdate {
  addedTiles: number;
  removedTiles: number;
  retainedTiles: number;
  /** true si el cambio de octava obligó a reconstruir los tiles residentes. */
  lodChanged: boolean;
}

interface ResidentTile {
  /** Constructor por cubo de estilo, vivo entre trozos del mismo tile. */
  builders: Map<string, { style: CadLineStyle; builder: CadLineBatchBuilder }>;
  /** Entidades del tile pendientes de materializar, y por dónde va. */
  pending: readonly string[];
  cursor: number;
  entityIds: string[];
  textRequests: CadTextQuadRequest[];
  instances: number;
  zoomOctave: number;
  complete: boolean;
  /**
   * Lotes ya derivados, o `null` si el tile cambió desde la última vez.
   *
   * `visibleBatches()` lo llama el consumidor en CADA cuadro —`scene.sync()` no
   * tiene otra forma de saber qué mallas quiere— y derivar un tile cuesta
   * ordenar sus cubos de estilo y construir una clave por lote. A 400 tiles
   * residentes eso era medio segundo de un asentado de segundo y medio, gastado
   * casi entero en volver a describir tiles que no se habían tocado. Se anula al
   * escribir instancias, que es lo ÚNICO que cambia el resultado.
   */
  batches: CadLineBatch[] | null;
}

/** Octava del zoom. Cuantizar evita invalidar la escena en cada muesca. */
export function cadRenderZoomOctave(pixelsPerUnit: number): number {
  if (!(pixelsPerUnit > 0)) return 0;
  return Math.round(Math.log2(pixelsPerUnit));
}

export class CadRenderPipeline {
  private readonly entities = new Map<string, CadNativeEntity>();
  private readonly drawOrder = new Map<string, number>();
  private readonly resident = new Map<CadTileId, ResidentTile>();
  /**
   * DOBLE BÚFER del cambio de octava. El tile residente de la octava vieja
   * SIGUE sirviendo sus lotes mientras la octava nueva se reconstruye aquí;
   * al completarse, el relevo es un swap atómico por tile. Antes el cambio de
   * LOD borraba los residentes y el usuario miraba huecos durante toda la
   * reconstrucción — a 100.000 entidades, minutos de dibujo a medias que el
   * benchmark de viewport documentó como `targetBlockedBy`.
   */
  private readonly staging = new Map<CadTileId, ResidentTile>();
  private readonly cache: CadTessellationCache;
  private readonly scheduler: CadRenderScheduler;
  private readonly styleOf: CadRenderStyleResolver;
  /**
   * Carril del teselado FUERA del hilo principal, cuando hay con qué.
   *
   * Cada trozo de tile pide su teselado por `postMessage`, lo espera SIN tarea
   * en el planificador y materializa desde la caché cuando vuelve. La
   * contabilidad —tiles en vuelo, época del contenido, origen del último
   * teselado— vive en `pipeline-offthread.ts` con sus propias razones.
   */
  private readonly offThread: CadOffThreadTessellationLane;
  /**
   * Carril de DEPENDIENTES: quién más queda obsoleto al tocar una entidad.
   * Las razones —y por qué el índice de detrás no es el dibujo entero— viven
   * en `pipeline-dependents.ts`.
   */
  private readonly dependencies: CadRenderDependencyLane;
  private index: CadRenderTileIndex;
  private document?: CadDocument;
  private visibleTiles: CadTileId[] = [];
  /** Espejo en Set de `visibleTiles`: la respuesta del worker pregunta O(1). */
  private visibleTileSet = new Set<CadTileId>();
  private view: CadRenderView = {
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    pixelsPerUnit: 1,
  };
  private zoomOctaveValue = 0;
  private drawOrderCount = 0;
  /** Origen flotante vigente (`render-origin.ts`). Sólo `replace()` lo mueve. */
  private origin: CadRenderOrigin = CAD_RENDER_ORIGIN_ZERO;

  constructor(options: CadRenderPipelineOptions = {}) {
    this.cache = options.cache ?? new CadTessellationCache();
    this.scheduler = new CadRenderScheduler({
      frameBudgetMs: options.frameBudgetMs,
      now: options.now,
      fixedBudget: options.fixedFrameBudget,
    });
    this.styleOf = options.style ?? defaultCadRenderStyle;
    this.index = new CadRenderTileIndex(options.tileSize ?? 4_096);
    this.document = options.document;
    this.offThread = new CadOffThreadTessellationLane(
      resolveCadOffThreadTessellator(options.offThread),
    );
    this.dependencies = new CadRenderDependencyLane(
      (id) => this.entities.get(id),
      options.neighborhood,
    );
  }

  /**
   * Sustituye el contenido. `drawOrderIds` es `modelSpace.entityIds`: define qué
   * tapa a qué, así que se guarda como índice y no como orden de iteración.
   */
  replace(
    entities: readonly CadNativeEntity[],
    drawOrderIds: readonly string[],
    document?: CadDocument,
  ): void {
    this.entities.clear();
    this.drawOrder.clear();
    this.resident.clear();
    this.staging.clear();
    this.cache.clear();
    this.scheduler.abort();
    // Las peticiones en vuelo describen el contenido ANTERIOR: dejan de contar
    // como pendiente y su respuesta, con la época vieja, se descartará entera.
    this.offThread.reset();
    this.dependencies.clear();
    this.document = document ?? this.document;
    // Dos uniones: `bounds` incluye TODO (culling, tiles) y `originBounds`
    // excluye el espacio papel, que es lo que ancla el origen flotante. El
    // porqué —y los 7243× que costaba mezclarlos— en `cadPaperSpaceEntityIds`.
    const spatialIndexStarted = cadRenderMark();
    let bounds: CadBounds | null = null;
    let originBounds: CadBounds | null = null;
    const paperSpaceIds = cadPaperSpaceEntityIds(this.document);
    const boundsById = new Map<string, CadBounds>();
    for (const entity of entities) {
      if (!CAD_ENTITY_REGISTRY.supports(entity)) continue;
      this.entities.set(entity.id, entity);
      const entityBounds = CAD_ENTITY_REGISTRY.adapter(entity).bounds.bounds(
        entity,
        this.document,
      );
      boundsById.set(entity.id, entityBounds);
      this.dependencies.track(entity, entityBounds);
      bounds = unionCadBounds(bounds, entityBounds);
      if (!paperSpaceIds.has(entity.id))
        originBounds = unionCadBounds(originBounds, entityBounds);
    }
    // `?? bounds`: un documento que fuese SÓLO papel (plantilla de cajetín sin
    // dibujo) no tiene modelo que anclar; su hoja es mejor que nada.
    this.origin = cadRenderOriginFromBounds(originBounds ?? bounds);
    drawOrderIds.forEach((id, position) => this.drawOrder.set(id, position));
    this.drawOrderCount = Math.max(drawOrderIds.length, this.entities.size);
    this.index = new CadRenderTileIndex(
      bounds ? suggestCadTileSize(bounds, this.entities.size) : 4_096,
    );
    for (const [id, entityBounds] of boundsById) this.index.upsert(id, entityBounds);
    cadRenderStage("spatialIndex", spatialIndexStarted);
    this.visibleTiles = [];
    this.visibleTileSet.clear();
  }

  get tileSize(): number {
    return this.index.tileSize;
  }

  /** Origen flotante vigente — lo necesita quien más empaqueta geometría contra el mismo marco. */
  get renderOrigin(): CadRenderOrigin {
    return this.origin;
  }

  /**
   * Invalidación por `affectedEntityIds`, que es lo que devuelve el ejecutor de
   * comandos tras aplicar un lote.
   *
   * CONTRATO, y conviene leerlo entero: un id afectado que **no** venga en
   * `upserts` se trata como una BAJA. Es lo que permite que borrar sea la misma
   * llamada que editar, pero significa que quien modifica una entidad tiene que
   * pasar su versión nueva; si sólo pasa el id, la entidad desaparece del
   * dibujo.
   *
   * Reindexa lo tocado, tira su teselado y libera los tiles residentes que lo
   * contenían, para que se reconstruyan con presupuesto en vez de de golpe.
   *
   * Y no sólo lo tocado: también sus DEPENDIENTES. Desde que hay geometría
   * derivada de la vecindad —las uniones de muro—, el contorno cacheado de A
   * puede haberlo dejado obsoleto una edición de B. Se pregunta ANTES y
   * DESPUÉS de aplicar el lote, porque un muro que deja de tocar a su vecino
   * ya no lo nombra, y uno que llega a tocarlo no lo nombraba. El coste está
   * acotado por un índice espacial que sólo contiene lo que se deriva del
   * documento; ver `pipeline-dependents.ts`.
   */
  invalidate(
    affectedEntityIds: readonly string[],
    upserts: readonly CadNativeEntity[] = [],
    document?: CadDocument,
  ): number {
    // El documento vigente, cuando quien edita lo tiene a mano. No es adorno:
    // la geometría derivada de la vecindad se rederiva LEYÉNDOLO, y con el de
    // antes el vecino se reconstruye con el inglete viejo — invalidarlo para
    // volver a dibujar exactamente lo mismo.
    this.document = document ?? this.document;
    // Conjunto y no búsqueda lineal: un MOVE de 10.000 entidades cruzaría
    // 10.000 ids contra 10.000 upserts, que son 100 millones de comparaciones
    // por lote de edición.
    // Una respuesta del worker pedida ANTES de esta edición traería la
    // geometría vieja de lo tocado; subir la época la descarta entera. Se paga
    // repetir la petición de lo no tocado que compartiera lote — correcto
    // primero, y una edición es rara al lado de una carga.
    this.offThread.invalidateEpoch();
    const touched = new Set<string>(affectedEntityIds);
    for (const entity of upserts) touched.add(entity.id);
    // La consulta de ANTES, sobre el estado que aún está en pie.
    const affected = new Set<string>(touched);
    this.dependencies.expandIds(touched, affected);
    const upsertedIds = new Set<string>();
    const invalidateIndexStarted = cadRenderMark();
    for (const entity of upserts) {
      if (!CAD_ENTITY_REGISTRY.supports(entity)) continue;
      upsertedIds.add(entity.id);
      this.entities.set(entity.id, entity);
      const entityBounds = CAD_ENTITY_REGISTRY.adapter(entity).bounds.bounds(
        entity,
        this.document,
      );
      this.index.upsert(entity.id, entityBounds);
      this.dependencies.track(entity, entityBounds);
    }
    cadRenderStage("spatialIndex", invalidateIndexStarted);
    for (const id of affectedEntityIds) {
      if (upsertedIds.has(id)) continue;
      if (!this.entities.has(id)) continue;
      this.index.remove(id);
      this.dependencies.untrack(id);
      this.entities.delete(id);
    }
    // Y la de DESPUÉS: el vecino nuevo al que la edición acaba de llegar.
    this.dependencies.expandEntities(upserts, affected);
    this.cache.invalidate(affected);
    let evicted = 0;
    for (const [tileId, tile] of [...this.resident]) {
      if (!tile.entityIds.some((id) => affected.has(id))) continue;
      this.resident.delete(tileId);
      this.staging.delete(tileId);
      evicted += 1;
    }
    // Un tile a medio reconstruir en staging también puede contener lo tocado.
    for (const [tileId, tile] of [...this.staging]) {
      if (!tile.entityIds.some((id) => affected.has(id))) continue;
      this.staging.delete(tileId);
    }
    this.enqueueMissingTiles();
    return evicted;
  }

  /**
   * Fija la vista. Devuelve el delta de tiles: es la cifra que demuestra que
   * panear no reconstruye la escena.
   */
  setView(view: CadRenderView): CadRenderViewUpdate {
    const previousTiles = this.visibleTiles;
    const octave = cadRenderZoomOctave(view.pixelsPerUnit);
    const lodChanged = octave !== this.zoomOctaveValue;
    this.view = view;
    this.zoomOctaveValue = octave;
    const viewStarted = cadRenderMark();
    this.visibleTiles = this.index.visibleTileIds(view.bounds);
    this.visibleTileSet = new Set(this.visibleTiles);
    const diff = diffCadTiles(previousTiles, this.visibleTiles);
    cadRenderStage("viewDiff", viewStarted);
    // Los tiles que salen de la vista liberan su geometría: sin esto, pasear por
    // un plano grande retiene el plano entero y la prueba de fuga lo caza.
    for (const tileId of diff.removed) {
      this.resident.delete(tileId);
      this.staging.delete(tileId);
    }
    if (lodChanged) {
      // Los residentes de la octava vieja NO se borran: siguen sirviendo sus
      // lotes mientras la octava nueva se reconstruye en `staging` (ver el
      // campo). Lo que sí muere es el staging de una octava que ya no es la
      // objetivo: era trabajo a medias hacia un destino que dejó de existir.
      for (const [tileId, tile] of [...this.staging])
        if (tile.zoomOctave !== octave) this.staging.delete(tileId);
    }
    const centerX = (view.bounds.minX + view.bounds.maxX) / 2;
    const centerY = (view.bounds.minY + view.bounds.maxY) / 2;
    this.scheduler.abort();
    this.scheduler.reprioritize(centerX, centerY);
    this.enqueueMissingTiles();
    return {
      addedTiles: diff.added.length,
      removedTiles: diff.removed.length,
      retainedTiles: diff.retained.length,
      lodChanged,
    };
  }

  private enqueueMissingTiles(): void {
    for (const tileId of this.visibleTiles) {
      const resident = this.resident.get(tileId);
      // Completo Y en la octava vigente: nada que hacer. Completo en una
      // octava vieja: sigue sirviendo, pero hay que reconstruir su relevo.
      if (resident?.complete && resident.zoomOctave === this.zoomOctaveValue)
        continue;
      if (this.staging.get(tileId)?.complete) continue;
      this.enqueueTile(tileId);
    }
  }

  private enqueueTile(tileId: CadTileId): void {
    const started = cadRenderMark();
    const bounds = this.index.tileContentBounds(tileId);
    if (!bounds) return;
    this.scheduler.enqueue({
      key: tileId,
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
      run: () => this.buildTileChunk(tileId),
    });
    cadRenderStage("tileEnqueue", started);
  }

  /**
   * Materializa un TROZO del tile y, si queda contenido, se reencola a sí mismo.
   *
   * El tile sigue siendo la unidad que entra y sale de la vista, pero deja de
   * ser la unidad de trabajo: así un tile denso en el escalón fino no se come el
   * cuadro entero. Lo ya materializado se ve mientras el resto llega, que es
   * exactamente la carga progresiva que se busca.
   */
  private buildTileChunk(tileId: CadTileId): void {
    cadRenderCount("chunks");
    // Con una petición en vuelo no hay nada que construir todavía: la
    // respuesta reencolará este tile. Sin la guarda, cada `setView` durante la
    // espera dispararía una petición duplicada del mismo lote.
    if (this.offThread.has(tileId)) return;
    // ¿Dónde se construye? Si hay un residente de OTRA octava, se construye el
    // relevo en `staging` y el residente sigue sirviendo; si no hay residente
    // (tile nuevo) o el residente ya es de la octava vigente, se construye en
    // su sitio, como siempre.
    const current = this.resident.get(tileId);
    const buildsInStaging =
      current !== undefined && current.zoomOctave !== this.zoomOctaveValue;
    const target = buildsInStaging ? this.staging : this.resident;
    let resident = target.get(tileId);
    if (resident && resident.zoomOctave !== this.zoomOctaveValue) {
      target.delete(tileId);
      resident = undefined;
    }
    if (!resident) {
      resident = {
        builders: new Map(),
        pending: this.index.entityIdsInTile(tileId),
        cursor: 0,
        entityIds: [],
        textRequests: [],
        instances: 0,
        zoomOctave: this.zoomOctaveValue,
        complete: false,
        batches: null,
      };
      target.set(tileId, resident);
    }
    let segmentsThisChunk = 0;
    while (resident.cursor < resident.pending.length) {
      const id = resident.pending[resident.cursor];
      const entity = this.entities.get(id);
      if (!entity) {
        resident.cursor += 1;
        continue;
      }
      const depth = cadDrawOrderDepth(this.drawOrder.get(id) ?? 0, this.drawOrderCount);
      if (entity.type === "mtext") {
        // El texto no se tesela: viaja como petición de quads para el atlas.
        // Los productores de geometría de MText, cotas y mleader se conservan;
        // este pipeline sólo cambia CÓMO se materializa el resultado.
        const textStarted = cadRenderMark();
        resident.cursor += 1;
        resident.textRequests.push({
          text: entity.text,
          fontKey: entity.fontFamily ?? "Arial",
          fontSize: entity.height ?? 120,
          x: entity.insertion.x,
          y: entity.insertion.y,
          rotationDeg: entity.rotation ?? 0,
          color: this.styleOf(entity).color,
          depth,
        });
        resident.entityIds.push(id);
        cadRenderStage("textRequest", textStarted);
        continue;
      }
      const tier = this.lodTierFor(id);
      // Con worker, un teselado que falta se PIDE en vez de calcularse aquí: el
      // cursor no avanza, la petición viaja y la respuesta reencola este tile,
      // que entonces materializa desde la caché. Sin worker (Node, la reserva),
      // la condición es falsa y el camino es el síncrono de siempre.
      if (
        this.offThread.active &&
        cadEntityTessellatesWithoutDocument(entity) &&
        !this.cache.peek(id, tier)
      ) {
        this.requestOffThreadChunk(tileId, resident.pending, resident.cursor);
        return;
      }
      resident.cursor += 1;
      const tessellationStarted = cadRenderMark();
      const tessellation = this.cache.get(id, tier, () =>
        tessellateCadEntity(entity, cadRenderSegmentBudget(tier), this.document, this.origin),
      );
      cadRenderStage("tessellate", tessellationStarted);
      if (tessellation.segmentCount === 0) continue;
      const batchStarted = cadRenderMark();
      const style = this.styleOf(entity);
      const key = cadLineStyleKey(style);
      let bucket = resident.builders.get(key);
      if (!bucket) {
        bucket = { style, builder: new CadLineBatchBuilder(Math.max(256, tessellation.segmentCount)) };
        resident.builders.set(key, bucket);
      }
      resident.instances += bucket.builder.push({ tessellation, style, depth });
      // Escribir instancias es lo único que invalida los lotes derivados.
      resident.batches = null;
      cadRenderStage("batchPush", batchStarted);
      resident.entityIds.push(id);
      segmentsThisChunk += tessellation.segmentCount;
      if (segmentsThisChunk >= CAD_RENDER_CHUNK_SEGMENT_BUDGET) break;
    }
    if (resident.cursor >= resident.pending.length) {
      resident.complete = true;
      // La lista de pendientes ya no hace falta: retenerla sería memoria muerta
      // multiplicada por el número de tiles residentes.
      resident.pending = [];
      if (buildsInStaging) {
        // RELEVO atómico: la octava nueva está completa y sustituye a la vieja
        // en la misma vuelta. El consumidor nunca ve el tile vacío.
        this.resident.set(tileId, resident);
        this.staging.delete(tileId);
      }
      return;
    }
    // Continuación del MISMO tile. Reencolar aquí el conjunto visible entero
    // volvería a recorrer todos los tiles por cada trozo: O(tiles) por trozo,
    // que es cuadrático sobre el cuadro y se comía el presupuesto.
    this.enqueueTile(tileId);
  }

  /**
   * Pide al worker el siguiente lote de teselados que FALTAN de un tile.
   *
   * Recorre las entidades pendientes desde el cursor y junta las que no están
   * en caché para el escalón vigente, hasta el tope de lote. Mientras la
   * petición viaja, el tile no tiene tarea en el planificador —la espera no
   * quema presupuesto de cuadro— pero sí cuenta en `pendingTasks`: una escena
   * con teselados en vuelo NO está asentada, y decir lo contrario haría que el
   * indicador (y los goldens que lo leen) declarasen listo un dibujo a medias.
   */
  private requestOffThreadChunk(
    tileId: CadTileId,
    pending: readonly string[],
    cursor: number,
  ): void {
    const batch = collectCadOffThreadBatch(
      pending,
      cursor,
      (id) => this.entities.get(id),
      (id) => this.lodTierFor(id),
      (id, tier) => this.cache.peek(id, tier) !== null,
    );
    if (batch.entities.length === 0) {
      // No puede pasar —se llama con el cursor sobre una entidad sin caché—,
      // pero si pasara, dejar el tile sin tarea NI petición lo congelaría.
      this.enqueueTile(tileId);
      return;
    }
    const hooks: CadOffThreadHooks = {
      seed: (payload, tier) => {
        const started = cadRenderMark();
        if (!this.entities.has(payload.entityId)) return;
        this.cache.get(payload.entityId, tier, () => cadTessellationFromPayload(payload));
        cadRenderStage("offThreadSeed", started);
      },
      finished: (finishedTileId) => {
        if (this.visibleTileSet.has(finishedTileId)) this.enqueueTile(finishedTileId);
      },
    };
    this.offThread.request(tileId, batch, hooks, this.origin);
  }

  /**
   * Lotes de un tile. La clave lleva el TILE por delante del cubo de estilo: un
   * lote es (tile × estilo), no sólo estilo. Sin el prefijo, dos tiles con el
   * mismo color se pisaban en el mapa de mallas del consumidor y sólo
   * sobrevivía el último — 48 lotes acababan siendo 3 objetos de escena y el
   * resto del dibujo desaparecía. Lo cazó el spec de la escena.
   */
  private residentBatches(tileId: CadTileId, resident: ResidentTile): CadLineBatch[] {
    if (resident.batches) return resident.batches;
    // `build()` devuelve VISTAS de los arrays del constructor, así que derivar
    // los lotes tras cada trozo cuesta O(cubos de estilo), no O(instancias).
    resident.batches = [...resident.builders.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([styleKey, bucket]) => ({
        bucketKey: `${tileId}#${styleKey}`,
        style: bucket.style,
        ...bucket.builder.build(),
      }))
      .filter((batch) => batch.instanceCount > 0);
    return resident.batches;
  }

  private lodTierFor(entityId: string): CadRenderLodTier {
    const bounds = this.index.bounds(entityId);
    if (!bounds) return 0;
    const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
    return cadRenderLodTier(span * this.view.pixelsPerUnit);
  }

  runFrame(budgetMs?: number): CadRenderFrameResult {
    return this.scheduler.runFrame(budgetMs);
  }

  /**
   * Accesores BARATOS del estado de la cola.
   *
   * Existen porque `stats()` no lo es: recorre las entidades visibles y las
   * residentes para poder afirmar que son las mismas, y eso es O(visibles).
   * Consultarlo dentro del bucle de cuadros convierte el bucle en O(n²) — pasó
   * al escribir el arnés de medida, y a 100.000 entidades el benchmark dejó de
   * terminar. Un bucle de cuadros pregunta «¿queda trabajo?», no «cuéntamelo
   * todo».
   */
  get pendingTasks(): number {
    // Las peticiones al worker cuentan: no están en la cola del planificador,
    // pero son trabajo que falta para que el dibujo esté completo.
    return this.scheduler.pending + this.offThread.pending;
  }

  get settled(): boolean {
    return this.scheduler.pending === 0 && this.offThread.pending === 0;
  }

  /**
   * Ejecuta cuadros hasta asentar. Es lo que mide `firstDetailMs` sin un rAF.
   *
   * SÍNCRONO a sabiendas: sólo puede vaciar la cola del planificador, no
   * esperar respuestas del worker. Quien lo usa —benchmark y specs de Node—
   * corre sin `Worker`; el consumidor del navegador (el anfitrión del editor,
   * el arnés del benchmark de navegador) itera con rAF preguntando `settled`,
   * que sí espera lo que está en vuelo.
   */
  settle(maxFrames = 100_000): number {
    let frames = 0;
    while (this.scheduler.pending > 0 && frames < maxFrames) {
      this.scheduler.runFrame();
      frames += 1;
    }
    return frames;
  }

  /** Lotes residentes de los tiles VISIBLES, en orden de cercanía al centro. */
  visibleBatches(): CadLineBatch[] {
    const started = cadRenderMark();
    const batches: CadLineBatch[] = [];
    for (const tileId of this.visibleTiles) {
      const tile = this.resident.get(tileId);
      if (tile) batches.push(...this.residentBatches(tileId, tile));
    }
    cadRenderStage("visibleBatches", started);
    return batches;
  }

  /** Peticiones de texto de los tiles visibles, para el atlas compartido. */
  visibleTextRequests(): CadTextQuadRequest[] {
    const requests: CadTextQuadRequest[] = [];
    for (const tileId of this.visibleTiles) {
      const tile = this.resident.get(tileId);
      if (tile) requests.push(...tile.textRequests);
    }
    return requests;
  }

  /** Entidades con detalle residente y visibles ahora mismo. */
  renderedEntityIds(): string[] {
    const ids: string[] = [];
    for (const tileId of this.visibleTiles) {
      const tile = this.resident.get(tileId);
      if (!tile) continue;
      for (const id of tile.entityIds) {
        const bounds = this.index.bounds(id);
        if (
          bounds &&
          bounds.minX <= this.view.bounds.maxX &&
          bounds.maxX >= this.view.bounds.minX &&
          bounds.minY <= this.view.bounds.maxY &&
          bounds.maxY >= this.view.bounds.minY
        )
          ids.push(id);
      }
    }
    return ids;
  }

  stats(): CadRenderPipelineStats {
    let batches = 0;
    let instances = 0;
    let glyphRequests = 0;
    for (const tileId of this.visibleTiles) {
      const tile = this.resident.get(tileId);
      if (!tile) continue;
      batches += tile.builders.size;
      instances += tile.instances;
      for (const request of tile.textRequests) glyphRequests += request.text.length;
    }
    return {
      totalEntities: this.entities.size,
      visibleEntities: this.index.visibleEntityIds(this.view.bounds).length,
      renderedEntities: this.renderedEntityIds().length,
      visibleTiles: this.visibleTiles.length,
      residentTiles: this.resident.size,
      batches,
      instances,
      glyphRequests,
      pendingTasks: this.pendingTasks,
      settled: this.settled,
      zoomOctave: this.zoomOctaveValue,
      tessellation: this.offThread.source,
      cache: this.cache.stats,
    };
  }

  /** Libera todo. Se llama al cerrar el documento; la prueba de fuga lo exige. */
  dispose(): void {
    this.scheduler.clear();
    this.resident.clear();
    this.staging.clear();
    this.cache.clear();
    this.entities.clear();
    this.drawOrder.clear();
    this.index.clear();
    this.dependencies.clear();
    this.visibleTiles = [];
    // Una respuesta del worker que llegue DESPUÉS no debe resucitar nada: la
    // época sube (no se siembra), el espejo de visibles queda vacío (no se
    // reencola) y la cuenta de en vuelo se vacía (no queda «pendiente» eterno).
    this.offThread.reset();
    this.visibleTileSet.clear();
  }
}
