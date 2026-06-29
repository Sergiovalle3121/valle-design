export type CadToolbarActionId =
  | "select"
  | "pan"
  | "measure"
  | "aisle"
  | "connector"
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
    description: "Navegar el plano sin cambiar geometria.",
  },
  {
    id: "measure",
    label: "Measure",
    shortcut: "M",
    group: "draw",
    description: "Medir distancia entre puntos.",
  },
  {
    id: "aisle",
    label: "Aisle",
    shortcut: "A",
    group: "draw",
    description: "Preparar creacion de pasillos/holguras.",
  },
  {
    id: "connector",
    label: "Connector",
    shortcut: "L",
    group: "draw",
    description: "Conectar flujo entre estaciones.",
  },
  {
    id: "zone",
    label: "Zone",
    shortcut: "Z",
    group: "insert",
    description: "Insertar zona/rectangulo de layout.",
  },
  {
    id: "equipment",
    label: "Equipment",
    shortcut: "I",
    group: "insert",
    description: "Abrir paleta de equipo.",
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
    description: "Enfocar el layout.",
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
