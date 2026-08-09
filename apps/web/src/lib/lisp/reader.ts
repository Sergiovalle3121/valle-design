/**
 * De texto `.lsp` a celdas cons.
 *
 * Tokenizador y lector en un módulo, porque el léxico de LISP es tan pequeño
 * que separarlos sólo añadiría una capa de listas intermedias.
 *
 * ## Los detalles que un lector ingenuo se salta
 *
 * **`.` es dos cosas.** En `(a . b)` es el punto del par; en `.5` es el
 * comienzo de un real. Se decide mirando el carácter siguiente.
 *
 * **`1` y `1.0` son tipos distintos.** El lector decide entero o real por la
 * FORMA escrita, no por el valor: `2.0` es real aunque valga dos, y `(/ 7 2)`
 * frente a `(/ 7 2.0)` es exactamente la diferencia que separa una rutina de
 * cajetín que cuadra de otra que no.
 *
 * **Los comentarios son dos.** `;` hasta fin de línea y `;| ... |;` en bloque,
 * anidable, que es como los escriben las cabeceras de las rutinas comerciales.
 *
 * **Las cadenas llevan escapes de AutoCAD**: `\\`, `\"`, `\n`, `\t`, `\r`,
 * `\e`, y los octales `\nnn` que aparecen en cada `%%d` mal copiado.
 *
 * ## Sobre los errores
 *
 * Un fichero mal formado se rechaza DICIENDO dónde: línea y columna. Un lector
 * que devuelve una lista a medias ante un paréntesis sin cerrar convierte un
 * error de sintaxis en geometría equivocada, y eso es peor que no cargar.
 */
import { LispError } from "./errors";
import {
  NIL,
  int,
  list,
  real,
  str,
  sym,
  type LispValue,
} from "./values";

export interface LispSourcePosition {
  line: number;
  column: number;
}

export class LispSyntaxError extends LispError {
  constructor(
    message: string,
    readonly position: LispSourcePosition,
  ) {
    super(`${message} (línea ${position.line}, columna ${position.column})`);
    this.name = "LispSyntaxError";
  }
}

type TokenKind =
  | "open"
  | "close"
  | "quote"
  | "backquote"
  | "unquote"
  | "unquote-splice"
  | "dot"
  | "atom"
  | "string";

interface Token {
  kind: TokenKind;
  /** Texto crudo para `atom`; contenido ya desescapado para `string`. */
  text: string;
  position: LispSourcePosition;
}

const DELIMITERS = new Set(["(", ")", "'", "`", ",", '"', ";"]);

function isSpace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f";
}

/**
 * Convierte el texto en fichas. Se expone porque las specs del léxico son
 * mucho más precisas cuando pueden mirar las fichas en vez de deducirlas del
 * árbol resultante.
 */
export function tokenizeLisp(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;
  let column = 1;

  const here = (): LispSourcePosition => ({ line, column });
  const advance = (count = 1): void => {
    for (let step = 0; step < count; step += 1) {
      if (source[index] === "\n") {
        line += 1;
        column = 1;
      } else {
        column += 1;
      }
      index += 1;
    }
  };

  while (index < source.length) {
    const ch = source[index];

    if (isSpace(ch)) {
      advance();
      continue;
    }

    // Comentario de bloque `;| ... |;`, anidable.
    if (ch === ";" && source[index + 1] === "|") {
      const start = here();
      let depth = 0;
      while (index < source.length) {
        if (source[index] === ";" && source[index + 1] === "|") {
          depth += 1;
          advance(2);
          continue;
        }
        if (source[index] === "|" && source[index + 1] === ";") {
          depth -= 1;
          advance(2);
          if (depth === 0) break;
          continue;
        }
        advance();
      }
      if (depth !== 0) throw new LispSyntaxError("Comentario de bloque sin cerrar", start);
      continue;
    }

    if (ch === ";") {
      while (index < source.length && source[index] !== "\n") advance();
      continue;
    }

    if (ch === "(") {
      tokens.push({ kind: "open", text: "(", position: here() });
      advance();
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "close", text: ")", position: here() });
      advance();
      continue;
    }
    if (ch === "'") {
      tokens.push({ kind: "quote", text: "'", position: here() });
      advance();
      continue;
    }
    if (ch === "`") {
      tokens.push({ kind: "backquote", text: "`", position: here() });
      advance();
      continue;
    }
    if (ch === ",") {
      const position = here();
      if (source[index + 1] === "@") {
        tokens.push({ kind: "unquote-splice", text: ",@", position });
        advance(2);
      } else {
        tokens.push({ kind: "unquote", text: ",", position });
        advance();
      }
      continue;
    }

    if (ch === '"') {
      const position = here();
      advance();
      let text = "";
      let closed = false;
      while (index < source.length) {
        const current = source[index];
        if (current === '"') {
          advance();
          closed = true;
          break;
        }
        if (current === "\\") {
          advance();
          const escape = source[index];
          if (escape === undefined) break;
          if (escape >= "0" && escape <= "7") {
            // Octal de hasta tres dígitos: `\101` es "A".
            let digits = "";
            while (digits.length < 3 && source[index] >= "0" && source[index] <= "7") {
              digits += source[index];
              advance();
            }
            text += String.fromCharCode(Number.parseInt(digits, 8));
            continue;
          }
          const mapped =
            escape === "n" ? "\n"
            : escape === "t" ? "\t"
            : escape === "r" ? "\r"
            : escape === "e" ? ""
            : escape;
          text += mapped;
          advance();
          continue;
        }
        text += current;
        advance();
      }
      if (!closed) throw new LispSyntaxError("Cadena sin cerrar", position);
      tokens.push({ kind: "string", text, position });
      continue;
    }

    // El punto del par sólo lo es cuando queda AISLADO: `.5` es un real y
    // `a.b` es un símbolo perfectamente legal.
    if (ch === "." && (index + 1 >= source.length || isSpace(source[index + 1]) || DELIMITERS.has(source[index + 1]))) {
      tokens.push({ kind: "dot", text: ".", position: here() });
      advance();
      continue;
    }

    const position = here();
    let text = "";
    while (index < source.length && !isSpace(source[index]) && !DELIMITERS.has(source[index])) {
      text += source[index];
      advance();
    }
    tokens.push({ kind: "atom", text, position });
  }

  return tokens;
}

const INTEGER = /^[+-]?\d+$/;
const REAL = /^[+-]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Átomo → valor. La regla es sintáctica y está aquí sola para que se pueda leer
 * entera: si tiene punto o exponente es real; si son sólo dígitos es entero; si
 * no, es símbolo.
 */
export function atomToValue(text: string): LispValue {
  if (INTEGER.test(text)) {
    const parsed = Number.parseInt(text, 10);
    // Fuera del rango seguro un entero deja de ser exacto, y un id de entidad o
    // un contador de bucle que pierde precisión miente en silencio.
    if (Number.isSafeInteger(parsed)) return int(parsed);
    return real(Number.parseFloat(text));
  }
  if (REAL.test(text)) return real(Number.parseFloat(text));
  const upper = text.toUpperCase();
  if (upper === "NIL") return NIL;
  return sym(upper);
}

interface ParserState {
  tokens: Token[];
  index: number;
}

function peek(state: ParserState): Token | undefined {
  return state.tokens[state.index];
}

function readForm(state: ParserState): LispValue {
  const token = state.tokens[state.index];
  if (!token) throw new LispSyntaxError("Se esperaba una expresión", { line: 0, column: 0 });
  state.index += 1;

  switch (token.kind) {
    case "atom":
      return atomToValue(token.text);
    case "string":
      return str(token.text);
    case "quote":
      return list([sym("QUOTE"), readForm(state)]);
    case "backquote":
      return list([sym("BACKQUOTE"), readForm(state)]);
    case "unquote":
      return list([sym("UNQUOTE"), readForm(state)]);
    case "unquote-splice":
      return list([sym("UNQUOTE-SPLICE"), readForm(state)]);
    case "open":
      return readList(state, token.position);
    case "close":
      throw new LispSyntaxError("Paréntesis de cierre sobrante", token.position);
    case "dot":
      throw new LispSyntaxError("Punto fuera de una lista", token.position);
  }
}

function readList(state: ParserState, open: LispSourcePosition): LispValue {
  const items: LispValue[] = [];
  let tail: LispValue = NIL;

  for (;;) {
    const token = peek(state);
    if (!token) throw new LispSyntaxError("Paréntesis sin cerrar", open);

    if (token.kind === "close") {
      state.index += 1;
      return list(items, tail);
    }

    if (token.kind === "dot") {
      if (items.length === 0)
        throw new LispSyntaxError("Un par punteado necesita un car", token.position);
      state.index += 1;
      tail = readForm(state);
      const closing = peek(state);
      if (!closing || closing.kind !== "close")
        throw new LispSyntaxError("Un par punteado sólo admite un cdr", token.position);
      state.index += 1;
      return list(items, tail);
    }

    items.push(readForm(state));
  }
}

/** Lee TODAS las formas de nivel superior de un fichero `.lsp`. */
export function readLispForms(source: string): LispValue[] {
  const state: ParserState = { tokens: tokenizeLisp(source), index: 0 };
  const forms: LispValue[] = [];
  while (state.index < state.tokens.length) forms.push(readForm(state));
  return forms;
}

/**
 * Lee exactamente una forma y exige que no sobre nada. Es lo que usa la línea
 * de comandos: teclear `(setq a 1) (setq b 2)` en un renglón que promete
 * evaluar UNA expresión debe avisar, no ejecutar la primera y perder la otra.
 */
export function readLispForm(source: string): LispValue {
  const forms = readLispForms(source);
  if (forms.length === 0) throw new LispSyntaxError("Entrada vacía", { line: 1, column: 1 });
  if (forms.length > 1)
    throw new LispSyntaxError("Se esperaba una sola expresión", { line: 1, column: 1 });
  return forms[0];
}
