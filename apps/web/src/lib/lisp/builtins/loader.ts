/**
 * `load`: cargar otro `.lsp` desde dentro de una rutina.
 *
 * Es la mitad que faltaba de APPLOAD. Una biblioteca de estudio de verdad no
 * son ficheros sueltos: es un `utiles.lsp` con las funciones comunes y quince
 * rutinas que empiezan con `(load "utiles")`. Sin esta función, traerse esa
 * biblioteca obliga a reescribirla concatenándolo todo en un fichero.
 *
 * ## De dónde salen los ficheros
 *
 * De la pizarra de la sesión, bajo `LIBRARY_READER`, y de ningún otro sitio. El
 * intérprete NO alcanza el disco, ni la red, ni el almacén del navegador: recibe
 * una función que dado un nombre devuelve un texto, y el anfitrión decide de
 * dónde lo saca. Es la misma disciplina que el registro de comandos —el
 * subsistema no importa nada del navegador— y es lo que hace que
 * `sandbox-surface.spec.ts` pueda seguir afirmando que aquí dentro no hay
 * superficie de ataque.
 *
 * Si nadie inyectó lector, `load` dice que no hay biblioteca montada. No
 * devuelve `nil` fingiendo que el fichero no existe: son dos cosas distintas y
 * quien depura necesita saber cuál de las dos le pasó.
 *
 * ## El ciclo se corta por nombre, no por presupuesto
 *
 * `a.lsp` carga `b.lsp` que carga `a.lsp`. El presupuesto acabaría cortándolo
 * —por pasos o por celdas—, pero el mensaje sería «se agotaron 2.000.000 de
 * pasos», que no dice nada. Se lleva la pila de nombres en curso y se nombra el
 * ciclo entero.
 *
 * ## Qué devuelve
 *
 * El valor de la ÚLTIMA expresión del fichero, como el original. Un fichero de
 * puros `defun` devuelve el nombre de la última función definida, que es lo que
 * las rutinas comprueban con `(if (load "utiles") … )`.
 */
import { LispError } from "../errors";
import { readLispForms } from "../reader";
import { NIL, type LispEval, type LispValue } from "../values";
import { defgen, wantString, type BuiltinTable } from "./define";

/**
 * Clave de la pizarra bajo la que el anfitrión deja el lector de la biblioteca.
 * Se declara junto a quien la lee para que no viva en dos sitios con dos
 * ortografías, igual que `COMMAND_REGISTRY`.
 */
export const LIBRARY_READER = "libraryReader";

/** Un lector: dado un nombre, el texto del fichero, o nada si no lo tiene. */
export type LispLibraryReader = (name: string) => string | undefined;

/** Pila de nombres en curso. Vive en la pizarra: es estado de la SESIÓN. */
const LOAD_STACK = "loadStack";

/**
 * Tope de anidamiento. No es el presupuesto: es la profundidad a partir de la
 * cual una biblioteca deja de ser una biblioteca y es un accidente.
 */
const MAX_LOAD_DEPTH = 16;

/**
 * Normaliza el nombre como lo haría AutoCAD: sin distinguir mayúsculas y con la
 * extensión opcional. `(load "utiles")`, `(load "UTILES.LSP")` y
 * `(load "utiles.lsp")` son el mismo fichero, y una rutina traída de un estudio
 * las escribe de las tres formas.
 */
export function normalizeLispFileName(name: string): string {
  const trimmed = name.trim().replace(/\\/g, "/");
  const base = trimmed.slice(trimmed.lastIndexOf("/") + 1);
  const lower = base.toLowerCase();
  return lower.endsWith(".lsp") ? lower : `${lower}.lsp`;
}

export function installLoader(table: BuiltinTable): void {
  defgen(table, "load", 1, 2, function* (args, ctx): LispEval {
    const requested = wantString(args[0]).v;
    const onFailure = args[1];
    const name = normalizeLispFileName(requested);

    const reader = ctx.state.get(LIBRARY_READER) as LispLibraryReader | undefined;
    if (!reader)
      // Sin lector no hay biblioteca. Devolver `onfailure` aquí escondería un
      // anfitrión mal montado detrás del caso «el fichero no está».
      throw new LispError(
        `load: este anfitrión no tiene biblioteca montada, así que no puede cargar "${requested}".`,
      );

    const stack = (ctx.state.get(LOAD_STACK) as string[] | undefined) ?? [];
    if (stack.includes(name))
      throw new LispError(
        `load: ciclo de carga ${[...stack, name].join(" → ")}. Un fichero no puede cargarse a sí mismo.`,
      );
    if (stack.length >= MAX_LOAD_DEPTH)
      throw new LispError(
        `load: ${MAX_LOAD_DEPTH} ficheros anidados es demasiado; se cortó al pedir "${requested}".`,
      );

    const source = reader(name);
    if (source === undefined) {
      if (onFailure !== undefined) return onFailure;
      throw new LispError(`load: no hay ningún "${requested}" en la biblioteca.`);
    }

    let forms: LispValue[];
    try {
      forms = readLispForms(source);
    } catch (cause) {
      if (onFailure !== undefined) return onFailure;
      throw new LispError(
        `load: "${requested}" no se pudo leer: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }

    // Se cobra el tamaño del fichero: cargar cien mil líneas es trabajo real y
    // un presupuesto que no lo ve deja abierta la vía de agotar memoria con
    // ficheros en vez de con bucles.
    ctx.charge(source.length);

    ctx.state.set(LOAD_STACK, [...stack, name]);
    try {
      let result: LispValue = NIL;
      for (const form of forms) result = yield* ctx.evaluate(form);
      return result;
    } finally {
      // Al valor previo, no a la lista vacía: dos `load` hermanos dentro del
      // mismo fichero tienen que ver la misma pila que había al entrar.
      ctx.state.set(LOAD_STACK, stack);
    }
  });
}
