/**
 * El vocabulario DXF: cómo se lee y se escribe una lista de códigos de grupo.
 *
 * `entget` no devuelve una entidad: devuelve una LISTA DE PARES cuyo `car` es
 * un número de grupo. Ese número es el contrato con el que hablan todas las
 * rutinas del mundo:
 *
 *     ((-1 . <ename>) (0 . "LINE") (8 . "MUROS") (10 3.0 4.0 0.0) (11 ...))
 *
 * Y hay dos formas distintas en la misma lista, que confundir cuesta caro:
 *
 *  - Un ESCALAR es un par punteado: `(8 . "MUROS")`, `(40 . 2.5)`.
 *  - Un PUNTO es una lista propia de cuatro elementos: `(10 3.0 4.0 0.0)`.
 *    Su `cdr` es la lista `(3.0 4.0 0.0)`, no un número.
 *
 * Por eso `(cdr (assoc 10 ed))` da un punto y `(cdr (assoc 8 ed))` da una
 * cadena. Un traductor que escribiera el punto como par punteado rompería
 * `(cadr (assoc 10 ed))` en todas las rutinas a la vez.
 *
 * ## Enteros y reales, otra vez
 *
 * El código de grupo decide el tipo: 10-59 son reales, 60-79 enteros, 90-99
 * enteros largos, 1-9 cadenas. Emitir el radio como entero porque vale 2 haría
 * que `(rtos (cdr (assoc 40 ed)) 2 2)` funcionara igual pero `(= 2 (cdr ...))`
 * cambiara de valor entre dos círculos idénticos. Los constructores de este
 * módulo fijan el tipo por código, no por el valor que traiga.
 */
import {
  NIL,
  cons,
  ename,
  int,
  list,
  real,
  str,
  toArray,
  type LispValue,
} from "../values";

/** Par escalar: `(código . valor)`. */
export function dxfPair(code: number, value: LispValue): LispValue {
  return cons(int(code), value);
}

export function dxfString(code: number, value: string): LispValue {
  return dxfPair(code, str(value));
}

/** Escalar REAL. Se usa para 10-59 aunque el valor sea entero. */
export function dxfReal(code: number, value: number): LispValue {
  return dxfPair(code, real(value));
}

export function dxfInt(code: number, value: number): LispValue {
  return dxfPair(code, int(value));
}

/** Punto: lista propia `(código x y z)`, NO un par punteado. */
export function dxfPoint(code: number, point: { x: number; y: number; z?: number }): LispValue {
  return list([int(code), real(point.x), real(point.y), real(point.z ?? 0)]);
}

/** El `(-1 . <ename>)` que encabeza todo `entget`. */
export function dxfEname(id: string): LispValue {
  return dxfPair(-1, ename(id));
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export interface DxfEntry {
  code: number;
  value: LispValue;
}

/**
 * Aplana una lista DXF a entradas ordenadas. El ORDEN importa: en una
 * LWPOLYLINE los pares `(42 . bulge)` se asocian al vértice `(10 …)` que los
 * precede, y `assoc` sólo devuelve el primero. Una rutina que edite el bulge
 * del tercer vértice depende de que el orden se conserve.
 */
export function dxfEntries(value: LispValue): DxfEntry[] {
  const entries: DxfEntry[] = [];
  for (const item of toArray(value)) {
    if (item.t !== "cons") continue;
    const code = item.car;
    if (code.t !== "int" && code.t !== "real") continue;
    entries.push({ code: Math.trunc(code.v), value: item.cdr });
  }
  return entries;
}

/** Primer valor con ese código, o `null`. */
export function dxfFirst(entries: readonly DxfEntry[], code: number): LispValue | null {
  const found = entries.find((entry) => entry.code === code);
  return found ? found.value : null;
}

export function dxfNumber(entries: readonly DxfEntry[], code: number): number | null {
  const value = dxfFirst(entries, code);
  if (!value) return null;
  return value.t === "int" || value.t === "real" ? value.v : null;
}

export function dxfText(entries: readonly DxfEntry[], code: number): string | null {
  const value = dxfFirst(entries, code);
  return value && value.t === "str" ? value.v : null;
}

/**
 * Punto de un código. El `cdr` de una entrada de punto es la lista de
 * coordenadas, así que se lee de ahí y no del valor entero.
 */
export function dxfPointAt(
  entries: readonly DxfEntry[],
  code: number,
  occurrence = 0,
): { x: number; y: number; z: number } | null {
  let seen = 0;
  for (const entry of entries) {
    if (entry.code !== code) continue;
    if (seen < occurrence) {
      seen += 1;
      continue;
    }
    const parts = toArray(entry.value);
    if (parts.length < 2) return null;
    const numbers = parts.map((part) => (part.t === "int" || part.t === "real" ? part.v : Number.NaN));
    if (numbers.some((value) => Number.isNaN(value))) return null;
    return { x: numbers[0], y: numbers[1], z: numbers[2] ?? 0 };
  }
  return null;
}

/** Todos los valores numéricos de un código, en orden. */
export function dxfNumbers(entries: readonly DxfEntry[], code: number): number[] {
  return entries
    .filter((entry) => entry.code === code)
    .map((entry) => (entry.value.t === "int" || entry.value.t === "real" ? entry.value.v : Number.NaN))
    .filter((value) => !Number.isNaN(value));
}

/** El nombre de entidad de un `(-1 . <ename>)`, si lo hay. */
export function dxfEntityName(entries: readonly DxfEntry[]): string | null {
  const value = dxfFirst(entries, -1);
  return value && value.t === "ename" ? value.id : null;
}

/** Ensambla la lista final descartando las entradas ausentes. */
export function dxfList(items: readonly (LispValue | null)[]): LispValue {
  return list(items.filter((item): item is LispValue => item !== null));
}

export const DXF_NIL = NIL;
