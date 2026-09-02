/**
 * Lectura de pares código/valor DXF y coerciones básicas.
 *
 * `dxf-parser` no expone las entidades que este producto necesita leer con
 * fidelidad —HATCH, MTEXT, DIMENSION con XDATA, y ahora los ocho tipos del
 * esquema 4—, así que la importación las lee a mano sobre los pares crudos.
 * Esa lectura es la MISMA para todos, y vive aquí para que no se duplique.
 *
 * Módulo HOJA: sólo importa tipos, así que puede importarlo cualquiera sin
 * cerrar un ciclo de carga.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CadDxfPoint } from "./dxf-import";

export interface RawDxfPair {
  code: number;
  value: string;
}

/**
 * Un DXF de texto es una secuencia de LÍNEAS ALTERNAS: código, valor, código,
 * valor. Se lee así y no con una gramática porque lo que hace falta es
 * localizar entidades y sus grupos, no validar el fichero entero.
 */
export function rawDxfPairs(text: string): RawDxfPair[] {
  const lines = text.split(/\r?\n/);
  const pairs: RawDxfPair[] = [];
  for (let index = 0; index + 1 < lines.length; index += 2) {
    const code = Number(lines[index].trim());
    if (Number.isInteger(code)) pairs.push({ code, value: lines[index + 1].trim() });
  }
  return pairs;
}

export const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null);

export const pt = (v: any): CadDxfPoint | null => {
  const x = num(v?.x);
  const y = num(v?.y);
  if (x == null || y == null) return null;
  // El bulge viaja en el vértice: descartarlo aplanaba a cuerda recta todos
  // los arcos de polilínea del fichero importado, en silencio.
  const bulge = num(v?.bulge);
  // La cota (código 30) viaja igual, y por la misma razón: descartarla
  // aplanaba contra el suelo cada pilar y cada planta elevada, también en
  // silencio (Ola C, 2026-09-02). El cero se omite: el suelo es la ausencia.
  const z = num(v?.z);
  return { x, y, ...(bulge ? { bulge } : {}), ...(z ? { z } : {}) };
};

export function decodeComponent(value: string | undefined): string {
  try { return decodeURIComponent(value ?? ''); } catch { return value ?? ''; }
}
