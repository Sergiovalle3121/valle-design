/**
 * Tiles RESIDENTES del pipeline por lotes: qué guarda uno y cuándo se suelta.
 *
 * Vive aparte de `pipeline.ts` por dos razones. La primera, que soltar tiles es
 * una decisión pura sobre dos mapas —residentes y `staging`— y aquí se prueba
 * sin planificador, sin caché y sin teselar nada. La segunda, que el
 * orquestador estaba en el techo del presupuesto de monolito.
 *
 * ## Por qué una edición suelta también el tile DESTINO
 *
 * `entityIds` de un residente sólo nombra lo que YA materializó. Soltar «los
 * tiles que contienen lo tocado» bastaba para editar y borrar, pero no para un
 * ALTA: el tile al que llega una entidad nueva (LINE, COPY, pegar) no la nombra,
 * seguía sirviendo su malla de antes y la entidad no aparecía hasta que otra
 * cosa —designar, panear— lo soltase. Medido en la demo el 2026-09-19. Un MOVE
 * que cruza de tile es el mismo caso por la otra punta: el origen se soltaba y
 * el destino no, así que lo movido desaparecía.
 */
import type { CadLineBatch, CadLineBatchBuilder, CadLineStyle } from "./line-batch";
import type { CadTextQuadRequest } from "./text-atlas";
import type { CadTileId } from "./tile-index";

export interface CadResidentTile {
  /**
   * Constructores por cubo de estilo, vivos entre trozos del mismo tile. Son
   * una LISTA —bloques de `CAD_LINE_BATCH_BLOCK_SEGMENTS`— y no uno solo: el
   * tile se llena a trozos y no sabe su total, así que un constructor único
   * crecería por duplicación y cada duplicación copia todo lo ya escrito. Ver
   * la cabecera de la constante: lleva la medida y el precio.
   */
  builders: Map<string, { style: CadLineStyle; builders: CadLineBatchBuilder[] }>;
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

/** Un tile por empezar: nada materializado y `pending` por recorrer. */
export function cadNewResidentTile(
  pending: readonly string[],
  zoomOctave: number,
): CadResidentTile {
  return {
    builders: new Map(),
    pending,
    cursor: 0,
    entityIds: [],
    textRequests: [],
    instances: 0,
    zoomOctave,
    complete: false,
    batches: null,
  };
}

/** Suelta estos tiles de los dos mapas. Es lo que pasa al salir de la vista. */
export function cadReleaseTiles(
  resident: Map<CadTileId, CadResidentTile>,
  staging: Map<CadTileId, CadResidentTile>,
  tileIds: Iterable<CadTileId>,
): void {
  for (const tileId of tileIds) {
    resident.delete(tileId);
    staging.delete(tileId);
  }
}

/**
 * Suelta los tiles que una edición deja obsoletos: los que contenían algo de
 * `affected` (lo tocado y sus dependientes) y los `destinations`, donde queda
 * cada entidad que entra. Soltar el residente suelta también su relevo en
 * `staging`, y un tile a medio reconstruir en `staging` puede estar obsoleto
 * por sí solo. Devuelve cuántos RESIDENTES soltó: es la cifra que el benchmark
 * de edición suma como `evictedTilesTotal`.
 */
export function cadReleaseEditedTiles(
  resident: Map<CadTileId, CadResidentTile>,
  staging: Map<CadTileId, CadResidentTile>,
  affected: ReadonlySet<string>,
  destinations: ReadonlySet<CadTileId>,
): number {
  // Destino primero: es O(1) y, en un alta, el único motivo que hay.
  const stale = (tileId: CadTileId, tile: CadResidentTile): boolean =>
    destinations.has(tileId) || tile.entityIds.some((id) => affected.has(id));
  let released = 0;
  for (const [tileId, tile] of [...resident]) {
    if (!stale(tileId, tile)) continue;
    resident.delete(tileId);
    staging.delete(tileId);
    released += 1;
  }
  for (const [tileId, tile] of [...staging]) if (stale(tileId, tile)) staging.delete(tileId);
  return released;
}
