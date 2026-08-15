/**
 * REGISTRO de entidades nativas del CAD: un adaptador por tipo, más el índice
 * espacial y el sincronizador de escena que lo consumen.
 *
 * Los ADAPTADORES viven en módulos hermanos —`basic-native-adapters`,
 * `curve-entity-adapters`, `block-text-adapters`, `solid3d-adapter`…— y este
 * archivo declara el contrato que cumplen y los junta. La dirección de los
 * imports importa: los hermanos importan de aquí sólo TIPOS, que se borran al
 * compilar. Un adaptador que le pidiera de vuelta un VALOR cerraría un ciclo que
 * `tsc --noEmit` no ve y que revienta al cargar con «Cannot access X before
 * initialization»; de ahí que `cloneContext` viva en `entity-context.ts`.
 */
import {
  type CadDocument,
  type CadEntity,
  type CadPoint2,
} from "./cad-document";
import { boundsIntersect } from "./entity-hit-geometry";
import type { CadAffine2 } from "./transform2d";
import { circleAdapter, isLegacyCircle, isLegacyDimension, lineAdapter } from "./basic-native-adapters";
import { arcAdapter, ellipseAdapter } from "./curve-entity-adapters";
import { insertAdapter, mtextAdapter } from "./block-text-adapters";
import { dimensionAdapter } from "./dimension-entity-adapter";
import { hatchAdapter } from "./hatch-entity-adapter";
import { polylineAdapter } from "./polyline-entity-adapter";
import { splineAdapter } from "./spline-entity-adapter";
import { pointAdapter, rayAdapter, xlineAdapter } from "./point-line-adapters";
import { imageAdapter, solidAdapter, wipeoutAdapter } from "./fill-entity-adapters";
import { attdefAdapter, tableAdapter } from "./annotation-v4-adapters";
import { mleaderAdapter } from "./mleader-entity-adapter";
import { regionAdapter, solid3dAdapter } from "./solid3d-adapter";
import { wallAdapter } from "./wall-entity-adapter";
import type { CadBoundaryPath } from "./hatch-associativity";

export type CadNativeEntity = Extract<
  CadEntity,
  { type: "line" | "polyline" | "circle" | "arc" | "ellipse" | "spline" | "hatch" | "mtext" | "dimension" | "mleader" | "insert"
    // Esquema 4. Cada uno tiene su adaptador registrado abajo; un tipo que
    // entra en esta unión sin adaptador revienta en `adapter()` la primera vez
    // que alguien lo dibuja, así que las dos listas se editan juntas.
    | "point" | "xline" | "ray" | "solid" | "wipeout" | "image" | "attdef" | "table"
    // Esquema 5: el sólido B-rep y la región 2D de la que nace. Misma regla que
    // arriba — tipo y adaptador se editan juntos.
    | "solid3d" | "region"
    // Esquema 6: el muro paramétrico. Misma regla — tipo y adaptador juntos.
    | "wall" }
>;
export type CadNativeEntityType = CadNativeEntity["type"];

export interface CadBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface CadRenderPath {
  points: CadPoint2[];
  closed: boolean;
}

export type CadGripKind =
  | "center"
  | "endpoint"
  | "quadrant"
  | "axis"
  | "control";

export interface CadGrip {
  id: string;
  kind: CadGripKind;
  point: CadPoint2;
  label: string;
}

export type CadSnapKind =
  | "center"
  | "endpoint"
  | "quadrant"
  | "tangent"
  | "control";

export interface CadSnapPoint {
  kind: CadSnapKind;
  point: CadPoint2;
  label: string;
}

export type CadPropertyValue = string | number | boolean;
export type CadPropertyBag = Record<string, CadPropertyValue>;

/**
 * Consulta ACOTADA del vecindario: las entidades cuya caja corta `bounds`.
 *
 * Existe para que `dependents` no reciba el documento entero. Un adaptador que
 * contestara recorriendo `document.entities` convertiría CADA edición en un
 * barrido O(n) del dibujo — justo el coste que el pipeline por tiles existe
 * para no pagar. Quien la sirve tiene un índice espacial detrás y responde en
 * proporción a lo que hay CERCA, no a lo que hay.
 */
export type CadEntityNeighborQuery = (bounds: CadBounds) => readonly CadNativeEntity[];

export interface CadEntityRenderer<E extends CadNativeEntity = CadNativeEntity> {
  paths(entity: E, segments?: number, document?: CadDocument): CadRenderPath[];
  /**
   * DECLARA que `paths` consume el DOCUMENTO: los trazos de esta entidad se
   * derivan de lo que hay alrededor, no sólo de sus propios campos.
   *
   * Hoy la cumplen dos adaptadores: INSERT —resuelve su definición de bloque—
   * y WALL —deriva sus uniones contra los muros vecinos—. La marca NO es
   * documentación: el carril fuera de hilo la consulta para decidir qué puede
   * viajar al worker, que tesela sin documento al lado. Un adaptador que lea el
   * documento y no se marque sale dibujado en el navegador con una geometría
   * distinta de la de la reserva síncrona —un muro sin sus uniones— y no hay
   * error, ni aviso, ni forma de notarlo salvo mirando el plano.
   *
   * Es `true` literal y opcional a propósito: `needsDocument: false` sería una
   * segunda manera de decir «no» y obligaría a los veinte adaptadores que no lo
   * necesitan a pronunciarse.
   */
  readonly needsDocument?: true;
  /**
   * Los ids cuya geometría cambia cuando cambia ESTA entidad.
   *
   * Con derivaciones por vecindad —las uniones de muro— el teselado cacheado
   * de A queda obsoleto porque se movió B. La invalidación del pipeline entra
   * por los ids que el ejecutor de comandos declara afectados, y ésos son los
   * que el usuario tocó: sin esta declaración el vecino se queda en pantalla
   * con el inglete de antes, que es un plano mal dibujado.
   *
   * `near` acota la búsqueda; el adaptador filtra por tipo y por su propio
   * criterio de contacto. Devuelve dependientes DIRECTOS: la derivación es
   * función pura de las RECETAS de los vecinos, no de su geometría derivada,
   * así que la relación no se propaga en cadena y un solo nivel basta.
   */
  dependents?(entity: E, near: CadEntityNeighborQuery): readonly string[];
}

export interface CadHitTester<E extends CadNativeEntity = CadNativeEntity> {
  hitTest(entity: E, point: CadPoint2, tolerance: number, document?: CadDocument): boolean;
  intersectsWindow(entity: E, window: CadBounds, crossing: boolean, document?: CadDocument): boolean;
}

export interface CadGripProvider<E extends CadNativeEntity = CadNativeEntity> {
  grips(entity: E): CadGrip[];
  moveGrip(entity: E, gripId: string, point: CadPoint2): E;
}

export interface CadSnapProvider<E extends CadNativeEntity = CadNativeEntity> {
  snaps(entity: E, cursor?: CadPoint2): CadSnapPoint[];
}

export interface CadPropertyAdapter<E extends CadNativeEntity = CadNativeEntity> {
  read(entity: E): CadPropertyBag;
  write(entity: E, patch: Partial<CadPropertyBag>): E;
}

export interface CadBoundsProvider<E extends CadNativeEntity = CadNativeEntity> {
  bounds(entity: E, document?: CadDocument): CadBounds;
}

/**
 * Transformada aplicable a una entidad.
 *
 * Los cuatro primeros campos son el vocabulario histórico y su comportamiento
 * está congelado bit a bit (ver `cadTransformPoint3`). Los tres últimos son
 * nuevos y amplían lo expresable a **cualquier afín 2×3**, que es lo que hacía
 * falta para MIRROR: una reflexión tiene determinante negativo y no se puede
 * escribir como giro más escala uniforme, por mucho que se intente.
 */
export interface CadEntityTransform {
  translation?: CadPoint2;
  rotationDeg?: number;
  scale?: number;
  origin?: CadPoint2;
  /** Escala no uniforme. Gana sobre `scale` cuando ambas están presentes. */
  scaleXY?: CadPoint2;
  /** Eje de reflexión: un punto y una dirección (no hace falta normalizarla). */
  mirror?: { point: CadPoint2; direction: CadPoint2 };
  /** Escotilla de escape: si viene, gana sobre todo lo demás. */
  affine?: CadAffine2;
}

export {
  cadTransformAngleBase,
  cadTransformIsReflecting,
  cadTransformScaleFactor,
} from "./transform2d";

export interface CadCommandAdapter<E extends CadNativeEntity = CadNativeEntity> {
  transform(entity: E, transform: CadEntityTransform): E;
}

export interface CadEntityAdapter<E extends CadNativeEntity = CadNativeEntity> {
  type: E["type"];
  renderer: CadEntityRenderer<E>;
  hitTester: CadHitTester<E>;
  grips: CadGripProvider<E>;
  snaps: CadSnapProvider<E>;
  properties: CadPropertyAdapter<E>;
  bounds: CadBoundsProvider<E>;
  commands: CadCommandAdapter<E>;
}

/** Vive en `entity-context.ts`, que es una hoja del grafo. Se reexporta aquí. */
export { cloneContext } from "./entity-context";

export class CadEntityRegistry {
  private readonly adapters = new Map<
    CadNativeEntityType,
    CadEntityAdapter<CadNativeEntity>
  >();

  register<E extends CadNativeEntity>(adapter: CadEntityAdapter<E>): this {
    this.adapters.set(
      adapter.type,
      adapter as CadEntityAdapter<CadNativeEntity>,
    );
    return this;
  }

  supports(entity: CadEntity): entity is CadNativeEntity {
    // Lo que posee el sistema heredado NO lo reclama el registro nativo: el
    // nativo no sabe guardarlo, porque la reproyección lo rehace desde la
    // proyección del editor. Vale para el círculo heredado y para la cota sin
    // `dimensionKind`.
    if (isLegacyCircle(entity) || isLegacyDimension(entity)) return false;
    return this.adapters.has(entity.type as CadNativeEntityType);
  }

  /**
   * Los tipos registrados, en orden de registro.
   *
   * Lo consumen los barridos que exigen que TODO adaptador cumpla algo —el de
   * paridad con el worker, sin ir más lejos—. Una lista escrita a mano en el
   * spec se queda atrás en cuanto alguien registra un tipo nuevo, que es
   * exactamente el momento en que la comprobación hacía falta.
   */
  types(): CadNativeEntityType[] {
    return [...this.adapters.keys()];
  }

  adapter<E extends CadNativeEntity>(entity: E): CadEntityAdapter<E> {
    const adapter = this.adapters.get(entity.type);
    if (!adapter) throw new Error(`No CAD entity adapter registered for ${entity.type}.`);
    return adapter as CadEntityAdapter<E>;
  }
}

export const CAD_ENTITY_REGISTRY = new CadEntityRegistry()
  .register(lineAdapter)
  .register(polylineAdapter)
  .register(circleAdapter)
  .register(arcAdapter)
  .register(ellipseAdapter)
  .register(splineAdapter)
  .register(mtextAdapter)
  .register(hatchAdapter)
  .register(dimensionAdapter)
  .register(mleaderAdapter)
  .register(insertAdapter)
  // Esquema 4. Van al final porque el orden de registro no importa —el registro
  // indexa por tipo—, pero mantenerlos juntos hace evidente qué estrena v4.
  .register(pointAdapter)
  .register(xlineAdapter)
  .register(rayAdapter)
  .register(solidAdapter)
  .register(wipeoutAdapter)
  .register(imageAdapter)
  .register(attdefAdapter)
  .register(tableAdapter)
  // Esquema 5. `solid3d` guarda su árbol de construcción y deriva su cuerpo con
  // el kernel B-rep; `region` es el área cerrada que alimenta EXTRUDE y REVOLVE.
  .register(solid3dAdapter)
  .register(regionAdapter)
  // Esquema 6. `wall` guarda su receta —eje, grosor, altura— y deriva la doble
  // línea de planta en `wall-geometry.ts`.
  .register(wallAdapter);

function rectangularBoundary(entity: Extract<CadEntity, { type: "box" | "station" }>): CadPoint2[] {
  const center = { x: entity.x + entity.w / 2, y: entity.y + entity.h / 2 };
  if (entity.type === "box" && entity.shape === "circle") {
    return Array.from({ length: 64 }, (_, index) => {
      const angle = (index / 64) * Math.PI * 2;
      return { x: center.x + Math.cos(angle) * entity.w / 2, y: center.y + Math.sin(angle) * entity.h / 2 };
    });
  }
  const radians = (entity.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [
    { x: -entity.w / 2, y: -entity.h / 2 },
    { x: entity.w / 2, y: -entity.h / 2 },
    { x: entity.w / 2, y: entity.h / 2 },
    { x: -entity.w / 2, y: entity.h / 2 },
  ].map((point) => ({
    x: center.x + point.x * cos - point.y * sin,
    y: center.y + point.x * sin + point.y * cos,
  }));
}

export function cadEntityBoundaryPaths(
  entity: CadEntity,
  registry = CAD_ENTITY_REGISTRY,
): CadBoundaryPath[] {
  if (entity.type === "box" || entity.type === "station")
    return [{ sourceId: entity.id, points: rectangularBoundary(entity), closed: true }];
  if (!registry.supports(entity)) return [];
  if (entity.type === "hatch")
    return entity.boundaries.map((points) => ({ sourceId: entity.id, points, closed: true }));
  if (entity.type === "mtext") return [];
  if (entity.type === "dimension") return [];
  if (entity.type === "mleader") return [];
  return registry.adapter(entity).renderer.paths(entity, 192)
    .map((path) => ({ sourceId: entity.id, points: path.points, closed: path.closed }));
}


interface SpatialEntry {
  bounds: CadBounds;
  cells: string[];
  overflow: boolean;
}

/**
 * Incremental uniform-grid index for native CAD entities. It avoids scanning
 * the whole document on pointermove and window selection. Very large entities
 * live in a bounded overflow set instead of exploding the number of buckets.
 */
export class CadSpatialIndex {
  private readonly buckets = new Map<string, Set<string>>();
  private readonly entries = new Map<string, SpatialEntry>();
  private readonly overflow = new Set<string>();

  constructor(
    private readonly cellSize = 2_000,
    private readonly maxCellsPerEntity = 4_096,
  ) {
    if (!(cellSize > 0)) throw new Error("cellSize must be positive.");
  }

  private cellKeys(bounds: CadBounds): string[] {
    // Una entidad SIN COTA —XLINE, RAY— tiene bounds infinitos, y eso no es un
    // caso raro: es su definición. Sin este guardia, `Math.floor(-Infinity /
    // cellSize)` da `-Infinity`, el conteo de celdas sale `NaN`, la comparación
    // `NaN > maxCellsPerEntity` es FALSA y el bucle siguiente itera de
    // `-Infinity` a `+Infinity`. No es que el índice devuelva de más: es que se
    // cuelga el hilo, y con él el editor entero.
    //
    // La salida correcta ya existía para las entidades enormes: la lista vacía
    // enruta al conjunto de DESBORDAMIENTO, que se examina en toda búsqueda.
    // Una recta infinita se comporta como una entidad gigantesca, que es
    // exactamente lo que es.
    if (
      !Number.isFinite(bounds.minX) || !Number.isFinite(bounds.maxX) ||
      !Number.isFinite(bounds.minY) || !Number.isFinite(bounds.maxY)
    )
      return [];
    const minX = Math.floor(bounds.minX / this.cellSize);
    const maxX = Math.floor(bounds.maxX / this.cellSize);
    const minY = Math.floor(bounds.minY / this.cellSize);
    const maxY = Math.floor(bounds.maxY / this.cellSize);
    const count = (maxX - minX + 1) * (maxY - minY + 1);
    if (count > this.maxCellsPerEntity) return [];
    const cells: string[] = [];
    for (let x = minX; x <= maxX; x += 1)
      for (let y = minY; y <= maxY; y += 1) cells.push(`${x}:${y}`);
    return cells;
  }

  upsert(id: string, bounds: CadBounds): void {
    this.remove(id);
    const cells = this.cellKeys(bounds);
    const overflow = cells.length === 0;
    this.entries.set(id, { bounds: { ...bounds }, cells, overflow });
    if (overflow) this.overflow.add(id);
    for (const cell of cells) {
      const bucket = this.buckets.get(cell) ?? new Set<string>();
      bucket.add(id);
      this.buckets.set(cell, bucket);
    }
  }

  remove(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    for (const cell of entry.cells) {
      const bucket = this.buckets.get(cell);
      bucket?.delete(id);
      if (bucket?.size === 0) this.buckets.delete(cell);
    }
    this.overflow.delete(id);
    this.entries.delete(id);
  }

  search(bounds: CadBounds): string[] {
    const cells = this.cellKeys(bounds);
    // A viewport or crossing window can legitimately span more cells than the
    // per-entity overflow guard. In that case an empty cell list means
    // "bounded full scan", not "no matches".
    const result = cells.length
      ? new Set<string>(this.overflow)
      : new Set<string>(this.entries.keys());
    for (const cell of cells)
      for (const id of this.buckets.get(cell) ?? []) result.add(id);
    return [...result]
      .filter((id) => {
        const entry = this.entries.get(id);
        return !!entry && boundsIntersect(entry.bounds, bounds);
      })
      .sort();
  }

  bounds(id: string): CadBounds | null {
    const bounds = this.entries.get(id)?.bounds;
    return bounds ? { ...bounds } : null;
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.buckets.clear();
    this.entries.clear();
    this.overflow.clear();
  }
}

export interface CadSceneSink<P> {
  create(entity: CadNativeEntity): P;
  update(entity: CadNativeEntity, projection: P): P;
  remove(entityId: string, projection: P): void;
}

export interface CadSceneSyncStats {
  created: number;
  updated: number;
  removed: number;
  unchanged: number;
  total: number;
}

export interface CadProgressiveSceneSyncStats extends CadSceneSyncStats {
  processed: number;
  batches: number;
  cancelled: boolean;
}

export interface CadProgressiveSceneSyncOptions {
  batchSize?: number;
  schedule?: () => Promise<void>;
  onBatch?: (stats: CadProgressiveSceneSyncStats) => void;
}

export interface CadScenePatch {
  upsert: CadNativeEntity[];
  remove: string[];
}

/**
 * Incremental CadDocument → scene projection. The canonical document remains
 * authoritative; projections and their per-entity hashes are disposable.
 */
export class CadSceneSynchronizer<P> {
  readonly spatialIndex: CadSpatialIndex;
  private readonly versions = new Map<string, string>();
  private readonly projections = new Map<string, P>();
  private syncGeneration = 0;
  private currentDocument?: CadDocument;

  constructor(
    private readonly registry = CAD_ENTITY_REGISTRY,
    spatialIndex = new CadSpatialIndex(),
  ) {
    this.spatialIndex = spatialIndex;
  }

  sync(document: CadDocument, sink: CadSceneSink<P>): CadSceneSyncStats {
    this.syncGeneration += 1;
    this.currentDocument = document;
    const current = new Map(
      document.entities
        .filter((entity): entity is CadNativeEntity => this.registry.supports(entity))
        .map((entity) => [entity.id, entity]),
    );
    let created = 0;
    let updated = 0;
    let removed = 0;
    let unchanged = 0;

    for (const [id, projection] of [...this.projections]) {
      if (current.has(id)) continue;
      sink.remove(id, projection);
      this.projections.delete(id);
      this.versions.delete(id);
      this.spatialIndex.remove(id);
      removed += 1;
    }

    for (const entity of current.values()) {
      const version = JSON.stringify(entity);
      const previous = this.projections.get(entity.id);
      if (!previous) {
        this.projections.set(entity.id, sink.create(entity));
        this.spatialIndex.upsert(
          entity.id,
          this.registry.adapter(entity).bounds.bounds(entity, document),
        );
        created += 1;
      } else if (this.versions.get(entity.id) !== version) {
        this.projections.set(entity.id, sink.update(entity, previous));
        this.spatialIndex.upsert(
          entity.id,
          this.registry.adapter(entity).bounds.bounds(entity, document),
        );
        updated += 1;
      } else {
        unchanged += 1;
      }
      this.versions.set(entity.id, version);
    }

    return {
      created,
      updated,
      removed,
      unchanged,
      total: current.size,
    };
  }

  /**
   * Reconciles a scene without blocking the UI on thousands of Three.js object
   * creations. Existing projections that remain in the target are preserved;
   * removals happen immediately and new/changed entities are applied in
   * cancellable batches.
   */
  async syncProgressive(
    document: CadDocument,
    sink: CadSceneSink<P>,
    options: CadProgressiveSceneSyncOptions = {},
  ): Promise<CadProgressiveSceneSyncStats> {
    const generation = ++this.syncGeneration;
    this.currentDocument = document;
    const entities = document.entities.filter(
      (entity): entity is CadNativeEntity => this.registry.supports(entity),
    );
    const currentIds = new Set(entities.map((entity) => entity.id));
    const stats: CadProgressiveSceneSyncStats = {
      created: 0,
      updated: 0,
      removed: 0,
      unchanged: 0,
      processed: 0,
      batches: 0,
      total: entities.length,
      cancelled: false,
    };

    for (const [id, projection] of [...this.projections]) {
      if (currentIds.has(id)) continue;
      sink.remove(id, projection);
      this.projections.delete(id);
      this.versions.delete(id);
      this.spatialIndex.remove(id);
      stats.removed += 1;
    }

    const batchSize = Math.max(1, Math.floor(options.batchSize ?? 200));
    const schedule = options.schedule ?? (() => new Promise<void>((resolve) => {
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => resolve(), { timeout: 50 });
      } else {
        setTimeout(resolve, 0);
      }
    }));

    for (let start = 0; start < entities.length; start += batchSize) {
      if (start > 0) await schedule();
      if (generation !== this.syncGeneration) {
        stats.cancelled = true;
        return stats;
      }
      const batch = entities.slice(start, start + batchSize);
      for (const entity of batch) {
        const version = JSON.stringify(entity);
        const previous = this.projections.get(entity.id);
        if (!previous) {
          this.projections.set(entity.id, sink.create(entity));
          stats.created += 1;
        } else if (this.versions.get(entity.id) !== version) {
          this.projections.set(entity.id, sink.update(entity, previous));
          stats.updated += 1;
        } else {
          stats.unchanged += 1;
        }
        if (!previous || this.versions.get(entity.id) !== version) {
          this.spatialIndex.upsert(
            entity.id,
            this.registry.adapter(entity).bounds.bounds(entity, document),
          );
        }
        this.versions.set(entity.id, version);
      }
      stats.processed += batch.length;
      stats.batches += 1;
      options.onBatch?.({ ...stats });
    }
    return stats;
  }

  /**
   * Applies a known document delta without scanning or hashing the complete
   * drawing. Command handlers can use this for pointermove and small edits,
   * while `sync` remains the safe reconciliation path after load/undo/redo.
   */
  applyPatch(patch: CadScenePatch, sink: CadSceneSink<P>): CadSceneSyncStats {
    this.syncGeneration += 1;
    let created = 0;
    let updated = 0;
    let removed = 0;
    let unchanged = 0;

    for (const id of new Set(patch.remove)) {
      const projection = this.projections.get(id);
      if (!projection) continue;
      sink.remove(id, projection);
      this.projections.delete(id);
      this.versions.delete(id);
      this.spatialIndex.remove(id);
      removed += 1;
    }

    for (const entity of patch.upsert) {
      const version = JSON.stringify(entity);
      const previous = this.projections.get(entity.id);
      if (!previous) {
        this.projections.set(entity.id, sink.create(entity));
        created += 1;
      } else if (this.versions.get(entity.id) !== version) {
        this.projections.set(entity.id, sink.update(entity, previous));
        updated += 1;
      } else {
        unchanged += 1;
      }
      if (!previous || this.versions.get(entity.id) !== version) {
        this.spatialIndex.upsert(
          entity.id,
          this.registry.adapter(entity).bounds.bounds(entity, this.currentDocument),
        );
      }
      this.versions.set(entity.id, version);
    }

    return {
      created,
      updated,
      removed,
      unchanged,
      total: this.projections.size,
    };
  }

  projection(entityId: string): P | undefined {
    return this.projections.get(entityId);
  }

  entries(): [string, P][] {
    return [...this.projections.entries()];
  }

  clear(sink: Pick<CadSceneSink<P>, "remove">): void {
    this.syncGeneration += 1;
    this.currentDocument = undefined;
    for (const [id, projection] of this.projections)
      sink.remove(id, projection);
    this.projections.clear();
    this.versions.clear();
    this.spatialIndex.clear();
  }
}
