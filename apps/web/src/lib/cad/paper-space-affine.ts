/**
 * La afín 2D de la lámina: matriz, identidad, composición y aplicación.
 *
 * Vive fuera de `paper-space.ts` por la misma razón que el respaldo del
 * registro: ese archivo tiene presupuesto propio en
 * `scripts/cad/monolith-budget.json` y sólo puede encoger, así que lo que no es
 * específico de publicar una hoja sale a un módulo con nombre. Y esto no lo es:
 * son seis números y dos multiplicaciones, la misma álgebra que usa cualquier
 * transformación del plano.
 *
 * La forma es la de SVG y la de `DOMMatrix`: `[a c e; b d f; 0 0 1]`.
 */
import type { CadPoint2 } from "./cad-document";

export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** Composición: `multiply(A, B)` aplica primero B y después A. */
export function multiply(left: Affine, right: Affine): Affine {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

/** Aplica la matriz a un punto del dibujo. */
export function point(matrix: Affine, value: CadPoint2): CadPoint2 {
  return {
    x: matrix.a * value.x + matrix.c * value.y + matrix.e,
    y: matrix.b * value.x + matrix.d * value.y + matrix.f,
  };
}
