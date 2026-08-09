/**
 * Cómo se declara un builtin, y por qué la comprobación de argumentos vive aquí.
 *
 * Cada función de sistema repite el mismo preámbulo: comprobar la aridad,
 * comprobar el tipo de cada argumento, y producir el mensaje EXACTO de
 * AutoLISP cuando algo no cuadra. Escrito a mano en ciento y pico funciones,
 * ese preámbulo se escribe mal en algunas: unas dicen `numberp`, otras
 * `number`, y una rutina que compara el texto del error deja de funcionar según
 * qué función falle.
 *
 * Con estos ayudantes el mensaje sale de un sitio. Y como el formato es el del
 * original —`bad argument type: numberp: "a"`—, `vl-catch-all-error-message`
 * devuelve lo que el autor de la rutina espera leer.
 */
import { badArgumentType } from "../errors";
import { printLisp } from "../printer";
import {
  isNumber,
  type LispCallContext,
  type LispEval,
  type LispInt,
  type LispReal,
  type LispString,
  type LispSubr,
  type LispValue,
} from "../values";

export type BuiltinTable = Map<string, LispValue>;

/** Declara una función de sistema síncrona. */
export function defsubr(
  table: BuiltinTable,
  name: string,
  min: number,
  max: number | null,
  call: (args: LispValue[], ctx: LispCallContext) => LispValue,
): void {
  const upper = name.toUpperCase();
  const subr: LispSubr = { t: "subr", name: upper, min, max, impl: { kind: "pure", call } };
  table.set(upper, subr);
}

/**
 * Declara una función de sistema que puede SUSPENDERSE: pedir un punto, lanzar
 * un comando, aplicar otra función LISP. Se distingue de `defsubr` porque
 * convertir en generador toda la aritmética costaría una asignación por
 * operación, y la aritmética es lo que más se ejecuta.
 */
export function defgen(
  table: BuiltinTable,
  name: string,
  min: number,
  max: number | null,
  call: (args: LispValue[], ctx: LispCallContext) => LispEval,
): void {
  const upper = name.toUpperCase();
  const subr: LispSubr = { t: "subr", name: upper, min, max, impl: { kind: "effectful", call } };
  table.set(upper, subr);
}

/**
 * Segundo nombre para un builtin ya declarado. AutoLISP tiene unos cuantos
 * pares —`vl-princ-to-string` y `princ`, `1+` y `add1`—, y compartir el mismo
 * objeto `LispSubr` hace que `(eq 'car 'car)` siga siendo cierto entre ellos.
 */
export function alias(table: BuiltinTable, from: string, to: string): void {
  const target = table.get(to.toUpperCase());
  if (!target) throw new Error(`No existe el builtin ${to} para aliasar como ${from}.`);
  table.set(from.toUpperCase(), target);
}

// ---------------------------------------------------------------------------
// Comprobadores de tipo. Devuelven el valor estrechado o lanzan.
// ---------------------------------------------------------------------------

export function wantNumber(value: LispValue): LispInt | LispReal {
  if (!isNumber(value)) throw badArgumentType("numberp", printLisp(value));
  return value;
}

export function wantInt(value: LispValue): number {
  if (value.t === "int") return value.v;
  // AutoLISP acepta un real donde espera un entero y lo TRUNCA. Rechazarlo
  // rompería `(nth 1.0 lst)`, que aparece en rutinas reales por descuido y
  // funciona en AutoCAD.
  if (value.t === "real") return Math.trunc(value.v);
  throw badArgumentType("fixnump", printLisp(value));
}

export function wantString(value: LispValue): LispString {
  if (value.t !== "str") throw badArgumentType("stringp", printLisp(value));
  return value;
}

export function wantList(value: LispValue): LispValue {
  if (value.t !== "cons" && value.t !== "nil") throw badArgumentType("listp", printLisp(value));
  return value;
}

export function wantCons(value: LispValue): LispValue {
  if (value.t !== "cons") throw badArgumentType("consp", printLisp(value));
  return value;
}

export function wantSymbol(value: LispValue): string {
  if (value.t !== "sym") throw badArgumentType("symbolp", printLisp(value));
  return value.name;
}

/**
 * Una «función» aceptable. Incluye el lambda CITADO —`'(lambda (x) ...)`—
 * porque es como está escrito casi todo el código que se pasa a `mapcar` en las
 * rutinas reales; el intérprete lo convierte en cierre al aplicarlo.
 */
export function wantFunction(value: LispValue): LispValue {
  if (value.t === "subr" || value.t === "closure" || value.t === "sym") return value;
  if (value.t === "cons" && value.car.t === "sym" && value.car.name === "LAMBDA") return value;
  throw badArgumentType("functionp", printLisp(value));
}

/**
 * Toda cadena NUEVA se cobra por caracteres. Es lo que corta el
 * `(repeat 30 (setq s (strcat s s)))`: treinta pasos, mil millones de
 * caracteres, y sólo este cargo lo ve venir.
 */
export function chargedString(ctx: LispCallContext, text: string): string {
  ctx.charge(text.length);
  return text;
}
