/**
 * Los tres modos de fallo del intérprete, y por qué son tres y no uno.
 *
 * ## `LispError` — el error del programa
 *
 * «bad argument type: numberp: "a"». Es un error DEL USUARIO, del mismo tipo
 * que produce AutoLISP: lo puede capturar `vl-catch-all-apply`, lo recibe el
 * manejador `*error*`, y no dice nada malo del intérprete.
 *
 * ## `LispAbort` — el presupuesto agotado
 *
 * Recursión infinita, diez millones de celdas, un `while` que no termina. NO se
 * puede capturar. Ésta es la decisión de diseño que hace vendible el sandbox:
 * si `vl-catch-all-apply` pudiera atrapar el corte por presupuesto, una rutina
 * hostil escribiría
 *
 *     (while T (vl-catch-all-apply 'bucle-infinito nil))
 *
 * y el corte no cortaría nada — cada aborto quedaría tragado y el siguiente
 * empezaría de cero. Un límite que el código medido puede ignorar no es un
 * límite. Por eso `LispAbort` atraviesa `vl-catch-all-apply`, atraviesa
 * `*error*` y sólo lo ve el anfitrión.
 *
 * ## `LispQuit` — la salida ordenada
 *
 * `(quit)` y `(exit)`. Termina la evaluación sin que sea un fallo. Tampoco se
 * captura, por la misma razón: `(exit)` significa salir.
 */

/** Error de programa. Capturable. */
export class LispError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LispError";
  }
}

/** Por qué se cortó la evaluación. Lo lee el anfitrión para decir la verdad. */
export type LispAbortReason = "steps" | "cells" | "depth" | "time" | "cancelled";

/** Corte del sandbox. NO capturable desde el propio LISP. */
export class LispAbort extends Error {
  constructor(
    readonly reason: LispAbortReason,
    message: string,
  ) {
    super(message);
    this.name = "LispAbort";
  }
}

/** `(quit)` / `(exit)`. NO capturable. */
export class LispQuit extends Error {
  constructor() {
    super("quit / exit abandoned the routine.");
    this.name = "LispQuit";
  }
}

/**
 * Verdadero para lo que `vl-catch-all-apply` y `*error*` pueden ver. Función
 * única y explícita: si mañana aparece un cuarto modo de fallo, quien la
 * escriba tiene que decidir aquí —en un sitio— de qué lado cae.
 */
export function isCatchable(cause: unknown): cause is LispError {
  return cause instanceof LispError;
}

/** Texto del fallo tal y como lo vería el usuario en la línea de comandos. */
export function failureText(cause: unknown): string {
  if (cause instanceof LispError) return cause.message;
  if (cause instanceof LispAbort) return cause.message;
  if (cause instanceof LispQuit) return "quit / exit abandoned the routine.";
  return cause instanceof Error ? cause.message : String(cause);
}

// ---------------------------------------------------------------------------
// Constructores de los errores canónicos de AutoLISP
// ---------------------------------------------------------------------------

/**
 * «bad argument type». El formato importa: hay rutinas de verdad que hacen
 * `(vl-catch-all-error-message ...)` y comparan la cadena. Se reproduce el
 * formato del original —función, predicado esperado, valor recibido— porque
 * inventarse otro sólo se descubre cuando la rutina del cliente ya falló.
 */
export function badArgumentType(expected: string, got: string): LispError {
  return new LispError(`bad argument type: ${expected}: ${got}`);
}

export function tooFewArguments(name: string): LispError {
  return new LispError(`too few arguments: ${name}`);
}

export function tooManyArguments(name: string): LispError {
  return new LispError(`too many arguments: ${name}`);
}

export function noFunction(name: string): LispError {
  return new LispError(`no function definition: ${name}`);
}

export function divideByZero(): LispError {
  return new LispError("divide by zero");
}

export function malformed(detail: string): LispError {
  return new LispError(`malformed list on input: ${detail}`);
}
