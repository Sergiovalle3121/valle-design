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
   * Índice ACI. AC1015 y AC1018 siempre lo traen. En R2010+ se decodifica
   * desde el 2026-09-01 (`r2010-table-layer.ts`, 54/54); queda `undefined`
   * SÓLO cuando esa lectura falla cerrado —una capa cuya cabeza no es la
   * medida— y entonces el diagnóstico dice cuál y por qué. `undefined` es
   * «no decodificado», nunca «sin color»: el mapeo canónico lo declara como
   * pérdida en vez de pintar blanco.
   */
  readonly colorIndex: number | undefined;
  /**
   * `BS` de estado crudo. Misma regla de ausencia que `colorIndex`. Se
   * conserva junto a su interpretación porque el número entero es lo que
   * permite declarar con precisión qué bits quedaron sin interpretar.
   */
  readonly stateFlags: number | undefined;
  /**
   * ESTADO YA INTERPRETADO, RESUELTO EN EL ENSAMBLADO (2026-09-01). Congelada
   * es el bit 0 y bloqueada el bit 3, medidos contra el oráculo DXF sobre 98
   * capas de 57 fixtures en las cinco versiones
   * (`scripts/dwg-layer-state-flags`, VALLE-CORPUS-LAYER-ESTADO-SEMANTICA).
   *
   * VIAJAN EN EL DATO Y NO COMO UNA FUNCIÓN PÚBLICA A PROPÓSITO. La superficie
   * pública del paquete son SIETE llamables y ensancharla para esto habría
   * sido pagar un precio de diseño permanente por una comodidad: resolver el
   * estado una vez, en el origen, deja a todos los consumidores —el documento
   * canónico y el adaptador del producto— con el MISMO criterio sin que
   * ninguno tenga que descifrar el `BS` por su cuenta.
   *
   * `undefined` cuando el estado no se decodificó; nunca un `false` fingido.
   */
  readonly frozen: boolean | undefined;
  readonly locked: boolean | undefined;
  /**
   * Bits del estado que se apartan del patrón constante del corpus medido —
   * unos donde siempre hubo ceros, o ceros donde siempre hubo unos. Es la
   * frontera de lo medido, para declararla en vez de callarla.
   */
  readonly unmeasuredStateBits: number | undefined;
  /**
   * Handle de la entrada LTYPE que usa la capa, leído de la posición MEDIDA
   * del flujo final (`objects/layer-linetype.ts`). Se conserva junto al
   * nombre porque el handle es lo que permite decir «apunta a algo que esta
   * base no trae» en vez de callarlo.
   */
  readonly linetypeHandle: number | undefined;
  /**
   * NOMBRE de esa entrada LTYPE, ya resuelto contra la tabla del propio
   * dibujo. `undefined` cuando el flujo no llega a la posición medida, cuando
   * el handle viaja nulo, o cuando apunta a una entrada que la tabla no trae:
   * en los tres casos se declara la ausencia y NUNCA se rellena con
   * `CONTINUOUS`, que es un tipo de línea real y no un «no sé».
   */
  readonly linetypeName: string | undefined;
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
  /**
   * EL ESPACIO QUE EL ARCHIVO DECLARA para esta entidad: "model" (modo 2) o
   * "paper" (modo 1). `undefined` cuando la entidad pertenece a un BLOQUE
   * (modo 0), porque entonces su sitio es el bloque y no un espacio.
   *
   * Se REPORTA desde el 2026-09-04 y no mueve nada: una entidad de hoja sigue
   * apareciendo en `modelSpaceEntities` con su diagnóstico
   * `database-paper-space-entity`, igual que antes. Lo que cambia es que el
   * dato deja de perderse: antes el lector SABÍA que la entidad era de papel
   * —lo dice el diagnóstico— y no había forma de preguntárselo, así que
   * cualquiera que re-escribiera el archivo la mandaba al modelo en silencio.
   */
  readonly space: "model" | "paper" | undefined;
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
