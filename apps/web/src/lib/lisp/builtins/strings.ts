/**
 * Cadenas, y las conversiones que escriben números en el plano.
 *
 * ## `rtos` no se reimplementa
 *
 * `rtos` es «escribe este número como lo escribiría el plano»: decimal,
 * científico, de ingeniería (`1'-6.50"`), arquitectónico (`1'-6 1/2"`) o
 * fraccionario. Eso ya existe en el repositorio —`lib/cad/unit-format.ts`, con
 * sus specs verdes— y es el mismo formateador que usan las cotas.
 *
 * Reimplementarlo aquí habría creado dos verdades sobre cómo se escribe una
 * medida: la de las cotas y la de las rutinas LISP. El día que difiriesen en el
 * redondeo de la fracción, un plano tendría la cota diciendo `6 1/2"` y la
 * tabla generada por la rutina diciendo `6 9/16"`, y nadie sabría cuál mandaba.
 * Los modos de `rtos` se traducen a los sistemas de `unit-format`; el formato
 * lo decide un solo módulo.
 *
 * ## `angtos` sí se implementa aquí
 *
 * Porque no existe: el repositorio formatea ángulos en grados decimales
 * (`dimension-format.ts`) y no sabe de grados-minutos-segundos, gradianes ni
 * rumbos de topógrafo. Se implementa completo, con la conversión desde radianes
 * que impone AutoLISP para la entrada.
 */
import { formatLength, type UnitSystem } from "../../cad/unit-format";
import { LispError, badArgumentType } from "../errors";
import { printLisp } from "../printer";
import { readLispForms } from "../reader";
import {
  NIL,
  int,
  list,
  real,
  str,
  sym,
  type LispValue,
} from "../values";
import {
  chargedString,
  defsubr,
  wantInt,
  wantNumber,
  wantString,
  type BuiltinTable,
} from "./define";

/** Modos de `rtos` → sistemas de `unit-format`. La tabla de AutoLISP. */
const RTOS_MODES: Record<number, UnitSystem> = {
  1: "scientific",
  2: "decimal",
  3: "engineering",
  4: "architectural",
  5: "fractional",
};

/**
 * `atof`/`atoi` de AutoLISP leen el PREFIJO numérico y devuelven 0 si no hay
 * ninguno: `(atoi "12abc")` es 12 y `(atoi "abc")` es 0. `Number("12abc")` da
 * `NaN`, así que hace falta el prefijo explícito.
 */
function leadingNumber(text: string): number {
  const match = /^\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(text);
  if (!match) return 0;
  const value = Number.parseFloat(match[0]);
  return Number.isFinite(value) ? value : 0;
}

/** Grados decimales → grados, minutos y segundos, con redondeo consistente. */
function toDegMinSec(degrees: number, precision: number): string {
  const sign = degrees < 0 ? "-" : "";
  let remaining = Math.abs(degrees);
  let whole = Math.floor(remaining);
  remaining = (remaining - whole) * 60;
  let minutes = Math.floor(remaining);
  let seconds = (remaining - minutes) * 60;
  // El redondeo de los segundos puede desbordar a 60: sin este arrastre saldría
  // `12d30'60"`, que no es un ángulo válido en ningún plano.
  const secondsText = seconds.toFixed(precision);
  if (Number.parseFloat(secondsText) >= 60) {
    seconds = 0;
    minutes += 1;
  } else {
    seconds = Number.parseFloat(secondsText);
  }
  if (minutes >= 60) {
    minutes -= 60;
    whole += 1;
  }
  const secondsOut = precision > 0 ? seconds.toFixed(precision) : String(Math.round(seconds));
  return `${sign}${whole}d${minutes}'${secondsOut}"`;
}

/**
 * Rumbo de topógrafo: `N 45d0'0" E`. El ángulo se mide desde el eje Norte o Sur
 * hacia el Este u Oeste, que es como se escriben los linderos en un plano de
 * parcelación.
 */
function toSurveyor(degrees: number, precision: number): string {
  const normalized = ((degrees % 360) + 360) % 360;
  if (normalized === 0) return "E";
  if (normalized === 90) return "N";
  if (normalized === 180) return "W";
  if (normalized === 270) return "S";
  const northSouth = normalized < 180 ? "N" : "S";
  const eastWest = normalized < 90 || normalized > 270 ? "E" : "W";
  const fromAxis =
    normalized < 90 ? 90 - normalized
    : normalized < 180 ? normalized - 90
    : normalized < 270 ? 270 - normalized
    : normalized - 270;
  return `${northSouth} ${toDegMinSec(fromAxis, precision)} ${eastWest}`;
}

export function installStrings(table: BuiltinTable): void {
  defsubr(table, "strcat", 0, null, (args, ctx) => {
    let out = "";
    for (const arg of args) out += wantString(arg).v;
    return str(chargedString(ctx, out));
  });

  defsubr(table, "strlen", 0, null, (args) => {
    let total = 0;
    for (const arg of args) total += wantString(arg).v.length;
    return int(total);
  });

  /**
   * `substr` cuenta desde 1, no desde 0. Es el error de traducción más
   * frecuente al portar rutinas, y se manifiesta como un carácter perdido al
   * principio de cada etiqueta.
   */
  defsubr(table, "substr", 2, 3, (args, ctx) => {
    const source = wantString(args[0]).v;
    const start = wantInt(args[1]);
    if (start < 1) throw badArgumentType("substr", printLisp(args[1]));
    const from = start - 1;
    const text =
      args.length > 2 ? source.slice(from, from + Math.max(0, wantInt(args[2]))) : source.slice(from);
    return str(chargedString(ctx, text));
  });

  defsubr(table, "strcase", 1, 2, (args, ctx) => {
    const source = wantString(args[0]).v;
    // El segundo argumento pide MINÚSCULAS cuando NO es nil; sin él,
    // mayúsculas. Invertido respecto de lo que sugiere el nombre.
    const lower = args.length > 1 && args[1].t !== "nil";
    return str(chargedString(ctx, lower ? source.toLowerCase() : source.toUpperCase()));
  });

  defsubr(table, "itoa", 1, 1, (args) => str(String(wantInt(args[0]))));
  defsubr(table, "atoi", 1, 1, (args) => int(Math.trunc(leadingNumber(wantString(args[0]).v))));
  defsubr(table, "atof", 1, 1, (args) => real(leadingNumber(wantString(args[0]).v)));

  defsubr(table, "chr", 1, 1, (args) => str(String.fromCharCode(wantInt(args[0]))));
  defsubr(table, "ascii", 1, 1, (args) => {
    const text = wantString(args[0]).v;
    return int(text.length === 0 ? 0 : text.charCodeAt(0));
  });

  /**
   * `(rtos valor [modo [precisión]])`. Sin modo, decimal con dos decimales,
   * que es el default de un dibujo recién creado.
   */
  defsubr(table, "rtos", 1, 3, (args, ctx) => {
    const value = wantNumber(args[0]).v;
    const mode = args.length > 1 ? wantInt(args[1]) : 2;
    const precision = args.length > 2 ? wantInt(args[2]) : 2;
    const system = RTOS_MODES[mode];
    if (!system) throw badArgumentType("rtos", printLisp(args[1] ?? NIL));
    const text = formatLength(value, {
      system,
      precision,
      // En modo arquitectónico y fraccionario la «precisión» de AutoLISP es el
      // EXPONENTE del denominador: 4 significa dieciseisavos. Pasar 4 como
      // denominador daría cuartos, y una cota de 6 1/2" saldría como 6 1/2"
      // por casualidad y una de 6 1/16" como 6", que es un error de 1,5 mm en
      // un plano de carpintería.
      denominator: 2 ** Math.max(0, Math.min(8, precision)),
    });
    return str(chargedString(ctx, text));
  });

  /**
   * `(angtos ángulo [modo [precisión]])`. El ángulo entra en RADIANES —lo dice
   * AutoLISP y lo olvida todo el mundo— y sale escrito según el modo:
   * 0 grados decimales, 1 grados/minutos/segundos, 2 gradianes, 3 radianes,
   * 4 rumbo de topógrafo.
   */
  defsubr(table, "angtos", 1, 3, (args, ctx) => {
    const radians = wantNumber(args[0]).v;
    const mode = args.length > 1 ? wantInt(args[1]) : 0;
    const precision = args.length > 2 ? Math.max(0, wantInt(args[2])) : 4;
    const degrees = (radians * 180) / Math.PI;
    let text: string;
    switch (mode) {
      case 0:
        text = degrees.toFixed(precision);
        break;
      case 1:
        text = toDegMinSec(degrees, precision);
        break;
      case 2:
        text = `${((radians * 200) / Math.PI).toFixed(precision)}g`;
        break;
      case 3:
        text = `${radians.toFixed(precision)}r`;
        break;
      case 4:
        text = toSurveyor(degrees, precision);
        break;
      default:
        throw badArgumentType("angtos", printLisp(args[1] ?? NIL));
    }
    return str(chargedString(ctx, text));
  });

  /**
   * `read` convierte texto en una EXPRESIÓN, no la evalúa. Es seguro: el
   * resultado son celdas cons inertes, y quien quiera ejecutarlas tiene que
   * pasarlo por `eval`, que sigue estando dentro del presupuesto y del sandbox.
   * En ningún caso alcanza el `eval` del anfitrión.
   */
  defsubr(table, "read", 1, 1, (args, ctx) => {
    const source = wantString(args[0]).v;
    ctx.charge(source.length);
    const forms = readLispForms(source);
    return forms[0] ?? NIL;
  });

  defsubr(table, "type", 1, 1, (args) => {
    const value = args[0];
    if (value.t === "nil") return NIL;
    return sym(
      value.t === "int" ? "INT"
      : value.t === "real" ? "REAL"
      : value.t === "str" ? "STR"
      : value.t === "sym" ? "SYM"
      : value.t === "cons" ? "LIST"
      : value.t === "ename" ? "ENAME"
      : value.t === "pickset" ? "PICKSET"
      // El puente Visual LISP: `(type (vlax-ename->vla-object e))` tiene que
      // decir VLA-OBJECT, que es lo que comprueba media rutina antes de llamar
      // a `vla-get-*`. Sin esta rama caía en el «STR» de abajo y la rutina
      // seguía creyendo que tenía una cadena.
      : value.t === "vla-object" ? "VLA-OBJECT"
      : value.t === "subr" ? "SUBR"
      : value.t === "closure" ? "USUBR"
      : "STR",
    );
  });

  defsubr(table, "vl-princ-to-string", 1, 1, (args, ctx) =>
    str(chargedString(ctx, printLisp(args[0], false))));
  defsubr(table, "vl-prin1-to-string", 1, 1, (args, ctx) =>
    str(chargedString(ctx, printLisp(args[0], true))));

  defsubr(table, "vl-string-search", 2, 3, (args) => {
    const needle = wantString(args[0]).v;
    const haystack = wantString(args[1]).v;
    const from = args.length > 2 ? wantInt(args[2]) : 0;
    const index = haystack.indexOf(needle, from);
    return index < 0 ? NIL : int(index);
  });

  defsubr(table, "vl-string-trim", 2, 2, (args, ctx) => {
    const chars = wantString(args[0]).v;
    const text = wantString(args[1]).v;
    // Recorta por los dos lados con la MISMA cuenta que las dos de un solo
    // lado: el segundo argumento es un conjunto de caracteres, no una
    // subcadena, y las tres tienen que interpretarlo igual.
    return str(chargedString(ctx, trimSide(chars, trimSide(chars, text, "left"), "right")));
  });

  defsubr(table, "vl-string-subst", 3, 3, (args, ctx) => {
    const replacement = wantString(args[0]).v;
    const target = wantString(args[1]).v;
    const source = wantString(args[2]).v;
    if (target.length === 0) return args[2];
    const index = source.indexOf(target);
    if (index < 0) return args[2];
    const text = source.slice(0, index) + replacement + source.slice(index + target.length);
    return str(chargedString(ctx, text));
  });

  // --- la familia de cadenas que usa una rutina descargada ---------------------
  //
  // Las seis de aquí abajo son las que aparecen en la primera pantalla de casi
  // cualquier `.lsp` de internet: parten un nombre de capa, recortan el relleno
  // de un campo de cajetín y comparan dos prefijos. Faltando una sola, la
  // rutina muere con «no function definition» antes de dibujar nada.

  /**
   * `vl-string->list` devuelve los CÓDIGOS, no los caracteres: es el inverso
   * exacto de `vl-list->string`, que ya estaba. Se recorre por unidades de
   * código UTF-16 —no por puntos de código— para que `strlen`, `substr`,
   * `ascii` y esta función cuenten TODAS lo mismo. Contar distinto aquí haría
   * que `(vl-list->string (vl-string->list s))` no devolviera `s`.
   */
  defsubr(table, "vl-string->list", 1, 1, (args, ctx) => {
    const text = wantString(args[0]).v;
    ctx.charge(text.length);
    const codes: LispValue[] = [];
    for (let index = 0; index < text.length; index += 1) codes.push(int(text.charCodeAt(index)));
    return list(codes);
  });

  defsubr(table, "vl-string-left-trim", 2, 2, (args, ctx) =>
    str(chargedString(ctx, trimSide(wantString(args[0]).v, wantString(args[1]).v, "left"))));

  defsubr(table, "vl-string-right-trim", 2, 2, (args, ctx) =>
    str(chargedString(ctx, trimSide(wantString(args[0]).v, wantString(args[1]).v, "right"))));

  /**
   * `(vl-string-position código cadena [desde [desde-el-final]])`.
   *
   * El primer argumento es un CÓDIGO de carácter, no una cadena de un carácter:
   * `(vl-string-position 44 "a,b")` es 1 y `(vl-string-position "," "a,b")` es
   * un error de tipo. Es la firma del original, y confundirla es el motivo por
   * el que una rutina portada parte mal una lista separada por comas.
   */
  defsubr(table, "vl-string-position", 2, 4, (args) => {
    const code = wantInt(args[0]);
    const text = wantString(args[1]).v;
    const from = args.length > 2 && args[2].t !== "nil" ? Math.max(0, wantInt(args[2])) : 0;
    const fromEnd = args.length > 3 && args[3].t !== "nil";
    const needle = String.fromCharCode(code);
    const index = fromEnd ? text.lastIndexOf(needle) : text.indexOf(needle, from);
    // Buscando desde el final, una coincidencia ANTES del arranque no cuenta:
    // el argumento `desde` sigue acotando la ventana de búsqueda.
    if (index < 0 || index < from) return NIL;
    return int(index);
  });

  /**
   * `(vl-string-elt cadena índice)` cuenta desde CERO —al revés que `substr`,
   * que cuenta desde uno— y devuelve el código del carácter. Fuera de rango es
   * un error, no nil: quien indexa una cadena por fuera tiene un defecto de
   * cuenta, y devolverle nil lo convertiría en un `strcat` con nil diez líneas
   * más abajo.
   */
  defsubr(table, "vl-string-elt", 2, 2, (args) => {
    const text = wantString(args[0]).v;
    const index = wantInt(args[1]);
    if (index < 0 || index >= text.length)
      throw new LispError(
        `bad argument value: vl-string-elt: el índice ${index} se sale de una cadena de ` +
          `${text.length} caracteres (se cuenta desde 0).`,
      );
    return int(text.charCodeAt(index));
  });

  /**
   * `(vl-string-mismatch a b [pos-a [pos-b [ignorar-mayúsculas]]])` devuelve
   * CUÁNTOS caracteres coinciden desde el arranque, no dónde difieren. Es la
   * función con la que una rutina decide si dos nombres de capa comparten
   * prefijo —`(= 6 (vl-string-mismatch "MUROS-CARGA" "MUROS-TABIQUE"))`— y
   * devolver la posición de la diferencia en vez del recuento daría el mismo
   * número en el caso fácil y otro en cuanto los arranques no sean 0.
   */
  defsubr(table, "vl-string-mismatch", 2, 5, (args) => {
    let first = wantString(args[0]).v;
    let second = wantString(args[1]).v;
    const startFirst = args.length > 2 && args[2].t !== "nil" ? Math.max(0, wantInt(args[2])) : 0;
    const startSecond = args.length > 3 && args[3].t !== "nil" ? Math.max(0, wantInt(args[3])) : 0;
    if (args.length > 4 && args[4].t !== "nil") {
      first = first.toUpperCase();
      second = second.toUpperCase();
    }
    let count = 0;
    while (
      startFirst + count < first.length &&
      startSecond + count < second.length &&
      first[startFirst + count] === second[startSecond + count]
    )
      count += 1;
    return int(count);
  });
}

/**
 * El recorte por un lado. `vl-string-trim` —que ya estaba— recorta por los dos,
 * y las tres comparten esta cuenta para que el conjunto de caracteres se
 * interprete igual en las tres: es un CONJUNTO de caracteres sueltos, no una
 * subcadena. `(vl-string-left-trim "ab" "banana")` recorta la b, la a y la n
 * no, y devuelve "nana".
 */
function trimSide(chars: string, text: string, side: "left" | "right"): string {
  const set = new Set(chars);
  let start = 0;
  let end = text.length;
  if (side === "left") while (start < end && set.has(text[start])) start += 1;
  else while (end > start && set.has(text[end - 1])) end -= 1;
  return text.slice(start, end);
}
