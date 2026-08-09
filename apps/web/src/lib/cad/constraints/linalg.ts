/**
 * Álgebra densa mínima para el solucionador de restricciones.
 *
 * No hay dependencias externas y no las va a haber: los bloques que resuelve el
 * solucionador son pequeños (una decena de variables es lo normal, unos cientos
 * el caso malo) porque el sistema se descompone antes en componentes
 * independientes. Meter una biblioteca de matrices para eso sería pagar peso de
 * bundle por nada.
 *
 * Todo es determinista: sin `Math.random`, sin recorrer objetos por orden de
 * inserción, sin atajos que dependan del orden en que llegaron los datos. Dos
 * llamadas con las mismas entradas devuelven exactamente los mismos números —
 * requisito del producto, no una cortesía: un solucionador que da un resultado
 * distinto en cada corrida no se puede probar ni usar.
 */

/** Matriz densa fila-mayor. `rows * cols === data.length`. */
export interface DenseMatrix {
  rows: number;
  cols: number;
  data: Float64Array;
}

export function createMatrix(rows: number, cols: number): DenseMatrix {
  return { rows, cols, data: new Float64Array(rows * cols) };
}

export function matrixGet(m: DenseMatrix, row: number, col: number): number {
  return m.data[row * m.cols + col];
}

export function matrixSet(m: DenseMatrix, row: number, col: number, value: number): void {
  m.data[row * m.cols + col] = value;
}

export function matrixAdd(m: DenseMatrix, row: number, col: number, value: number): void {
  m.data[row * m.cols + col] += value;
}

/**
 * Resuelve `A x = b` con eliminación gaussiana y pivoteo parcial. `A` se
 * destruye. Devuelve `null` si la matriz es singular hasta la tolerancia — el
 * llamante decide qué hacer, que en un solucionador amortiguado es subir λ y
 * reintentar, no rendirse.
 */
export function solveLinearSystem(
  a: DenseMatrix,
  b: Float64Array,
  tolerance = 1e-12,
): Float64Array | null {
  const n = a.rows;
  if (a.cols !== n || b.length !== n) throw new Error("solveLinearSystem needs a square system.");
  const x = Float64Array.from(b);
  const scale = matrixInfinityNorm(a);
  const limit = Math.max(tolerance, tolerance * scale);

  for (let col = 0; col < n; col += 1) {
    let pivotRow = col;
    let pivotValue = Math.abs(matrixGet(a, col, col));
    for (let row = col + 1; row < n; row += 1) {
      const candidate = Math.abs(matrixGet(a, row, col));
      if (candidate > pivotValue) {
        pivotValue = candidate;
        pivotRow = row;
      }
    }
    if (!(pivotValue > limit)) return null;
    if (pivotRow !== col) {
      swapRows(a, col, pivotRow);
      const tmp = x[col];
      x[col] = x[pivotRow];
      x[pivotRow] = tmp;
    }
    const pivot = matrixGet(a, col, col);
    for (let row = col + 1; row < n; row += 1) {
      const factor = matrixGet(a, row, col) / pivot;
      if (factor === 0) continue;
      matrixSet(a, row, col, 0);
      for (let k = col + 1; k < n; k += 1)
        matrixAdd(a, row, k, -factor * matrixGet(a, col, k));
      x[row] -= factor * x[col];
    }
  }

  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = x[row];
    for (let col = row + 1; col < n; col += 1) sum -= matrixGet(a, row, col) * x[col];
    x[row] = sum / matrixGet(a, row, row);
  }
  return x;
}

function swapRows(m: DenseMatrix, a: number, b: number): void {
  for (let col = 0; col < m.cols; col += 1) {
    const index = a * m.cols + col;
    const other = b * m.cols + col;
    const tmp = m.data[index];
    m.data[index] = m.data[other];
    m.data[other] = tmp;
  }
}

export function matrixInfinityNorm(m: DenseMatrix): number {
  let max = 0;
  for (let index = 0; index < m.data.length; index += 1) {
    const value = Math.abs(m.data[index]);
    if (value > max) max = value;
  }
  return max;
}

/**
 * Rango numérico por eliminación de Gauss-Jordan con pivoteo COMPLETO sobre las
 * filas ya escalonadas.
 *
 * Es el número que convierte «no converge» en un diagnóstico: el rango dice
 * cuántas de las m ecuaciones son de verdad independientes, y de ahí salen los
 * grados de libertad (`n - rango`) y qué restricciones sobran. Sin él, un
 * sistema sobre-restringido de forma no evidente pasa desapercibido.
 *
 * La tolerancia es RELATIVA al mayor pivote visto: una matriz en milímetros y
 * la misma matriz en metros tienen que dar el mismo rango.
 */
export function matrixRank(source: DenseMatrix, relativeTolerance = 1e-9): number {
  const m = { rows: source.rows, cols: source.cols, data: Float64Array.from(source.data) };
  const scale = matrixInfinityNorm(m);
  if (!(scale > 0)) return 0;
  const limit = scale * relativeTolerance;
  let rank = 0;
  const usedColumns = new Set<number>();

  for (let step = 0; step < Math.min(m.rows, m.cols); step += 1) {
    let bestRow = -1;
    let bestCol = -1;
    let best = limit;
    for (let row = rank; row < m.rows; row += 1) {
      for (let col = 0; col < m.cols; col += 1) {
        if (usedColumns.has(col)) continue;
        const value = Math.abs(matrixGet(m, row, col));
        if (value > best) {
          best = value;
          bestRow = row;
          bestCol = col;
        }
      }
    }
    if (bestRow < 0) break;
    if (bestRow !== rank) swapRows(m, rank, bestRow);
    usedColumns.add(bestCol);
    const pivot = matrixGet(m, rank, bestCol);
    for (let row = rank + 1; row < m.rows; row += 1) {
      const factor = matrixGet(m, row, bestCol) / pivot;
      if (factor === 0) continue;
      for (let col = 0; col < m.cols; col += 1)
        matrixAdd(m, row, col, -factor * matrixGet(m, rank, col));
    }
    rank += 1;
  }
  return rank;
}

/** Norma infinita de un vector. */
export function vectorInfinityNorm(v: Float64Array | readonly number[]): number {
  let max = 0;
  for (let index = 0; index < v.length; index += 1) {
    const value = Math.abs(v[index]);
    if (value > max) max = value;
  }
  return max;
}

/**
 * Coeficientes que expresan `row` como combinación de `basis` en mínimos
 * cuadrados, o `null` si el residuo de esa aproximación no es despreciable
 * (es decir: `row` NO está en el espacio generado por `basis`).
 *
 * Es lo que permite nombrar culpables. Cuando una restricción resulta
 * dependiente, sus coeficientes no nulos señalan exactamente CON QUIÉN es
 * dependiente, en vez de soltar la lista entera del sistema y dejar que el
 * usuario adivine cuál quitar.
 */
export function dependencyCoefficients(
  basis: readonly Float64Array[],
  row: Float64Array,
  relativeTolerance = 1e-7,
): Float64Array | null {
  const k = basis.length;
  if (k === 0) return null;
  const normal = createMatrix(k, k);
  const rhs = new Float64Array(k);
  for (let i = 0; i < k; i += 1) {
    for (let j = 0; j < k; j += 1) matrixSet(normal, i, j, dot(basis[i], basis[j]));
    // Regularización de Tíjonov mínima: la base puede ser dependiente entre sí
    // (varias restricciones redundantes acumuladas) y sin esto el sistema
    // normal sería singular justo en el caso que se quiere diagnosticar.
    matrixAdd(normal, i, i, 1e-12 * (dot(basis[i], basis[i]) || 1));
    rhs[i] = dot(basis[i], row);
  }
  const coefficients = solveLinearSystem(normal, rhs);
  if (!coefficients) return null;
  let residual = 0;
  for (let index = 0; index < row.length; index += 1) {
    let approximation = 0;
    for (let i = 0; i < k; i += 1) approximation += coefficients[i] * basis[i][index];
    residual = Math.max(residual, Math.abs(row[index] - approximation));
  }
  const scale = vectorInfinityNorm(row);
  return residual <= Math.max(relativeTolerance, relativeTolerance * scale) ? coefficients : null;
}

function dot(a: Float64Array, b: Float64Array): number {
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += a[index] * b[index];
  return sum;
}
