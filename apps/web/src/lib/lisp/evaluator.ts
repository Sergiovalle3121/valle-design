/**
 * El evaluador. Un generador, y no una función corriente, por una razón.
 *
 * `getpoint` tiene que PARAR la rutina en mitad de una expresión, esperar a que
 * alguien pinche en el lienzo, y continuar donde estaba con el punto en la
 * mano. Hay tres formas de hacer eso y dos son malas:
 *
 *  - Bloquear el hilo hasta que llegue el punto. Es lo que hace AutoCAD, y en
 *    un navegador significa colgar la pestaña: el clic que estás esperando
 *    llega por el mismo bucle de eventos que has bloqueado. No es que sea lento
 *    — es que el punto no puede llegar nunca.
 *  - Hacer `async` todo el evaluador. Entonces cada `(+ 1 2)` devuelve una
 *    promesa, el presupuesto de tiempo deja de comprobarse en un punto único, y
 *    un `await` mal puesto convierte la rutina en reentrante: dos comandos
 *    pisándose el documento a la vez.
 *  - Suspender con un generador. La rutina cede el control con `yield`, el
 *    anfitrión resuelve la petición cuando puede y llama a `next(respuesta)`.
 *    El evaluador sigue siendo síncrono y de un solo hilo, el presupuesto se
 *    cobra en un sitio, y quien conduce el generador decide cuándo continuar.
 *
 * De ahí que todo el módulo esté escrito con `yield*`.
 *
 * ## Formas especiales
 *
 * Están RESERVADAS: `(setq if 5)` liga el símbolo, pero `(if ...)` sigue siendo
 * la condicional. En AutoCAD el resultado de eso es indefinido y en la práctica
 * catastrófico; aquí una rutina hostil no puede reescribir el flujo de control
 * del intérprete debajo de otra.
 *
 * ## Ámbito
 *
 * Dinámico, como el original. La justificación entera está en `environment.ts`.
 */
import { LispMeter, type LispBudgetLimits } from "./budget";
import { LispScope } from "./environment";
import {
  LispAbort,
  LispError,
  LispQuit,
  isCatchable,
  noFunction,
  tooFewArguments,
  tooManyArguments,
} from "./errors";
import { printLisp } from "./printer";
import {
  NIL,
  T,
  bool,
  catchError,
  cons,
  list,
  properList,
  str,
  sym,
  toArray,
  truthy,
  type LispCallContext,
  type LispClosure,
  type LispEval,
  type LispHostServices,
  type LispValue,
} from "./values";

const SPECIAL_FORMS = new Set([
  "QUOTE",
  "FUNCTION",
  "DEFUN",
  "SETQ",
  "LAMBDA",
  "IF",
  "COND",
  "WHILE",
  "REPEAT",
  "FOREACH",
  "PROGN",
  "AND",
  "OR",
  "BACKQUOTE",
  "UNQUOTE",
  "UNQUOTE-SPLICE",
]);

/** Nombre del manejador de errores del usuario, tal cual lo escribe AutoLISP. */
export const ERROR_HANDLER = "*ERROR*";

export interface LispInterpreterOptions {
  /** Tabla base de builtins. Compartida y de sólo lectura entre sesiones. */
  builtins: ReadonlyMap<string, LispValue>;
  limits?: LispBudgetLimits;
  now?: () => number;
  host?: LispHostServices | null;
}

export class LispInterpreter {
  readonly scope: LispScope;
  readonly meter: LispMeter;
  readonly host: LispHostServices | null;
  /** Todo lo que la rutina imprimió, en orden. */
  readonly output: string[] = [];
  private picksetSerial = 0;

  constructor(options: LispInterpreterOptions) {
    this.scope = new LispScope(options.builtins);
    this.meter = new LispMeter(options.limits, options.now);
    this.host = options.host ?? null;
    this.context.host = this.host;
  }

  /**
   * Contexto que reciben los builtins. Se construye UNA vez por sesión: un
   * objeto nuevo por llamada añadiría una asignación a cada `(+ 1 2)`.
   */
  readonly context: LispCallContext = {
    charge: (cells) => this.meter.charge(cells),
    apply: (fn, args) => this.apply(fn, args),
    catchAll: (fn, args) => this.catchAllApply(fn, args),
    evaluate: (form) => this.evaluate(form),
    lookup: (name) => this.scope.get(name.toUpperCase()),
    setGlobal: (name, value) => this.scope.set(name.toUpperCase(), value),
    host: null,
    nextPicksetSerial: () => {
      this.picksetSerial += 1;
      return this.picksetSerial;
    },
  };

  *evaluate(form: LispValue): LispEval {
    this.meter.step();

    switch (form.t) {
      case "sym":
        // `T` y `NIL` se evalúan a sí mismos; el resto busca su valor, y un
        // símbolo sin ligar vale nil como en el original.
        return form === T ? T : this.scope.get(form.name);
      case "cons":
        return yield* this.evaluateCall(form.car, form.cdr);
      default:
        return form;
    }
  }

  /** Evalúa una secuencia devolviendo el último valor; `nil` si está vacía. */
  *evaluateBody(forms: readonly LispValue[]): LispEval {
    let result: LispValue = NIL;
    for (const form of forms) result = yield* this.evaluate(form);
    return result;
  }

  private *evaluateCall(head: LispValue, rest: LispValue): LispEval {
    if (head.t === "sym" && SPECIAL_FORMS.has(head.name))
      return yield* this.special(head.name, rest);

    const fn = head.t === "sym" ? this.scope.get(head.name) : yield* this.evaluate(head);
    const argForms = properList(rest);
    if (!argForms) throw new LispError(`malformed list on input: ${printLisp(cons(head, rest))}`);

    const args: LispValue[] = [];
    this.meter.charge(argForms.length);
    for (const argForm of argForms) args.push(yield* this.evaluate(argForm));

    // El lambda citado también vale como cabeza de llamada; `apply` lo resuelve.
    const callable =
      fn.t === "subr" ||
      fn.t === "closure" ||
      (fn.t === "cons" && fn.car.t === "sym" && fn.car.name === "LAMBDA");
    if (!callable) throw noFunction(head.t === "sym" ? head.name : printLisp(head));
    return yield* this.apply(fn, args);
  }

  *apply(fn: LispValue, args: LispValue[]): LispEval {
    if (fn.t === "sym") {
      const resolved = this.scope.get(fn.name);
      if (resolved.t !== "subr" && resolved.t !== "closure") throw noFunction(fn.name);
      return yield* this.apply(resolved, args);
    }

    if (fn.t === "subr") {
      if (args.length < fn.min) throw tooFewArguments(fn.name);
      if (fn.max !== null && args.length > fn.max) throw tooManyArguments(fn.name);
      if (fn.impl.kind === "pure") return fn.impl.call(args, this.context);
      return yield* fn.impl.call(args, this.context);
    }

    if (fn.t === "closure") return yield* this.applyClosure(fn, args);

    /**
     * `'(lambda (x) ...)` — un lambda CITADO — es una lista, no un cierre, y
     * aun así AutoLISP lo acepta como función. No es una rareza: es la forma en
     * la que está escrito casi todo el código que se pasa a `mapcar` en las
     * rutinas reales, porque en el original `lambda` también se evalúa a una
     * lista. Rechazarlo dejaría fuera media biblioteca.
     */
    if (fn.t === "cons" && fn.car.t === "sym" && fn.car.name === "LAMBDA")
      return yield* this.applyClosure(makeClosure("", toArray(fn.cdr)), args);

    throw noFunction(printLisp(fn));
  }

  private *applyClosure(fn: LispClosure, args: LispValue[]): LispEval {
    if (args.length < fn.params.length) throw tooFewArguments(fn.name || "lambda");
    if (args.length > fn.params.length) throw tooManyArguments(fn.name || "lambda");

    const names = [...fn.params, ...fn.locals];
    const values = [...args, ...fn.locals.map(() => NIL)];
    this.meter.enter();
    const saved = this.scope.bindFrame(names, values);
    try {
      return yield* this.evaluateBody(fn.body);
    } finally {
      this.scope.restoreFrame(saved);
      this.meter.leave();
    }
  }

  // -------------------------------------------------------------------------
  // Formas especiales
  // -------------------------------------------------------------------------

  private *special(name: string, rest: LispValue): LispEval {
    const forms = properList(rest);
    if (!forms) throw new LispError(`malformed list on input: ${name}`);

    switch (name) {
      case "QUOTE":
        return forms[0] ?? NIL;

      case "FUNCTION":
        // `(function (lambda ...))` es `quote` con intención declarada. Sin
        // compilador que aprovecharlo, la diferencia es documental: se evalúa
        // el lambda para devolver un cierre usable.
        return forms[0] === undefined ? NIL : yield* this.evaluate(forms[0]);

      case "LAMBDA":
        return makeClosure("", forms);

      case "DEFUN":
        return this.defun(forms);

      case "SETQ":
        return yield* this.setq(forms);

      case "IF": {
        if (forms.length < 2) throw tooFewArguments("if");
        const test = yield* this.evaluate(forms[0]);
        if (truthy(test)) return yield* this.evaluate(forms[1]);
        return forms.length > 2 ? yield* this.evaluate(forms[2]) : NIL;
      }

      case "COND":
        return yield* this.cond(forms);

      case "WHILE": {
        if (forms.length === 0) throw tooFewArguments("while");
        let result: LispValue = NIL;
        for (;;) {
          this.meter.step();
          const test = yield* this.evaluate(forms[0]);
          if (!truthy(test)) return result;
          result = yield* this.evaluateBody(forms.slice(1));
        }
      }

      case "REPEAT": {
        if (forms.length === 0) throw tooFewArguments("repeat");
        const count = yield* this.evaluate(forms[0]);
        if (count.t !== "int" && count.t !== "real")
          throw new LispError(`bad argument type: numberp: ${printLisp(count)}`);
        let result: LispValue = NIL;
        const times = Math.trunc(count.v);
        for (let index = 0; index < times; index += 1) {
          this.meter.step();
          result = yield* this.evaluateBody(forms.slice(1));
        }
        return result;
      }

      case "FOREACH": {
        if (forms.length < 2) throw tooFewArguments("foreach");
        const variable = forms[0];
        if (variable.t !== "sym") throw new LispError("bad argument type: foreach: variable");
        const sequence = yield* this.evaluate(forms[1]);
        const items = toArray(sequence);
        let result: LispValue = NIL;
        const saved = this.scope.bindFrame([variable.name], [NIL]);
        try {
          for (const item of items) {
            this.meter.step();
            this.scope.set(variable.name, item);
            result = yield* this.evaluateBody(forms.slice(2));
          }
        } finally {
          this.scope.restoreFrame(saved);
        }
        return result;
      }

      case "PROGN":
        return yield* this.evaluateBody(forms);

      case "AND": {
        let result: LispValue = T;
        for (const form of forms) {
          result = yield* this.evaluate(form);
          if (!truthy(result)) return NIL;
        }
        return truthy(result) ? T : NIL;
      }

      case "OR": {
        for (const form of forms) {
          const value = yield* this.evaluate(form);
          if (truthy(value)) return T;
        }
        return NIL;
      }

      case "BACKQUOTE":
        return yield* this.quasiquote(forms[0] ?? NIL);

      case "UNQUOTE":
      case "UNQUOTE-SPLICE":
        throw new LispError(`${name === "UNQUOTE" ? "," : ",@"} fuera de un backquote`);

      default:
        throw noFunction(name);
    }
  }

  private defun(forms: readonly LispValue[]): LispValue {
    if (forms.length < 2) throw tooFewArguments("defun");
    const nameForm = forms[0];
    if (nameForm.t !== "sym") throw new LispError("bad argument type: defun: nombre");
    const closure = makeClosure(nameForm.name, forms.slice(1));
    this.scope.set(nameForm.name, closure);
    return nameForm;
  }

  private *setq(forms: readonly LispValue[]): LispEval {
    if (forms.length === 0) throw tooFewArguments("setq");
    if (forms.length % 2 !== 0) throw new LispError("setq: número impar de argumentos");
    let last: LispValue = NIL;
    for (let index = 0; index < forms.length; index += 2) {
      const target = forms[index];
      if (target.t !== "sym") throw new LispError("bad argument type: setq: símbolo");
      last = yield* this.evaluate(forms[index + 1]);
      this.scope.set(target.name, last);
    }
    return last;
  }

  private *cond(clauses: readonly LispValue[]): LispEval {
    for (const clause of clauses) {
      const parts = properList(clause);
      if (!parts || parts.length === 0) throw new LispError("bad argument type: cond: cláusula");
      const test = yield* this.evaluate(parts[0]);
      if (!truthy(test)) continue;
      // Una cláusula sin cuerpo devuelve el valor de la prueba, como el
      // original: `(cond (x))` es la forma corta de «devuélvemelo si lo hay».
      if (parts.length === 1) return test;
      return yield* this.evaluateBody(parts.slice(1));
    }
    return NIL;
  }

  /** `\`(a ,b ,@c)`: reconstruye la plantilla evaluando sólo lo desmarcado. */
  private *quasiquote(template: LispValue): LispEval {
    if (template.t !== "cons") return template;

    const head = template.car;
    if (head.t === "sym" && head.name === "UNQUOTE")
      return yield* this.evaluate(toArray(template.cdr)[0] ?? NIL);

    const items: LispValue[] = [];
    let node: LispValue = template;
    while (node.t === "cons") {
      const element = node.car;
      // Un `,@` en posición de cola: `(a . ,b)` llega como cdr, no como item.
      if (element.t === "cons" && element.car.t === "sym" && element.car.name === "UNQUOTE-SPLICE") {
        const spliced = yield* this.evaluate(toArray(element.cdr)[0] ?? NIL);
        const expanded = toArray(spliced);
        this.meter.charge(expanded.length);
        items.push(...expanded);
      } else if (element.t === "cons" && element.car.t === "sym" && element.car.name === "UNQUOTE") {
        items.push(yield* this.evaluate(toArray(element.cdr)[0] ?? NIL));
      } else {
        items.push(yield* this.quasiquote(element));
      }
      const next: LispValue = node.cdr;
      if (next.t === "cons" && next.car.t === "sym" && next.car.name === "UNQUOTE") {
        const tail = yield* this.evaluate(toArray(next.cdr)[0] ?? NIL);
        this.meter.charge(items.length);
        return list(items, tail);
      }
      node = next;
    }
    this.meter.charge(items.length);
    return list(items, node.t === "nil" ? NIL : yield* this.quasiquote(node));
  }

  // -------------------------------------------------------------------------
  // Captura de errores
  // -------------------------------------------------------------------------

  /**
   * `vl-catch-all-apply`. Devuelve el valor de la llamada, o un objeto de error
   * capturado si falló.
   *
   * Lo importante está en qué NO atrapa: `LispAbort` (presupuesto agotado) y
   * `LispQuit` la atraviesan. Un sandbox cuyo límite se puede tragar con un
   * `try` no limita nada — véase la explicación en `errors.ts`.
   */
  *catchAllApply(fn: LispValue, args: LispValue[]): LispEval {
    try {
      return yield* this.apply(fn, args);
    } catch (cause) {
      if (!isCatchable(cause)) throw cause;
      return catchError(cause.message);
    }
  }

  /**
   * Ejecuta el manejador `*error*` del usuario, si lo definió. Los fallos del
   * propio manejador se tragan a propósito: un `*error*` roto no puede
   * convertir un error corriente en un fallo distinto que oculte el original.
   */
  *runErrorHandler(message: string): LispEval {
    const handler = this.scope.get(ERROR_HANDLER);
    if (handler.t !== "closure" && handler.t !== "subr") return NIL;
    try {
      return yield* this.apply(handler, [str(message)]);
    } catch (cause) {
      if (cause instanceof LispAbort || cause instanceof LispQuit) throw cause;
      return NIL;
    }
  }

  /** Verdadero si la sesión definió su propio `*error*`. */
  get hasErrorHandler(): boolean {
    const handler = this.scope.get(ERROR_HANDLER);
    return handler.t === "closure" || handler.t === "subr";
  }
}

/**
 * `(name (a b / loc1 loc2) cuerpo...)` → cierre. La barra separa argumentos de
 * locales, y es LA convención con la que AutoLISP declara variables locales; sin
 * ella, cada `setq` de una rutina ensucia el espacio global y dos rutinas de dos
 * proveedores distintos se pisan las variables.
 */
function makeClosure(name: string, forms: readonly LispValue[]): LispClosure {
  const header = forms[0] ?? NIL;
  const declared = header.t === "nil" ? [] : properList(header);
  if (declared === null) throw new LispError(`bad argument type: ${name || "lambda"}: lista de argumentos`);

  const params: string[] = [];
  const locals: string[] = [];
  let afterSlash = false;
  for (const entry of declared) {
    if (entry.t !== "sym") throw new LispError(`bad argument type: ${name || "lambda"}: argumento`);
    if (entry.name === "/") {
      if (afterSlash) throw new LispError(`${name || "lambda"}: dos barras en la lista de argumentos`);
      afterSlash = true;
      continue;
    }
    (afterSlash ? locals : params).push(entry.name);
  }

  return { t: "closure", name, params, locals, body: forms.slice(1) };
}

/** `bool` reexportado: los builtins de predicados lo usan constantemente. */
export const lispBool = bool;

/** Símbolo del nombre de una función, para mensajes. */
export function functionName(fn: LispValue): string {
  if (fn.t === "subr") return fn.name;
  if (fn.t === "closure") return fn.name || "lambda";
  if (fn.t === "sym") return fn.name;
  return printLisp(fn);
}

/** Reexportado por comodidad de los módulos de builtins. */
export { sym as internSymbol };
