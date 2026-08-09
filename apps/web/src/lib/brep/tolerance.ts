/**
 * Tolerancias del kernel B-rep, en un solo sitio.
 *
 * Un kernel sólido falla por tolerancias antes que por álgebra. El error típico
 * no es "la fórmula está mal" sino "este trozo comparaba con 1e-9 y aquel otro
 * con 1e-6, y en la frontera un punto estaba dentro y fuera a la vez". Tener un
 * único objeto de tolerancias que se pasa a todas las operaciones convierte esa
 * clase de bug en algo que se puede AJUSTAR desde fuera y, sobre todo, en algo
 * que se puede leer.
 *
 * Tres escalas distintas, porque miden cosas distintas:
 *
 *   - `linear`: distancias en unidades del modelo. Dos puntos más cerca que
 *     esto son EL MISMO punto.
 *   - `angular`: radianes. Dos direcciones que difieren menos que esto son
 *     paralelas; dos caras, tangentes.
 *   - `parametric`: pasos en el espacio de parámetros de una superficie o
 *     curva. No es convertible a `linear` sin conocer la derivada, así que se
 *     lleva aparte en vez de fingir que 1e-9 significa lo mismo en ambos.
 */

export interface BrepTolerance {
  /** Distancia por debajo de la cual dos puntos se consideran coincidentes. */
  linear: number;
  /** Ángulo (rad) por debajo del cual dos direcciones se consideran paralelas. */
  angular: number;
  /** Paso mínimo significativo en espacio de parámetros. */
  parametric: number;
}

/**
 * Tolerancias por defecto. `1e-7` en lineal es deliberadamente MÁS FLOJO que el
 * `1e-9` que usa la afín 2D: allí se comparan resultados de una única operación
 * afín, aquí se comparan puntos que han pasado por intersecciones,
 * proyecciones iterativas y sumas de miles de términos. Apretar el lineal a
 * 1e-9 no da más precisión, sólo hace que dos representaciones del mismo punto
 * dejen de reconocerse.
 */
export const BREP_TOLERANCE: BrepTolerance = Object.freeze({
  linear: 1e-7,
  angular: 1e-9,
  parametric: 1e-9,
});

/** Rellena los huecos de una tolerancia parcial con los valores por defecto. */
export function resolveTolerance(tol?: Partial<BrepTolerance>): BrepTolerance {
  if (!tol) return BREP_TOLERANCE;
  return {
    linear: tol.linear ?? BREP_TOLERANCE.linear,
    angular: tol.angular ?? BREP_TOLERANCE.angular,
    parametric: tol.parametric ?? BREP_TOLERANCE.parametric,
  };
}

/**
 * Tolerancia lineal escalada al tamaño del modelo.
 *
 * Un sólido de 10 m y otro de 10 µm no pueden compartir un umbral absoluto. Se
 * toma el mayor entre el absoluto y `size · relativeFactor`, de modo que en
 * modelos pequeños manda el absoluto (no se puede pedir más precisión que la
 * del doble) y en modelos grandes manda el relativo.
 */
export function scaledLinearTolerance(size: number, tol: BrepTolerance, relativeFactor = 1e-9): number {
  const scaled = Math.abs(size) * relativeFactor;
  return Math.max(tol.linear, scaled);
}

/** Signo con banda muerta: -1, 0 o +1. El 0 es "está EN la frontera", no "es pequeño". */
export function tolerantSign(value: number, tol: number): -1 | 0 | 1 {
  if (value > tol) return 1;
  if (value < -tol) return -1;
  return 0;
}

/** ¿Son iguales dentro de tolerancia? */
export function tolerantEquals(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}
