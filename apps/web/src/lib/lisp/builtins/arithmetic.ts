/**
 * Aritmética. El módulo donde entero-vs-real deja de ser una curiosidad.
 *
 * La regla de AutoLISP —y de este módulo— es de CONTAGIO: una operación entre
 * enteros da entero; en cuanto aparece un real, el resultado es real. De ahí
 * que `(/ 7 2)` valga 3 y `(/ 7 2.0)` valga 3.5.
 *
 * No es una sutileza académica. Una rutina de cajetín reparte el ancho del
 * recuadro entre las columnas con `(/ ancho columnas)` y confía en el truncado
 * para que la suma cierre. Con división real, cada columna arrastra decimales,
 * la última no llega al borde, y el cajetín sale descuadrado sin que nada
 * falle. Los errores de compatibilidad más caros son los que no dan error.
 *
 * `(/ 1 0)` lanza «divide by zero», igual que el original — y no `Infinity`,
 * que se propagaría hasta convertirse en coordenadas no finitas y las
 * rechazaría `migrateCadDocument` mucho más lejos del sitio del problema.
 */
import { badArgumentType, divideByZero } from "../errors";
import { printLisp } from "../printer";
import {
  NIL,
  bool,
  int,
  isNumber,
  real,
  type LispValue,
} from "../values";
import { defsubr, wantInt, wantNumber, type BuiltinTable } from "./define";

/** Verdadero si TODOS los operandos son enteros: la regla del contagio. */
function allInts(values: readonly LispValue[]): boolean {
  return values.every((value) => value.t === "int");
}

function numeric(value: LispValue): number {
  return wantNumber(value).v;
}

function result(exact: boolean, value: number): LispValue {
  return exact ? int(value) : real(value);
}

export function installArithmetic(table: BuiltinTable): void {
  defsubr(table, "+", 0, null, (args) => {
    const exact = allInts(args);
    let total = 0;
    for (const arg of args) total += numeric(arg);
    return result(exact, exact ? Math.trunc(total) : total);
  });

  defsubr(table, "-", 1, null, (args) => {
    const exact = allInts(args);
    if (args.length === 1) return result(exact, -numeric(args[0]));
    let total = numeric(args[0]);
    for (let index = 1; index < args.length; index += 1) total -= numeric(args[index]);
    return result(exact, exact ? Math.trunc(total) : total);
  });

  defsubr(table, "*", 0, null, (args) => {
    const exact = allInts(args);
    let total = 1;
    for (const arg of args) total *= numeric(arg);
    return result(exact, exact ? Math.trunc(total) : total);
  });

  defsubr(table, "/", 1, null, (args) => {
    const exact = allInts(args);
    if (args.length === 1) {
      const single = numeric(args[0]);
      if (single === 0) throw divideByZero();
      return exact ? int(Math.trunc(1 / single)) : real(1 / single);
    }
    let total = numeric(args[0]);
    for (let index = 1; index < args.length; index += 1) {
      const divisor = numeric(args[index]);
      if (divisor === 0) throw divideByZero();
      total /= divisor;
      // El truncado se aplica en CADA paso, siguiendo el orden de evaluación
      // del original. Para enteros positivos coincide con truncar una sola vez
      // al final; se hace paso a paso igualmente porque es lo que dice la
      // semántica, y depender de que una identidad aritmética se mantenga es
      // exactamente el tipo de suposición que se rompe con un signo negativo.
      if (exact) total = Math.trunc(total);
    }
    return result(exact, total);
  });

  defsubr(table, "rem", 2, null, (args) => {
    const exact = allInts(args);
    let total = numeric(args[0]);
    for (let index = 1; index < args.length; index += 1) {
      const divisor = numeric(args[index]);
      if (divisor === 0) throw divideByZero();
      total %= divisor;
    }
    return result(exact, total);
  });

  defsubr(table, "expt", 2, 2, (args) => {
    const base = numeric(args[0]);
    const power = numeric(args[1]);
    const exact = args[0].t === "int" && args[1].t === "int";
    const value = Math.pow(base, power);
    // Un exponente entero NEGATIVO sobre base entera da un real en AutoLISP:
    // `(expt 2 -1)` es 0.5, no 0. La excepción está aquí porque es la que
    // sorprende a quien implementa esto por primera vez.
    if (exact && power < 0) return real(value);
    return result(exact, exact ? Math.trunc(value) : value);
  });

  defsubr(table, "abs", 1, 1, (args) => {
    const value = wantNumber(args[0]);
    return value.t === "int" ? int(Math.abs(value.v)) : real(Math.abs(value.v));
  });

  defsubr(table, "1+", 1, 1, (args) => {
    const value = wantNumber(args[0]);
    return value.t === "int" ? int(value.v + 1) : real(value.v + 1);
  });

  defsubr(table, "1-", 1, 1, (args) => {
    const value = wantNumber(args[0]);
    return value.t === "int" ? int(value.v - 1) : real(value.v - 1);
  });

  defsubr(table, "min", 1, null, (args) => {
    const exact = allInts(args);
    let best = numeric(args[0]);
    for (const arg of args) best = Math.min(best, numeric(arg));
    return result(exact, best);
  });

  defsubr(table, "max", 1, null, (args) => {
    const exact = allInts(args);
    let best = numeric(args[0]);
    for (const arg of args) best = Math.max(best, numeric(arg));
    return result(exact, best);
  });

  defsubr(table, "gcd", 2, 2, (args) => {
    let a = Math.abs(wantInt(args[0]));
    let b = Math.abs(wantInt(args[1]));
    while (b) [a, b] = [b, a % b];
    return int(a);
  });

  defsubr(table, "float", 1, 1, (args) => real(numeric(args[0])));
  defsubr(table, "fix", 1, 1, (args) => int(Math.trunc(numeric(args[0]))));

  // --- trigonometría y transcendentes ---------------------------------------
  // Todas devuelven real SIEMPRE, también sobre enteros: `(sin 0)` es 0.0. Es
  // el comportamiento del original y lo que espera quien encadena `(* (sin a) r)`.
  const unaryReal: Array<[string, (value: number) => number]> = [
    ["sin", Math.sin],
    ["cos", Math.cos],
    ["atan", Math.atan],
    ["exp", Math.exp],
  ];
  for (const [name, fn] of unaryReal)
    defsubr(table, name, 1, name === "atan" ? 2 : 1, (args) => {
      if (name === "atan" && args.length === 2) {
        const denominator = numeric(args[1]);
        // `(atan y 0)` es ±pi/2 en AutoLISP en vez de un error: es como se
        // calcula el ángulo de un tramo vertical, y lanzar aquí rompería
        // cualquier rutina de numeración de ejes.
        if (denominator === 0)
          return real(numeric(args[0]) >= 0 ? Math.PI / 2 : -Math.PI / 2);
        return real(Math.atan2(numeric(args[0]), denominator));
      }
      return real(fn(numeric(args[0])));
    });

  defsubr(table, "sqrt", 1, 1, (args) => {
    const value = numeric(args[0]);
    // Un `NaN` aquí no fallaría: viajaría hasta una coordenada y lo rechazaría
    // `migrateCadDocument` al guardar, a diez pasos del sitio del problema.
    if (value < 0) throw badArgumentType("sqrt", printLisp(args[0]));
    return real(Math.sqrt(value));
  });

  defsubr(table, "log", 1, 1, (args) => {
    const value = numeric(args[0]);
    if (value <= 0) throw divideByZero();
    return real(Math.log(value));
  });

  // --- comparaciones ---------------------------------------------------------
  // Aceptan números Y cadenas, como el original: `(< "a" "b")` es cierto, y las
  // rutinas que ordenan capas por nombre lo usan.
  const comparisons: Array<[string, (a: number, b: number) => boolean, (a: string, b: string) => boolean]> = [
    ["<", (a, b) => a < b, (a, b) => a < b],
    ["<=", (a, b) => a <= b, (a, b) => a <= b],
    [">", (a, b) => a > b, (a, b) => a > b],
    [">=", (a, b) => a >= b, (a, b) => a >= b],
    ["=", (a, b) => a === b, (a, b) => a === b],
    ["/=", (a, b) => a !== b, (a, b) => a !== b],
  ];
  for (const [name, numberOp, stringOp] of comparisons)
    defsubr(table, name, 1, null, (args) => {
      for (let index = 0; index + 1 < args.length; index += 1) {
        const left = args[index];
        const right = args[index + 1];
        const ok =
          left.t === "str" && right.t === "str"
            ? stringOp(left.v, right.v)
            : numberOp(numeric(left), numeric(right));
        if (!ok) return NIL;
      }
      return bool(true);
    });

  defsubr(table, "zerop", 1, 1, (args) => bool(isNumber(args[0]) && args[0].v === 0));
  defsubr(table, "minusp", 1, 1, (args) => bool(isNumber(args[0]) && args[0].v < 0));
}
