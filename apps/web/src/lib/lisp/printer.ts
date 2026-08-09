/**
 * Cómo se ESCRIBE un valor. Dos formas, como en el original.
 *
 * `princ` escribe la cadena tal cual —es lo que se usa para poner texto en la
 * línea de comandos— y `prin1` la escribe LEGIBLE, con comillas y escapes, de
 * modo que lo impreso se pueda volver a leer. La diferencia parece cosmética
 * hasta que una rutina vuelca una tabla con rutas dentro y se pierde cada `\`.
 *
 * ## El formato de los reales
 *
 * AutoLISP imprime `2.0`, no `2`. Es la señal visible de que entero y real son
 * tipos distintos, y hay rutinas que la usan para comprobar sus propios
 * cálculos. Un `String(2)` de JavaScript la borra, así que hay que forzarla.
 *
 * Para magnitudes extremas el original pasa a notación con exponente
 * (`1.0e+015`). Se reproduce el umbral —16 dígitos— y el signo explícito del
 * exponente, que es lo que hace que dos volcados se puedan comparar.
 */
import {
  listLength,
  toArray,
  type LispValue,
} from "./values";

/** Cuántos elementos de una lista se imprimen antes de resumir. */
const MAX_PRINTED_ITEMS = 5_000;

function formatReal(value: number): string {
  if (!Number.isFinite(value)) return Number.isNaN(value) ? "nan" : value > 0 ? "1.#INF" : "-1.#INF";
  if (value === 0) return Object.is(value, -0) ? "-0.0" : "0.0";
  const magnitude = Math.abs(value);
  if (magnitude >= 1e16 || magnitude < 1e-4) {
    const [mantissa, exponent] = value.toExponential(6).split("e");
    const sign = exponent.startsWith("-") ? "-" : "+";
    const digits = exponent.replace(/^[+-]/, "").padStart(3, "0");
    return `${mantissa}e${sign}${digits}`;
  }
  const text = String(value);
  return text.includes(".") || text.includes("e") ? text : `${text}.0`;
}

function escapeString(value: string): string {
  let out = '"';
  for (const ch of value) {
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\t") out += "\\t";
    else if (ch === "\r") out += "\\r";
    else out += ch;
  }
  return `${out}"`;
}

/**
 * Representación de un valor. `readable` distingue `prin1` de `princ`: sólo
 * cambia el trato de las CADENAS, dentro de una lista incluido — `(princ '("a"))`
 * imprime `(a)` en el original, y quien vuelca tablas cuenta con ello.
 */
export function printLisp(value: LispValue, readable = true): string {
  switch (value.t) {
    case "nil":
      return "nil";
    case "sym":
      return value.name;
    case "int":
      return String(value.v);
    case "real":
      return formatReal(value.v);
    case "str":
      return readable ? escapeString(value.v) : value.v;
    case "ename":
      return `<Entity name: ${value.id}>`;
    case "pickset":
      return `<Selection set: ${value.serial}>`;
    case "subr":
      return `<Subr: ${value.name}>`;
    case "closure":
      return value.name ? `<USubr: ${value.name}>` : "<USubr: lambda>";
    case "catch-error":
      return `<%catch-all-apply-error%>`;
    case "cons":
      return printCons(value, readable);
  }
}

function printCons(value: LispValue, readable: boolean): string {
  const parts: string[] = [];
  let node = value;
  let printed = 0;
  while (node.t === "cons") {
    if (printed >= MAX_PRINTED_ITEMS) {
      parts.push(`... ${listLength(node)} más`);
      return `(${parts.join(" ")})`;
    }
    parts.push(printLisp(node.car, readable));
    printed += 1;
    node = node.cdr;
  }
  // Par punteado: `(0 . "LINE")`. Es la forma nativa de las listas DXF, así que
  // imprimirlo mal haría ilegible cada volcado de `entget`.
  if (node.t !== "nil") parts.push(".", printLisp(node, readable));
  return `(${parts.join(" ")})`;
}

/**
 * Vuelca una lista DXF en varias líneas, una por par. Es el formato con el que
 * se depura una rutina de entidades de verdad: leer `entget` en un solo renglón
 * de 400 caracteres no sirve para encontrar el código que falta.
 */
export function printDxfList(value: LispValue): string {
  return toArray(value)
    .map((item) => `  ${printLisp(item)}`)
    .join("\n");
}
