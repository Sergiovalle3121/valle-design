/**
 * Partición del plano en tiles para el pipeline de render por lotes.
 *
 * ## Qué problema resuelve
 *
 * El pipeline anterior decidía qué dibujar con `planCadNativeRenderBudget`, que
 * ante un documento grande **muestreaba**: de 100.000 entidades visibles se
 * quedaba con 2.500 repartidas uniformemente. El resultado no es un dibujo
 * lento, es un dibujo FALSO — el usuario ve un plano que no es el suyo y no hay
 * nada en pantalla que se lo diga. Este índice existe para que el culling sea
 * culling: se dibuja TODO lo que cae dentro de la vista, y lo que no se dibuja
 * es exactamente lo que no se ve.
 *
 * ## Por qué tiles y no el índice espacial que ya existe
 *
 * `CadSpatialIndex` responde «qué entidades tocan este rectángulo» y lo hace
 * bien (p95 de 5,27 ms a 100k) — por eso la selección lo sigue usando y este
 * módulo no lo toca. Pero para el render la pregunta no es esa: es «qué ha
 * CAMBIADO respecto al cuadro anterior». Un paneo de 30 px con el índice
 * espacial devuelve otra vez las ~99 % de entidades que ya estaban dibujadas, y
 * reconstruir su geometría es justamente el coste que hay que eliminar. Con
 * tiles la respuesta es una diferencia de conjuntos pequeña: dos o tres tiles
 * entran, dos o tres salen, y el resto de la escena no se toca.
 *
 * ## Rejilla laxa: cada entidad vive en UN solo tile
 *
 * La tentación es meter cada entidad en todos los tiles que solapa. Entonces
 * una línea a caballo de cuatro tiles se dibuja cuatro veces: cuádruple coste y,
 * con mezcla alfa, cuádruple opacidad — un artefacto visible. Aquí cada entidad
 * pertenece al tile que contiene el CENTRO de su caja, y cada tile recuerda la
 * caja union de su contenido (`contentBounds`). Un tile es visible cuando esa
 * caja union corta la vista, no cuando la corta su rejilla nominal. Así:
 *
 *   - ninguna entidad se dibuja dos veces (pertenece a un tile y sólo a uno);
 *   - ninguna entidad se pierde (su tile siempre la contiene por construcción);
 *   - una entidad enorme no explota la memoria del índice: infla la caja de un
 *     único tile, que pasa a considerarse visible más a menudo. Es un coste
 *     acotado y local, no cuadrático.
 *
 * Puro: sin THREE y sin DOM, para poder probarlo entero en Node.
 */
import type { CadBounds } from "../entity-runtime";

/** Identificador textual de un tile. `${tx}:${ty}` con tx,ty enteros con signo. */
export type CadTileId = string;

export interface CadTileCoord {
  tx: number;
  ty: number;
}

export interface CadRenderTile {
  id: CadTileId;
  tx: number;
  ty: number;
  /** Caja union del contenido real. Es la que decide la visibilidad. */
  contentBounds: CadBounds;
  entityIds: readonly string[];
}

export interface CadTileDiff {
  added: CadTileId[];
  removed: CadTileId[];
  retained: CadTileId[];
}

interface MutableTile {
  tx: number;
  ty: number;
  contentBounds: CadBounds;
  entityIds: Set<string>;
  /** Marca de recálculo diferido de `contentBounds` tras una baja. */
  boundsDirty: boolean;
}

export const CAD_RENDER_DEFAULT_TILE_SIZE = 4_096;

export function cadTileId(tx: number, ty: number): CadTileId {
  return `${tx}:${ty}`;
}

export function cadTileCoordFromId(id: CadTileId): CadTileCoord {
  const separator = id.indexOf(":");
  return {
    tx: Number.parseInt(id.slice(0, separator), 10),
    ty: Number.parseInt(id.slice(separator + 1), 10),
  };
}

function boundsIntersect(a: CadBounds, b: CadBounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function unionInto(target: CadBounds, source: CadBounds): void {
  if (source.minX < target.minX) target.minX = source.minX;
  if (source.minY < target.minY) target.minY = source.minY;
  if (source.maxX > target.maxX) target.maxX = source.maxX;
  if (source.maxY > target.maxY) target.maxY = source.maxY;
}

const EMPTY_BOUNDS: CadBounds = {
  minX: Number.POSITIVE_INFINITY,
  minY: Number.POSITIVE_INFINITY,
  maxX: Number.NEGATIVE_INFINITY,
  maxY: Number.NEGATIVE_INFINITY,
};

/**
 * Índice de tiles del render. No sustituye a `CadSpatialIndex` (que sigue
 * sirviendo a la selección con su propio gate en verde): responde otra pregunta.
 */
export class CadRenderTileIndex {
  private readonly tiles = new Map<CadTileId, MutableTile>();
  private readonly entityTiles = new Map<string, CadTileId>();
  private readonly entityBounds = new Map<string, CadBounds>();

  constructor(readonly tileSize: number = CAD_RENDER_DEFAULT_TILE_SIZE) {
    if (!(tileSize > 0)) throw new Error("tileSize must be positive.");
  }

  get size(): number {
    return this.entityTiles.size;
  }

  get tileCount(): number {
    return this.tiles.size;
  }

  /** Tile propietario de una caja: el que contiene su centro. */
  ownerTile(bounds: CadBounds): CadTileCoord {
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    return {
      tx: Math.floor(centerX / this.tileSize),
      ty: Math.floor(centerY / this.tileSize),
    };
  }

  upsert(id: string, bounds: CadBounds): void {
    const previous = this.entityTiles.get(id);
    const { tx, ty } = this.ownerTile(bounds);
    const nextId = cadTileId(tx, ty);
    if (previous !== undefined && previous !== nextId) this.detach(id, previous);
    const copy: CadBounds = {
      minX: bounds.minX,
      minY: bounds.minY,
      maxX: bounds.maxX,
      maxY: bounds.maxY,
    };
    const tile = this.tiles.get(nextId) ?? {
      tx,
      ty,
      contentBounds: { ...EMPTY_BOUNDS },
      entityIds: new Set<string>(),
      boundsDirty: false,
    };
    if (previous === nextId) {
      // Reemplazo en el mismo tile: la caja anterior puede haber sido la que
      // definía un borde, así que el recálculo no se puede evitar por unión.
      tile.boundsDirty = true;
    }
    tile.entityIds.add(id);
    unionInto(tile.contentBounds, copy);
    this.tiles.set(nextId, tile);
    this.entityTiles.set(id, nextId);
    this.entityBounds.set(id, copy);
  }

  remove(id: string): void {
    const tileId = this.entityTiles.get(id);
    if (tileId === undefined) return;
    this.detach(id, tileId);
    this.entityTiles.delete(id);
    this.entityBounds.delete(id);
  }

  private detach(id: string, tileId: CadTileId): void {
    const tile = this.tiles.get(tileId);
    if (!tile) return;
    tile.entityIds.delete(id);
    if (tile.entityIds.size === 0) {
      this.tiles.delete(tileId);
      return;
    }
    // La caja del tile sólo puede encoger al quitar contenido; se recalcula
    // perezosamente porque una ráfaga de borrados haría N recálculos inútiles.
    tile.boundsDirty = true;
  }

  private resolvedBounds(tile: MutableTile): CadBounds {
    if (!tile.boundsDirty) return tile.contentBounds;
    const next: CadBounds = { ...EMPTY_BOUNDS };
    for (const entityId of tile.entityIds) {
      const bounds = this.entityBounds.get(entityId);
      if (bounds) unionInto(next, bounds);
    }
    tile.contentBounds = next;
    tile.boundsDirty = false;
    return next;
  }

  bounds(id: string): CadBounds | null {
    const bounds = this.entityBounds.get(id);
    return bounds ? { ...bounds } : null;
  }

  tile(id: CadTileId): CadRenderTile | null {
    const tile = this.tiles.get(id);
    if (!tile) return null;
    return {
      id,
      tx: tile.tx,
      ty: tile.ty,
      contentBounds: { ...this.resolvedBounds(tile) },
      entityIds: [...tile.entityIds],
    };
  }

  /**
   * Caja de contenido de un tile SIN copiar su lista de entidades.
   *
   * `tile()` devuelve una instantánea completa, lista de ids incluida. Llamarlo
   * desde el bucle de encolado costaba una copia de cada lista de entidades por
   * trozo construido — miles de cadenas por cuadro, y el coste se llevaba por
   * delante el presupuesto que el planificador intenta respetar. Aquí se copian
   * cuatro números.
   */
  tileContentBounds(id: CadTileId): CadBounds | null {
    const tile = this.tiles.get(id);
    return tile ? { ...this.resolvedBounds(tile) } : null;
  }

  entityIdsInTile(id: CadTileId): readonly string[] {
    const tile = this.tiles.get(id);
    return tile ? [...tile.entityIds] : [];
  }

  /**
   * Tiles cuya caja de contenido corta la vista, ordenados por distancia de su
   * centro al centro de la vista: el planificador de cuadros consume esa lista
   * en orden y así lo primero que aparece es lo que el usuario está mirando.
   */
  visibleTileIds(view: CadBounds): CadTileId[] {
    const centerX = (view.minX + view.maxX) / 2;
    const centerY = (view.minY + view.maxY) / 2;
    const hits: Array<{ id: CadTileId; distance: number }> = [];
    for (const [id, tile] of this.tiles) {
      if (!boundsIntersect(this.resolvedBounds(tile), view)) continue;
      const tileCenterX = (tile.tx + 0.5) * this.tileSize;
      const tileCenterY = (tile.ty + 0.5) * this.tileSize;
      const dx = tileCenterX - centerX;
      const dy = tileCenterY - centerY;
      hits.push({ id, distance: dx * dx + dy * dy });
    }
    hits.sort((left, right) =>
      left.distance === right.distance
        ? left.id.localeCompare(right.id)
        : left.distance - right.distance,
    );
    return hits.map((hit) => hit.id);
  }

  /**
   * Entidades realmente visibles: TODAS, sin muestreo. Es el número que el
   * benchmark compara con «entidades detalladas en reposo» para demostrar que
   * el dibujo que se ve es el documento que se tiene.
   */
  visibleEntityIds(view: CadBounds): string[] {
    const result: string[] = [];
    for (const tileId of this.visibleTileIds(view)) {
      const tile = this.tiles.get(tileId);
      if (!tile) continue;
      for (const entityId of tile.entityIds) {
        const bounds = this.entityBounds.get(entityId);
        if (bounds && boundsIntersect(bounds, view)) result.push(entityId);
      }
    }
    return result;
  }

  clear(): void {
    this.tiles.clear();
    this.entityTiles.clear();
    this.entityBounds.clear();
  }
}

/**
 * Diferencia entre dos listas de tiles visibles. Es la operación que convierte
 * un paneo en «añade dos tiles, quita dos» en vez de en una reconstrucción de
 * la escena. El orden de `added` y `retained` respeta el de `next`, que ya viene
 * ordenado por cercanía al centro de la vista.
 */
export function diffCadTiles(
  previous: readonly CadTileId[],
  next: readonly CadTileId[],
): CadTileDiff {
  const previousSet = new Set(previous);
  const nextSet = new Set(next);
  const added: CadTileId[] = [];
  const retained: CadTileId[] = [];
  for (const id of next) {
    if (previousSet.has(id)) retained.push(id);
    else added.push(id);
  }
  const removed = previous.filter((id) => !nextSet.has(id));
  return { added, removed, retained };
}

/**
 * Tamaño de tile sugerido a partir de la extensión del dibujo y del número de
 * entidades. Se apunta a ~256 entidades por tile: suficientes para que un lote
 * instanciado amortice su llamada de dibujo, y pocas para que entrar o salir de
 * la vista cueste poco. El resultado se redondea a potencia de dos para que la
 * rejilla sea estable entre documentos parecidos y los logs sean comparables.
 */
export function suggestCadTileSize(
  bounds: CadBounds,
  entityCount: number,
  targetPerTile = 256,
): number {
  const spanX = Math.max(bounds.maxX - bounds.minX, 1);
  const spanY = Math.max(bounds.maxY - bounds.minY, 1);
  if (entityCount <= targetPerTile) return Math.max(spanX, spanY);
  const desiredTiles = Math.max(1, entityCount / targetPerTile);
  const raw = Math.sqrt((spanX * spanY) / desiredTiles);
  const exponent = Math.round(Math.log2(Math.max(raw, 1)));
  return 2 ** exponent;
}
