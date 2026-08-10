/**
 * La tabla COMPLETA: núcleo del lenguaje + todo lo que toca el dibujo.
 *
 * Se construye encima de `createCoreLispBuiltins()` en vez de mezclarse con él
 * porque la separación tiene consecuencias comprobables: el núcleo se evalúa
 * entero sin documento —de ahí que sus specs no monten un CAD— y ningún módulo
 * del núcleo importa el modelo canónico, así que el ciclo de inicialización
 * entre intérprete y registro de entidades es imposible por construcción.
 *
 * Quien monte una sesión SIN anfitrión y use esta tabla obtiene un error claro
 * al llamar a `entget` («necesita un dibujo abierto»), no un fallo por
 * referencia nula. Es deliberado: hay usos legítimos del intérprete sin
 * documento —validar la sintaxis de un `.lsp` al subirlo, por ejemplo— y tienen
 * que fallar diciendo qué falta.
 */
import { installDialogs } from "./builtins/dialogs";
import { installEntityFunctions } from "./builtins/entities";
import { installInteraction } from "./builtins/interaction";
import { installLoader } from "./builtins/loader";
import { installSelectionFunctions } from "./builtins/selection";
import { createCoreLispBuiltins } from "./core-builtins";
import type { LispValue } from "./values";

export function createCadLispBuiltins(): Map<string, LispValue> {
  const table = createCoreLispBuiltins();
  installEntityFunctions(table);
  installSelectionFunctions(table);
  installInteraction(table);
  installDialogs(table);
  // `load` va en la tabla CAD y no en el núcleo porque necesita una biblioteca
  // montada por el anfitrión; el núcleo se evalúa entero sin nada montado.
  installLoader(table);
  return table;
}

/** Tabla completa compartida. No se muta en ningún sitio. */
export const CAD_LISP_BUILTINS: ReadonlyMap<string, LispValue> = createCadLispBuiltins();
