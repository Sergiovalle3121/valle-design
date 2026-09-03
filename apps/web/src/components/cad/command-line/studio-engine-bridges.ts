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
 * - `history`: `U`, `UNDO` y `REDO` viajan por la MISMA pila que Ctrl+Z. El
 *   editor expone `undo()`/`redo()` que no devuelven nada, así que el éxito se
 *   MIDE aquí comparando la profundidad antes y después — que es la única forma
 *   honesta de que la línea de comandos diga «Deshecho: 3 operaciones» y no un
 *   «Hecho» que se inventa lo que pasó.
 * - `osnapOverride`, `visualStyle`, `linetypeScale`, `preview`, `cursor` y
 *   `apply`: cables que vivían en el monolito sin necesitarlo. `apply` en
 *   particular eran DIECISÉIS líneas de política —quién queda designado tras
 *   una orden, y qué bloque hay que reversionar— que no tocan React ni THREE.
 *   Bajarlos aquí es lo que paga las líneas que `history`, el anclaje de la
 *   rueda y el doble clic cuestan allí, y el presupuesto sólo puede encoger.
 */
import type { CadDocument } from "@/lib/cad/cad-document";
import type { CadEntityCommand } from "@/lib/cad/entity-commands";
import type { CadPreviewPath } from "@/lib/cad/engine/command-types";
import type { SnapType } from "@/lib/cad/snap-engine";
import type { CadVisualStyleId } from "@/lib/cad/view/visual-styles";
import type { CadStudioCommandEngineOptions } from "./use-command-engine";

export interface CadStudioEngineBridgeInputs {
  /** Documento vivo por ACCESOR: se evalúa al despachar, nunca en el render. */
  document: () => CadDocument | null;
  /** Pestaña abierta (`null` = espacio modelo) y su setter real. */
  activePaperSpaceId: string | null;
  setActivePaperSpaceId: (id: string | null) => void;
  /** El setter canónico de selección del editor. */
  selectNative: (ids: string[]) => void;
  /**
   * La pila de deshacer viva y las dos acciones del editor.
   *
   * Se pide la REF y no una lectura, porque `UNDO 3` da tres pasos dentro del
   * mismo turno y una profundidad capturada en el render diría tres veces lo
   * mismo. La ref se lee después de cada paso, que es cuando la respuesta
   * cambia.
   */
  history: { current: { depths(): { undo: number; redo: number } } | null };
  undo: () => void;
  redo: () => void;
  /** Modos de captura forzados por el paso actual del motor. */
  osnapOverrideRef: { current: readonly SnapType[] | null };
  /** El visor de sólidos, si esta sesión lo tiene montado. */
  solidShadeHost: { current: { applyVisualStyle(style: CadVisualStyleId): string } | null };
  /** LTSCALE es del DOCUMENTO: se lee de `meta` y se escribe por la fachada. */
  setLinetypeScale: (value: number) => void;
  /** ¿La orden en curso la arrancó el PUNTERO (barra) o el teclado? */
  startedByPointer: () => boolean;
  /** El embudo de mutación canónico del editor, con lo que queda designado. */
  commit: (commands: CadEntityCommand[], created?: readonly string[]) => void;
  /** Reversiona la fila de la biblioteca cuando BLOCK redefine un bloque. */
  syncRedefinedBlock: (blockId: string) => void;
  /** Posición viva del puntero en unidades de dibujo. */
  cursor: { current: { x: number; y: number } | null };
  /** Banda elástica del paso actual. */
  drawPreview: (paths: readonly CadPreviewPath[]) => void;
}

export function cadStudioEngineBridges(
  inputs: CadStudioEngineBridgeInputs,
): Pick<
  CadStudioCommandEngineOptions,
  | "activeLayout"
  | "setSelection"
  | "setSpace"
  | "openPageSetup"
  | "history"
  | "osnapOverride"
  | "visualStyle"
  | "linetypeScale"
  | "apply"
  | "cursor"
  | "preview"
> {
  const {
    document,
    activePaperSpaceId,
    setActivePaperSpaceId,
    selectNative,
    history,
    undo,
    redo,
    osnapOverrideRef,
    solidShadeHost,
    setLinetypeScale,
    startedByPointer,
    commit,
    syncRedefinedBlock,
    cursor,
    drawPreview,
  } = inputs;
  /** Da un paso y dice si de verdad lo dio: la profundidad tiene que bajar. */
  const step = (direction: "undo" | "redo", run: () => void) => (): boolean => {
    const before = history.current?.depths()[direction] ?? 0;
    if (before === 0) return false;
    run();
    return (history.current?.depths()[direction] ?? 0) < before;
  };
  return {
    activeLayout: activePaperSpaceId,
    cursor,
    preview: drawPreview,
    apply: (commands) => {
      // Dibujar con la BARRA deja lo creado designado (como el camino
      // heredado); tecleado NO: la línea de comandos nunca designó, y designar
      // cambiaría lo que ve la orden siguiente (p. ej. un HATCH tras un MTEXT).
      const created = startedByPointer()
        ? commands.flatMap((command) =>
            command.type === "insert" ? [command.entity.id] : [],
          )
        : [];
      commit([...commands], created.length ? created : undefined);
      // BLOCK «¿Redefinirlo? Sí» sale del motor como op:redefine: la fila de la
      // biblioteca del despacho tiene que versionarse igual que cuando el panel
      // redefinía por su cuenta, o el catálogo enseña la silla vieja.
      for (const command of commands)
        if (command.type === "block" && command.op === "redefine")
          syncRedefinedBlock(command.definition.id);
    },
    linetypeScale: {
      get: () => document()?.meta.linetypeScale ?? 1,
      set: setLinetypeScale,
    },
    history: { undo: step("undo", undo), redo: step("redo", redo) },
    osnapOverride: (modes) => {
      osnapOverrideRef.current = modes;
    },
    // VSCURRENT/SHADEMODE: estado del visor, no del documento.
    visualStyle: (styleId) => solidShadeHost.current?.applyVisualStyle(styleId) ?? null,
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
