export type CadKeyboardShortcutId =
  | "palette"
  | "select"
  | "measure"
  | "aisle"
  | "connector"
  | "zone"
  | "equipment"
  | "text"
  | "fit_view"
  | "undo"
  | "redo"
  | "cancel"
  | "grid_toggle"
  | "object_snap_toggle"
  | "validate_layout"
  | "export_dxf";

export interface CadKeyboardShortcut {
  id: CadKeyboardShortcutId;
  label: string;
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
}
export interface CadKeyboardEventLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

export const CAD_KEYBOARD_SHORTCUTS: CadKeyboardShortcut[] = [
  {
    id: "palette",
    label: "Command palette",
    key: "k",
    ctrl: true,
    description: "Abrir Cmd-K CAD.",
  },
  { id: "select", label: "Select", key: "v", description: "Modo seleccion." },
  {
    id: "measure",
    label: "Measure",
    key: "m",
    description: "Herramienta de medicion.",
  },
  {
    id: "aisle",
    label: "Aisle",
    key: "a",
    description: "Preparar pasillo/holgura desde el comando CAD.",
  },
  {
    id: "connector",
    label: "Connector",
    key: "l",
    description: "Conectar flujo de la linea seleccionada.",
  },
  {
    id: "zone",
    label: "Zone",
    key: "z",
    description: "Insertar zona rectangular editable.",
  },
  {
    id: "equipment",
    label: "Equipment",
    key: "i",
    description: "Abrir biblioteca de equipo y simbolos.",
  },
  {
    id: "text",
    label: "Text",
    key: "t",
    description: "Agregar nota de texto.",
  },
  {
    id: "fit_view",
    label: "Fit view",
    key: "f",
    description: "Enfocar layout.",
  },
  { id: "undo", label: "Undo", key: "z", ctrl: true, description: "Deshacer." },
  {
    id: "redo",
    label: "Redo",
    key: "z",
    ctrl: true,
    shift: true,
    description: "Rehacer.",
  },
  {
    id: "redo",
    label: "Redo",
    key: "y",
    ctrl: true,
    description: "Rehacer.",
  },
  {
    id: "cancel",
    label: "Cancel",
    key: "escape",
    description: "Cancelar herramienta actual.",
  },
  {
    id: "grid_toggle",
    label: "Grid",
    key: "g",
    description: "Mostrar u ocultar la grilla.",
  },
  {
    id: "object_snap_toggle",
    label: "Object snap",
    key: "o",
    description: "Activar o desactivar snaps a objetos/DXF.",
  },
  {
    id: "validate_layout",
    label: "Validate layout",
    key: "v",
    shift: true,
    description: "Ejecutar revision de diseno del layout.",
  },
  {
    id: "export_dxf",
    label: "Export DXF",
    key: "e",
    description: "Abrir exportacion DXF profesional.",
  },
];

export function matchCadShortcut(
  event: CadKeyboardEventLike,
  shortcuts = CAD_KEYBOARD_SHORTCUTS,
): CadKeyboardShortcut | undefined {
  const key = event.key.toLowerCase();
  const ctrl = !!(event.ctrlKey || event.metaKey);
  return shortcuts.find(
    (shortcut) =>
      shortcut.key.toLowerCase() === key &&
      !!shortcut.ctrl === ctrl &&
      !!shortcut.shift === !!event.shiftKey &&
      !!shortcut.alt === !!event.altKey,
  );
}
export function cadShortcutLabel(shortcut: CadKeyboardShortcut): string {
  return [
    shortcut.ctrl ? "Ctrl" : null,
    shortcut.shift ? "Shift" : null,
    shortcut.alt ? "Alt" : null,
    shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key,
  ]
    .filter(Boolean)
    .join("+");
}
