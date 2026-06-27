export interface CadKeyboardShortcut {
  id: string;
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
  { id: "select", label: "Select", key: "v", description: "Modo selección." },
  {
    id: "measure",
    label: "Measure",
    key: "m",
    description: "Herramienta de medición.",
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
    id: "cancel",
    label: "Cancel",
    key: "escape",
    description: "Cancelar herramienta actual.",
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
