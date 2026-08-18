import { SEED_BATHROOM_BLOCKS } from './seed-bathroom';
import { SEED_CIRCULATION_BLOCKS } from './seed-circulation';
import { SEED_DOOR_BLOCKS } from './seed-doors';
import { SEED_FURNITURE_BLOCKS } from './seed-furniture';
import { SEED_KITCHEN_BLOCKS } from './seed-kitchen';
import { SEED_WINDOW_BLOCKS } from './seed-windows';
import {
  SEED_BLOCK_ID_PREFIX,
  seedBlockDefinition,
  seedBlockId,
  type SeedBlock,
  type SeedBlockDefinition,
} from './seed-geometry';

export {
  SEED_BLOCK_ID_PREFIX,
  seedBlockBounds,
  seedBlockDefinition,
  seedBlockId,
} from './seed-geometry';
export type {
  SeedBlock,
  SeedBlockDefinition,
  SeedBounds,
  SeedPoint,
  SeedShape,
} from './seed-geometry';

/**
 * EL CATÁLOGO: los bloques arquitectónicos que el producto siembra.
 *
 * ## Qué problema resuelve
 *
 * La migración «biblioteca profesional de bloques» de julio no sembraba ni un
 * bloque: añadía dos columnas y se llamaba biblioteca. El resultado es que los
 * primeros cinco minutos del producto estaban vacíos — un arquitecto abría un
 * lienzo y no podía colocar una puerta —, y ningún arquitecto cambia de CAD
 * para dibujar cada puerta a mano otra vez. Esto es lo que llena ese hueco.
 *
 * ## Por qué el catálogo vive junto a la migración y no en un módulo de la app
 *
 * Es la CARGA de un sembrado, no una capacidad del runtime. Vivir en
 * `migrations/seed/` deja claras dos cosas: que el glob de migraciones
 * (`migrations/!(*.spec).{ts,js}`, de un solo nivel) no lo recoge como
 * migración, y que su contrato es de datos — se añaden bloques, no se
 * reescriben los ya sembrados, porque una fila que ya está en la base de un
 * cliente no la cambia una edición de este archivo.
 *
 * ## El identificador manda
 *
 * `valle:arq:<slug>` es a la vez el id del bloque canónico y la llave de
 * idempotencia en `sf_cad_blocks.legacy_source_id`. Se reutiliza esa columna a
 * propósito: ya existe sobre ella un índice único PARCIAL para el carril de
 * sistema (`tenant_id IS NULL`), que es exactamente lo que hace falta para que
 * sembrar dos veces no duplique nada. El prefijo con dos puntos impide
 * cualquier choque con los identificadores de la importación heredada, que es
 * el otro uso de la columna.
 */
export const ARCHITECTURAL_SEED_BLOCKS: readonly SeedBlock[] = [
  ...SEED_DOOR_BLOCKS,
  ...SEED_WINDOW_BLOCKS,
  ...SEED_BATHROOM_BLOCKS,
  ...SEED_KITCHEN_BLOCKS,
  ...SEED_FURNITURE_BLOCKS,
  ...SEED_CIRCULATION_BLOCKS,
];

/** Fila tal cual se escribe en `sf_cad_blocks`. */
export interface ArchitecturalSeedRow {
  legacySourceId: string;
  name: string;
  definition: SeedBlockDefinition;
}

export const ARCHITECTURAL_SEED_ROWS: readonly ArchitecturalSeedRow[] =
  ARCHITECTURAL_SEED_BLOCKS.map((block) => ({
    legacySourceId: seedBlockId(block.slug),
    name: block.name,
    definition: seedBlockDefinition(block),
  }));

/** Autor de las filas sembradas; distingue el carril de sistema de un alta. */
export const ARCHITECTURAL_SEED_AUTHOR = 'valle-design:seed';

/**
 * Patrón `LIKE` del carril de sistema. Se usa para CONTAR lo sembrado y
 * comprobar que están todos: si el catálogo declarase dos veces el mismo slug,
 * el índice único absorbería el segundo `INSERT` en silencio y la biblioteca
 * quedaría incompleta sin que nadie se enterase.
 */
export const ARCHITECTURAL_SEED_LIKE = `${SEED_BLOCK_ID_PREFIX}%`;
