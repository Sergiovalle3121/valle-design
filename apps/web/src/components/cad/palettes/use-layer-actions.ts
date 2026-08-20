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
import {
  captureCadLayerState,
  deleteCadDocumentLayerState,
  restoreCadDocumentLayerState,
  upsertCadDocumentLayerState,
} from "@/lib/cad/layer-states";
import type { CadLayerManagerHost } from "./layer-manager-host";
import type { CadLayerManagerRow } from "./layer-manager-model";

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
  setFrozen: (id: string, frozen: boolean) => void;
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
   * Congela o descongela la capa A NIVEL DE DOCUMENTO (esquema 9).
   *
   * La capa ACTIVA se niega con el porqué, igual que LAYFRZ y -LAYER: los
   * objetos nuevos irían a una capa que ni se dibuja ni cuenta, y nadie los
   * volvería a ver. Descongelar BORRA la clave en vez de escribir `false`,
   * para que el opcional-ausente del esquema no se materialice.
   */
  const setFrozen = useCallback((id: string, frozen: boolean) => {
    const { rows, commit, notify } = live.current;
    if (frozen && rows.current.some((row) => row.id === id && row.active)) {
      notify.error(
        `«${id}» es la capa activa y no se puede congelar. Activa otra capa primero.`,
      );
      return;
    }
    commit(
      (document) =>
        commitChange(
          {
            ...document,
            layers: document.layers.map((layer) => {
              if (layer.id !== id) return layer;
              if (frozen) return { ...layer, frozen: true };
              const { frozen: _thawed, ...thawed } = layer;
              return thawed;
            }),
          },
          `layer:${frozen ? "freeze" : "thaw"}:${id}`,
        ),
      `Capa ${id} ${frozen ? "congelada: ni se dibuja, ni se regenera, ni cuenta" : "descongelada"}.`,
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

  /**
   * Guarda el estado EN EL DOCUMENTO (esquema 9): sobrevive a la recarga y
   * viaja con el plano — la misma escritura que hace LAYERSTATE Guardar. La
   * foto sale de `document.layers` dentro del propio commit, no de las filas
   * de la interfaz: una sola fuente de verdad, la canónica.
   */
  const saveState = useCallback(() => {
    const { host, commit } = live.current;
    const name = host.draftStateName.trim();
    if (!name) return;
    const saved = commit(
      (document) =>
        upsertCadDocumentLayerState(document, captureCadLayerState(name, document.layers)),
      `Estado de capa «${name}» guardado en el documento.`,
    );
    if (saved) host.setDraftStateName("");
  }, []);

  /**
   * Restaura un estado como UNA transacción y UN paso de deshacer. El helper
   * devuelve el MISMO documento cuando no hay nada que cambiar, y la puerta
   * canónica del editor convierte eso en «no había cambios» sin ensuciar el
   * historial.
   */
  const restoreState = useCallback((name: string) => {
    live.current.commit(
      (document) => restoreCadDocumentLayerState(document, name),
      `Estado «${name}» restaurado.`,
    );
  }, []);

  const deleteState = useCallback((name: string) => {
    live.current.commit(
      (document) => deleteCadDocumentLayerState(document, name),
      `Estado «${name}» borrado del documento.`,
    );
  }, []);

  return {
    setLinetype,
    setLineweight,
    setPlot,
    hideEmpty,
    setFrozen,
    toggleViewportFreeze,
    saveState,
    restoreState,
    deleteState,
  };
}
