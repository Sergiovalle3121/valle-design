/**
 * Análisis de grados de libertad y de restricciones sobrantes.
 *
 * Es lo que convierte el solucionador en algo usable. Sin esto el usuario ve
 * «no converge» y no sabe qué quitar; con esto ve «te sobra la cota
 * `dist:lado-a`, que ya está implicada por `dist:lado-b` y `eq:lados`» o «te
 * quedan 2 grados libres».
 *
 * Se apoya en una sola idea: el RANGO del jacobiano es el número de ecuaciones
 * de verdad independientes. De ahí salen los tres diagnósticos:
 *
 *  - `n - rango` son los grados de libertad que quedan.
 *  - Una fila que NO aumenta el rango es dependiente de las anteriores. Si su
 *    residuo es cero, es redundante (sobra, pero no estorba); si no lo es, es
 *    CONTRADICTORIA con aquéllas de las que depende, y esas son las que hay que
 *    enseñar.
 *  - Los modos de sólido rígido —dos traslaciones y un giro por bloque suelto—
 *    se cuentan aparte, porque un triángulo con sus tres lados acotados tiene
 *    cero grados de libertad de FORMA aunque pueda seguir moviéndose por el
 *    plano. Confundir las dos cosas es lo que hace que un solucionador diga
 *    «sub-restringido» de un dibujo que está perfectamente definido.
 */
import {
  createMatrix,
  dependencyCoefficients,
  matrixGet,
  matrixInfinityNorm,
  matrixRank,
  matrixSet,
  type DenseMatrix,
} from "./linalg";

export interface DiagnosisRow {
  constraintId: string;
  /** Gradiente respecto de las columnas LIBRES del bloque. */
  gradient: Float64Array;
  residual: number;
}

export interface RigidMotion {
  vector: Float64Array;
}

export interface BlockDiagnosis {
  variables: number;
  rank: number;
  degreesOfFreedom: number;
  rigidBodyModes: number;
  internalDegreesOfFreedom: number;
  redundant: { constraintId: string; withConstraintIds: string[] }[];
  conflicting: { constraintId: string; withConstraintIds: string[] }[];
}

/**
 * Diagnostica un bloque. `rows` tiene que venir ORDENADO de forma estable (por
 * id de restricción): qué fila se considera «la que sobra» de un par dependiente
 * depende del orden, y un orden inestable haría que el mensaje cambiase entre
 * ejecuciones sobre el mismo dibujo.
 */
export function diagnoseBlock(
  variables: number,
  rows: readonly DiagnosisRow[],
  rigidMotions: readonly RigidMotion[],
  residualTolerance: number,
): BlockDiagnosis {
  const jacobian = createMatrix(Math.max(rows.length, 1), Math.max(variables, 1));
  rows.forEach((row, index) => {
    for (let col = 0; col < variables; col += 1) matrixSet(jacobian, index, col, row.gradient[col]);
  });
  const rank = rows.length === 0 || variables === 0 ? 0 : matrixRank(jacobian);
  const degreesOfFreedom = Math.max(0, variables - rank);

  const rigidBodyModes = rigidMotions.filter((motion) =>
    isNullSpaceVector(jacobian, motion.vector, rows.length, variables),
  ).length;

  const basis: Float64Array[] = [];
  const owners: string[] = [];
  const tally = new Map<string, { total: number; dependent: number; culprits: Set<string> }>();
  const conflicting: BlockDiagnosis["conflicting"] = [];

  for (const row of rows) {
    const entry = tally.get(row.constraintId) ?? { total: 0, dependent: 0, culprits: new Set<string>() };
    entry.total += 1;
    tally.set(row.constraintId, entry);

    const coefficients = dependencyCoefficients(basis, row.gradient);
    const zeroRow = infinityNorm(row.gradient) <= 0;
    if (coefficients === null && !zeroRow) {
      basis.push(row.gradient);
      owners.push(row.constraintId);
      continue;
    }
    // Fila dependiente (o completamente nula: todas sus variables están
    // ancladas). Sólo estorba si además NO se cumple.
    entry.dependent += 1;
    const culprits = coefficients
      ? owners.filter((_, index) => Math.abs(coefficients[index]) > 1e-9)
      : owners.filter((owner) => owner !== row.constraintId);
    for (const culprit of culprits) entry.culprits.add(culprit);
    if (Math.abs(row.residual) > residualTolerance)
      conflicting.push({ constraintId: row.constraintId, withConstraintIds: unique(culprits) });
  }

  const conflictingIds = new Set(conflicting.map((entry) => entry.constraintId));
  // REDUNDANTE es la restricción cuyas ecuaciones son TODAS dependientes. Una a
  // la que sólo le sobra una de dos —`collinear` sobre un par que ya era
  // paralelo aporta todavía «y además en la misma recta»— no sobra: quitarla
  // perdería esa segunda ecuación. Contar por filas y no por restricción hacía
  // que AUTOCONSTRAIN descartase justamente las restricciones más informativas.
  const redundant = [...tally.entries()]
    .filter(([id, entry]) => entry.total > 0 && entry.dependent === entry.total && !conflictingIds.has(id))
    .map(([constraintId, entry]) => ({ constraintId, withConstraintIds: unique([...entry.culprits]) }));

  return {
    variables,
    rank,
    degreesOfFreedom,
    rigidBodyModes,
    internalDegreesOfFreedom: Math.max(0, degreesOfFreedom - rigidBodyModes),
    redundant: dedupeByConstraint(redundant),
    conflicting: dedupeByConstraint(conflicting),
  };
}

/** ¿`vector` está en el núcleo de `jacobian`? Tolerancia relativa a ambos. */
function isNullSpaceVector(
  jacobian: DenseMatrix,
  vector: Float64Array,
  rows: number,
  cols: number,
): boolean {
  const vectorNorm = infinityNorm(vector);
  if (!(vectorNorm > 0)) return false;
  if (rows === 0) return true;
  const scale = matrixInfinityNorm(jacobian) * vectorNorm * cols;
  if (!(scale > 0)) return true;
  for (let row = 0; row < rows; row += 1) {
    let sum = 0;
    for (let col = 0; col < cols; col += 1) sum += matrixGet(jacobian, row, col) * vector[col];
    if (Math.abs(sum) > 1e-9 * scale) return false;
  }
  return true;
}

function infinityNorm(vector: Float64Array): number {
  let max = 0;
  for (let index = 0; index < vector.length; index += 1) max = Math.max(max, Math.abs(vector[index]));
  return max;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/** Una restricción con varias filas dependientes se nombra UNA vez. */
function dedupeByConstraint(
  entries: readonly { constraintId: string; withConstraintIds: string[] }[],
): { constraintId: string; withConstraintIds: string[] }[] {
  const merged = new Map<string, Set<string>>();
  for (const entry of entries) {
    const set = merged.get(entry.constraintId) ?? new Set<string>();
    for (const id of entry.withConstraintIds) set.add(id);
    merged.set(entry.constraintId, set);
  }
  return [...merged.entries()]
    .map(([constraintId, set]) => ({ constraintId, withConstraintIds: [...set].sort() }))
    .sort((a, b) => (a.constraintId < b.constraintId ? -1 : a.constraintId > b.constraintId ? 1 : 0));
}
