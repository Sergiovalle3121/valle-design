/**
 * Propagación de restricciones en la frontera de commit.
 *
 * El ejecutor de lotes sólo resuelve cuando el lote TOCA la sección de
 * restricciones o parámetros; mover geometría restringida por cualquier otra
 * vía (bloques, xrefs, LISP, merge, la segunda frontera) dejaba el residuo sin
 * resolver hasta que otra vía disparara el solver. Esta fachada da a las
 * puertas de commit una llamada única y de coste honesto a 100k entidades:
 *
 *  - O(1) si el documento no tiene restricciones (el caso masivo).
 *  - O(restricciones) para decidir si alguna habilitada toca lo mutado.
 *  - Sólo entonces delega en `solveCadConstraints` (Newton, determinista),
 *    anclando lo que el usuario acaba de mover.
 *
 * No converge ⇒ devuelve el documento de entrada intacto, igual que la fachada
 * del solver: una puerta de commit nunca deja el dibujo a medias.
 */
import type { CadDocument } from "./cad-document";
import { solveCadConstraints } from "./live-constraints";

export interface CadConstraintPropagation {
  document: CadDocument;
  /**
   * Entidades que el solver movió ADEMÁS de las tocadas por la mutación: la
   * puerta debe sumarlas a su sincronización de escena y proyección.
   */
  movedEntityIds: string[];
}

/**
 * Variante para puertas que reciben una mutación OPACA del documento entero
 * (`commitBlockMutation`): lo tocado se infiere por identidad de referencia
 * entre checkpoint y resultado. Una rutina que reconstruye entidades sin
 * cambiarlas produce un conjunto tocado mayor, y no pasa nada: el solver sólo
 * corre si alguna restricción habilitada toca ese conjunto, y resolver un
 * sistema ya satisfecho converge de inmediato.
 */
export function propagateCadConstraintsByDiff(
  checkpoint: CadDocument,
  next: CadDocument,
): CadConstraintPropagation {
  if (next.constraints.length === 0) return { document: next, movedEntityIds: [] };
  const before = new Map(checkpoint.entities.map((entity) => [entity.id, entity]));
  const touched: string[] = [];
  for (const entity of next.entities) {
    if (before.get(entity.id) !== entity) touched.push(entity.id);
  }
  return propagateCadConstraints(next, touched);
}

export function propagateCadConstraints(
  document: CadDocument,
  touchedEntityIds: Iterable<string>,
): CadConstraintPropagation {
  if (document.constraints.length === 0) {
    return { document, movedEntityIds: [] };
  }
  const touched: ReadonlySet<string> =
    touchedEntityIds instanceof Set
      ? touchedEntityIds
      : new Set(touchedEntityIds);
  if (touched.size === 0) return { document, movedEntityIds: [] };
  const affectsConstrained = document.constraints.some(
    (constraint) =>
      constraint.enabled !== false &&
      constraint.entityIds.some((id) => touched.has(id)),
  );
  if (!affectsConstrained) return { document, movedEntityIds: [] };
  const result = solveCadConstraints(document, [...touched]);
  if (!result.converged) return { document, movedEntityIds: [] };
  return {
    document: result.document,
    movedEntityIds: result.changedEntityIds.filter((id) => !touched.has(id)),
  };
}
