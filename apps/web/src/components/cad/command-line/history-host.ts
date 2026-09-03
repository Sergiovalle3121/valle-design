/**
 * Anfitrión del historial: donde `U`, `UNDO` y `REDO` dejan de ser una petición
 * y el dibujo vuelve atrás.
 *
 * El motor no puede deshacer y no debe poder: la pila la sostiene el editor
 * (`CanonicalHistory`), es estado de SESIÓN —dos personas con el mismo plano
 * abierto tienen cada una la suya— y viajar entre snapshots no es una mutación
 * más. Mismo reparto que PLOT: el comando pide, el anfitrión hace.
 *
 * ## El renglón dice CUÁNTAS, no «hecho»
 *
 * `UNDO 5` con tres pasos en la pila deshace tres, y decir «Hecho» sería
 * exactamente el «éxito falso» que `check:command-integrity` existe para
 * impedir. Así que el puente devuelve cuántos pasos pudo dar y el renglón lo
 * cuenta; si no pudo dar ninguno, lo dice con esas palabras.
 */
import type { CadHostRequest } from "@/lib/cad/engine/host-requests";

export interface CadHistoryHostBridge {
  /**
   * Da UN paso atrás y devuelve si de verdad lo dio.
   *
   * Un paso cada vez y no N de golpe: el editor ya tiene su `undo()` probado y
   * su repintado, y pedirle una versión con contador duplicaría la lógica de la
   * pila en dos sitios. Bucle aquí, verdad allí.
   */
  undo(): boolean;
  redo(): boolean;
}

/** Cuántos pasos se aceptan de una vez. Más que esto es un dedo apoyado. */
export const CAD_HISTORY_MAX_STEPS = 100;

function plural(count: number, singular: string, many: string): string {
  return `${count} ${count === 1 ? singular : many}`;
}

/**
 * Atiende `{kind:"history"}`. Devuelve `null` si la petición no es suya, para
 * que quien enruta pueda encadenar anfitriones sin conocerlos.
 */
export function handleCadHistoryHostRequest(
  request: CadHostRequest,
  bridge: CadHistoryHostBridge,
): string | null {
  if (request.kind !== "history") return null;
  const wanted = Math.min(Math.max(Math.floor(request.steps), 1), CAD_HISTORY_MAX_STEPS);
  let done = 0;
  while (done < wanted && (request.action === "undo" ? bridge.undo() : bridge.redo())) done += 1;
  const verbo = request.action === "undo" ? "Deshecho" : "Rehecho";
  if (done === 0)
    return request.action === "undo"
      ? "Nada que deshacer."
      : "Nada que rehacer.";
  const corto =
    done < wanted
      ? ` (se pidieron ${wanted}; la pila no daba para más)`
      : "";
  return `${verbo}: ${plural(done, "operación", "operaciones")}${corto}.`;
}
