/**
 * La ranura de la BANDEJA de la barra de estado, para el chrome que se monta
 * fuera del editor.
 *
 * `CadStudioHost` monta la barra de llamada, la mensajería y la colaboración
 * como HERMANOS del editor, y la barra de estado vive dentro del editor, bajo
 * el lienzo. No hay un padre común al que pasarle una ref sin atravesar el
 * monolito, así que la bandeja se publica por `data-testid` y se busca aquí;
 * el observador cubre el orden de montaje (el editor llega después) y el
 * desmontaje (al cerrar el CAD la ranura desaparece y el chrome vuelve a su
 * posición fija, que sigue existiendo como respaldo).
 */
import { useSyncExternalStore } from "react";

export const CAD_STATUS_TRAY_SELECTOR = '[data-testid="cad-status-tray"]';

const query = (): HTMLElement | null =>
  typeof document === "undefined" ? null : document.querySelector<HTMLElement>(CAD_STATUS_TRAY_SELECTOR);

/**
 * Suscripción al DOM como sistema externo: el observador avisa cuando el
 * cuerpo del documento cambia y `getSnapshot` devuelve el elemento vigente
 * (misma referencia mientras la ranura no se remonte, así React no rerrenderiza
 * en vano).
 */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}

export function useStudioTraySlot(): HTMLElement | null {
  return useSyncExternalStore(subscribe, query, () => null);
}
