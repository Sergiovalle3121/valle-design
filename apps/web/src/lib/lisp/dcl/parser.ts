/**
 * DCL: el lenguaje con el que AutoCAD describe un diálogo.
 *
 *     pedir_ancho : dialog {
 *       label = "Cajetín";
 *       : edit_box { key = "ancho"; label = "Ancho:"; edit_width = 8; }
 *       : toggle   { key = "marco"; label = "Con marco"; value = "1"; }
 *       : row {
 *         : button { key = "accept"; label = "Aceptar"; is_default = true; }
 *         : button { key = "cancel"; label = "Cancelar"; is_cancel  = true; }
 *       }
 *     }
 *
 * Es un formato pequeño y con una gramática regular, así que el analizador cabe
 * en un archivo. Lo que NO es pequeño es la lista de atributos que AutoCAD
 * entiende, y ahí está la decisión de diseño de este módulo:
 *
 * **Los atributos se conservan TODOS, incluidos los que este producto no sabe
 * pintar.** Un analizador que se quedara sólo con los que entiende obligaría a
 * tocar el intérprete cada vez que la interfaz aprendiese a pintar uno más, y
 * mientras tanto perdería en silencio lo que el autor del diálogo escribió.
 * Aquí el árbol es fiel al fichero; qué se pinta lo decide el anfitrión.
 *
 * Los valores se normalizan a CADENA, que es como los trata DCL: `value = "1"`
 * y `is_default = true` acaban los dos siendo texto, y `get_tile` devuelve
 * texto siempre. Convertirlos a booleano aquí crearía dos representaciones del
 * mismo atributo según cómo lo hubiera escrito el autor.
 */
import { LispError } from "../errors";
import type { LispDialogTile } from "../values";

export class DclSyntaxError extends LispError {
  constructor(message: string, line: number) {
    super(`${message} (línea ${line} del DCL)`);
    this.name = "DclSyntaxError";
  }
}

export interface DclDialog {
  name: string;
  tile: LispDialogTile;
}

type Token =
  | { kind: "name"; text: string; line: number }
  | { kind: "string"; text: string; line: number }
  | { kind: "punct"; text: ":" | "{" | "}" | ";" | "="; line: number };

const PUNCT = new Set([":", "{", "}", ";", "="]);

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;

  while (index < source.length) {
    const ch = source[index];
    if (ch === "\n") {
      line += 1;
      index += 1;
      continue;
    }
    if (/\s/.test(ch)) {
      index += 1;
      continue;
    }
    // DCL comenta con `//` y con `/* */`, como C.
    if (ch === "/" && source[index + 1] === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (ch === "/" && source[index + 1] === "*") {
      const start = line;
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        if (source[index] === "\n") line += 1;
        index += 1;
      }
      if (index >= source.length) throw new DclSyntaxError("Comentario sin cerrar", start);
      index += 2;
      continue;
    }
    if (PUNCT.has(ch)) {
      tokens.push({ kind: "punct", text: ch as ":" | "{" | "}" | ";" | "=", line });
      index += 1;
      continue;
    }
    if (ch === '"') {
      const start = line;
      index += 1;
      let text = "";
      while (index < source.length && source[index] !== '"') {
        if (source[index] === "\\") {
          index += 1;
          const escaped = source[index] ?? "";
          text += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
          index += 1;
          continue;
        }
        if (source[index] === "\n") line += 1;
        text += source[index];
        index += 1;
      }
      if (index >= source.length) throw new DclSyntaxError("Cadena sin cerrar", start);
      index += 1;
      tokens.push({ kind: "string", text, line: start });
      continue;
    }
    let text = "";
    while (index < source.length && !/\s/.test(source[index]) && !PUNCT.has(source[index]) && source[index] !== '"') {
      text += source[index];
      index += 1;
    }
    if (text.length === 0) throw new DclSyntaxError(`Carácter inesperado "${ch}"`, line);
    tokens.push({ kind: "name", text, line });
  }
  return tokens;
}

interface Cursor {
  tokens: Token[];
  index: number;
}

function peek(cursor: Cursor): Token | undefined {
  return cursor.tokens[cursor.index];
}

function expect(cursor: Cursor, text: string): Token {
  const token = cursor.tokens[cursor.index];
  if (!token || token.text !== text)
    throw new DclSyntaxError(
      `Se esperaba "${text}" y ${token ? `llegó "${token.text}"` : "se acabó el fichero"}`,
      token?.line ?? 0,
    );
  cursor.index += 1;
  return token;
}

/** `{ ... }` con atributos y tiles hijos mezclados, como permite DCL. */
function parseBody(cursor: Cursor, type: string): LispDialogTile {
  expect(cursor, "{");
  const attributes: Record<string, string> = {};
  const children: LispDialogTile[] = [];

  for (;;) {
    const token = peek(cursor);
    if (!token) throw new DclSyntaxError(`Falta la llave de cierre de ${type}`, 0);
    if (token.text === "}") {
      cursor.index += 1;
      break;
    }
    if (token.text === ";") {
      cursor.index += 1;
      continue;
    }
    // `: tipo { ... }` es un tile hijo.
    if (token.text === ":") {
      cursor.index += 1;
      const childType = cursor.tokens[cursor.index];
      if (!childType || childType.kind !== "name")
        throw new DclSyntaxError("Se esperaba el tipo del control", token.line);
      cursor.index += 1;
      children.push(parseBody(cursor, childType.text));
      continue;
    }
    // `nombre = valor;` es un atributo.
    if (token.kind === "name") {
      cursor.index += 1;
      expect(cursor, "=");
      const value = cursor.tokens[cursor.index];
      if (!value || value.kind === "punct")
        throw new DclSyntaxError(`El atributo ${token.text} no tiene valor`, token.line);
      cursor.index += 1;
      // Normalizado a cadena: DCL trata todo como texto y `get_tile` devuelve
      // texto siempre. Ver la nota de cabecera.
      attributes[token.text] = value.text;
      continue;
    }
    throw new DclSyntaxError(`No se esperaba "${token.text}" aquí`, token.line);
  }

  const key = attributes.key;
  return { type, ...(key === undefined ? {} : { key }), attributes, children };
}

/**
 * Lee un fichero `.dcl` entero. Un fichero puede declarar varios diálogos, y
 * `load_dialog` los carga todos: `new_dialog` elige después por nombre.
 */
export function parseDcl(source: string): DclDialog[] {
  const cursor: Cursor = { tokens: tokenize(source), index: 0 };
  const dialogs: DclDialog[] = [];

  while (cursor.index < cursor.tokens.length) {
    const name = cursor.tokens[cursor.index];
    if (name.kind !== "name")
      throw new DclSyntaxError(`Se esperaba el nombre de un diálogo y llegó "${name.text}"`, name.line);
    cursor.index += 1;
    expect(cursor, ":");
    const type = cursor.tokens[cursor.index];
    if (!type || type.kind !== "name" || type.text !== "dialog")
      throw new DclSyntaxError(
        `Sólo se admiten declaraciones de nivel superior de tipo "dialog"`,
        name.line,
      );
    cursor.index += 1;
    dialogs.push({ name: name.text, tile: parseBody(cursor, "dialog") });
  }

  if (dialogs.length === 0) throw new DclSyntaxError("El fichero no declara ningún diálogo", 1);
  return dialogs;
}

/** Tipos de control que el anfitrión sabe pintar. Los demás se rechazan. */
export const SUPPORTED_DCL_TILES = new Set([
  "dialog",
  "button",
  "edit_box",
  "list_box",
  "popup_list",
  "toggle",
  "radio_column",
  "radio_button",
  "column",
  "row",
  "boxed_column",
  "boxed_row",
  "text",
  "spacer",
  "ok_cancel",
]);

/**
 * Comprueba que sólo hay controles que se puedan pintar, y devuelve la lista de
 * los que no. Se separa del análisis a propósito: un fichero con un control
 * exótico se LEE bien —su árbol es correcto— y lo que falla es que este producto
 * no lo sabe dibujar. Son dos problemas distintos y merecen mensajes distintos.
 */
export function unsupportedTiles(tile: LispDialogTile, into: string[] = []): string[] {
  if (!SUPPORTED_DCL_TILES.has(tile.type)) into.push(tile.type);
  for (const child of tile.children) unsupportedTiles(child, into);
  return into;
}

/** Todas las claves declaradas, en orden de aparición. */
export function tileKeys(tile: LispDialogTile, into: string[] = []): string[] {
  if (tile.key) into.push(tile.key);
  for (const child of tile.children) tileKeys(child, into);
  return into;
}

/** Busca un tile por clave. */
export function findTile(tile: LispDialogTile, key: string): LispDialogTile | null {
  if (tile.key === key) return tile;
  for (const child of tile.children) {
    const found = findTile(child, key);
    if (found) return found;
  }
  return null;
}
