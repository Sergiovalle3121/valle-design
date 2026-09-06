/**
 * EL SUELO DEL HISTORIAL, DICHO (T-24·2, petición F3-P-04).
 *
 * `maxEntries: 80` es la cifra que se lee en el código; la que gobierna en un
 * plano denso es el presupuesto de bytes retenidos: cada punto de deshacer
 * guarda el documento COMPLETO y `enforceBudget()` expulsa el más viejo,
 * salvo el último. `docs/cad/evidence/document-limits.json` (`undoDepthByTier`,
 * generado por `scripts/cad/undo-depth-benchmark.mts`) mide cuántos pasos
 * sobreviven por tamaño: a partir del escalón denso, uno o dos. Sin esta
 * pista, quien mueve un plano grande y pulsa Ctrl+Z dos veces cree que el
 * producto perdió su segunda acción, cuando nunca hubo sitio para conservarla.
 */

/**
 * Escalón a partir del cual el presupuesto de memoria, no el número de
 * acciones, decide la profundidad (el primer escalón de `undoDepthByTier`
 * donde sobreviven dos pasos o menos).
 */
export const CAD_HISTORY_FLOOR_ENTITIES = 20_000;

export interface CadHistoryDepthHint {
  /** El historial está contra su suelo de memoria, no contra las acciones dadas. */
  floor: boolean;
  /** Lo que ve quien deja el ratón encima del indicador. */
  title: string;
}

export function cadHistoryDepthHint(
  undo: number,
  entityCount: number,
): CadHistoryDepthHint {
  const floor = undo <= 1 && entityCount >= CAD_HISTORY_FLOOR_ENTITIES;
  return {
    floor,
    title: floor
      ? "Profundidad de deshacer/rehacer. En un dibujo de este tamaño el presupuesto de memoria del historial sólo conserva uno o dos pasos: no es que hayas dado un solo paso, es que no cabe más."
      : "Profundidad de deshacer/rehacer",
  };
}
