/**
 * `wcmatch`: los comodines de AutoCAD, que NO son los de un glob de shell.
 *
 * Aparecen en dos sitios y en los dos importan:
 *
 *  - En los filtros de `ssget`: `(ssget "X" '((8 . "MURO*")))` selecciona todo
 *    lo que esté en cualquier capa cuyo nombre empiece por MURO. Es como se
 *    escriben las rutinas de comprobación de norma, porque los nombres de capa
 *    de un estudio siguen una convención con prefijos.
 *  - Como función propia, `(wcmatch cadena patrón)`, que las rutinas usan para
 *    validar códigos de pieza y referencias de cajetín.
 *
 * El vocabulario completo, y por qué cada símbolo:
 *
 *     *   cualquier secuencia, incluida la vacía
 *     ?   un carácter cualquiera
 *     #   un DÍGITO — no existe en glob, y es justo el que hace falta para
 *         «EJE-##» en una numeración de ejes
 *     @   una letra
 *     .   cualquier carácter que no sea alfanumérico
 *     ~   al principio, NIEGA el patrón entero
 *     [..] conjunto; [~..] conjunto negado; a-z rangos
 *     `x  escapa el carácter siguiente
 *     ,   separa patrones alternativos: "LINE,ARC,CIRCLE"
 *
 * La comparación NO distingue mayúsculas, como en AutoCAD, porque los nombres
 * de capa de un DWG real llegan en cualquier caja.
 */

/** Traduce UN patrón (sin comas) a expresión regular anclada. */
function compileSingle(pattern: string): RegExp {
  let source = "^";
  let index = 0;
  while (index < pattern.length) {
    const ch = pattern[index];
    if (ch === "`") {
      // La comilla invertida escapa: `` `* `` es un asterisco literal.
      index += 1;
      const escaped = pattern[index] ?? "";
      source += escaped.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      index += 1;
      continue;
    }
    if (ch === "[") {
      const close = pattern.indexOf("]", index + 1);
      if (close < 0) {
        source += "\\[";
        index += 1;
        continue;
      }
      let body = pattern.slice(index + 1, close);
      const negated = body.startsWith("~");
      if (negated) body = body.slice(1);
      source += `[${negated ? "^" : ""}${body.replace(/\\/g, "\\\\")}]`;
      index = close + 1;
      continue;
    }
    switch (ch) {
      case "*":
        source += ".*";
        break;
      case "?":
        source += ".";
        break;
      case "#":
        source += "\\d";
        break;
      case "@":
        source += "[A-Za-z]";
        break;
      case ".":
        source += "[^A-Za-z0-9]";
        break;
      default:
        source += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    index += 1;
  }
  return new RegExp(`${source}$`, "i");
}

/**
 * Parte por comas respetando el escape. `"A`,B,C"` son dos alternativas —
 * `A,B` y `C`—, no tres.
 */
function splitAlternatives(pattern: string): string[] {
  const parts: string[] = [];
  let current = "";
  let index = 0;
  while (index < pattern.length) {
    const ch = pattern[index];
    if (ch === "`") {
      current += ch + (pattern[index + 1] ?? "");
      index += 2;
      continue;
    }
    if (ch === ",") {
      parts.push(current);
      current = "";
      index += 1;
      continue;
    }
    current += ch;
    index += 1;
  }
  parts.push(current);
  return parts;
}

/**
 * Longitud máxima de patrón aceptada. Un patrón absurdo puede compilarse en
 * una expresión regular con retroceso catastrófico —`(a*)*b` sobre una cadena
 * larga— y ese coste NO lo ve el contador de pasos del intérprete, porque
 * ocurre dentro de una sola llamada. Se corta por tamaño, que es el límite que
 * sí se puede comprobar antes de ejecutar nada.
 */
const MAX_PATTERN_LENGTH = 512;

export function wcmatch(text: string, pattern: string): boolean {
  if (pattern.length > MAX_PATTERN_LENGTH) return false;
  const negated = pattern.startsWith("~");
  const effective = negated ? pattern.slice(1) : pattern;
  const matched = splitAlternatives(effective).some((alternative) =>
    compileSingle(alternative).test(text));
  return negated ? !matched : matched;
}
