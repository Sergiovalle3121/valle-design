"use client";

/**
 * Acciones del gestor de capas que el monolito no tenía.
 *
 * Tipo de línea, grosor, plot on/off, congelación por viewport y estados de
 * capa. Viven aquí y no dentro de `Layout3DEditor.tsx` por la razón de
 * siempre: el archivo sólo puede encoger, y añadir la funcionalidad que falta
 * dentro de él es exactamente lo que el trinquete existe para impedir.
 *
 * El módulo no toca la red ni el documento por su cuenta: recibe `commit`, que
 * es la MISMA puerta canónica que usa el resto del editor —un checkpoint, un
 * `commitChange`, un paso de deshacer—. No hay una segunda ruta de mutación.
 *
 * ## Callbacks estables con datos vivos
 *
 * Las filas del gestor se recalculan en cada render, pero los callbacks tienen
 * que ser estables por identidad o la paleta memoizada se re-renderiza con
 * cada movimiento del ratón. Mismo truco que en `use-command-engine.ts`: lo que
 * cambia va a una `ref` que se escribe en el cuerpo del render —no en un
 * efecto, porque un manejador puede dispararse antes de que los efectos de ese
 * render corran— y los callbacks leen de ella.
 */
import { useCallback, useRef } from "react";
import { commitChange, type CadDocument } from "@/lib/cad/cad-document";
import { updateCadDocumentLayer } from "@/lib/cad/cad-layer-manager";
import type { CadLayerManagerHost } from "./layer-manager-host";
import {
  captureCadLayerState,
  planCadLayerStateRestore,
  type CadLayerManagerRow,
} from "./layer-manager-model";

export interface CadLayerActionsOptions {
  host: CadLayerManagerHost;
  /**
   * Filas SIN filtrar, por referencia viva: un estado de capa fotografía el
   * dibujo entero, y las filas se recalculan DESPUÉS de montar los hooks.
   */
  rows: { readonly current: readonly CadLayerManagerRow[] };
  /** Ruta canónica de mutación del editor. Devuelve si el cambio cuajó. */
  commit: (
    mutate: (document: CadDocument) => CadDocument,
    success: string,
  ) => boolean;
  notify: {
    success: (message: string) => void;
    info: (message: string) => void;
    error: (message: string) => void;
  };
  /** Viewport activo, o `null` en espacio modelo. */
  activeViewportId: string | null;
  setViewportLayerVisibility: (
    viewportId: string,
    layerId: string,
    visible: boolean,
  ) => void;
}

export interface CadLayerActions {
  setLinetype: (id: string, linetype: string) => void;
  setLineweight: (id: string, lineweight: number) => void;
  setPlot: (id: string, plot: boolean) => void;
  hideEmpty: () => void;
  toggleViewportFreeze: (id: string, frozen: boolean) => void;
  saveState: () => void;
  restoreState: (name: string) => void;
  deleteState: (name: string) => void;
}

export function useCadLayerActions(
  options: CadLayerActionsOptions,
): CadLayerActions {
  const live = useRef(options);
  live.current = options;

  const setLinetype = useCallback((id: string, linetype: string) => {
    live.current.commit(
      (document) => updateCadDocumentLayer(document, id, { linetype }),
      `Tipo de línea de ${id}: ${linetype}.`,
    );
  }, []);

  const setLineweight = useCallback((id: string, lineweight: number) => {
    live.current.commit(
      (document) => updateCadDocumentLayer(document, id, { lineweight }),
      `Grosor de ${id} actualizado.`,
    );
  }, []);

  const setPlot = useCallback((id: string, plot: boolean) => {
    live.current.commit(
      (document) => updateCadDocumentLayer(document, id, { plot }),
      `Capa ${id} ${plot ? "se imprime" : "no se imprime"}.`,
    );
  }, []);

  const hideEmpty = useCallback(() => {
    const counts = new Map(
      live.current.rows.current.map((row) => [row.id, row.objectCount]),
    );
    live.current.commit(
      (document) =>
        commitChange(
          {
            ...document,
            layers: document.layers.map((layer) => ({
              ...layer,
              visible: (counts.get(layer.id) ?? 0) > 0,
            })),
          },
          "layer:hide-empty",
        ),
      "Capas CAD vacías ocultas.",
    );
  }, []);

  /**
   * Congela una capa SÓLO en el viewport activo.
   *
   * Es lo que separa una capa apagada de una congelada por viewport: la
   * primera desaparece del dibujo entero, la segunda sólo de esa ventana. El
   * documento ya lo modela (`viewport.layerVisibility`) y el renderizador de
   * presentaciones ya lo respeta; lo que faltaba era poder hacerlo desde el
   * gestor de capas y no sólo desde el de presentaciones.
   *
   * Sin viewport activo se RECHAZA con un mensaje en vez de callar: en espacio
   * modelo no hay ventana que congelar, y fingir que sí dejaría al usuario
   * esperando un cambio que nunca llega.
   */
  const toggleViewportFreeze = useCallback((id: string, frozen: boolean) => {
    const { activeViewportId, setViewportLayerVisibility, notify } =
      live.current;
    if (!activeViewportId) {
      notify.error(
        "Abre una presentación y designa un viewport para congelar la capa sólo en él.",
      );
      return;
    }
    setViewportLayerVisibility(activeViewportId, id, !frozen);
  }, []);

  const saveState = useCallback(() => {
    const { host, rows, notify } = live.current;
    const name = host.draftStateName.trim();
    if (!name) return;
    host.saveState(captureCadLayerState(name, rows.current));
    notify.success(`Estado de capa «${name}» guardado en esta sesión.`);
  }, []);

  /**
   * Restaura un estado como UNA transacción.
   *
   * Los parches salen calculados por diferencia, así que restaurar el estado en
   * el que ya se está no toca el documento ni deja un paso de deshacer vacío.
   * Las capas nacidas después del estado se dejan como están y se informan: el
   * estado no contiene ninguna intención sobre ellas.
   */
  const restoreState = useCallback((name: string) => {
    const { host, rows, commit, notify } = live.current;
    const state = host.findState(name);
    if (!state) return;
    const plan = planCadLayerStateRestore(state, rows.current);
    if (!plan.patches.length) {
      notify.info(`El dibujo ya está en el estado «${name}».`);
      return;
    }
    commit(
      (document) =>
        plan.patches.reduce(
          (current, entry) =>
            updateCadDocumentLayer(current, entry.id, entry.patch),
          document,
        ),
      plan.unknown.length
        ? `Estado «${name}» restaurado; ${plan.unknown.length} capa(s) nueva(s) sin tocar.`
        : `Estado «${name}» restaurado.`,
    );
  }, []);

  const deleteState = useCallback((name: string) => {
    live.current.host.deleteState(name);
  }, []);

  return {
    setLinetype,
    setLineweight,
    setPlot,
    hideEmpty,
    toggleViewportFreeze,
    saveState,
    restoreState,
    deleteState,
  };
}
