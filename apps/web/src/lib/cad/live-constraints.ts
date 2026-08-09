/**
 * Fachada del dibujo paramétrico sobre el documento canónico.
 *
 * Mantiene la MISMA firma que tenía cuando por debajo había un iterador de punto
 * fijo (`constraints/legacy-fixed-point.ts`), para que el editor no se entere del
 * cambio de motor. Por dentro llama al solucionador de Newton
 * (`constraints/solver.ts`), que resuelve todas las restricciones a la vez.
 *
 * ## Qué cambia respecto del iterador, y por qué el nuevo es el correcto
 *
 * 1. **Los lazos acoplados ahora se resuelven.** Un triángulo con los tres lados
 *    acotados hacía oscilar al iterador hasta agotar las pasadas; Newton lo
 *    resuelve. Es el motivo del cambio y está fijado en `solver.spec.ts`.
 * 2. **Participan círculos, arcos, elipses, polilíneas y splines**, no sólo
 *    líneas y muros.
 * 3. **`changedEntityIds` es una preferencia, no un orden de referencia.** Antes
 *    decidía qué entidad de un par hacía de referencia; ahora ancla lo que el
 *    usuario acaba de mover, y si anclarlo hace el sistema imposible se resuelve
 *    otra vez sin anclas. Acotar la línea que acabas de dibujar sigue
 *    funcionando, y arrastrar ya no mueve de vuelta lo que arrastraste.
 * 4. **`colinear` conserva la longitud.** El aplicador anterior proyectaba los
 *    dos extremos sobre la recta de referencia, lo que además ACORTABA el
 *    segmento; dos segmentos colineales comparten recta soporte, no longitud.
 * 5. **`fully_constrained` significa cero grados de libertad de verdad**,
 *    calculados por el rango del jacobiano, no «cada entidad aparece en dos
 *    restricciones». Un dibujo sin anclar conserva sus tres movimientos de
 *    sólido rígido y se informa aparte de cuántos grados son internos.
 *
 * Lo que NO cambia: no muta el documento de entrada, y ante un fallo devuelve
 * exactamente el documento que recibió.
 */
import type { CadConstraint, CadDocument, CadEntity } from "./cad-document";
import { evaluateCadParameters } from "./constraints/parameters";
import { solveConstraintSystem } from "./constraints/solver";

export type CadConstraintSolveStatus =
  | "under_constrained"
  | "fully_constrained"
  | "over_constrained"
  | "inconsistent";

export interface CadConstraintSolveResult {
  document: CadDocument;
  status: CadConstraintSolveStatus;
  converged: boolean;
  iterations: number;
  changedEntityIds: string[];
  issues: { code: string; message: string; constraintIds: string[] }[];
  /** Variables libres menos ecuaciones independientes. */
  degreesOfFreedom: number;
  /** Los de arriba menos los movimientos de sólido rígido del conjunto. */
  internalDegreesOfFreedom: number;
  rigidBodyModes: number;
  /** Restricciones que no aportan ecuación nueva (sobran, pero no estorban). */
  redundantConstraintIds: string[];
  /** Restricciones que se contradicen entre sí. */
  conflictingConstraintIds: string[];
}

/**
 * Resuelve las restricciones del documento. Determinista: el mismo documento y
 * las mismas restricciones dan exactamente la misma solución.
 */
export function solveCadConstraints(
  document: CadDocument,
  changedEntityIds: string[] = [],
  options: { tolerance?: number; maxIterations?: number } = {},
): CadConstraintSolveResult {
  const parameters = evaluateCadParameters(document.parameters ?? [], { unit: document.meta.unit });
  const solution = solveConstraintSystem(document.entities, document.constraints, {
    tolerance: options.tolerance,
    // El iterador anterior daba 16 pasadas sobre TODAS las restricciones; Newton
    // necesita muchas menos, pero converger desde muy lejos con amortiguación
    // fuerte puede pedir unas decenas. El techo alto sólo se paga cuando hace
    // falta, porque el bucle sale en cuanto el residuo baja de la tolerancia.
    maxIterations: options.maxIterations === undefined ? undefined : Math.max(16, options.maxIterations),
    preferFixedEntityIds: changedEntityIds,
    parameterValues: parameters.values,
  });

  const issues = [
    ...parameters.issues.map((issue) => ({
      code: issue.code,
      message: issue.message,
      constraintIds: [] as string[],
    })),
    ...solution.issues,
  ];

  if (!solution.converged)
    return {
      document,
      status: solution.status,
      converged: false,
      iterations: solution.iterations,
      changedEntityIds: [],
      issues,
      degreesOfFreedom: solution.degreesOfFreedom,
      internalDegreesOfFreedom: solution.internalDegreesOfFreedom,
      rigidBodyModes: solution.rigidBodyModes,
      redundantConstraintIds: solution.redundantConstraintIds,
      conflictingConstraintIds: solution.conflictingConstraintIds,
    };

  const solved = new Map<string, CadEntity>(solution.entities.map((entity) => [entity.id, entity]));
  const entities = document.entities.map((entity) => solved.get(entity.id) ?? entity);
  return {
    document: { ...document, entities },
    status: solution.status,
    converged: true,
    iterations: solution.iterations,
    changedEntityIds: solution.changedEntityIds,
    issues,
    degreesOfFreedom: solution.degreesOfFreedom,
    internalDegreesOfFreedom: solution.internalDegreesOfFreedom,
    rigidBodyModes: solution.rigidBodyModes,
    redundantConstraintIds: solution.redundantConstraintIds,
    conflictingConstraintIds: solution.conflictingConstraintIds,
  };
}

export function upsertCadConstraint(
  document: CadDocument,
  constraint: CadConstraint,
): CadDocument {
  const constraints = document.constraints.filter((candidate) => candidate.id !== constraint.id);
  constraints.push({ ...constraint, entityIds: [...constraint.entityIds] });
  constraints.sort((a, b) => a.id.localeCompare(b.id));
  return { ...document, constraints };
}

/** Baja de una restricción por id. Devuelve el documento intacto si no existe. */
export function removeCadConstraint(document: CadDocument, constraintId: string): CadDocument {
  if (!document.constraints.some((constraint) => constraint.id === constraintId)) return document;
  return {
    ...document,
    constraints: document.constraints.filter((constraint) => constraint.id !== constraintId),
  };
}
