/**
 * Caracterización del intérprete de teclado del estudio: un caso por rama
 * del manejador histórico, incluidas las precedencias que un refactor rompe
 * primero (editable→ignorar, solo-lectura antes que todo, caminata se traga
 * lo que no es Esc, la cascada de Escape en su orden exacto).
 */
import { strict as assert } from "node:assert";
import {
  editorKeyEventLike,
  interpretEditorKeyAfterEngine,
  interpretEditorKeyBeforeEngine,
  isCommandLineCharacter,
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
  // Los casos históricos de fase 1 se escriben con el muelle OCULTO: es el
  // único estado en el que una letra suelta sigue siendo del editor.
  commandLineOpen: false,
};
const OPEN: EditorKeyContextBeforeEngine = { ...BEFORE, commandLineOpen: true };

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

// ─── Fase 0: con la línea de comandos abierta, los caracteres son suyos ──────
// Medido antes: «l» arrancaba LINE sin Intro por el camino del puntero y
// «1», «,», «@» morían en el body.
for (const k of ["l", "L", "1", ",", ".", "@", "<", "-", "ñ", "("]) {
  eq(interpretEditorKeyBeforeEngine(key({ key: k }), OPEN), { type: "command-line" }, `«${k}» va a la línea de comandos`);
}
eq(interpretEditorKeyBeforeEngine(key({ key: "@", ctrlKey: true, altKey: true }), OPEN), { type: "command-line" }, "AltGr+2 («@» en es-ES) es un carácter");
eq(interpretEditorKeyBeforeEngine(key({ key: "@", altKey: true }), OPEN), { type: "command-line" }, "Option+2 («@» en Mac) es un carácter");
eq(interpretEditorKeyBeforeEngine(key({ key: "q", altKey: true }), OPEN), null, "Alt+letra en Linux/Windows enfoca sin insertar (medido): no se roba");
eq(interpretEditorKeyBeforeEngine(key({ key: "l" }), BEFORE), { type: "toolbar", id: "line" }, "con el muelle oculto, la letra del registro sigue siendo del editor (golden 19)");
for (const k of ["Enter", "Escape", "Delete", "Backspace", "F3", "ArrowLeft", "Tab", " ", "Dead", "Process", "Unidentified"]) {
  assert.notDeepEqual(interpretEditorKeyBeforeEngine(key({ key: k }), OPEN), { type: "command-line" }, `«${k}» nunca es un carácter de la caja`);
  checks += 1;
}
eq(interpretEditorKeyBeforeEngine(key({ key: "z", ctrlKey: true }), OPEN), { type: "toolbar", id: "undo" }, "Ctrl+Z sigue siendo deshacer con el muelle abierto");
eq(interpretEditorKeyBeforeEngine(key({ key: "1", ctrlKey: true }), OPEN), { type: "reveal-properties" }, "Ctrl+1 sigue revelando propiedades");
// Ctrl+2 y Ctrl+3, los dos que faltaban del juego de AutoCAD, y por su NOMBRE
// de comando: el atajo y teclear la orden tienen que ser la misma acción.
eq(interpretEditorKeyBeforeEngine(key({ key: "2", ctrlKey: true }), OPEN), { type: "invoke", command: "ADCENTER" }, "Ctrl+2 abre el DesignCenter");
eq(interpretEditorKeyBeforeEngine(key({ key: "3", ctrlKey: true }), OPEN), { type: "invoke", command: "TOOLPALETTES" }, "Ctrl+3 abre las paletas de herramientas");
eq(interpretEditorKeyBeforeEngine(key({ key: "a", isComposing: true }), OPEN), null, "una composición IME no es de nadie todavía");
eq(interpretEditorKeyBeforeEngine(key({ key: "l" }), { ...OPEN, walkMode: true }), null, "en caminata, la letra tampoco va a la caja");
eq(interpretEditorKeyBeforeEngine(key({ key: "l" }), { ...OPEN, readOnly: true }), { type: "notify-read-only" }, "en solo lectura, una orden mutadora avisa antes de ir a la caja");
eq(interpretEditorKeyBeforeEngine(key({ key: "?" }), OPEN), null, "«?» sigue siendo del editor (ayuda)");
eq(interpretEditorKeyBeforeEngine(key({ key: "\\" }), OPEN), null, "«\\» sigue siendo del editor (modo enfoque)");
eq(interpretEditorKeyBeforeEngine(key({ key: "c", targetKind: "control" }), OPEN), { type: "command-line" }, "con un botón enfocado, la letra va a la caja");
eq(isCommandLineCharacter(key({ key: " " })), false, "Espacio no es un carácter: es Intro");
eq(editorKeyEventLike({ key: "a", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, isComposing: false, target: { tagName: "BUTTON" } as unknown as EventTarget }).targetKind, "control", "BUTTON es un control");
eq(editorKeyEventLike({ key: "a", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, isComposing: false, target: { tagName: "DIV", isContentEditable: true } as unknown as EventTarget }).targetKind, "editable", "contentEditable es editable");
eq(editorKeyEventLike({ key: "a", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, isComposing: false, target: null }).targetKind, "other", "sin objetivo es «other»");

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
  interpretEditorKeyBeforeEngine(key({ key: "F3" }), {
    ...BEFORE,
    readOnly: true,
  }),
  { type: "osnap-toggle" },
  "solo lectura deja pasar una tecla de navegación (F3 es de lectura)",
);
eq(
  interpretEditorKeyBeforeEngine(key({ key: "f" }), BEFORE),
  null,
  "f suelta ya no encuadra: F=FILLET en acad.pgp, la letra suelta es de la línea de comandos",
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
  eq(measure, null, "m suelta ya no mide: M=MOVE en acad.pgp (medido: 13 letras robadas)");
  const line = interpretEditorKeyBeforeEngine(key({ key: "l" }), BEFORE);
  eq(line, { type: "toolbar", id: "line" }, "l sigue trazando: coincide con su alias LINE");
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
  { type: "repeat-last-command" },
  "Enter en reposo desde el lienzo repite el último comando, como en AutoCAD",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: " " }), AFTER),
  { type: "repeat-last-command" },
  "Espacio en reposo desde el lienzo repite el último comando",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: " " }), { ...AFTER, drawCommandActive: true }),
  { type: "commit-draft" },
  "Espacio con el borrador heredado abierto lo consuma, igual que Intro",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: "Enter", targetKind: "control" }), AFTER),
  null,
  "Intro sobre un botón enfocado es del botón (lo activa), no del editor",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: " ", targetKind: "control" }), { ...AFTER, drawCommandActive: true }),
  null,
  "Espacio sobre un botón enfocado tampoco se roba con borrador abierto",
);
// Las letras sueltas que eran alias de acad.pgp (M=MOVE, W=WBLOCK, F=FILLET)
// y la R que rotaba sin preguntar ya no son del editor en ninguna fase, con
// o sin selección, en minúscula o con Bloq Mayús.
for (const letra of ["m", "M", "w", "W", "f", "F", "r", "R"]) {
  for (const ctx of [AFTER, SEL, NATIVE]) {
    eq(interpretEditorKeyAfterEngine(key({ key: letra }), ctx), null, `«${letra}» suelta cae a la línea de comandos (selección: ${ctx.hasSelection || ctx.hasNativeSelection})`);
  }
}
eq(
  interpretEditorKeyAfterEngine(key({ key: "f", shiftKey: true }), AFTER),
  { type: "fit-view", target: "plant" },
  "Shift+F encuadra la planta",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: "F", shiftKey: true }), AFTER),
  { type: "fit-view", target: "plant" },
  "Shift+F con la mayúscula que el navegador entrega también encuadra",
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
// Ola D (2026-09-02): Ctrl+X corta al portapapeles de geometría. Medido antes:
// la tecla no hacía nada y cortar exigía Ctrl+C y Suprimir por separado.
eq(
  interpretEditorKeyAfterEngine(key({ key: "x", ctrlKey: true }), NATIVE),
  { type: "cut-selection", native: true },
  "Ctrl+X corta la selección nativa (CUTCLIP)",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: "X", metaKey: true }), SEL),
  { type: "cut-selection", native: false },
  "Cmd+X corta la selección heredada",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: "x", ctrlKey: true }), AFTER),
  null,
  "Ctrl+X sin selección no hace nada",
);
eq(
  interpretEditorKeyAfterEngine(key({ key: "x", ctrlKey: true }), {
    ...SEL,
    hasDomTextSelection: true,
  }),
  null,
  "Ctrl+X respeta el corte de texto del DOM",
);
eq(isReadOnlyMutationKey(key({ key: "x", ctrlKey: true })), true, "Ctrl+X muta (corta): en solo lectura avisa");
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
eq(isReadOnlyMutationKey(key({ key: "m" })), false, "m ya no es una tecla del lienzo: no muta");
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
