/**
 * Los cables del estudio hacia el motor de comandos que la campaña de
 * cimientos conectó: designación real, hoja activa y cambio de espacio.
 *
 * Viven aquí y no en `Layout3DEditor.tsx` por el presupuesto del monolito
 * (sólo puede encoger) — y porque son lógica pura sobre el documento y dos
 * setters, probable sin montar el editor.
 *
 * - `setSelection`: QSELECT y FILTER designan por el MISMO camino que un clic.
 * - `activeLayout`: LAYOUT, PLOT y PAGESETUP operan sobre la pestaña ACTIVA,
 *   no sobre la primera hoja del documento.
 * - `setSpace`: MSPACE/PSPACE/MODEL cambian la pestaña real. Devuelve si DE
 *   VERDAD cambió — pedir espacio papel en un dibujo sin presentaciones no
 *   puede afirmar un cambio que no ocurrió (el éxito falso que la auditoría
 *   de integridad señaló).
 * - `openPageSetup`: la forma de cuadro de PAGESETUP activa la hoja, que es
 *   donde viven sus controles.
 */
import type { CadDocument } from "@/lib/cad/cad-document";
import type { CadStudioCommandEngineOptions } from "./use-command-engine";

export interface CadStudioEngineBridgeInputs {
  /** Documento vivo por ACCESOR: se evalúa al despachar, nunca en el render. */
  document: () => CadDocument | null;
  /** Pestaña abierta (`null` = espacio modelo) y su setter real. */
  activePaperSpaceId: string | null;
  setActivePaperSpaceId: (id: string | null) => void;
  /** El setter canónico de selección del editor. */
  selectNative: (ids: string[]) => void;
}

export function cadStudioEngineBridges(
  inputs: CadStudioEngineBridgeInputs,
): Pick<
  CadStudioCommandEngineOptions,
  "activeLayout" | "setSelection" | "setSpace" | "openPageSetup"
> {
  const { document, activePaperSpaceId, setActivePaperSpaceId, selectNative } =
    inputs;
  return {
    activeLayout: activePaperSpaceId,
    setSelection: (entityIds) => selectNative([...entityIds]),
    setSpace: (space, layoutId) => {
      if (space === "model") {
        setActivePaperSpaceId(null);
        return true;
      }
      const spaces = document()?.paperSpaces ?? [];
      const target = layoutId
        ? spaces.find((candidate) => candidate.id === layoutId)
        : (spaces.find((candidate) => candidate.id === activePaperSpaceId) ??
          spaces[0]);
      if (!target) return false;
      setActivePaperSpaceId(target.id);
      return true;
    },
    openPageSetup: (layoutId) => {
      const spaces = document()?.paperSpaces ?? [];
      if (spaces.some((candidate) => candidate.id === layoutId))
        setActivePaperSpaceId(layoutId);
    },
  };
}
