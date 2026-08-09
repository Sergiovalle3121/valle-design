/**
 * Montaje del sistema: de entidades y restricciones a números.
 *
 * Vive aparte de `solver.ts` por la misma razón que `entity-commands.ts` vive
 * aparte de `entity-runtime.ts`: esto es el ENSAMBLAJE —qué variables hay, en
 * qué orden, qué filas produce cada restricción y qué subsistemas quedan
 * desacoplados— y aquello es la ITERACIÓN. Se leen y se rompen por separado, y
 * ninguno de los dos pasa del presupuesto de tamaño.
 *
 * Tres decisiones que este archivo fija y que el solucionador da por hechas:
 *
 * **El orden de las columnas es el alfabético de los ids de entidad.** Ese orden
 * decide qué solución de norma mínima sale entre las infinitas de un sistema
 * sub-restringido; dejarlo al orden de inserción haría que el mismo documento se
 * resolviese distinto según cómo se hubiera cargado.
 *
 * **Las filas se guardan DISPERSAS.** El jacobiano de un sistema de
 * restricciones lo es por naturaleza —cada restricción toca dos o tres
 * entidades— y guardarlo denso reservaría decenas de kilobytes por fila para
 * anotar seis números. Con mil entidades eso son megabytes por iteración.
 *
 * **El acoplamiento se decide por ESTRUCTURA, no por qué derivadas salen cero.**
 * La derivada de una tangencia respecto del centro X del círculo vale exactamente
 * cero cuando la recta es horizontal; con el criterio numérico esa variable
 * desaparecía del bloque, se descontaba de los grados de libertad y reaparecía
 * en cuanto la recta se inclinaba. Los grados de libertad de un dibujo no pueden
 * depender de en qué ángulo esté.
 */
import type { CadEntity } from "../cad-document";
import type { CadConstraint } from "./constraint-schema";
import { evaluateConstraint, planConstraint, type ConstraintPlan } from "./residuals";
import { dualGeometry, parametrizeCadEntity, type CadEntityParametrization } from "./variables";

export interface CadConstraintIssue {
  code: string;
  message: string;
  constraintIds: string[];
}

export interface PreparedConstraint {
  constraint: CadConstraint;
  parametrizations: CadEntityParametrization[];
  localOffsets: number[];
  localSize: number;
  localToGlobal: Int32Array;
  plan: ConstraintPlan;
}

export interface PreparedSystem {
  parametrizations: CadEntityParametrization[];
  offsets: number[];
  values: Float64Array;
  columnScale: Float64Array;
  columnEntity: Int32Array;
  constraints: PreparedConstraint[];
}

/** Fila del jacobiano en forma dispersa: sólo las columnas que toca. */
export interface SparseRow {
  columns: Int32Array;
  values: Float64Array;
}

export interface SystemEvaluation {
  residuals: number[];
  rows: SparseRow[];
  rowOwners: string[];
  rowConstraintIndex: number[];
}

export interface SolverBlock {
  /** Columnas GLOBALES libres del bloque. */
  columns: number[];
  /** Índices de fila, en el orden de una evaluación completa. */
  rows: number[];
  /** Restricciones que lo forman: lo único que hay que reevaluar al iterarlo. */
  constraintIndices: number[];
}

/**
 * Parametriza las entidades a las que apuntan las restricciones, o explica por
 * qué no se puede. Un TEXT o una cota no participan en el dibujo paramétrico, y
 * eso se dice con su tipo en vez de con un «no converge».
 */
export function collectParametrizations(
  entities: readonly CadEntity[],
  constraints: readonly CadConstraint[],
): { parametrizations: Map<string, CadEntityParametrization> } | { issues: CadConstraintIssue[] } {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const parametrizations = new Map<string, CadEntityParametrization>();
  const issues: CadConstraintIssue[] = [];
  for (const constraint of constraints) {
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
  return issues.length > 0 ? { issues } : { parametrizations };
}

export function prepareSystem(
  parametrizations: ReadonlyMap<string, CadEntityParametrization>,
  constraints: readonly CadConstraint[],
  parameterValues: ReadonlyMap<string, number> | undefined,
): PreparedSystem | { issues: CadConstraintIssue[] } {
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
      // Las columnas angulares se miden en «longitudes equivalentes»: girar
      // 1/L radianes desplaza el extremo una unidad. Sin esa escala, la
      // corrección de norma mínima prefiere girar en los dibujos grandes y
      // trasladar en los pequeños, que es una preferencia de las unidades y no
      // de la geometría.
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

/**
 * Evalúa el sistema, o sólo las restricciones indicadas.
 *
 * El filtro NO es una optimización cosmética: sin él, resolver N bloques
 * independientes evalúa N veces el sistema entero en cada iteración de cada
 * bloque, y la descomposición —que existe justamente para no pagar eso— se
 * vuelve cuadrática en el número de bloques.
 */
export function evaluateSystem(
  system: PreparedSystem,
  only?: readonly number[],
): SystemEvaluation | { issues: CadConstraintIssue[] } {
  const residuals: number[] = [];
  const rows: SparseRow[] = [];
  const rowOwners: string[] = [];
  const rowConstraintIndex: number[] = [];
  const issues: CadConstraintIssue[] = [];
  const indices = only ?? system.constraints.map((_, index) => index);

  for (const constraintIndex of indices) {
    const prepared = system.constraints[constraintIndex];
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
      continue;
    }
    let degenerate = false;
    for (const row of evaluated.rows) {
      if (!Number.isFinite(row.v)) {
        issues.push({
          code: "constraint_degenerate",
          message: `La restricción ${prepared.constraint.id} produce geometría degenerada.`,
          constraintIds: [prepared.constraint.id],
        });
        degenerate = true;
        break;
      }
      // Una entidad puede aparecer DOS veces en la misma restricción, y
      // entonces dos posiciones locales apuntan a la misma columna global: sus
      // derivadas se suman, no se pisan.
      const accumulated = new Map<number, number>();
      for (let local = 0; local < prepared.localSize; local += 1) {
        const derivative = row.g[local];
        if (derivative === 0) continue;
        const column = prepared.localToGlobal[local];
        accumulated.set(column, (accumulated.get(column) ?? 0) + derivative * system.columnScale[column]);
      }
      const columns = [...accumulated.keys()].sort((a, b) => a - b);
      residuals.push(row.v);
      rows.push({
        columns: Int32Array.from(columns),
        values: Float64Array.from(columns, (column) => accumulated.get(column) ?? 0),
      });
      rowOwners.push(prepared.constraint.id);
      rowConstraintIndex.push(constraintIndex);
    }
    if (degenerate) break;
  }

  if (issues.length > 0) return { issues };
  return { residuals, rows, rowOwners, rowConstraintIndex };
}

/** Proyecta una fila dispersa sobre un subconjunto de columnas. */
export function denseRow(
  row: SparseRow,
  columnIndex: ReadonlyMap<number, number>,
  size: number,
): Float64Array {
  const dense = new Float64Array(size);
  for (let entry = 0; entry < row.columns.length; entry += 1) {
    const index = columnIndex.get(row.columns[entry]);
    if (index !== undefined) dense[index] = row.values[entry];
  }
  return dense;
}

/** Componentes independientes del sistema. */
export function splitIntoBlocks(
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

  const blocks = new Map<number, SolverBlock>();
  // Filas sin NINGUNA variable libre: no se pueden resolver, pero sí
  // diagnosticar — son las que chocan con un anclaje y hay que nombrarlas.
  const stuck: SolverBlock = { columns: [], rows: [], constraintIndices: [] };
  const blockOf = (columns: readonly number[]): SolverBlock => {
    if (columns.length === 0) return stuck;
    const root = find(columns[0]);
    const block = blocks.get(root) ?? { columns: [], rows: [], constraintIndices: [] };
    blocks.set(root, block);
    return block;
  };
  rowConstraintIndex.forEach((constraintIndex, rowIndex) => {
    const block = blockOf(constraintColumns[constraintIndex]);
    block.rows.push(rowIndex);
    if (block.constraintIndices.at(-1) !== constraintIndex)
      block.constraintIndices.push(constraintIndex);
  });
  for (let column = 0; column < parent.length; column += 1) {
    if (frozenColumns[column]) continue;
    const root = find(column);
    const block = blocks.get(root) ?? { columns: [], rows: [], constraintIndices: [] };
    block.columns.push(column);
    blocks.set(root, block);
  }
  const ordered = [...blocks.entries()].sort((a, b) => a[0] - b[0]).map(([, block]) => block);
  if (stuck.rows.length > 0) ordered.push(stuck);
  return ordered;
}

/** Una fila del jacobiano con el id de la restricción que la puso. */
export interface CadConstraintJacobianRow {
  constraintId: string;
  gradient: Float64Array;
}

/**
 * Jacobiano de un conjunto de restricciones sobre la geometría dada, SIN
 * resolver nada y conservando el orden recibido.
 *
 * Existe para AUTOCONSTRAIN, que necesita saber si una candidata aporta una
 * ecuación nueva. Preguntándoselo al solucionador una vez por candidata,
 * deducir sobre cuarenta objetos tardaba minutos: son miles de candidatas y
 * cada consulta montaba y resolvía el sistema entero. Con el jacobiano en la
 * mano, la misma pregunta es una ortogonalización.
 */
export function sampleConstraintJacobian(
  entities: readonly CadEntity[],
  constraints: readonly CadConstraint[],
  parameterValues?: ReadonlyMap<string, number>,
): { columns: number; rows: CadConstraintJacobianRow[] } | null {
  const enabled = constraints.filter((constraint) => constraint.enabled);
  if (enabled.length === 0) return { columns: 0, rows: [] };
  const collected = collectParametrizations(entities, enabled);
  if ("issues" in collected) return null;
  const prepared = prepareSystem(collected.parametrizations, enabled, parameterValues);
  if ("issues" in prepared) return null;
  const evaluated = evaluateSystem(prepared);
  if ("issues" in evaluated) return null;
  const columns = prepared.values.length;
  const identity = new Map<number, number>();
  for (let column = 0; column < columns; column += 1) identity.set(column, column);
  return {
    columns,
    rows: evaluated.rows.map((row, index) => ({
      constraintId: evaluated.rowOwners[index],
      gradient: denseRow(row, identity, columns),
    })),
  };
}
