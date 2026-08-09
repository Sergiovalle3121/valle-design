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
 * Puro respecto a THREE: produce lotes en arrays tipados. Quien lo consume los
 * sube a la GPU con `line-batch-three.ts`.
 */
import {
  CAD_ENTITY_REGISTRY,
  type CadBounds,
  type CadNativeEntity,
} from "../entity-runtime";
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
import type { CadTextQuadRequest } from "./text-atlas";

/** Color por defecto, el mismo que usaba la proyección anterior. */
export const CAD_RENDER_DEFAULT_COLOR = 0x60a5fa;
/** Medio grosor por defecto en píxeles: un trazo de 1 px. */
export const CAD_RENDER_DEFAULT_HALF_WIDTH_PX = 0.5;

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
}

function defaultStyle(entity: CadNativeEntity): CadLineStyle {
  const value = entity.context?.presentation?.color?.value;
  const color =
    value && /^#[0-9a-f]{6}$/i.test(value)
      ? Number.parseInt(value.slice(1), 16)
      : CAD_RENDER_DEFAULT_COLOR;
  const weight = entity.context?.presentation?.lineweight?.value;
  return {
    color,
    // El lineweight canónico va en centésimas de milímetro, como en DXF. Se
    // convierte a un medio grosor en píxeles con la regla de que 0,25 mm es un
    // trazo fino de 1 px: es una convención, pero explícita y en un solo sitio.
    halfWidthPx:
      typeof weight === "number" && weight > 0
        ? Math.max(CAD_RENDER_DEFAULT_HALF_WIDTH_PX, weight / 50)
        : CAD_RENDER_DEFAULT_HALF_WIDTH_PX,
    linetypeIndex: 0,
    layer: entity.layer,
  };
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
  private readonly cache: CadTessellationCache;
  private readonly scheduler: CadRenderScheduler;
  private readonly styleOf: CadRenderStyleResolver;
  private index: CadRenderTileIndex;
  private document?: CadDocument;
  private visibleTiles: CadTileId[] = [];
  private view: CadRenderView = {
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    pixelsPerUnit: 1,
  };
  private zoomOctaveValue = 0;
  private drawOrderCount = 0;

  constructor(options: CadRenderPipelineOptions = {}) {
    this.cache = options.cache ?? new CadTessellationCache();
    this.scheduler = new CadRenderScheduler({
      frameBudgetMs: options.frameBudgetMs,
      now: options.now,
    });
    this.styleOf = options.style ?? defaultStyle;
    this.index = new CadRenderTileIndex(options.tileSize ?? 4_096);
    this.document = options.document;
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
    this.cache.clear();
    this.scheduler.abort();
    this.document = document ?? this.document;
    let bounds: CadBounds | null = null;
    const boundsById = new Map<string, CadBounds>();
    for (const entity of entities) {
      if (!CAD_ENTITY_REGISTRY.supports(entity)) continue;
      this.entities.set(entity.id, entity);
      const entityBounds = CAD_ENTITY_REGISTRY.adapter(entity).bounds.bounds(
        entity,
        this.document,
      );
      boundsById.set(entity.id, entityBounds);
      bounds = bounds
        ? {
            minX: Math.min(bounds.minX, entityBounds.minX),
            minY: Math.min(bounds.minY, entityBounds.minY),
            maxX: Math.max(bounds.maxX, entityBounds.maxX),
            maxY: Math.max(bounds.maxY, entityBounds.maxY),
          }
        : { ...entityBounds };
    }
    drawOrderIds.forEach((id, position) => this.drawOrder.set(id, position));
    this.drawOrderCount = Math.max(drawOrderIds.length, this.entities.size);
    this.index = new CadRenderTileIndex(
      bounds ? suggestCadTileSize(bounds, this.entities.size) : 4_096,
    );
    for (const [id, entityBounds] of boundsById) this.index.upsert(id, entityBounds);
    this.visibleTiles = [];
  }

  get tileSize(): number {
    return this.index.tileSize;
  }

  /**
   * Invalidación por `affectedEntityIds`. Reindexa las entidades tocadas, tira
   * su teselado y libera los tiles residentes que las contenían para que se
   * reconstruyan con presupuesto en vez de de golpe.
   */
  invalidate(
    affectedEntityIds: readonly string[],
    upserts: readonly CadNativeEntity[] = [],
  ): number {
    for (const entity of upserts) {
      if (!CAD_ENTITY_REGISTRY.supports(entity)) continue;
      this.entities.set(entity.id, entity);
      this.index.upsert(
        entity.id,
        CAD_ENTITY_REGISTRY.adapter(entity).bounds.bounds(entity, this.document),
      );
    }
    for (const id of affectedEntityIds) {
      if (upserts.some((entity) => entity.id === id)) continue;
      if (!this.entities.has(id)) continue;
      // Un id afectado que ya no está entre las entidades es una baja.
      this.index.remove(id);
      this.entities.delete(id);
    }
    this.cache.invalidate(affectedEntityIds);
    const affected = new Set(affectedEntityIds);
    let evicted = 0;
    for (const [tileId, tile] of [...this.resident]) {
      if (!tile.entityIds.some((id) => affected.has(id))) continue;
      this.resident.delete(tileId);
      evicted += 1;
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
    this.visibleTiles = this.index.visibleTileIds(view.bounds);
    const diff = diffCadTiles(previousTiles, this.visibleTiles);
    // Los tiles que salen de la vista liberan su geometría: sin esto, pasear por
    // un plano grande retiene el plano entero y la prueba de fuga lo caza.
    for (const tileId of diff.removed) this.resident.delete(tileId);
    if (lodChanged) {
      for (const [tileId, tile] of [...this.resident])
        if (tile.zoomOctave !== octave) this.resident.delete(tileId);
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
      if (resident?.complete) continue;
      this.enqueueTile(tileId);
    }
  }

  private enqueueTile(tileId: CadTileId): void {
    const bounds = this.index.tileContentBounds(tileId);
    if (!bounds) return;
    this.scheduler.enqueue({
      key: tileId,
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
      run: () => this.buildTileChunk(tileId),
    });
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
    let resident = this.resident.get(tileId);
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
      };
      this.resident.set(tileId, resident);
    }
    let segmentsThisChunk = 0;
    while (resident.cursor < resident.pending.length) {
      const id = resident.pending[resident.cursor];
      resident.cursor += 1;
      const entity = this.entities.get(id);
      if (!entity) continue;
      const depth = cadDrawOrderDepth(this.drawOrder.get(id) ?? 0, this.drawOrderCount);
      if (entity.type === "mtext") {
        // El texto no se tesela: viaja como petición de quads para el atlas.
        // Los productores de geometría de MText, cotas y mleader se conservan;
        // este pipeline sólo cambia CÓMO se materializa el resultado.
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
        continue;
      }
      const tier = this.lodTierFor(id);
      const tessellation = this.cache.get(id, tier, () =>
        tessellateCadEntity(entity, cadRenderSegmentBudget(tier), this.document),
      );
      if (tessellation.segmentCount === 0) continue;
      const style = this.styleOf(entity);
      const key = cadLineStyleKey(style);
      let bucket = resident.builders.get(key);
      if (!bucket) {
        bucket = { style, builder: new CadLineBatchBuilder(Math.max(256, tessellation.segmentCount)) };
        resident.builders.set(key, bucket);
      }
      resident.instances += bucket.builder.push({ tessellation, style, depth });
      resident.entityIds.push(id);
      segmentsThisChunk += tessellation.segmentCount;
      if (segmentsThisChunk >= CAD_RENDER_CHUNK_SEGMENT_BUDGET) break;
    }
    if (resident.cursor >= resident.pending.length) {
      resident.complete = true;
      // La lista de pendientes ya no hace falta: retenerla sería memoria muerta
      // multiplicada por el número de tiles residentes.
      resident.pending = [];
      return;
    }
    // Continuación del MISMO tile. Reencolar aquí el conjunto visible entero
    // volvería a recorrer todos los tiles por cada trozo: O(tiles) por trozo,
    // que es cuadrático sobre el cuadro y se comía el presupuesto.
    this.enqueueTile(tileId);
  }

  /**
   * Lotes de un tile. La clave lleva el TILE por delante del cubo de estilo: un
   * lote es (tile × estilo), no sólo estilo. Sin el prefijo, dos tiles con el
   * mismo color se pisaban en el mapa de mallas del consumidor y sólo
   * sobrevivía el último — 48 lotes acababan siendo 3 objetos de escena y el
   * resto del dibujo desaparecía. Lo cazó el spec de la escena.
   */
  private residentBatches(tileId: CadTileId, resident: ResidentTile): CadLineBatch[] {
    // `build()` devuelve VISTAS de los arrays del constructor, así que derivar
    // los lotes tras cada trozo cuesta O(cubos de estilo), no O(instancias).
    return [...resident.builders.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([styleKey, bucket]) => ({
        bucketKey: `${tileId}#${styleKey}`,
        style: bucket.style,
        ...bucket.builder.build(),
      }))
      .filter((batch) => batch.instanceCount > 0);
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
    return this.scheduler.pending;
  }

  get settled(): boolean {
    return this.scheduler.pending === 0;
  }

  /** Ejecuta cuadros hasta asentar. Es lo que mide `firstDetailMs` sin un rAF. */
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
    const batches: CadLineBatch[] = [];
    for (const tileId of this.visibleTiles) {
      const tile = this.resident.get(tileId);
      if (tile) batches.push(...this.residentBatches(tileId, tile));
    }
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
      pendingTasks: this.scheduler.pending,
      settled: this.scheduler.pending === 0,
      zoomOctave: this.zoomOctaveValue,
      cache: this.cache.stats,
    };
  }

  /** Libera todo. Se llama al cerrar el documento; la prueba de fuga lo exige. */
  dispose(): void {
    this.scheduler.clear();
    this.resident.clear();
    this.cache.clear();
    this.entities.clear();
    this.drawOrder.clear();
    this.index.clear();
    this.visibleTiles = [];
  }
}
