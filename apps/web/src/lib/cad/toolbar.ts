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

/*
 * Sin `shortcut` en Seleccionar, Distancia, Polilínea, Rectángulo, Pasillo,
 * Área y Ajustar todo: V, M, P, B, A, Z y F son alias de una letra de
 * acad.pgp (VIEW, MOVE, PAN, BLOCK, ARC, ZOOM, FILLET) y el lienzo ya no las
 * roba —la letra suelta es de la línea de comandos—. Anunciar una tecla que
 * no está dada de alta es una etiqueta falsa (ver arriba). Quedan L, C, I, T,
 * que coinciden con LINE, CIRCLE, INSERT y MTEXT.
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
    id: "measure",
    label: "Distancia",
    group: "draw",
    description: "Medir distancia entre puntos.",
  },
  {
    id: "line",
    label: "Línea",
    shortcut: "L",
    group: "draw",
    description: "Trazar muros por segmentos encadenados con precisión.",
  },
  {
    id: "polyline",
    label: "Polilínea",
    group: "draw",
    description: "Trazar una polilínea de muros y terminar con Enter.",
  },
  {
    id: "rect",
    label: "Rectángulo",
    group: "draw",
    description: "Dibujar un rectangulo desde dos esquinas.",
  },
  {
    id: "circle",
    label: "Círculo",
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
    label: "Mover",
    group: "draw",
    description: "Desplazar la selección de un punto base a un punto destino.",
  },
  {
    id: "copy",
    label: "Copiar",
    group: "draw",
    description: "Duplicar la selección de un punto base a un punto destino.",
  },
  {
    id: "offset",
    label: "Desfase",
    shortcut: "Shift+O",
    group: "draw",
    description: "Desfasar la selección por una distancia exacta.",
  },
  // Antes "Corridor": inglés y vocabulario del planificador industrial del
  // que nació el producto (ver IDENTITY.md). El comportamiento —preparar un
  // pasillo entre dos objetos seleccionados— es arquitectónico de verdad
  // (un pasillo es un espacio de circulación de cualquier plano) y ya está
  // endurecido contra el barrido de cables sueltos (`cables-sueltos.spec.ts`);
  // sólo cambia la etiqueta, nunca el id ni el despacho.
  {
    id: "aisle",
    label: "Pasillo",
    group: "draw",
    description: "Preparar un pasillo o una holgura entre dos objetos.",
  },
  // Antes "Area": mismo defecto que "Corridor" arriba, misma corrección —
  // sólo la etiqueta pasa a español; el id "zone" y su despacho no cambian.
  {
    id: "zone",
    label: "Área",
    group: "insert",
    description: "Insertar un área rectangular editable.",
  },
  {
    id: "equipment",
    label: "Símbolos",
    shortcut: "I",
    group: "insert",
    description: "Abrir la biblioteca de simbolos y bloques.",
  },
  {
    id: "text",
    label: "Texto",
    shortcut: "T",
    group: "insert",
    description: "Agregar etiqueta o nota.",
  },
  {
    id: "fit_view",
    label: "Ajustar todo",
    group: "navigate",
    description: "Encuadrar el dibujo completo.",
  },
  {
    id: "undo",
    label: "Deshacer",
    shortcut: "Ctrl+Z",
    group: "history",
    description: "Deshacer el ultimo cambio.",
  },
  {
    id: "redo",
    label: "Rehacer",
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
