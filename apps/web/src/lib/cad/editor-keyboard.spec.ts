/**
 * Caracterización del intérprete de teclado del estudio: un caso por rama
 * del manejador histórico, incluidas las precedencias que un refactor rompe
 * primero (editable→ignorar, solo-lectura antes que todo, caminata se traga
 * lo que no es Esc, la cascada de Escape en su orden exacto).
 */
import { strict as assert } from "node:assert";
import {
  interpretEditorKeyAfterEngine,
  interpretEditorKeyBeforeEngine,
  isReadOnlyMutationKey,
  type EditorKeyContextAfterEngine,
  type EditorKeyContextBeforeEngine,
  type EditorKeyEventLike,
} from "./editor-keyboard";
import { CAD_KEYBOARD_SHORTCUTS } from "./keyboard-shortcuts";

function key(partial: Partial<EditorKeyEventLike>): EditorKeyEventLike {
  return {
    key: "",
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    targetKind: "other",
    ...partial,
  };
}

const BEFORE: EditorKeyContextBeforeEngine = {
  readOnly: false,
  walkMode: false,
  workspaceShortcuts: CAD_KEYBOARD_SHORTCUTS,
};

const AFTER: EditorKeyContextAfterEngine = {
  gridSize: 100,
  hasSelection: false,
  hasNativeSelection: false,
  hatchPickMode: false,
  paletteOpen: false,
  commandPreviewOpen: false,
  commandTextPending: false,
  drawCommandActive: false,
  toolIsSelect: true,
  hasDomTextSelection: false,
};

let checks = 0;
function eq(actual: unknown, expected: unknown, message: string): void {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

// ─── Fase 1: antes del motor ─────────────────────────────────────────────────

eq(
  interpretEditorKeyBeforeEngine(
    key({ key: "Delete", targetKind: "editable" }),
    BEFORE,
  ),
  null,
  "un campo editable se queda con sus teclas",
);
eq(
  interpretEditorKeyBeforeEngine(key({ key: "Delete" }), {
    ...BEFORE,
    readOnly: true,
  }),
  { type: "notify-read-only" },
  "solo lectura ataja una tecla mutadora antes que nada",
);
eq(
  interpretEditorKeyBeforeEngine(key({ key: "f" }), {
    ...BEFORE,
    readOnly: true,
  }),
  { type: "toolbar", id: "fit_view" },
  "solo lectura deja pasar una tecla de navegación (fit_view es de lectura)",
);
eq(
  interpretEditorKeyBeforeEngine(key({ key: "1", ctrlKey: true }), BEFORE),
  { type: "reveal-properties" },
  "Ctrl+1 revela propiedades",
);
eq(
  interpretEditorKeyBeforeEngine(key({ key: "8", metaKey: true }), BEFORE),
  { type: "toggle-styles" },
  "Cmd+8 abre estilos",
);
eq(
  interpretEditorKeyBeforeEngine(key({ key: "9", ctrlKey: true }), BEFORE),
  { type: "toggle-draft-settings" },
  "Ctrl+9 abre DSETTINGS",
);
eq(
  interpretEditorKeyBeforeEngine(
    key({ key: "Escape" }),
    { ...BEFORE, walkMode: true },
  ),
  { type: "toggle-walk" },
  "en caminata, Esc sale",
);
eq(
  interpretEditorKeyBeforeEngine(key({ key: "w" }), {
    ...BEFORE,
    walkMode: true,
  }),
  null,
  "en caminata, WASD no es del editor",
);
{
  const measure = interpretEditorKeyBeforeEngine(key({ key: "m" }), BEFORE);
  eq(measure, { type: "toolbar", id: "measure" }, "m despacha a la barra");
}
{
  const save = interpretEditorKeyBeforeEngine(
    key({ key: "s", ctrlKey: true }),
    BEFORE,
  );
  eq(save, { type: "save" }, "Ctrl+S guarda");
}
eq(
  interpretEditorKeyBeforeEngine(key({ key: "q" }), BEFORE),
  null,
  "una tecla sin registro cae a la fase 2",
);

// La precedencia caminata-vs-barra: el modo caminata va ANTES de despachar a
// la barra, así que «m» en caminata NO mide.
eq(
  interpretEditorKeyBeforeEngine(key({ key: "m" }), {
    ...BEFORE,
    walkMode: true,
  }),
  null,
  "caminata se traga los atajos de barra",
);

// ─── Fase 2: la cascada de Escape, en orden ──────────────────────────────────

const escapeOrder: Array<[Partial<EditorKeyContextAfterEngine>, string]> = [
  [{ hatchPickMode: true, paletteOpen: true }, "exit-hatch-pick"],
  [{ paletteOpen: true, commandPreviewOpen: true }, "close-palette"],
  [{ commandPreviewOpen: true, commandTextPending: true }, "clear-preview"],
  [{ commandTextPending: true, drawCommandActive: true }, "clear-command-text"],
  [{ drawCommandActive: true, toolIsSelect: false }, "cancel-draw"],
  [{ toolIsSelect: false, hasSelection: true }, "reset-tool"],
  [{ hasSelection: true }, "clear-selection"],
  [{}, "none"],
];
for (const [ctx, step] of escapeOrder) {
  eq(
    interpretEditorKeyAfterEngine(key({ key: "Escape" }), { ...AFTER, ...ctx }),
    { type: "escape", step },
    `Escape con ${JSON.stringify(ctx)} → ${step}`,
  );
}

// ─── Fase 2: edición y selección ─────────────────────────────────────────────

const SEL = { ...AFTER, hasSelection: true };
const NATIVE = { ...AFTER, hasNativeSelection: true };

eq(
  interpretEditorKeyAfterEngine(key({ key: "?" }), AFTER),
  { type: "toggle-help" },
  "? abre la ayuda",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: "a", ctrlKey: true }), AFTER),
  { type: "select-all" },
  "Ctrl+A selecciona todo",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: "z", ctrlKey: true }), AFTER),
  { type: "undo" },
  "Ctrl+Z deshace",
);
eq(
  interpretEditorKeyAfterEngine(
    key({ key: "Z", ctrlKey: true, shiftKey: true }),
    AFTER,
  ),
  { type: "redo" },
  "Ctrl+Shift+Z rehace",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: "y", metaKey: true }), AFTER),
  { type: "redo" },
  "Cmd+Y rehace",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: "Enter" }), {
    ...AFTER,
    drawCommandActive: true,
  }),
  { type: "commit-draft" },
  "Enter con comando de dibujo abierto lo consuma",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: "Enter" }), AFTER),
  null,
  "Enter sin comando abierto no es del editor",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: "m" }), AFTER),
  { type: "toggle-measure" },
  "m (si el registro no la tomó) mide",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: "w" }), AFTER),
  { type: "toggle-wall" },
  "w alterna muro",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: "f" }), SEL),
  { type: "fit-view", target: "selection" },
  "f con selección encuadra la selección",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: "f" }), AFTER),
  { type: "fit-view", target: "all" },
  "f sin selección encuadra todo",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: "f", shiftKey: true }), AFTER),
  { type: "fit-view", target: "plant" },
  "Shift+F encuadra la planta",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: "\\" }), AFTER),
  { type: "toggle-focus-mode" },
  "\\\\ alterna modo enfoque",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: "Delete" }), SEL),
  { type: "delete-selection", native: false },
  "Delete borra la selección heredada",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: "Backspace" }), NATIVE),
  { type: "delete-selection", native: true },
  "Backspace borra la selección nativa",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: "Delete" }), AFTER),
  null,
  "Delete sin selección no hace nada",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: "r", shiftKey: true }), NATIVE),
  { type: "rotate-selection", deltaDeg: -15, native: true },
  "Shift+R rota −15°",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: "d", ctrlKey: true }), SEL),
  { type: "duplicate-selection", native: false },
  "Ctrl+D duplica",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: "c", ctrlKey: true }), SEL),
  { type: "copy-selection", native: false },
  "Ctrl+C copia la selección",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: "c", ctrlKey: true }), {
    ...SEL,
    hasDomTextSelection: true,
  }),
  null,
  "Ctrl+C respeta la copia de texto del DOM",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: "v", metaKey: true }), AFTER),
  { type: "paste" },
  "Cmd+V pega",
);
eq(
  interpretEditorKeyAfterEngine(
    key({ key: "g", ctrlKey: true, shiftKey: true }),
    SEL,
  ),
  { type: "ungroup" },
  "Ctrl+Shift+G desagrupa",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: "G", ctrlKey: true }), SEL),
  { type: "group" },
  "Ctrl+G agrupa",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: "ArrowLeft" }), SEL),
  { type: "nudge", dx: -100, dy: 0, native: false },
  "flecha izquierda empuja un paso de rejilla",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: "ArrowDown", shiftKey: true }), NATIVE),
  { type: "nudge", dx: 0, dy: 500, native: true },
  "Shift+flecha empuja cinco pasos",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: "ArrowUp" }), AFTER),
  null,
  "flecha sin selección no es del editor",
);

// ─── isReadOnlyMutationKey: la tabla que protege el modo lectura ─────────────

eq(isReadOnlyMutationKey(key({ key: "Delete" })), true, "Delete muta");
eq(isReadOnlyMutationKey(key({ key: "f" })), false, "f no muta");
eq(
  isReadOnlyMutationKey(key({ key: "s", ctrlKey: true })),
  true,
  "Ctrl+S muta",
);
eq(
  isReadOnlyMutationKey(key({ key: "x" }), "export_dxf"),
  false,
  "un atajo de solo lectura del registro no muta",
);
eq(
  isReadOnlyMutationKey(key({ key: "l" }), "line"),
  true,
  "un atajo de dibujo del registro muta",
);

console.log(`editor-keyboard: ${checks} comprobaciones verdes`);
