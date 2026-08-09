/**
 * El universo de valores de AutoLISP.
 *
 * ## Por qué un tipo etiquetado y no los tipos de JavaScript
 *
 * La tentación evidente es representar un entero LISP con un `number` de
 * JavaScript y una lista con un `Array`. Las dos decisiones destruyen
 * compatibilidad de una forma que sólo se nota meses después:
 *
 *  - **Entero y real son tipos DISTINTOS en AutoLISP.** `(/ 7 2)` vale `3` y
 *    `(/ 7 2.0)` vale `3.5`. Miles de rutinas de cajetín reparten anchos con
 *    divisiones enteras y cuentan con ese truncado. Un `number` único los
 *    fusiona y el cajetín sale descuadrado sin que nada falle.
 *  - **La celda cons no es un array.** `(0 . "LINE")` —un par PUNTEADO— es la
 *    forma en la que hablan `entget` y `entmake`, y no es una lista de dos
 *    elementos: su `cdr` es una cadena, no otra celda. Con arrays no se puede
 *    ni escribir.
 *
 * Así que el valor es una unión etiquetada y las listas son cadenas de celdas
 * con `NIL` al final, como en el original.
 *
 * ## Símbolos
 *
 * AutoLISP no distingue mayúsculas en los nombres: `setq`, `SETQ` y `SetQ` son
 * el mismo símbolo. Se internan en mayúsculas, que es además cómo los imprime
 * el intérprete de referencia.
 *
 * ## Qué NO está aquí
 *
 * Ni evaluación, ni presupuesto, ni acceso al documento. Este módulo es hoja:
 * no importa nada del subsistema. Es la condición que impide el ciclo de
 * inicialización que el repositorio ya ha sufrido en `entity-runtime`.
 */

export interface LispNil {
  readonly t: "nil";
}

export interface LispSymbol {
  readonly t: "sym";
  /** Siempre en mayúsculas. */
  readonly name: string;
}

export interface LispInt {
  readonly t: "int";
  readonly v: number;
}

export interface LispReal {
  readonly t: "real";
  readonly v: number;
}

export interface LispString {
  readonly t: "str";
  readonly v: string;
}

export interface LispCons {
  readonly t: "cons";
  car: LispValue;
  cdr: LispValue;
}

/**
 * Nombre de entidad. Opaco a propósito: por dentro es el id canónico del
 * `CadDocument`, y una rutina no puede fabricarse uno con `(strcat ...)`. Ése
 * es el punto: `entmod` sólo acepta enames que el intérprete entregó, así que
 * no hay forma de inventar una referencia a algo que no se ha designado.
 */
export interface LispEname {
  readonly t: "ename";
  readonly id: string;
}

/**
 * Conjunto de selección (`ssget`). Mutable —`ssadd` y `ssdel` modifican el
 * conjunto en el sitio, como en el original— y con identidad propia: dos
 * conjuntos con los mismos elementos NO son `eq`.
 */
export interface LispPickset {
  readonly t: "pickset";
  readonly serial: number;
  readonly ids: string[];
  readonly index: Set<string>;
}

/** Resultado de `vl-catch-all-apply` cuando la llamada falló. */
export interface LispCatchError {
  readonly t: "catch-error";
  readonly message: string;
}

export interface LispSubr {
  readonly t: "subr";
  readonly name: string;
  /** Aridad mínima y máxima; `max: null` significa variádica. */
  readonly min: number;
  readonly max: number | null;
  /**
   * `pure` se ejecuta y devuelve; `effectful` es un generador que puede
   * SUSPENDERSE para pedir una entrada al usuario (`getpoint`) o para
   * despachar un comando. La distinción existe porque hacer generador a
   * `(+ 1 2)` costaría una asignación por operación aritmética.
   */
  readonly impl: LispSubrImpl;
}

export interface LispClosure {
  readonly t: "closure";
  /** Vacío para un `lambda` anónimo. */
  readonly name: string;
  readonly params: readonly string[];
  /** Los declarados tras `/` en la lista de argumentos. */
  readonly locals: readonly string[];
  readonly body: readonly LispValue[];
}

export type LispValue =
  | LispNil
  | LispSymbol
  | LispInt
  | LispReal
  | LispString
  | LispCons
  | LispEname
  | LispPickset
  | LispCatchError
  | LispSubr
  | LispClosure;

/**
 * Lo que una función suspendida le pide al anfitrión. El evaluador es un
 * generador precisamente por esto: `getpoint` tiene que parar la rutina a mitad
 * y esperar a que alguien pinche, y una función `async` no serviría porque
 * entonces TODO el evaluador sería asíncrono y el presupuesto de tiempo dejaría
 * de ser comprobable en un punto único.
 */
export type LispRequest =
  | { kind: "prompt-point"; message: string; base: LispValue }
  | { kind: "prompt-number"; message: string; integer: boolean }
  | { kind: "prompt-string"; message: string; allowSpaces: boolean }
  | { kind: "prompt-keyword"; message: string; keywords: readonly string[] }
  | { kind: "prompt-angle"; message: string; base: LispValue }
  | { kind: "prompt-distance"; message: string; base: LispValue }
  | { kind: "prompt-corner"; message: string; base: LispValue }
  | { kind: "prompt-selection"; message: string }
  | { kind: "write"; text: string }
  | { kind: "alert"; text: string }
  /** Un `(command ...)` completo, ya traducido a entradas del motor. */
  | { kind: "command"; name: string; args: readonly LispValue[] }
  | { kind: "dialog"; id: string; values: Readonly<Record<string, string>> };

/** Respuesta del anfitrión a una petición. `cancel` es el Esc del usuario. */
export type LispResponse =
  | { kind: "value"; value: LispValue }
  | { kind: "cancel" };

/** Alias del generador que atraviesa todo el evaluador. */
export type LispEval<T = LispValue> = Generator<LispRequest, T, LispResponse>;

export type LispSubrImpl =
  | { kind: "pure"; call(args: LispValue[], ctx: LispCallContext): LispValue }
  | { kind: "effectful"; call(args: LispValue[], ctx: LispCallContext): LispEval };

/**
 * Lo que un builtin puede hacer además de mirar sus argumentos. Se declara aquí
 * —en el módulo hoja— para que ni `values.ts` ni los builtins importen al
 * evaluador: sería el ciclo de inicialización de siempre.
 */
export interface LispCallContext {
  /** Reserva presupuesto; lanza `LispAbort` si se agotó. */
  charge(cells: number): void;
  /** Aplica una función LISP a argumentos ya evaluados. */
  apply(fn: LispValue, args: LispValue[]): LispEval;
  /**
   * Aplica atrapando los errores DE PROGRAMA (`vl-catch-all-apply`). Vive en el
   * contexto y no en el builtin porque la línea que decide qué es atrapable
   * —`isCatchable`— debe existir una sola vez: es la que sostiene el sandbox.
   */
  catchAll(fn: LispValue, args: LispValue[]): LispEval;
  /** Evalúa una forma con este mismo intérprete (`eval` de LISP). */
  evaluate(form: LispValue): LispEval;
  /** Valor global de un símbolo (lo usa `*error*`, entre otros). */
  lookup(name: string): LispValue;
  setGlobal(name: string, value: LispValue): void;
  /** Servicios del documento y de la interacción; `null` en modo puro. */
  host: LispHostServices | null;
  /** Contador de conjuntos de selección; garantiza seriales únicos. */
  nextPicksetSerial(): number;
}

/**
 * Puerto del anfitrión. Lo implementa quien monta el intérprete (el editor, un
 * spec, la golden headless); el subsistema LISP nunca lo implementa por su
 * cuenta ni supone nada de él más allá de esta interfaz.
 */
export interface LispHostServices {
  /** Entidades visibles, en orden de dibujo. */
  entityIds(): readonly string[];
  entity(id: string): unknown;
  /** Capa activa, para las entidades que no declaran la suya. */
  activeLayer(): string;
  /** Identificador nuevo para una entidad creada por la rutina. */
  newEntityId(): string;
  /**
   * ÚNICA salida de escritura. Recibe comandos canónicos ya construidos y los
   * aplica por `commitNativeCommands`: un lote, un paso de deshacer, la
   * disciplina CAS del anfitrión. El subsistema LISP no conoce otra puerta.
   */
  commit(commands: readonly unknown[], label: string): void;
}

// ---------------------------------------------------------------------------
// Constructores e internado
// ---------------------------------------------------------------------------

export const NIL: LispNil = { t: "nil" };

const symbols = new Map<string, LispSymbol>();

/** Interna un símbolo. El nombre se normaliza a mayúsculas. */
export function sym(name: string): LispSymbol {
  const key = name.toUpperCase();
  let interned = symbols.get(key);
  if (!interned) {
    interned = { t: "sym", name: key };
    symbols.set(key, interned);
  }
  return interned;
}

export const T: LispSymbol = sym("T");

export function int(v: number): LispInt {
  return { t: "int", v: Math.trunc(v) };
}

export function real(v: number): LispReal {
  return { t: "real", v };
}

export function str(v: string): LispString {
  return { t: "str", v };
}

export function cons(car: LispValue, cdr: LispValue): LispCons {
  return { t: "cons", car, cdr };
}

export function ename(id: string): LispEname {
  return { t: "ename", id };
}

export function pickset(serial: number, ids: Iterable<string>): LispPickset {
  const index = new Set(ids);
  return { t: "pickset", serial, ids: [...index], index };
}

export function catchError(message: string): LispCatchError {
  return { t: "catch-error", message };
}

/** Verdad LISP: sólo `nil` es falso. El 0 y la cadena vacía son verdaderos. */
export function truthy(value: LispValue): boolean {
  return value.t !== "nil";
}

export function bool(value: boolean): LispValue {
  return value ? T : NIL;
}

// ---------------------------------------------------------------------------
// Listas
// ---------------------------------------------------------------------------

/** Construye una lista propia a partir de elementos, opcionalmente con cola. */
export function list(items: readonly LispValue[], tail: LispValue = NIL): LispValue {
  let result = tail;
  for (let index = items.length - 1; index >= 0; index -= 1) result = cons(items[index], result);
  return result;
}

/**
 * Recorre una lista PROPIA y devuelve sus elementos. Una lista impropia
 * (`(1 2 . 3)`) devuelve los elementos hasta el punto; quien necesite
 * distinguirlo usa `properList`.
 */
export function toArray(value: LispValue): LispValue[] {
  const items: LispValue[] = [];
  let node = value;
  while (node.t === "cons") {
    items.push(node.car);
    node = node.cdr;
  }
  return items;
}

/** Elementos de una lista propia, o `null` si la lista es impropia. */
export function properList(value: LispValue): LispValue[] | null {
  const items: LispValue[] = [];
  let node = value;
  while (node.t === "cons") {
    items.push(node.car);
    node = node.cdr;
  }
  return node.t === "nil" ? items : null;
}

export function listLength(value: LispValue): number {
  let count = 0;
  let node = value;
  while (node.t === "cons") {
    count += 1;
    node = node.cdr;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Números
// ---------------------------------------------------------------------------

export function isNumber(value: LispValue): value is LispInt | LispReal {
  return value.t === "int" || value.t === "real";
}

/** Valor numérico de un entero o un real. Quien llama ya comprobó el tipo. */
export function numberValue(value: LispInt | LispReal): number {
  return value.v;
}

// ---------------------------------------------------------------------------
// Igualdad
// ---------------------------------------------------------------------------

/**
 * `eq`: identidad. Dos celdas cons distintas nunca son `eq` aunque su contenido
 * coincida; dos símbolos con el mismo nombre SÍ, porque están internados.
 *
 * Los números se comparan por valor Y por tipo: `(eq 1 1.0)` es nil, igual que
 * en el original. Los enteros no están internados, así que compararlos por
 * identidad de objeto habría hecho `(eq 1 1)` falso.
 */
export function eq(a: LispValue, b: LispValue): boolean {
  if (a === b) return true;
  if (a.t !== b.t) return false;
  switch (a.t) {
    case "nil":
      return true;
    case "int":
    case "real":
      return a.v === (b as LispInt | LispReal).v;
    case "str":
      // `eq` sobre cadenas es identidad en AutoCAD, pero dos literales iguales
      // del mismo fichero son indistinguibles para el usuario y el original
      // los da por iguales en la práctica. Se compara por valor.
      return a.v === (b as LispString).v;
    case "ename":
      return a.id === (b as LispEname).id;
    default:
      return false;
  }
}

/** `equal`: estructura. Recorre celdas comparando `equal` recursivamente. */
export function equal(a: LispValue, b: LispValue, fuzz = 0): boolean {
  if (a.t === "cons" && b.t === "cons")
    return equal(a.car, b.car, fuzz) && equal(a.cdr, b.cdr, fuzz);
  if (fuzz > 0 && isNumber(a) && isNumber(b)) return Math.abs(a.v - b.v) <= fuzz;
  return eq(a, b);
}

// ---------------------------------------------------------------------------
// Puntos: la lista de 2 o 3 reales que atraviesa TODO el subsistema
// ---------------------------------------------------------------------------

export interface LispPoint {
  x: number;
  y: number;
  z: number;
}

/**
 * Lee un punto LISP. Acepta listas de 2 o 3 números —enteros incluidos, porque
 * `(list 0 0)` es lo que teclea medio mundo— y devuelve `null` para cualquier
 * otra cosa. Devolver `null` en vez de lanzar deja que quien llama produzca el
 * mensaje de error de AutoLISP con el nombre de SU función.
 */
export function pointOf(value: LispValue): LispPoint | null {
  const items = properList(value);
  if (!items || items.length < 2 || items.length > 3) return null;
  if (!items.every(isNumber)) return null;
  const [x, y, z] = items as (LispInt | LispReal)[];
  return { x: x.v, y: y.v, z: z ? z.v : 0 };
}

/** Escribe un punto como lista de tres reales, que es lo que emite AutoLISP. */
export function pointValue(point: { x: number; y: number; z?: number }): LispValue {
  return list([real(point.x), real(point.y), real(point.z ?? 0)]);
}

/** Nombre del tipo tal y como lo escribe `type` y los mensajes de error. */
export function typeName(value: LispValue): string {
  switch (value.t) {
    case "nil":
      return "nil";
    case "sym":
      return "SYM";
    case "int":
      return "INT";
    case "real":
      return "REAL";
    case "str":
      return "STR";
    case "cons":
      return "LIST";
    case "ename":
      return "ENAME";
    case "pickset":
      return "PICKSET";
    case "subr":
      return "SUBR";
    case "closure":
      return "USUBR";
    case "catch-error":
      return "CATCH-ERROR";
  }
}
