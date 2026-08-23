export type CadKeyboardShortcutId =
  | "palette"
  | "select"
  | "measure"
  | "line"
  | "polyline"
  | "rect"
  | "circle"
  | "offset"
  | "aisle"
  | "connector"
  | "zone"
  | "equipment"
  | "text"
  | "fit_view"
  | "undo"
  | "redo"
  | "save"
  | "cancel"
  | "grid_toggle"
  | "grid_snap_toggle"
  | "object_snap_toggle"
  | "ortho_toggle"
  | "polar_tracking_toggle"
  | "object_tracking_toggle"
  | "dynamic_input_toggle"
  | "validate_layout"
  | "export_dxf"
  // Kit diario (VD-CAD-XFORM-001/MIRROR-001): transformaciones directas.
  | "rotate"
  | "scale"
  | "mirror";

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
    id: "line",
    label: "Line",
    key: "l",
    description: "Trazar muros por segmentos encadenados.",
  },
  {
    id: "polyline",
    label: "Polyline",
    key: "p",
    description: "Trazar polilínea CAD de muros.",
  },
  {
    id: "rect",
    label: "Rectangle",
    key: "b",
    description: "Dibujar un rectangulo desde dos esquinas.",
  },
  {
    id: "circle",
    label: "Circle",
    key: "c",
    description: "Dibujar círculo por centro y radio o diámetro.",
  },
  {
    id: "offset",
    label: "Offset",
    key: "o",
    shift: true,
    description: "Desfasar la selección por distancia exacta.",
  },
  {
    id: "aisle",
    label: "Corridor",
    key: "a",
    description: "Preparar un pasillo o una holgura desde el comando CAD.",
  },
  {
    id: "connector",
    label: "Connector",
    key: "l",
    shift: true,
    description: "Unir con una polilinea los objetos seleccionados.",
  },
  {
    id: "zone",
    label: "Area",
    key: "z",
    description: "Insertar un area rectangular editable.",
  },
  {
    id: "equipment",
    label: "Symbols",
    key: "i",
    description: "Abrir la biblioteca de simbolos y bloques.",
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
    description: "Encuadrar el dibujo completo.",
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
    id: "save",
    label: "Save",
    key: "s",
    ctrl: true,
    description: "Guardar el documento canónico.",
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
    id: "object_snap_toggle",
    label: "Object snap",
    key: "f3",
    description: "Activar o desactivar snaps a objetos/DXF.",
  },
  // Las teclas F de AutoCAD que faltaban: F7 es una segunda entrada del mismo
  // id que la G (el patrón que ya siguen O y F3), F9 y F12 son ids nuevos. El
  // cuadro DSETTINGS ya pintaba los hints F7/F9 sin que las teclas existieran.
  {
    id: "grid_toggle",
    label: "Grid",
    key: "f7",
    description: "Mostrar u ocultar la grilla.",
  },
  {
    id: "grid_snap_toggle",
    label: "Grid snap",
    key: "f9",
    description: "Forzar o soltar el cursor a la rejilla.",
  },
  {
    id: "dynamic_input_toggle",
    label: "Dynamic input",
    key: "f12",
    description: "Mostrar u ocultar la entrada dinámica junto al cursor.",
  },
  {
    id: "ortho_toggle",
    label: "Ortho",
    key: "f8",
    description: "Restringir el dibujo a ejes ortogonales.",
  },
  {
    id: "polar_tracking_toggle",
    label: "Polar tracking",
    key: "f10",
    description: "Activar o desactivar el rastreo polar incremental.",
  },
  {
    id: "object_tracking_toggle",
    label: "Object snap tracking",
    key: "f11",
    description: "Rastrear ejes desde puntos OSNAP adquiridos.",
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
  {
    id: "rotate",
    label: "Rotar",
    key: "r",
    description: "Rotar la seleccion (pide grados).",
  },
  {
    id: "scale",
    label: "Escalar",
    key: "s",
    description: "Escalar la seleccion (pide factor).",
  },
  {
    id: "mirror",
    label: "Espejo",
    key: "x",
    description: "Espejo de la seleccion (eje vertical).",
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
