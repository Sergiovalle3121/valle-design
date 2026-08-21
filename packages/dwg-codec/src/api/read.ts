import type { DwgLimitOverrides } from "./limits.js";
import {
  readAc1015Database,
  type Ac1015DatabaseBlock,
  type Ac1015DatabaseEntityRecord,
  type Ac1015DatabaseLayer,
  type Ac1015NeutralDatabase,
  type Ac1015UnsupportedDatabaseObject,
} from "../reader/ac1015-database-reader.js";

/**
 * Base neutral que `readDwg` devuelve. Hoy es la base AC1015; cuando el
 * contenedor de la familia 2004 se decodifique, este alias seguirá siendo el
 * contrato estable del paquete y el despacho por versión vivirá aquí dentro.
 */
export type DwgDatabase = Ac1015NeutralDatabase;
export type DwgDatabaseLayer = Ac1015DatabaseLayer;
export type DwgDatabaseBlock = Ac1015DatabaseBlock;
export type DwgDatabaseEntityRecord = Ac1015DatabaseEntityRecord;
export type DwgUnsupportedDatabaseObject = Ac1015UnsupportedDatabaseObject;

/**
 * Lee un archivo DWG completo a la base neutral del laboratorio.
 *
 * Falla cerrado con `DwgParseError` tipado: firma ajena o versión sin
 * decodificador (`DWG_VERSION_DECODER_UNSUPPORTED`), estructura corrupta con
 * offset (`DWG_STRUCTURE_CORRUPT`), o presupuesto agotado. Nunca lanza un
 * error crudo del runtime.
 */
export function readDwg(
  input: Uint8Array,
  limits?: DwgLimitOverrides,
): DwgDatabase {
  return limits === undefined
    ? readAc1015Database(input)
    : readAc1015Database(input, limits);
}
