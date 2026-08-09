/**
 * El puerto del anfitrión: TODO lo que el intérprete puede hacerle al programa.
 *
 * Está declarado en un módulo propio, y es corto a propósito. Es la lista
 * completa de capacidades que una rutina de un tercero alcanza; si mañana una
 * rutina puede hacer algo que no está aquí, es que alguien amplió esta
 * interfaz, y eso se ve en el diff.
 *
 * ## La regla que no se negocia
 *
 * `apply` es la ÚNICA salida de escritura. Recibe `CadEntityCommand[]` —el
 * vocabulario canónico de mutación del producto— y quien la implementa los pasa
 * por `commitNativeCommands`: un lote, un `commitChange`, un paso de deshacer,
 * la disciplina CAS del anfitrión. El subsistema LISP no conoce ninguna otra
 * puerta, no importa `commitChange`, y no puede escribir en el documento por su
 * cuenta ni queriendo.
 *
 * Que `entmake` y `command` acaben los dos aquí no es una casualidad de la
 * implementación: es lo que hace que una rutina LISP no pueda saltarse el
 * historial. Sin esto, deshacer después de correr la rutina de un cliente
 * dejaría el dibujo en un estado que nadie compuso.
 *
 * ## Por qué `apply` es INMEDIATA
 *
 * Una rutina hace `entmake` y a continuación `entlast` para leer lo que acaba
 * de crear. Si las escrituras se acumularan sin aplicarse hasta el final, ese
 * `entlast` devolvería la entidad anterior y la rutina trabajaría sobre el
 * objeto equivocado. Así que el anfitrión aplica en el acto sobre su documento
 * de trabajo Y acumula el lote; la frontera de deshacer la pone quien conduce
 * la sesión, no cada escritura.
 */
import type { CadDocument, CadEntity, CadLayerDef } from "../cad/cad-document";
import type { CadEntityCommand } from "../cad/entity-commands";

export interface LispHostServices {
  /** Documento de trabajo. Sólo lectura para el intérprete. */
  document(): CadDocument;
  /** Ids en ORDEN DE DIBUJO. `entnext` recorre justo este orden. */
  entityIds(): readonly string[];
  entity(id: string): CadEntity | undefined;
  layers(): readonly CadLayerDef[];
  /** Capa de las entidades que no declaran la suya. */
  activeLayer(): string;
  /** Identificador nuevo, inyectado: las specs no dependen de `randomUUID`. */
  newEntityId(): string;
  /**
   * ÚNICA salida de escritura. Aplica en el acto y acumula para que quien
   * conduce la sesión cierre UN solo paso de deshacer.
   */
  apply(commands: readonly CadEntityCommand[], label: string): void;
}
