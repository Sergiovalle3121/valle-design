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

export const CAD_TOOLBAR_ACTIONS: CadToolbarAction[] = [
  {
    id: "select",
    label: "Select",
    shortcut: "V",
    group: "navigate",
    description: "Seleccionar y mover objetos.",
  },
  {
    id: "pan",
    label: "Pan",
    shortcut: "Space",
    group: "navigate",
    description: "Navegar el plano sin cambiar la geometria.",
  },
  {
    id: "measure",
    label: "Measure",
    shortcut: "M",
    group: "draw",
    description: "Medir distancia entre puntos.",
  },
  {
    id: "line",
    label: "Line",
    shortcut: "L",
    group: "draw",
    description: "Trazar muros por segmentos encadenados con precisión.",
  },
  {
    id: "polyline",
    label: "Pline",
    shortcut: "P",
    group: "draw",
    description: "Trazar una polilínea de muros y terminar con Enter.",
  },
  {
    id: "rect",
    label: "Rect",
    shortcut: "B",
    group: "draw",
    description: "Dibujar un rectangulo desde dos esquinas.",
  },
  {
    id: "circle",
    label: "Circle",
    shortcut: "C",
    group: "draw",
    description: "Dibujar un círculo por centro y radio o diámetro.",
  },
  // MOVE y COPY existían en la máquina de comandos (`cad-command.ts`), en
  // `CAD_DRAW_TOOLS` y en sus pruebas unitarias, pero NO tenían entrada de
  // barra ni de paleta: el comando estaba implementado y era inalcanzable.
  // Ahora se exponen, y su mutación es la canónica —la misma que los botones
  // del panel—, así que heredan capa bloqueada, atomicidad y undo/redo.
  // Sin `shortcut`: el registro de teclado (`keyboard-shortcuts.ts`) es otra
  // lista, y anunciar una combinación que no está dada de alta sería una
  // etiqueta falsa en la interfaz.
  {
    id: "move",
    label: "Move",
    group: "draw",
    description: "Desplazar la selección de un punto base a un punto destino.",
  },
  {
    id: "copy",
    label: "Copy",
    group: "draw",
    description: "Duplicar la selección de un punto base a un punto destino.",
  },
  {
    id: "offset",
    label: "Offset",
    shortcut: "Shift+O",
    group: "draw",
    description: "Desfasar la selección por una distancia exacta.",
  },
  {
    id: "aisle",
    label: "Corridor",
    shortcut: "A",
    group: "draw",
    description: "Preparar un pasillo o una holgura entre dos objetos.",
  },
  {
    id: "zone",
    label: "Area",
    shortcut: "Z",
    group: "insert",
    description: "Insertar un area rectangular editable.",
  },
  {
    id: "equipment",
    label: "Symbols",
    shortcut: "I",
    group: "insert",
    description: "Abrir la biblioteca de simbolos y bloques.",
  },
  {
    id: "text",
    label: "Text",
    shortcut: "T",
    group: "insert",
    description: "Agregar etiqueta o nota.",
  },
  {
    id: "fit_view",
    label: "Fit",
    shortcut: "F",
    group: "navigate",
    description: "Encuadrar el dibujo completo.",
  },
  {
    id: "undo",
    label: "Undo",
    shortcut: "Ctrl+Z",
    group: "history",
    description: "Deshacer el ultimo cambio.",
  },
  {
    id: "redo",
    label: "Redo",
    shortcut: "Ctrl+Shift+Z",
    group: "history",
    description: "Rehacer el ultimo cambio.",
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
