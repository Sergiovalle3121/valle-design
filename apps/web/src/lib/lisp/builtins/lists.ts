/**
 * Listas. Y `assoc`, que es la función más importante de todo el subsistema.
 *
 * Puede sonar exagerado hasta que se mira lo que hace una rutina de entidades
 * de verdad: `entget` devuelve una lista de pares punteados con códigos DXF, y
 * TODO lo que la rutina sabe de esa entidad lo saca con `(cdr (assoc 10 ed))`.
 * Si `assoc` compara mal —por identidad en vez de por `equal`, o sin distinguir
 * el entero 10 del real 10.0—, la rutina no falla: recibe `nil`, lo interpreta
 * como «esa entidad no tiene punto de inserción», y dibuja en el origen.
 *
 * De ahí que `assoc` compare con `equal` y que la aritmética de este módulo
 * respete la diferencia entre entero y real que impone `values.ts`.
 *
 * ## Sobre `append` y el presupuesto
 *
 * `append` COPIA todas las listas menos la última. Cobrar por elemento copiado
 * es lo que impide que `(repeat 25 (setq l (append l l)))` construya treinta y
 * tres millones de celdas: son veinticinco pasos, y sólo el cargo por celda lo
 * ve venir.
 */
import { badArgumentType } from "../errors";
import { printLisp } from "../printer";
import {
  NIL,
  bool,
  cons,
  equal,
  int,
  list,
  listLength,
  properList,
  str,
  toArray,
  truthy,
  type LispCallContext,
  type LispEval,
  type LispValue,
} from "../values";
import {
  defgen,
  defsubr,
  wantFunction,
  wantInt,
  wantList,
  type BuiltinTable,
} from "./define";

/** `(car x)` sobre algo que no es lista da nil, como el original. */
function carOf(value: LispValue): LispValue {
  return value.t === "cons" ? value.car : NIL;
}

function cdrOf(value: LispValue): LispValue {
  return value.t === "cons" ? value.cdr : NIL;
}

/**
 * Las combinaciones `c…r` que aparecen en rutinas reales. `cadr` y `caddr` son
 * X e Y de un punto; `cdar` recorre listas de asociación. Se generan desde la
 * cadena de letras para que añadir una más no sea copiar y pegar mal.
 */
const CxR = [
  "aa", "ad", "da", "dd",
  "aaa", "aad", "ada", "add", "daa", "dad", "dda", "ddd",
];

export function installLists(table: BuiltinTable): void {
  defsubr(table, "car", 1, 1, (args) => carOf(wantList(args[0])));
  defsubr(table, "cdr", 1, 1, (args) => cdrOf(wantList(args[0])));

  for (const path of CxR)
    defsubr(table, `c${path}r`, 1, 1, (args) => {
      let value = wantList(args[0]);
      // Se aplica de derecha a izquierda: `cadr` es `(car (cdr x))`.
      for (let index = path.length - 1; index >= 0; index -= 1)
        value = path[index] === "a" ? carOf(value) : cdrOf(value);
      return value;
    });

  defsubr(table, "cons", 2, 2, (args, ctx) => {
    ctx.charge(1);
    return cons(args[0], args[1]);
  });

  defsubr(table, "list", 0, null, (args, ctx) => {
    ctx.charge(args.length);
    return list(args);
  });

  defsubr(table, "append", 0, null, (args, ctx) => {
    if (args.length === 0) return NIL;
    const items: LispValue[] = [];
    for (let index = 0; index < args.length - 1; index += 1) {
      const elements = properList(wantList(args[index]));
      if (elements === null) throw badArgumentType("listp", printLisp(args[index]));
      ctx.charge(elements.length);
      items.push(...elements);
    }
    // La ÚLTIMA lista no se copia: se comparte como cola, igual que el
    // original. Por eso `append` es barato al final de un bucle acumulador.
    return list(items, args[args.length - 1]);
  });

  defsubr(table, "length", 1, 1, (args) => int(listLength(wantList(args[0]))));

  defsubr(table, "nth", 2, 2, (args) => {
    const index = wantInt(args[0]);
    if (index < 0) return NIL;
    let node = wantList(args[1]);
    for (let step = 0; step < index && node.t === "cons"; step += 1) node = node.cdr;
    return carOf(node);
  });

  defsubr(table, "last", 1, 1, (args) => {
    let node = wantList(args[0]);
    if (node.t !== "cons") return NIL;
    while (node.t === "cons" && node.cdr.t === "cons") node = node.cdr;
    return node.car;
  });

  defsubr(table, "reverse", 1, 1, (args, ctx) => {
    const items = toArray(wantList(args[0]));
    ctx.charge(items.length);
    return list(items.reverse());
  });

  /**
   * `member` devuelve la COLA de la lista desde la coincidencia, no `T`. Media
   * biblioteca de rutinas escribe `(cadr (member "-l" argumentos))` para leer
   * el valor que sigue a una opción; devolver un booleano lo rompería sin que
   * ninguna prueba de «¿está?» lo notase.
   */
  defsubr(table, "member", 2, 2, (args) => {
    let node = wantList(args[1]);
    while (node.t === "cons") {
      if (equal(node.car, args[0])) return node;
      node = node.cdr;
    }
    return NIL;
  });

  defsubr(table, "assoc", 2, 2, (args) => {
    let node = wantList(args[1]);
    while (node.t === "cons") {
      const entry = node.car;
      // Se compara con `equal`, no con `eq`: la clave puede ser una lista
      // (grupos DXF extendidos) y `eq` diría que no en un caso perfectamente
      // legítimo.
      if (entry.t === "cons" && equal(entry.car, args[0])) return entry;
      node = node.cdr;
    }
    return NIL;
  });

  /**
   * `subst`: sustituye TODAS las apariciones de `viejo` por `nuevo`,
   * recursivamente. Es la función con la que se modifica una entidad:
   *
   *     (entmod (subst (cons 8 "MUROS") (assoc 8 ed) ed))
   *
   * La recursión en el `car` es lo que hace que funcione dentro de sublistas;
   * sin ella, cambiar el punto de un vértice de polilínea no haría nada.
   */
  defsubr(table, "subst", 3, 3, (args, ctx) => {
    const [replacement, target, source] = args;
    const substitute = (value: LispValue): LispValue => {
      if (equal(value, target)) return replacement;
      if (value.t !== "cons") return value;
      ctx.charge(1);
      return cons(substitute(value.car), substitute(value.cdr));
    };
    return substitute(source);
  });

  defsubr(table, "vl-remove", 2, 2, (args, ctx) => {
    const items = toArray(wantList(args[1])).filter((item) => !equal(item, args[0]));
    ctx.charge(items.length);
    return list(items);
  });

  defsubr(table, "vl-position", 2, 2, (args) => {
    const items = toArray(wantList(args[1]));
    const index = items.findIndex((item) => equal(item, args[0]));
    return index < 0 ? NIL : int(index);
  });

  defsubr(table, "vl-list->string", 1, 1, (args, ctx) => {
    const codes = toArray(wantList(args[0])).map((item) => wantInt(item));
    ctx.charge(codes.length);
    return str(String.fromCharCode(...codes));
  });

  // --- las que llaman a otra función: generadores ----------------------------

  defgen(table, "apply", 2, 2, function* (args, ctx): LispEval {
    const fn = wantFunction(args[0]);
    const callArgs = properList(wantList(args[1]));
    if (callArgs === null) throw badArgumentType("listp", printLisp(args[1]));
    return yield* ctx.apply(fn, callArgs);
  });

  /**
   * `mapcar` con N listas se detiene en la MÁS CORTA. Es el comportamiento del
   * original y lo que hace que `(mapcar '+ p1 p2)` sume dos puntos aunque uno
   * venga con Z y el otro no.
   */
  defgen(table, "mapcar", 2, null, function* (args, ctx): LispEval {
    const fn = wantFunction(args[0]);
    const columns = args.slice(1).map((value) => toArray(wantList(value)));
    const rows = Math.min(...columns.map((column) => column.length));
    const results: LispValue[] = [];
    ctx.charge(rows);
    for (let row = 0; row < rows; row += 1)
      results.push(yield* ctx.apply(fn, columns.map((column) => column[row])));
    return list(results);
  });

  defgen(table, "vl-some", 2, 2, function* (args, ctx): LispEval {
    const fn = wantFunction(args[0]);
    for (const item of toArray(wantList(args[1]))) {
      const value = yield* ctx.apply(fn, [item]);
      if (truthy(value)) return value;
    }
    return NIL;
  });

  defgen(table, "vl-every", 2, 2, function* (args, ctx): LispEval {
    const fn = wantFunction(args[0]);
    for (const item of toArray(wantList(args[1]))) {
      const value = yield* ctx.apply(fn, [item]);
      if (!truthy(value)) return NIL;
    }
    return bool(true);
  });

  defgen(table, "vl-remove-if", 2, 2, function* (args, ctx): LispEval {
    const fn = wantFunction(args[0]);
    const kept: LispValue[] = [];
    for (const item of toArray(wantList(args[1]))) {
      const value = yield* ctx.apply(fn, [item]);
      if (!truthy(value)) kept.push(item);
    }
    ctx.charge(kept.length);
    return list(kept);
  });

  /**
   * `vl-sort` con un comparador del usuario. La ordenación se hace sobre un
   * array de JavaScript, pero el comparador es LISP y puede suspenderse, así
   * que `Array.prototype.sort` no sirve: se implementa una mezcla iterativa
   * cuyas comparaciones sí pueden ceder el control.
   */
  defgen(table, "vl-sort", 2, 2, function* (args, ctx): LispEval {
    const items = toArray(wantList(args[0]));
    const fn = wantFunction(args[1]);
    ctx.charge(items.length);
    let width = 1;
    let source = items;
    let target = new Array<LispValue>(items.length);
    while (width < source.length) {
      for (let start = 0; start < source.length; start += width * 2) {
        let left = start;
        const middle = Math.min(start + width, source.length);
        let right = middle;
        const end = Math.min(start + width * 2, source.length);
        for (let out = start; out < end; out += 1) {
          const takeLeft =
            left < middle &&
            (right >= end || truthy(yield* ctx.apply(fn, [source[left], source[right]])));
          target[out] = takeLeft ? source[left++] : source[right++];
        }
      }
      [source, target] = [target, source];
      width *= 2;
    }
    return list(source);
  });

  /**
   * `vl-list*` construye una lista cuyo ÚLTIMO argumento es la COLA, no un
   * elemento. `(vl-list* 1 2 '(3 4))` es `(1 2 3 4)` y `(vl-list* 1 2)` es el
   * par punteado `(1 . 2)`. Es como se arma un par de códigos DXF a partir de
   * piezas calculadas, y confundirla con `list` produce `(1 2 (3 4))`: una
   * lista de tres elementos donde la rutina espera cuatro.
   */
  defsubr(table, "vl-list*", 1, null, (args, ctx) => {
    ctx.charge(args.length);
    return list(args.slice(0, -1), args[args.length - 1]);
  });

  defgen(table, "vl-remove-if-not", 2, 2, function* (args, ctx): LispEval {
    const fn = wantFunction(args[0]);
    const kept: LispValue[] = [];
    for (const item of toArray(wantList(args[1]))) {
      const value = yield* ctx.apply(fn, [item]);
      if (truthy(value)) kept.push(item);
    }
    ctx.charge(kept.length);
    return list(kept);
  });

  /**
   * `vl-member-if` devuelve la COLA desde el primer elemento que cumple, igual
   * que `member` devuelve la cola desde la coincidencia — no `T`, y no el
   * elemento. La rutina que busca el primer par de una lista de asociación que
   * cumpla algo sigue leyendo desde ahí con `cdr`.
   */
  defgen(table, "vl-member-if", 2, 2, function* (args, ctx): LispEval {
    return yield* memberIf(args, ctx, true);
  });

  defgen(table, "vl-member-if-not", 2, 2, function* (args, ctx): LispEval {
    return yield* memberIf(args, ctx, false);
  });

  /**
   * `vl-sort-i` ordena y devuelve los ÍNDICES, no los elementos. Existe por una
   * razón concreta: con los índices se puede reordenar OTRA lista en paralelo
   * —los nombres de capa por su área, las etiquetas por la coordenada de su
   * eje—, que con la lista ya ordenada sería imposible.
   *
   * A diferencia de `vl-sort`, conserva los repetidos: hay un índice por cada
   * elemento de la lista de entrada, siempre.
   *
   * La ordenación es la misma mezcla iterativa que `vl-sort`, y por el mismo
   * motivo: el comparador es código LISP y puede SUSPENDERSE, así que
   * `Array.prototype.sort` —que no sabe ceder el control— no sirve.
   */
  defgen(table, "vl-sort-i", 2, 2, function* (args, ctx): LispEval {
    const items = toArray(wantList(args[0]));
    const fn = wantFunction(args[1]);
    ctx.charge(items.length);
    let width = 1;
    let source = items.map((_unused, index) => index);
    let target = new Array<number>(items.length);
    while (width < source.length) {
      for (let start = 0; start < source.length; start += width * 2) {
        let left = start;
        const middle = Math.min(start + width, source.length);
        let right = middle;
        const end = Math.min(start + width * 2, source.length);
        for (let out = start; out < end; out += 1) {
          // Se pregunta al revés —«¿va el de la derecha ANTES?»— para que los
          // elementos que el comparador considera iguales conserven su orden
          // de entrada. Es lo que hace utilizable el resultado: si `vl-sort-i`
          // barajara los empatados, reordenar en paralelo la lista de nombres
          // por la de áreas emparejaría cada nombre con el área de otro en
          // cuanto dos áreas coincidieran.
          const takeLeft =
            left < middle &&
            (right >= end ||
              !truthy(yield* ctx.apply(fn, [items[source[right]], items[source[left]]])));
          target[out] = takeLeft ? source[left++] : source[right++];
        }
      }
      [source, target] = [target, source];
      width *= 2;
    }
    return list(source.map((index) => int(index)));
  });
}

/**
 * El cuerpo compartido de `vl-member-if` y `vl-member-if-not`. Se recorre la
 * CADENA DE CELDAS y no un array copiado porque lo que se devuelve es un nodo
 * de la lista original: copiarla devolvería una cola equivalente pero distinta,
 * y `(eq (vl-member-if p l) (cdr l))` dejaría de ser cierto donde el original
 * dice que lo es.
 */
function* memberIf(
  args: readonly LispValue[],
  ctx: LispCallContext,
  wanted: boolean,
): LispEval {
  const fn = wantFunction(args[0]);
  let node = wantList(args[1]);
  while (node.t === "cons") {
    const value = yield* ctx.apply(fn, [node.car]);
    if (truthy(value) === wanted) return node;
    node = node.cdr;
  }
  return NIL;
}
