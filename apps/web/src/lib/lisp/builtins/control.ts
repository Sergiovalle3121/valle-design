/**
 * Control, errores y salida por pantalla.
 *
 * ## `vl-catch-all-apply` es un builtin, no una forma especial
 *
 * Recibe una función YA evaluada y una lista de argumentos YA evaluados; lo
 * único especial es que atrapa. Escribirlo como forma especial habría metido
 * lógica de captura en el evaluador, donde es más difícil de auditar. Aquí, la
 * única línea que decide qué se atrapa está en `errors.ts` (`isCatchable`), y
 * ningún otro sitio la duplica.
 *
 * Lo que NO atrapa —presupuesto agotado, `quit`— es la propiedad que sostiene
 * el sandbox entero, y tiene su propia spec adversarial.
 *
 * ## `princ` y su valor de retorno
 *
 * `(princ)` sin argumentos devuelve un símbolo que se imprime como nada: es el
 * truco con el que TODA rutina de AutoLISP termina para que la línea de
 * comandos no muestre el valor de la última expresión. Aquí se devuelve `nil`
 * y quien pinta la salida sabe que `nil` no se escribe — pero `(princ "hola")`
 * sí devuelve la cadena, como el original, porque hay rutinas que encadenan.
 */
import { LispQuit } from "../errors";
import { printLisp } from "../printer";
import {
  NIL,
  bool,
  str,
  type LispEval,
  type LispValue,
} from "../values";
import {
  defgen,
  defsubr,
  wantFunction,
  wantString,
  type BuiltinTable,
} from "./define";

export function installControl(table: BuiltinTable): void {
  defgen(table, "vl-catch-all-apply", 2, 2, function* (args, ctx): LispEval {
    const fn = wantFunction(args[0]);
    const callArgs: LispValue[] = [];
    let node = args[1];
    while (node.t === "cons") {
      callArgs.push(node.car);
      node = node.cdr;
    }
    // La captura vive en el intérprete (`catchAllApply`), no aquí: es el único
    // sitio que sabe qué excepciones son del programa y cuáles del sandbox.
    return yield* ctx.catchAll(fn, callArgs);
  });

  defsubr(table, "vl-catch-all-error-p", 1, 1, (args) => bool(args[0].t === "catch-error"));

  defsubr(table, "vl-catch-all-error-message", 1, 1, (args) =>
    args[0].t === "catch-error" ? str(args[0].message) : NIL);

  defgen(table, "eval", 1, 1, function* (args, ctx): LispEval {
    // `eval` de LISP: evalúa CELDAS CONS con este mismo intérprete. No tiene
    // ninguna relación con el `eval` de JavaScript, al que el subsistema no
    // puede llegar — `sandbox-surface.spec.ts` lo comprueba sobre el código.
    return yield* ctx.evaluate(args[0]);
  });

  defsubr(table, "quit", 0, 0, () => {
    throw new LispQuit();
  });
  defsubr(table, "exit", 0, 0, () => {
    throw new LispQuit();
  });

  // --- salida ----------------------------------------------------------------

  defgen(table, "princ", 0, 2, function* (args): LispEval {
    if (args.length === 0) return NIL;
    const text = printLisp(args[0], false);
    yield { kind: "write", text };
    return args[0];
  });

  defgen(table, "prin1", 0, 2, function* (args): LispEval {
    if (args.length === 0) return NIL;
    yield { kind: "write", text: printLisp(args[0], true) };
    return args[0];
  });

  defgen(table, "print", 0, 2, function* (args): LispEval {
    if (args.length === 0) return NIL;
    yield { kind: "write", text: `\n${printLisp(args[0], true)} ` };
    return args[0];
  });

  defgen(table, "terpri", 0, 0, function* (): LispEval {
    yield { kind: "write", text: "\n" };
    return NIL;
  });

  /**
   * `prompt` escribe y devuelve nil SIEMPRE. La diferencia con `princ` importa:
   * `(prompt "x")` no deja "x" como valor de la expresión, así que se puede
   * poner al final de una rutina sin ensuciar lo que devuelve.
   */
  defgen(table, "prompt", 1, 1, function* (args): LispEval {
    yield { kind: "write", text: wantString(args[0]).v };
    return NIL;
  });

  defgen(table, "alert", 1, 1, function* (args): LispEval {
    yield { kind: "alert", text: wantString(args[0]).v };
    return NIL;
  });
}
