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
    description: "Navegar el plano sin cambiar geometría.",
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
    group: "draw",
    description: "Preparar creación de pasillos/holguras.",
  },
  {
    id: "connector",
    label: "Connector",
    group: "draw",
    description: "Conectar flujo entre estaciones.",
  },
  {
    id: "zone",
    label: "Zone",
    group: "insert",
    description: "Insertar zona/rectángulo de layout.",
  },
  {
    id: "equipment",
    label: "Equipment",
    group: "insert",
    description: "Abrir paleta de equipo.",
  },
  {
    id: "text",
    label: "Text",
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
    description: "Deshacer el último cambio.",
  },
  {
    id: "redo",
    label: "Redo",
    shortcut: "Ctrl+Shift+Z",
    group: "history",
    description: "Rehacer el último cambio.",
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
