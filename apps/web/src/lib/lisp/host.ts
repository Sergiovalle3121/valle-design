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
import type { CadVariableAccess } from "../cad/system-variables";

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
  /**
   * La tabla de variables de sistema del producto (`lib/cad/system-variables`),
   * la MISMA que escriben SETVAR, UNITS, COLOR, LTSCALE y OSNAP.
   *
   * ## Por qué entra por el puerto y no por un almacén propio
   *
   * `getvar` y `setvar` tenían aquí su propia verdad: `getvar` sabía contestar
   * CLAYER e INSUNITS y `setvar` lanzaba SIEMPRE. El resultado medido es que el
   * prólogo con el que empieza media biblioteca de despacho —`(setq old (getvar
   * "CMDECHO")) (setvar "CMDECHO" 0)`— mataba la rutina ajena en la línea 2. Un
   * almacén propio del intérprete lo habría arreglado a medias y habría creado
   * la peor versión del problema: dos tablas con el mismo nombre que se
   * contradicen, y un `SETVAR OSMODE` tecleado que la rutina no ve.
   *
   * Así que no hay tabla nueva: se consulta la del producto, con sus reglas
   * —las `readOnly` rechazan la escritura, `coerceCadSystemVariable` valida
   * rango y enumerado, y lo que no está en la tabla no existe—.
   *
   * ## Por qué es OPCIONAL
   *
   * Porque es una capacidad AÑADIDA a un puerto que ya tenía implementadores
   * fuera de este subsistema. Quien no la ofrece sigue compilando y sigue
   * teniendo el comportamiento de antes —CLAYER e INSUNITS leídos del
   * documento, y `setvar` que se niega diciéndolo—, que es un límite declarado
   * y no un valor inventado.
   */
  variables?(): CadVariableAccess;
}
