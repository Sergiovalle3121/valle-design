/**
 * Solucionador de restricciones geométricas: Newton-Raphson amortiguado sobre
 * el jacobiano, con descomposición en bloques y análisis de rango.
 *
 * ## Por qué no vale iterar
 *
 * Lo que había antes era un iterador de punto fijo: hasta 16 pasadas aplicando
 * las restricciones UNA A UNA, cada una pisando lo que hizo la anterior.
 * Converge cuando las restricciones no se tocan entre sí, y falla justo cuando
 * hacen falta: en un lazo acoplado —un triángulo con sus tres lados acotados,
 * un cuadrilátero cerrado— cada pasada deshace la anterior y el proceso oscila
 * para siempre. `legacy-fixed-point.ts` conserva aquel algoritmo y su spec
 * demuestra el fallo sobre un caso concreto, para que la diferencia sea un
 * hecho comprobable y no una afirmación de un PR.
 *
 * Aquí las restricciones se resuelven TODAS A LA VEZ: `F(v) = 0`, un vector de
 * residuos sobre el vector de variables, y Newton sobre el sistema completo.
 *
 * ## Las cuatro piezas
 *
 * **Amortiguación (Levenberg-Marquardt).** Newton puro diverge en cuanto se
 * arranca lejos de la solución o el jacobiano se vuelve casi singular. El
 * término `λ` interpola entre Newton (rápido cerca) y descenso de gradiente
 * (seguro lejos), y se ajusta solo según el paso mejore o empeore.
 *
 * **Descomposición en bloques.** Dos lazos que no comparten ninguna variable son
 * dos sistemas, no uno: resolverlos juntos multiplica el coste (el sistema
 * normal es cuadrático en el número de variables) y mezcla el diagnóstico de uno
 * con el del otro. Se separan por componentes conexas del grafo variable-fila.
 *
 * **Preacondicionado por papel de la variable.** Un ángulo en radianes y una
 * coordenada en milímetros no son comparables. Cada columna angular se escala
 * por el tamaño característico de su entidad, de modo que «moverse un poco»
 * significa lo mismo para todas las variables y la corrección de norma mínima
 * es geométricamente razonable en vez de depender de las unidades del dibujo.
 *
 * **Diagnóstico por rango** (`diagnosis.ts`): grados de libertad y culpables.
 */
import type { CadEntity } from "../cad-document";
import type { CadConstraint } from "./constraint-schema";
import { createMatrix, matrixAdd, solveLinearSystem, type DenseMatrix } from "./linalg";
import { diagnoseBlock, type DiagnosisRow, type RigidMotion } from "./diagnosis";
import { evaluateConstraint, planConstraint, type ConstraintPlan } from "./residuals";
import { dualGeometry, parametrizeCadEntity, type CadEntityParametrization } from "./variables";

export type CadConstraintStatus =
  | "under_constrained"
  | "fully_constrained"
  | "over_constrained"
  | "inconsistent";

export interface CadConstraintIssue {
  code: string;
  message: string;
  constraintIds: string[];
}

export interface CadConstraintSolution {
  /** Entidades resueltas, sólo las que participan. Vacío si no se resolvió. */
  entities: CadEntity[];
  changedEntityIds: string[];
  converged: boolean;
  iterations: number;
  /** Norma infinita del residuo final, en unidades de dibujo. */
  residual: number;
  status: CadConstraintStatus;
  /** Ecuaciones INDEPENDIENTES del sistema. Sube sólo si algo aporta de verdad. */
  rank: number;
  /** Variables libres menos ecuaciones independientes. */
  degreesOfFreedom: number;
  /** Los de arriba menos los movimientos de sólido rígido. */
  internalDegreesOfFreedom: number;
  rigidBodyModes: number;
  blocks: number;
  redundantConstraintIds: string[];
  conflictingConstraintIds: string[];
  issues: CadConstraintIssue[];
}

export interface CadConstraintSolverOptions {
  /** Tolerancia del residuo en unidades de dibujo. */
  tolerance?: number;
  maxIterations?: number;
  /**
   * Entidades que el usuario acaba de mover. Se intentan mantener quietas; si
   * eso hace el sistema imposible, se resuelve otra vez dejándolas libres.
   */
  preferFixedEntityIds?: readonly string[];
  /** Valores de los parámetros con nombre para las restricciones dimensionales. */
  parameterValues?: ReadonlyMap<string, number>;
}

interface PreparedConstraint {
  constraint: CadConstraint;
  parametrizations: CadEntityParametrization[];
  localOffsets: number[];
  localSize: number;
  localToGlobal: Int32Array;
  plan: ConstraintPlan;
}

interface PreparedSystem {
  parametrizations: CadEntityParametrization[];
  offsets: number[];
  values: Float64Array;
  columnScale: Float64Array;
  columnEntity: Int32Array;
  constraints: PreparedConstraint[];
}

const byIdAsc = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Resuelve el sistema. No muta nada: devuelve las entidades resueltas aparte.
 */
export function solveConstraintSystem(
  entities: readonly CadEntity[],
  constraints: readonly CadConstraint[],
  options: CadConstraintSolverOptions = {},
): CadConstraintSolution {
  const tolerance = Math.max(1e-12, options.tolerance ?? 1e-6);
  const maxIterations = Math.min(500, Math.max(1, options.maxIterations ?? 60));
  const enabled = [...constraints].filter((constraint) => constraint.enabled).sort(byIdAsc);
  if (enabled.length === 0) return emptySolution();

  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const parametrizations = new Map<string, CadEntityParametrization>();
  const issues: CadConstraintIssue[] = [];
  for (const constraint of enabled) {
    for (const entityId of constraint.entityIds) {
      if (parametrizations.has(entityId)) continue;
      const entity = byId.get(entityId);
      if (!entity) {
        issues.push({
          code: "constraint_missing_entity",
          message: `La restricción ${constraint.id} apunta a ${entityId}, que no está en el documento.`,
          constraintIds: [constraint.id],
        });
        continue;
      }
      const parametrization = parametrizeCadEntity(entity);
      if (!parametrization) {
        issues.push({
          code: "constraint_unsupported",
          message: `${entityId} es de tipo ${entity.type} y no participa en el dibujo paramétrico.`,
          constraintIds: [constraint.id],
        });
        continue;
      }
      parametrizations.set(entityId, parametrization);
    }
  }
  if (issues.length > 0) return failedSolution(issues);

  const anchored = new Set<string>();
  for (const constraint of enabled)
    if (constraint.kind === "fix") for (const entityId of constraint.entityIds) anchored.add(entityId);

  const preferred = new Set(options.preferFixedEntityIds ?? []);
  const first = attempt(parametrizations, enabled, options, tolerance, maxIterations, new Set([...anchored, ...preferred]));
  // Respetar lo que el usuario acaba de mover es una PREFERENCIA, no un dogma:
  // si congelarlo hace el sistema imposible —«esta línea mide 2400», y la línea
  // es justo la que se acaba de tocar— se vuelve a resolver dejándola libre. Sin
  // este segundo intento, acotar lo que acabas de dibujar sería siempre un error.
  if (first.converged || preferred.size === 0 || first.status === "inconsistent") return first;
  const second = attempt(parametrizations, enabled, options, tolerance, maxIterations, anchored);
  return second.converged ? second : first;
}

function attempt(
  parametrizations: ReadonlyMap<string, CadEntityParametrization>,
  constraints: readonly CadConstraint[],
  options: CadConstraintSolverOptions,
  tolerance: number,
  maxIterations: number,
  frozenEntityIds: ReadonlySet<string>,
): CadConstraintSolution {
  const prepared = prepareSystem(parametrizations, constraints, options.parameterValues);
  if ("issues" in prepared) return failedSolution(prepared.issues);

  const frozenColumns = new Uint8Array(prepared.values.length);
  prepared.parametrizations.forEach((parametrization, index) => {
    if (!frozenEntityIds.has(parametrization.entityId)) return;
    for (let column = 0; column < prepared.values.length; column += 1)
      if (prepared.columnEntity[column] === index) frozenColumns[column] = 1;
  });

  const evaluation = evaluateSystem(prepared);
  if ("issues" in evaluation) return failedSolution(evaluation.issues);

  const blocks = splitIntoBlocks(prepared, evaluation.rowConstraintIndex, frozenColumns);
  let iterations = 0;
  let converged = true;
  for (const block of blocks) {
    if (block.columns.length === 0) continue;
    const outcome = solveBlock(prepared, block, tolerance, maxIterations);
    iterations = Math.max(iterations, outcome.iterations);
    if (!outcome.converged) converged = false;
  }

  const final = evaluateSystem(prepared);
  if ("issues" in final) return failedSolution(final.issues);
  const residual = final.residuals.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  if (residual > tolerance) converged = false;

  return summarize(prepared, blocks, final, converged, iterations, residual, tolerance);
}

// ---------------------------------------------------------------------------
// Montaje del sistema
// ---------------------------------------------------------------------------

function prepareSystem(
  parametrizations: ReadonlyMap<string, CadEntityParametrization>,
  constraints: readonly CadConstraint[],
  parameterValues: ReadonlyMap<string, number> | undefined,
): PreparedSystem | { issues: CadConstraintIssue[] } {
  // Orden estable por id: el orden de las columnas decide qué solución de norma
  // mínima sale, así que dejarlo al orden de inserción haría que el mismo
  // documento se resolviese distinto según cómo se hubiera cargado.
  const list = [...parametrizations.values()].sort((a, b) =>
    a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0,
  );
  const offsets: number[] = [];
  let total = 0;
  for (const parametrization of list) {
    offsets.push(total);
    total += parametrization.values.length;
  }
  const values = new Float64Array(total);
  const columnScale = new Float64Array(total);
  const columnEntity = new Int32Array(total);
  list.forEach((parametrization, index) => {
    const offset = offsets[index];
    parametrization.values.forEach((value, local) => {
      values[offset + local] = value;
      columnEntity[offset + local] = index;
      const role = parametrization.roles[local];
      columnScale[offset + local] = role === "length" ? 1 : 1 / parametrization.scale;
    });
  });

  const indexOf = new Map(list.map((parametrization, index) => [parametrization.entityId, index]));
  const issues: CadConstraintIssue[] = [];
  const preparedConstraints: PreparedConstraint[] = [];
  for (const constraint of constraints) {
    const entityIndices = constraint.entityIds.map((entityId) => indexOf.get(entityId));
    if (entityIndices.some((index) => index === undefined)) continue;
    const involved = entityIndices as number[];
    const localOffsets: number[] = [];
    const localToGlobal: number[] = [];
    for (const index of involved) {
      localOffsets.push(localToGlobal.length);
      const offset = offsets[index];
      for (let local = 0; local < list[index].values.length; local += 1)
        localToGlobal.push(offset + local);
    }
    const value = resolveConstraintValue(constraint, parameterValues);
    if (value === "missing") {
      issues.push({
        code: "constraint_parameter_missing",
        message: `La restricción ${constraint.id} usa el parámetro «${constraint.parameter}», que no existe.`,
        constraintIds: [constraint.id],
      });
      continue;
    }
    const scale = Math.max(...involved.map((index) => list[index].scale), 1e-6);
    preparedConstraints.push({
      constraint,
      parametrizations: involved.map((index) => list[index]),
      localOffsets,
      localSize: localToGlobal.length,
      localToGlobal: Int32Array.from(localToGlobal),
      plan: planConstraint(constraint, involved.map((index) => snapshotGeometry(list[index])), value, scale),
    });
  }
  if (issues.length > 0) return { issues };
  return { parametrizations: list, offsets, values, columnScale, columnEntity, constraints: preparedConstraints };
}

function resolveConstraintValue(
  constraint: CadConstraint,
  parameterValues: ReadonlyMap<string, number> | undefined,
): number | null | "missing" {
  if (!constraint.parameter) return constraint.value ?? null;
  const resolved = parameterValues?.get(constraint.parameter);
  if (resolved === undefined || !Number.isFinite(resolved)) return "missing";
  return resolved;
}

/** Vista escalar de una entidad, para congelar el caso de las tangencias. */
function snapshotGeometry(parametrization: CadEntityParametrization) {
  const values = parametrization.values;
  if (parametrization.form === "segment")
    return { form: "segment", center: { x: values[0], y: values[1] }, angle: values[2], radius: null };
  if (parametrization.form === "circle")
    return { form: "circle", center: { x: values[0], y: values[1] }, angle: null, radius: values[2] };
  if (parametrization.form === "arc")
    return { form: "arc", center: { x: values[0], y: values[1] }, angle: null, radius: values[2] };
  if (parametrization.form === "ellipse")
    return { form: "ellipse", center: { x: values[0], y: values[1] }, angle: values[2], radius: values[3] };
  return { form: "points", center: { x: values[0], y: values[1] }, angle: null, radius: null };
}

interface SystemEvaluation {
  residuals: number[];
  /** Gradiente de cada fila en columnas GLOBALES, ya escaladas. */
  rowGradients: Float64Array[];
  rowOwners: string[];
  rowConstraintIndex: number[];
}

function evaluateSystem(system: PreparedSystem): SystemEvaluation | { issues: CadConstraintIssue[] } {
  const residuals: number[] = [];
  const rowGradients: Float64Array[] = [];
  const rowOwners: string[] = [];
  const rowConstraintIndex: number[] = [];
  const issues: CadConstraintIssue[] = [];

  system.constraints.forEach((prepared, constraintIndex) => {
    const localValues: number[] = [];
    for (let local = 0; local < prepared.localSize; local += 1)
      localValues.push(system.values[prepared.localToGlobal[local]]);
    const geometries = prepared.parametrizations.map((parametrization, index) =>
      dualGeometry(parametrization, prepared.localOffsets[index], prepared.localSize, localValues),
    );
    const evaluated = evaluateConstraint(prepared.constraint, geometries, prepared.plan, prepared.localSize);
    if (!evaluated.ok) {
      issues.push({
        code: evaluated.code,
        message: evaluated.message,
        constraintIds: [prepared.constraint.id],
      });
      return;
    }
    for (const row of evaluated.rows) {
      if (!Number.isFinite(row.v)) {
        issues.push({
          code: "constraint_degenerate",
          message: `La restricción ${prepared.constraint.id} produce geometría degenerada.`,
          constraintIds: [prepared.constraint.id],
        });
        return;
      }
      const gradient = new Float64Array(system.values.length);
      for (let local = 0; local < prepared.localSize; local += 1) {
        const column = prepared.localToGlobal[local];
        gradient[column] += row.g[local] * system.columnScale[column];
      }
      residuals.push(row.v);
      rowGradients.push(gradient);
      rowOwners.push(prepared.constraint.id);
      rowConstraintIndex.push(constraintIndex);
    }
  });

  if (issues.length > 0) return { issues };
  return { residuals, rowGradients, rowOwners, rowConstraintIndex };
}

// ---------------------------------------------------------------------------
// Bloques independientes
// ---------------------------------------------------------------------------

interface SolverBlock {
  /** Columnas GLOBALES libres del bloque. */
  columns: number[];
  /** Índices de fila (en el orden de `evaluateSystem`). */
  rows: number[];
}

/**
 * Componentes independientes del sistema.
 *
 * El acoplamiento se decide por ESTRUCTURA —qué entidades toca cada
 * restricción— y no por qué derivadas salen distintas de cero en la
 * configuración actual. La diferencia importa: la derivada de una tangencia
 * respecto del centro X del círculo vale exactamente cero cuando la recta es
 * horizontal, y con el criterio numérico esa variable desaparecía del bloque,
 * se descontaba de los grados de libertad y volvía a aparecer en cuanto la
 * recta se inclinaba un poco. Los grados de libertad de un dibujo no pueden
 * depender de en qué ángulo esté.
 */
function splitIntoBlocks(
  system: PreparedSystem,
  rowConstraintIndex: readonly number[],
  frozenColumns: Uint8Array,
): SolverBlock[] {
  const parent = new Int32Array(system.values.length);
  for (let index = 0; index < parent.length; index += 1) parent[index] = index;
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    let walk = index;
    while (parent[walk] !== root) {
      const next = parent[walk];
      parent[walk] = root;
      walk = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[Math.max(rootA, rootB)] = Math.min(rootA, rootB);
  };

  // Las columnas libres de una misma entidad van siempre juntas: una entidad no
  // se parte entre dos subsistemas.
  const entityColumns = system.parametrizations.map((): number[] => []);
  for (let column = 0; column < system.values.length; column += 1) {
    if (frozenColumns[column]) continue;
    entityColumns[system.columnEntity[column]].push(column);
  }
  for (const columns of entityColumns)
    for (let index = 1; index < columns.length; index += 1) union(columns[0], columns[index]);

  const entityIndexOf = new Map(
    system.parametrizations.map((parametrization, index) => [parametrization.entityId, index]),
  );
  const constraintColumns = system.constraints.map((prepared) => {
    const free = [
      ...new Set(
        prepared.parametrizations.flatMap(
          (parametrization) => entityColumns[entityIndexOf.get(parametrization.entityId)!],
        ),
      ),
    ].sort((a, b) => a - b);
    for (let index = 1; index < free.length; index += 1) union(free[0], free[index]);
    return free;
  });
  const rowColumns: number[][] = rowConstraintIndex.map((index) => constraintColumns[index]);

  const blocks = new Map<number, SolverBlock>();
  // Filas sin NINGUNA variable libre: no se pueden resolver, pero sí
  // diagnosticar — son las que chocan con un anclaje y hay que nombrarlas.
  const stuck: SolverBlock = { columns: [], rows: [] };
  rowColumns.forEach((columns, rowIndex) => {
    if (columns.length === 0) {
      stuck.rows.push(rowIndex);
      return;
    }
    const root = find(columns[0]);
    const block = blocks.get(root) ?? { columns: [], rows: [] };
    block.rows.push(rowIndex);
    blocks.set(root, block);
  });
  for (let column = 0; column < parent.length; column += 1) {
    if (frozenColumns[column]) continue;
    const root = find(column);
    const block = blocks.get(root) ?? { columns: [], rows: [] };
    block.columns.push(column);
    blocks.set(root, block);
  }
  const ordered = [...blocks.entries()].sort((a, b) => a[0] - b[0]).map(([, block]) => block);
  if (stuck.rows.length > 0) ordered.push(stuck);
  return ordered;
}

// ---------------------------------------------------------------------------
// Levenberg-Marquardt sobre un bloque
// ---------------------------------------------------------------------------

function solveBlock(
  system: PreparedSystem,
  block: SolverBlock,
  tolerance: number,
  maxIterations: number,
): { converged: boolean; iterations: number } {
  const columns = block.columns;
  const n = columns.length;
  let lambda = 1e-6;
  let underTolerance = 0;
  let iterations = 0;

  const blockResiduals = (): number[] | null => {
    const evaluated = evaluateSystem(system);
    if ("issues" in evaluated) return null;
    return block.rows.map((rowIndex) => evaluated.residuals[rowIndex]);
  };

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    iterations = iteration;
    const evaluated = evaluateSystem(system);
    if ("issues" in evaluated) return { converged: false, iterations };
    const residuals = block.rows.map((rowIndex) => evaluated.residuals[rowIndex]);
    const norm = residuals.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
    if (norm <= tolerance) {
      // Un paso de PULIDO tras cruzar la tolerancia. Newton converge de forma
      // cuadrática: la iteración siguiente baja el residuo varios órdenes de
      // magnitud más, y eso es lo que separa «cumple la tolerancia» de «la
      // geometría está donde tiene que estar» cuando alguien mide el ángulo
      // resultante con nueve decimales.
      underTolerance += 1;
      if (underTolerance >= 2) return { converged: true, iterations };
    } else {
      underTolerance = 0;
    }

    // Ecuaciones normales `JᵀJ Δ = -JᵀF`. Se recorren sólo las entradas NO
    // NULAS de cada fila: el jacobiano es disperso por construcción (una
    // restricción toca dos o tres entidades de las que haya en el bloque) y
    // recorrerlo denso convertiría un dibujo grande en un cuadrado inútil.
    const normal = createMatrix(n, n);
    const gradient = new Float64Array(n);
    block.rows.forEach((rowIndex, localRow) => {
      const row = evaluated.rowGradients[rowIndex];
      const entries: number[] = [];
      const factors: number[] = [];
      for (let index = 0; index < n; index += 1) {
        const value = row[columns[index]];
        if (value === 0) continue;
        entries.push(index);
        factors.push(value);
      }
      for (let i = 0; i < entries.length; i += 1) {
        gradient[entries[i]] += factors[i] * residuals[localRow];
        for (let j = 0; j < entries.length; j += 1)
          matrixAdd(normal, entries[i], entries[j], factors[i] * factors[j]);
      }
    });

    let maxDiagonal = 0;
    for (let index = 0; index < n; index += 1)
      maxDiagonal = Math.max(maxDiagonal, normal.data[index * n + index]);
    const floor = maxDiagonal > 0 ? maxDiagonal : 1;

    const before = norm;
    const snapshot = Float64Array.from(system.values);
    let accepted = false;
    for (let trial = 0; trial < 12 && !accepted; trial += 1) {
      const damped = { rows: n, cols: n, data: Float64Array.from(normal.data) } satisfies DenseMatrix;
      for (let index = 0; index < n; index += 1) matrixAdd(damped, index, index, lambda * floor);
      const rhs = new Float64Array(n);
      for (let index = 0; index < n; index += 1) rhs[index] = -gradient[index];
      const step = solveLinearSystem(damped, rhs);
      if (!step) {
        lambda *= 10;
        continue;
      }
      columns.forEach((column, index) => {
        system.values[column] = snapshot[column] + step[index] * system.columnScale[column];
      });
      const next = blockResiduals();
      const nextNorm = next ? next.reduce((max, value) => Math.max(max, Math.abs(value)), 0) : Number.POSITIVE_INFINITY;
      if (Number.isFinite(nextNorm) && nextNorm < before) {
        accepted = true;
        lambda = Math.max(lambda / 3, 1e-12);
      } else {
        system.values.set(snapshot);
        lambda *= 10;
      }
    }
    if (!accepted) {
      // Ningún paso amortiguado mejora: o ya está en el mínimo alcanzable
      // (sistema contradictorio) o la geometría es degenerada. En ambos casos
      // seguir iterando sólo gasta tiempo y el diagnóstico dirá cuál es.
      return { converged: underTolerance > 0, iterations };
    }
  }
  const residuals = blockResiduals();
  const norm = residuals ? residuals.reduce((max, value) => Math.max(max, Math.abs(value)), 0) : Number.POSITIVE_INFINITY;
  return { converged: norm <= tolerance, iterations };
}

// ---------------------------------------------------------------------------
// Resumen y diagnóstico
// ---------------------------------------------------------------------------

function summarize(
  system: PreparedSystem,
  blocks: readonly SolverBlock[],
  evaluation: SystemEvaluation,
  converged: boolean,
  iterations: number,
  residual: number,
  tolerance: number,
): CadConstraintSolution {
  let degreesOfFreedom = 0;
  let internal = 0;
  let rigidBodyModes = 0;
  let rank = 0;
  const redundant: string[] = [];
  const conflicting: string[] = [];
  const issues: CadConstraintIssue[] = [];

  for (const block of blocks) {
    const rows: DiagnosisRow[] = block.rows.map((rowIndex) => ({
      constraintId: evaluation.rowOwners[rowIndex],
      gradient: Float64Array.from(block.columns.map((column) => evaluation.rowGradients[rowIndex][column])),
      residual: evaluation.residuals[rowIndex],
    }));
    const diagnosis = diagnoseBlock(block.columns.length, rows, rigidMotions(system, block), tolerance);
    rank += diagnosis.rank;
    degreesOfFreedom += diagnosis.degreesOfFreedom;
    internal += diagnosis.internalDegreesOfFreedom;
    rigidBodyModes += diagnosis.rigidBodyModes;
    for (const entry of diagnosis.redundant) {
      redundant.push(entry.constraintId);
      issues.push({
        code: "constraint_redundant",
        message: entry.withConstraintIds.length
          ? `${entry.constraintId} es redundante: ya está implicada por ${entry.withConstraintIds.join(", ")}.`
          : `${entry.constraintId} no aporta ninguna ecuación nueva.`,
        constraintIds: [entry.constraintId, ...entry.withConstraintIds],
      });
    }
    for (const entry of diagnosis.conflicting) {
      conflicting.push(entry.constraintId);
      issues.push({
        code: "constraint_conflict",
        message: entry.withConstraintIds.length
          ? `${entry.constraintId} contradice a ${entry.withConstraintIds.join(", ")}: no pueden cumplirse a la vez.`
          : `${entry.constraintId} no puede cumplirse: todas sus variables están ancladas.`,
        constraintIds: [entry.constraintId, ...entry.withConstraintIds],
      });
    }
  }

  const status: CadConstraintStatus = conflicting.length
    ? "over_constrained"
    : !converged
      ? "inconsistent"
      : degreesOfFreedom === 0
        ? "fully_constrained"
        : "under_constrained";
  if (!converged && conflicting.length === 0)
    issues.push({
      code: "constraint_no_convergence",
      message: `El sistema no converge: residuo ${residual.toExponential(2)} tras ${iterations} iteraciones.`,
      constraintIds: [...new Set(evaluation.rowOwners)].sort(),
    });

  const entities: CadEntity[] = [];
  const changedEntityIds: string[] = [];
  if (converged) {
    system.parametrizations.forEach((parametrization, index) => {
      const offset = system.offsets[index];
      const next = Array.from(parametrization.values, (_, local) => system.values[offset + local]);
      const moved = next.some((value, local) => Math.abs(value - parametrization.values[local]) > 1e-12);
      const built = parametrization.build(next);
      if (!built) {
        issues.push({
          code: "constraint_degenerate",
          message: `${parametrization.entityId} quedaría degenerada (longitud o radio nulo).`,
          constraintIds: [],
        });
        return;
      }
      entities.push(built);
      if (moved) changedEntityIds.push(parametrization.entityId);
    });
  }
  const degenerate = issues.some((issue) => issue.code === "constraint_degenerate");

  return {
    entities: degenerate ? [] : entities,
    changedEntityIds: degenerate ? [] : changedEntityIds.sort(),
    converged: converged && !degenerate,
    iterations,
    residual,
    status: degenerate ? "inconsistent" : status,
    rank,
    degreesOfFreedom,
    internalDegreesOfFreedom: internal,
    rigidBodyModes,
    blocks: blocks.filter((block) => block.columns.length > 0).length,
    redundantConstraintIds: [...new Set(redundant)].sort(),
    conflictingConstraintIds: [...new Set(conflicting)].sort(),
    issues,
  };
}

/**
 * Movimientos de sólido rígido del bloque: dos traslaciones y un giro alrededor
 * del centroide de sus entidades, expresados en las columnas del bloque y en
 * coordenadas ya escaladas.
 */
function rigidMotions(system: PreparedSystem, block: SolverBlock): RigidMotion[] {
  const columns = block.columns;
  const columnIndex = new Map(columns.map((column, index) => [column, index]));
  const entityIndices = [...new Set(columns.map((column) => system.columnEntity[column]))].sort((a, b) => a - b);
  if (entityIndices.length === 0) return [];

  let pivotX = 0;
  let pivotY = 0;
  for (const index of entityIndices) {
    const offset = system.offsets[index];
    pivotX += system.values[offset];
    pivotY += system.values[offset + 1];
  }
  pivotX /= entityIndices.length;
  pivotY /= entityIndices.length;

  const translationX = new Float64Array(columns.length);
  const translationY = new Float64Array(columns.length);
  const rotation = new Float64Array(columns.length);
  const put = (column: number, target: Float64Array, value: number) => {
    const index = columnIndex.get(column);
    // El vector se expresa en coordenadas escaladas: es la misma dirección, con
    // las componentes ya comparables entre ángulos y longitudes.
    if (index !== undefined) target[index] = value / system.columnScale[column];
  };

  for (const index of entityIndices) {
    const parametrization = system.parametrizations[index];
    const offset = system.offsets[index];
    if (parametrization.form === "points") {
      for (let point = 0; point < parametrization.values.length / 2; point += 1) {
        const px = system.values[offset + point * 2];
        const py = system.values[offset + point * 2 + 1];
        put(offset + point * 2, translationX, 1);
        put(offset + point * 2 + 1, translationY, 1);
        put(offset + point * 2, rotation, -(py - pivotY));
        put(offset + point * 2 + 1, rotation, px - pivotX);
      }
      continue;
    }
    const cx = system.values[offset];
    const cy = system.values[offset + 1];
    put(offset, translationX, 1);
    put(offset + 1, translationY, 1);
    put(offset, rotation, -(cy - pivotY));
    put(offset + 1, rotation, cx - pivotX);
    if (parametrization.form === "segment" || parametrization.form === "ellipse") put(offset + 2, rotation, 1);
    if (parametrization.form === "arc") {
      put(offset + 3, rotation, 1);
      put(offset + 4, rotation, 1);
    }
  }
  return [{ vector: translationX }, { vector: translationY }, { vector: rotation }];
}

function emptySolution(): CadConstraintSolution {
  return {
    entities: [],
    changedEntityIds: [],
    converged: true,
    iterations: 0,
    residual: 0,
    status: "under_constrained",
    rank: 0,
    degreesOfFreedom: 0,
    internalDegreesOfFreedom: 0,
    rigidBodyModes: 0,
    blocks: 0,
    redundantConstraintIds: [],
    conflictingConstraintIds: [],
    issues: [],
  };
}

function failedSolution(issues: CadConstraintIssue[]): CadConstraintSolution {
  return { ...emptySolution(), converged: false, status: "inconsistent", issues };
}
