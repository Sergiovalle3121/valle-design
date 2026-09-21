export type CadToolbarActionId =
  | "select"
  | "pan"
  | "measure"
  | "line"
  | "polyline"
  | "rect"
  | "circle"
  | "move"
  | "copy"
  | "offset"
  | "aisle"
  | "zone"
  | "equipment"
  | "text"
  | "fit_view"
  | "undo"
  | "redo";

export interface CadToolbarAction {
  id: CadToolbarActionId;
  label: string;
  shortcut?: string;
  group: "navigate" | "draw" | "insert" | "history";
  description: string;
}

/**
 * LA PALETA, PODADA (ola1-paleta, 2026-09-19).
 *
 * De los diecisiete controles que tenía la columna flotante quedan TRES: los
 * que no son una orden sino navegación de cámara. Once eran duplicados
 * exactos de un botón de la cinta —Distancia=DIST, Línea=LINE,
 * Polilínea=PLINE, Rectángulo=RECTANG, Círculo=CIRCLE, Mover=MOVE,
 * Copiar=COPY, Desfase=OFFSET, Texto=TEXT, Deshacer=U, Rehacer=REDO— y tres
 * más (Pasillo, Área, Símbolos) eran vocabulario industrial heredado que no
 * pertenece a la superficie general del producto (ver IDENTITY.md); ninguno
 * de los catorce se declara ya como ACCIÓN DE PALETA.
 *
 * `CadToolPalette.spec.ts` cruza esta lista contra `cadRibbonExposedNames()`
 * y afirma que es EXACTAMENTE {select, pan, fit_view} — cero duplicados,
 * verificado por código.
 *
 * EL REGISTRO DE COMANDOS NO SE TOCA: `CadToolbarActionId` sigue siendo la
 * unión cerrada de siempre porque los catorce ids retirados de aquí siguen
 * siendo destinos válidos de `runToolbarAction` (el switch de
 * `Layout3DEditor.tsx`) y de `TOOLBAR_SHORTCUT_IDS`
 * (`editor-keyboard.ts`) — sus atajos de una letra (L, C, I, T…) y su
 * despacho por `commandEngineRef.invoke(...)` desde la cinta no cambian. Lo
 * único que se retira es EL BOTÓN FLOTANTE que los duplicaba.
 */
export const CAD_TOOLBAR_ACTIONS: CadToolbarAction[] = [
  {
    id: "select",
    label: "Seleccionar",
    group: "navigate",
    description: "Seleccionar y mover objetos.",
  },
  {
    id: "pan",
    label: "Encuadre",
    shortcut: "Space",
    group: "navigate",
    description: "Navegar el plano sin cambiar la geometria.",
  },
  {
    id: "fit_view",
    label: "Ajustar todo",
    group: "navigate",
    description: "Encuadrar el dibujo completo.",
  },
];

export function toolbarActionsByGroup(
  group: CadToolbarAction["group"],
): CadToolbarAction[] {
  return CAD_TOOLBAR_ACTIONS.filter((action) => action.group === group);
}

export function findToolbarAction(
  id: CadToolbarActionId,
): CadToolbarAction | undefined {
  return CAD_TOOLBAR_ACTIONS.find((action) => action.id === id);
}
