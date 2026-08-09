/**
 * La tabla de funciones de sistema del NÚCLEO del lenguaje.
 *
 * Núcleo significa: lo que funciona sin documento y sin editor. Aritmética,
 * listas, cadenas, predicados, control y salida. Se puede evaluar entera en
 * Node, y por eso las specs del lenguaje no necesitan montar un CAD.
 *
 * Las funciones que SÍ tocan el dibujo —`entget`, `ssget`, `command`,
 * `getpoint`— se instalan encima, en `cad-builtins.ts`. La separación no es
 * estética: mantiene este módulo sin ninguna dependencia del modelo canónico,
 * de modo que un ciclo de importación entre el intérprete y el registro de
 * entidades es imposible por construcción, no por disciplina.
 *
 * ## La tabla se construye UNA vez y se comparte
 *
 * Cientos de símbolos, y una sesión LISP puede abrirse en cada pulsación de la
 * línea de comandos. Copiarla por sesión sería un mapa nuevo de varios cientos
 * de entradas por tecla. Se comparte como respaldo de sólo lectura y cada
 * sesión escribe en la suya (véase `environment.ts`): por eso una rutina que
 * redefina `car` se lo redefine A ELLA y el editor sigue entero.
 */
import { installArithmetic } from "./builtins/arithmetic";
import { installControl } from "./builtins/control";
import { installLists } from "./builtins/lists";
import { installPredicates } from "./builtins/predicates";
import { installStrings } from "./builtins/strings";
import type { BuiltinTable } from "./builtins/define";
import { T, real, type LispValue } from "./values";

/**
 * Constantes predefinidas. `PI` está porque media rutina de geometría la usa
 * sin declararla; `T` porque es el verdadero canónico y evaluarlo tiene que dar
 * el mismo objeto que devuelven los predicados.
 */
function installConstants(table: BuiltinTable): void {
  table.set("PI", real(Math.PI));
  table.set("T", T);
}

/** Construye la tabla del núcleo. Cada llamada devuelve una tabla nueva. */
export function createCoreLispBuiltins(): Map<string, LispValue> {
  const table: BuiltinTable = new Map();
  installConstants(table);
  installArithmetic(table);
  installLists(table);
  installStrings(table);
  installPredicates(table);
  installControl(table);
  return table;
}

/**
 * Tabla del núcleo compartida. Es un valor de módulo y NO se muta en ningún
 * sitio; quien necesite añadir funciones parte de `createCoreLispBuiltins()`.
 */
export const CORE_LISP_BUILTINS: ReadonlyMap<string, LispValue> = createCoreLispBuiltins();
