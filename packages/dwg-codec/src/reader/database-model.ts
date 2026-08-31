/**
 * TIPOS de la base neutral, extraídos de `database-assembly.ts` cuando el
 * intake del ensamblado R2010+ (2026-08-31) empujó ese archivo por encima del
 * presupuesto de monolito. Sólo declaraciones: el ensamblado sigue donde
 * estaba y los re-exporta, así que ningún consumidor cambia de import.
 */
import type { DwgGeometryEntity } from "../model/entity-geometry.js";
import type { DwgDiagnostic } from "../api/diagnostics.js";
import type {
  Ac1015DatabaseDictionary,
  Ac1015DatabaseSymbolTables,
} from "../objects/tables-symbol.js";
import type { Ac1015ClassRecord } from "../objects/objects-dictionary.js";

/** Una capa de la base neutral. */
export interface Ac1015DatabaseLayer {
  readonly handle: number;
  /** Bytes del nombre en la página de códigos del dibujo. */
  readonly name: readonly number[];
  /**
   * Índice ACI. `undefined` SÓLO en el camino R2010+: las banderas y el color
   * de un LAYER no se decodifican ahí, y se midió por qué — ver
   * `r2010-database-assembly.ts`. AC1015 y AC1018 siempre lo traen.
   */
  readonly colorIndex: number | undefined;
  /** BS de estado crudo (semántica bit a bit pendiente de corpus). */
  readonly stateFlags: number | undefined;
}

/** Una entidad colocada en la base: geometría, capa y referencia de INSERT. */
export interface Ac1015DatabaseEntityRecord {
  readonly handle: number;
  readonly entity: DwgGeometryEntity;
  /** Handle de capa resuelto del flujo; `undefined` cuando viaja nulo. */
  readonly layerHandle: number | undefined;
  /** Sólo INSERT: nombre del bloque insertado, resuelto por su handle. */
  readonly insertedBlockName: readonly number[] | undefined;
  /** Sólo INSERT con ATTRIBs: los atributos atados por su propietario. */
  readonly attributes: readonly Ac1015DatabaseEntityRecord[] | undefined;
  /** Sólo POLYLINE clásica: sus VERTEX (y caras polyface) en orden del mapa. */
  readonly vertices: readonly Ac1015DatabaseEntityRecord[] | undefined;
  /** Sólo INSERT/POLYLINE: handle del SEQEND que cierra su secuencia. */
  readonly sequenceEndHandle: number | undefined;
}

/** Un bloque de la base: registro, marcadores y contenido en orden del mapa. */
export interface Ac1015DatabaseBlock {
  readonly handle: number;
  readonly name: readonly number[];
  /** Handle de la entidad BLOCK que abre el contenido, si apareció. */
  readonly blockBeginHandle: number | undefined;
  /** Handle de la entidad ENDBLK que cierra el contenido, si apareció. */
  readonly blockEndHandle: number | undefined;
  readonly entities: readonly Ac1015DatabaseEntityRecord[];
}

/** Un objeto que el laboratorio aún no decodifica: enumerado, nunca callado. */
export interface Ac1015UnsupportedDatabaseObject {
  readonly handle: number;
  /** Tipo BS con que arranca su cuerpo. */
  readonly type: number;
  /** Bytes del nombre DXF de la clase, cuando el tipo es de clase (D5). */
  readonly className?: readonly number[];
}

/** La base de datos neutral que devuelve el ensamblado de las fases D4/D5. */
export interface Ac1015NeutralDatabase {
  readonly layers: readonly Ac1015DatabaseLayer[];
  readonly blocks: readonly Ac1015DatabaseBlock[];
  readonly modelSpaceEntities: readonly Ac1015DatabaseEntityRecord[];
  /**
   * BS crudo de INSUNITS (variables de cabecera, capítulo 9): unidades del
   * dibujo. `undefined` SÓLO en el camino R2010+, cuya sección de variables de
   * cabecera se VALIDA (centinelas y CRC) pero no se decodifica: su
   * disposición diverge de la de AC1018 y no está medida. Cero significaría
   * «el archivo declara sin unidades», que es una afirmación distinta de «no
   * lo hemos leído».
   */
  readonly insunits: number | undefined;
  /** Fase D5: tablas de símbolos, diccionarios (nombre → handle) y el mapa de clases (número → nombre). */
  readonly tables: Ac1015DatabaseSymbolTables;
  readonly dictionaries: readonly Ac1015DatabaseDictionary[];
  readonly classMap: readonly Ac1015ClassRecord[];
  readonly unsupported: readonly Ac1015UnsupportedDatabaseObject[];
  readonly diagnostics: readonly DwgDiagnostic[];
}
