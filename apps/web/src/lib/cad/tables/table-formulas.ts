/**
 * Fórmulas de celda en TABLE: `=SUMA(A1:A5)`, `=PROMEDIO(B2:B9)`, `=CONTAR(C:C)`
 * y aritmética simple entre celdas (`=A1+B2`, `=A1*1.21`).
 *
 * ## Por qué hacía falta, medido
 *
 * `docs/execution/auditoria-fable/dimensiones/12-productividad.md` (§3.5) lo
 * pone en 1/10: «Sin fórmulas, sin DATALINK, sin TABLEEXPORT», y un grep de
 * «formula» sobre el código de tablas no daba nada. Sin esto, el total de un
 * cuadro de superficies o el presupuesto de un cuadro de acabados se teclea a
 * mano, y se queda diciendo lo de ayer en cuanto alguien mueve un muro.
 *
 * ## Qué NO hace, a propósito
 *
 * No hay funciones anidadas dentro de los argumentos de `SUMA`/`PROMEDIO`/
 * `CONTAR` (`SUMA(A1+B1)` no se admite: sólo rangos, celdas sueltas y números,
 * separados por comas). Es la forma en que se usan estas tres funciones en un
 * cuadro de obra —sumar o promediar una columna— y limitar el argumento a eso
 * mantiene el analizador pequeño y sus errores legibles. Una fórmula fuera de
 * función sí admite la aritmética completa: `=A1+B2*2` funciona.
 *
 * ## Vacío, texto y ciclo
 *
 * Una celda en blanco o con texto no numérico vale como «ausente»: no cuenta en
 * `PROMEDIO` ni en `CONTAR`, y aporta nada a `SUMA` — igual que una hoja de
 * cálculo corriente. En una referencia aritmética directa (`=A1+B2`) una celda
 * ausente vale 0, para que un total no se rompa por una fila todavía sin
 * rellenar. Una fórmula que se refiere a sí misma, directa o
 * indirectamente, no se recalcula en bucle: se corta y esa celda enseña
 * `#CICLO!`; las demás fórmulas que la usaran ven esa celda como ausente, no
 * arrastran el error.
 */
import type { CadTableCell, CadTableEntity } from "../cad-entities-v4";

export interface CadTableFormulaOk {
  ok: true;
  value: number;
}
export interface CadTableFormulaError {
  ok: false;
  error: string;
}
export type CadTableFormulaResult = CadTableFormulaOk | CadTableFormulaError;

interface CellRef {
  row: number;
  column: number;
}
interface RangeRef {
  start: CellRef;
  end: CellRef;
}

const CELL_REF = /^([A-Za-z]+)([0-9]+)$/;

/** Columna en letras (A, B, …, Z, AA, AB, …) a índice 0-based. `-1` si no lo es. */
export function cadTableColumnFromLetters(letters: string): number {
  if (!/^[A-Za-z]+$/.test(letters)) return -1;
  let value = 0;
  for (const char of letters.toUpperCase()) value = value * 26 + (char.charCodeAt(0) - 64);
  return value - 1;
}

/** El inverso: índice 0-based a letras de columna. */
export function cadTableLettersFromColumn(column: number): string {
  let n = column + 1;
  let letters = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    letters = String.fromCharCode(65 + rest) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters || "A";
}

/** `A1` con fila y columna en base 0. `null` si no tiene esa forma. */
function parseCellRef(token: string): CellRef | null {
  const match = CELL_REF.exec(token.trim());
  if (!match) return null;
  const column = cadTableColumnFromLetters(match[1]);
  const row = Number.parseInt(match[2], 10) - 1;
  if (column < 0 || row < 0) return null;
  return { row, column };
}

function cellsInRange(range: RangeRef): CellRef[] {
  const r0 = Math.min(range.start.row, range.end.row);
  const r1 = Math.max(range.start.row, range.end.row);
  const c0 = Math.min(range.start.column, range.end.column);
  const c1 = Math.max(range.start.column, range.end.column);
  const cells: CellRef[] = [];
  for (let row = r0; row <= r1; row += 1)
    for (let column = c0; column <= c1; column += 1) cells.push({ row, column });
  return cells;
}

// ---------------------------------------------------------------------------
// Analizador: cadena → tokens → valor, sin construir un AST intermedio.
// ---------------------------------------------------------------------------

type Token =
  | { kind: "num"; value: number }
  | { kind: "ref"; ref: CellRef }
  | { kind: "range"; range: RangeRef }
  | { kind: "ident"; name: string }
  | { kind: "op"; op: "+" | "-" | "*" | "/" }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "comma" };

function tokenize(source: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  const letters = (from: number): number => {
    let j = from;
    while (j < source.length && /[A-Za-z]/.test(source[j])) j += 1;
    return j;
  };
  const digits = (from: number): number => {
    let j = from;
    while (j < source.length && /[0-9]/.test(source[j])) j += 1;
    return j;
  };
  while (i < source.length) {
    const char = source[i];
    if (/\s/.test(char)) {
      i += 1;
      continue;
    }
    if (char === "(") {
      tokens.push({ kind: "lparen" });
      i += 1;
      continue;
    }
    if (char === ")") {
      tokens.push({ kind: "rparen" });
      i += 1;
      continue;
    }
    if (char === ",") {
      tokens.push({ kind: "comma" });
      i += 1;
      continue;
    }
    if (char === "+" || char === "-" || char === "*" || char === "/") {
      tokens.push({ kind: "op", op: char });
      i += 1;
      continue;
    }
    if (/[A-Za-z]/.test(char)) {
      const nameEnd = letters(i);
      const digitEnd = digits(nameEnd);
      // Letras seguidas de dígitos: una referencia de celda, o el principio de
      // un rango si a continuación viene `:`.
      if (digitEnd > nameEnd) {
        if (source[digitEnd] === ":") {
          const secondLettersEnd = letters(digitEnd + 1);
          const secondDigitsEnd = digits(secondLettersEnd);
          if (secondDigitsEnd === secondLettersEnd) return null;
          const start = parseCellRef(source.slice(i, digitEnd));
          const end = parseCellRef(source.slice(digitEnd + 1, secondDigitsEnd));
          if (!start || !end) return null;
          tokens.push({ kind: "range", range: { start, end } });
          i = secondDigitsEnd;
          continue;
        }
        const ref = parseCellRef(source.slice(i, digitEnd));
        if (!ref) return null;
        tokens.push({ kind: "ref", ref });
        i = digitEnd;
        continue;
      }
      // Sin dígitos detrás: el nombre de una función (`SUMA`, `PROMEDIO`…).
      tokens.push({ kind: "ident", name: source.slice(i, nameEnd).toUpperCase() });
      i = nameEnd;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      const end = (() => {
        let j = i;
        let sawDot = false;
        while (j < source.length && (/[0-9]/.test(source[j]) || (source[j] === "." && !sawDot))) {
          if (source[j] === ".") sawDot = true;
          j += 1;
        }
        return j;
      })();
      const value = Number.parseFloat(source.slice(i, end));
      if (!Number.isFinite(value)) return null;
      tokens.push({ kind: "num", value });
      i = end;
      continue;
    }
    return null;
  }
  return tokens;
}

interface EvalCtx {
  /** Valor de UNA celda, o `null` si está en blanco / no es numérica. */
  refValue: (ref: CellRef) => number | null;
  /** Valores de un rango, en el mismo orden que `cellsInRange`. */
  rangeValues: (range: RangeRef) => (number | null)[];
}

const AGGREGATES: Readonly<Record<string, (values: readonly (number | null)[]) => number>> = {
  SUMA: (values) => values.reduce<number>((total, value) => total + (value ?? 0), 0),
  SUM: (values) => AGGREGATES.SUMA(values),
  PROMEDIO: (values) => {
    const numeric = values.filter((value): value is number => value !== null);
    return numeric.length ? numeric.reduce((total, value) => total + value, 0) / numeric.length : 0;
  },
  AVERAGE: (values) => AGGREGATES.PROMEDIO(values),
  PROM: (values) => AGGREGATES.PROMEDIO(values),
  CONTAR: (values) => values.filter((value) => value !== null).length,
  COUNT: (values) => AGGREGATES.CONTAR(values),
};

/**
 * Evalúa una fórmula (con o sin el `=` inicial) contra un contexto de celdas.
 *
 * Exportada aparte de `cadRecalcTableFormulas` para poder probar el
 * analizador solo, sin construir una tabla entera.
 */
export function cadEvaluateTableFormula(formula: string, ctx: EvalCtx): CadTableFormulaResult {
  const body = formula.trim().replace(/^=/, "");
  if (!body) return { ok: false, error: "#VACÍO!" };
  const tokens = tokenize(body);
  if (!tokens || tokens.length === 0) return { ok: false, error: "#FÓRMULA!" };

  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];
  const advance = (): Token => tokens[pos++];
  let failed = false;
  const fail = (): null => {
    failed = true;
    return null;
  };

  function parseExpr(): number | null {
    let value = parseTerm();
    if (failed) return null;
    for (;;) {
      const token = peek();
      if (!token || token.kind !== "op" || (token.op !== "+" && token.op !== "-")) break;
      advance();
      const rhs = parseTerm();
      if (failed || value === null || rhs === null) return fail();
      value = token.op === "+" ? value + rhs : value - rhs;
    }
    return value;
  }
  function parseTerm(): number | null {
    let value = parseUnary();
    if (failed) return null;
    for (;;) {
      const token = peek();
      if (!token || token.kind !== "op" || (token.op !== "*" && token.op !== "/")) break;
      advance();
      const rhs = parseUnary();
      if (failed || value === null || rhs === null) return fail();
      if (token.op === "/" && rhs === 0) return fail();
      value = token.op === "*" ? value * rhs : value / rhs;
    }
    return value;
  }
  function parseUnary(): number | null {
    const token = peek();
    if (token && token.kind === "op" && token.op === "-") {
      advance();
      const value = parseUnary();
      return value === null ? fail() : -value;
    }
    if (token && token.kind === "op" && token.op === "+") {
      advance();
      return parseUnary();
    }
    return parsePrimary();
  }
  function parsePrimary(): number | null {
    const token = peek();
    if (!token) return fail();
    if (token.kind === "num") {
      advance();
      return token.value;
    }
    if (token.kind === "ref") {
      advance();
      return ctx.refValue(token.ref) ?? 0;
    }
    if (token.kind === "lparen") {
      advance();
      const value = parseExpr();
      const close = peek();
      if (!close || close.kind !== "rparen") return fail();
      advance();
      return value;
    }
    if (token.kind === "ident") {
      advance();
      const open = peek();
      if (!open || open.kind !== "lparen") return fail();
      advance();
      const args = parseArgs();
      if (failed) return null;
      const close = peek();
      if (!close || close.kind !== "rparen") return fail();
      advance();
      const aggregate = AGGREGATES[token.name];
      if (!aggregate) return fail();
      return aggregate(args);
    }
    return fail();
  }
  /** Argumentos de una función: rangos, celdas o números — nunca expresiones. */
  function parseArgs(): (number | null)[] {
    const values: (number | null)[] = [];
    if (peek()?.kind === "rparen") return values;
    for (;;) {
      let negate = false;
      if (peek()?.kind === "op" && (peek() as { kind: "op"; op: string }).op === "-") {
        negate = true;
        advance();
      }
      const token = peek();
      if (!token) {
        fail();
        break;
      }
      if (token.kind === "range") {
        advance();
        const rangeValues = ctx.rangeValues(token.range);
        values.push(...(negate ? rangeValues.map((v) => (v === null ? null : -v)) : rangeValues));
      } else if (token.kind === "ref") {
        advance();
        const value = ctx.refValue(token.ref);
        values.push(value === null ? null : negate ? -value : value);
      } else if (token.kind === "num") {
        advance();
        values.push(negate ? -token.value : token.value);
      } else {
        fail();
        break;
      }
      if (peek()?.kind === "comma") {
        advance();
        continue;
      }
      break;
    }
    return values;
  }

  const value = parseExpr();
  if (failed || value === null || pos !== tokens.length) return { ok: false, error: "#FÓRMULA!" };
  if (!Number.isFinite(value)) return { ok: false, error: "#ERROR!" };
  return { ok: true, value };
}

/** El valor tal como se imprime: hasta 6 decimales, sin ceros de cola ni `-0`. */
export function cadFormatTableFormulaValue(value: number): string {
  if (!Number.isFinite(value)) return "#ERROR!";
  const rounded = Math.round(value * 1e6) / 1e6;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** El número de una celda de texto plano, o `null` si no lo es (vacía incluida). */
function literalNumber(cell: CadTableCell | undefined): number | null {
  if (!cell) return null;
  const trimmed = cell.text.trim();
  if (trimmed === "") return null;
  const value = Number.parseFloat(trimmed.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

/**
 * Recalcula TODAS las fórmulas de una tabla y devuelve su lista de celdas con
 * el `text` de cada una puesto al día.
 *
 * Se recorren TODAS a propósito, no sólo la celda que cambió: `=SUMA(A1:A5)`
 * depende de cinco celdas y cualquiera de ellas pudo ser la que se acaba de
 * editar. Es el mismo criterio que `cadUpdateFields` aplica a los campos del
 * dibujo, y por la misma razón: barato de recorrer, imposible de acertar a
 * medias.
 */
export function cadRecalcTableFormulas(table: CadTableEntity): CadTableCell[] {
  const byKey = new Map<string, CadTableCell>();
  for (const cell of table.cells) byKey.set(`${cell.row}:${cell.column}`, cell);

  const cache = new Map<string, CadTableFormulaResult>();
  const visiting = new Set<string>();
  // Todo id que en algún momento formó parte de un ciclo aún abierto. Al
  // detectarlo se marca aquí ENTERO el camino de visita, no sólo la celda que
  // lo cerró: en `A1=B1` y `B1=A1`, quien cierra el bucle es A1 al pedirse a
  // sí misma, pero la que miente si se queda callada es también B1.
  const cycleMembers = new Set<string>();

  function resolveNumeric(row: number, column: number): number | null {
    const key = `${row}:${column}`;
    const cell = byKey.get(key);
    if (!cell) return null;
    if (!cell.formula) return literalNumber(cell);
    const result = evaluate(key, cell.formula);
    return result.ok ? result.value : null;
  }

  function evaluate(key: string, formula: string): CadTableFormulaResult {
    const cached = cache.get(key);
    if (cached) return cached;
    if (visiting.has(key)) {
      for (const member of visiting) cycleMembers.add(member);
      cycleMembers.add(key);
      // Transitorio: NO se cachea aquí. El resultado depende de en qué punto
      // de la recursión se detectó, y quien sí lo cachea —al desenrollar— es
      // la llamada de más abajo, una vez que sabe que su propia clave quedó
      // marcada en `cycleMembers`.
      return { ok: false, error: "#CICLO!" };
    }
    visiting.add(key);
    const raw = cadEvaluateTableFormula(formula, {
      refValue: (ref) => resolveNumeric(ref.row, ref.column),
      rangeValues: (range) => cellsInRange(range).map(({ row, column }) => resolveNumeric(row, column)),
    });
    visiting.delete(key);
    // Una celda marcada por el ciclo dice `#CICLO!` aunque, sustituyendo por 0
    // la referencia que cerró el bucle, `raw` diera un número: ese número no
    // es el valor de la celda, es el valor de fingir que el ciclo no existe.
    const result = cycleMembers.has(key) ? ({ ok: false, error: "#CICLO!" } as const) : raw;
    cache.set(key, result);
    return result;
  }

  return table.cells.map((cell) => {
    if (!cell.formula) return cell;
    const key = `${cell.row}:${cell.column}`;
    const result = evaluate(key, cell.formula);
    const text = result.ok ? cadFormatTableFormulaValue(result.value) : result.error;
    return text === cell.text ? cell : { ...cell, text };
  });
}
