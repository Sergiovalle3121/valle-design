/**
 * Intérprete PURO del teclado del estudio.
 *
 * Decide QUÉ atajo aplica — no lo ejecuta. El monolito conserva un ejecutor
 * de un switch por acción; la precedencia completa (editable→ignorar,
 * solo-lectura, paletas Ctrl+1/8/9, paleta de comandos, modo caminata,
 * barra, atajos de registro, y tras el motor la cascada de Escape y los
 * atajos de selección) vive aquí, testeable en Node sin DOM, rama a rama.
 *
 * Está partido en DOS fases a propósito, porque el manejador real intercala
 * un paso con efectos: tras la fase «antes del motor», el editor ofrece la
 * tecla al router del motor de comandos y al controlador de grips
 * (`keyDown(e)` devuelve si la consumió); sólo si ninguno la quiere corre la
 * fase «después del motor». Ese hand-off no puede ser puro y por eso no está
 * aquí — el orden, sí.
 *
 * Contrato con el ejecutor: TODA acción devuelta exige `preventDefault()`;
 * `null` significa «no es nuestra» y el evento sigue su curso (así el modo
 * caminata deja pasar WASD, y un campo editable se queda con sus teclas).
 */
import {
  matchCadShortcut,
  type CadKeyboardShortcut,
} from "./keyboard-shortcuts";
import type { CadToolbarActionId } from "./toolbar";

/** Lo que el intérprete necesita saber de un KeyboardEvent: un objeto plano. */
export interface EditorKeyEventLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  /** Composición IME en curso: la tecla no es de nadie todavía. */
  readonly isComposing?: boolean;
  /**
   * "editable" = INPUT/TEXTAREA/contentEditable: el editor no interviene.
   * "control" = BUTTON/A/SELECT/SUMMARY enfocado: Intro y Espacio son suyos
   * (activan el control), las letras van a la línea de comandos.
   */
  readonly targetKind: "editable" | "control" | "other";
}

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA"]);
const CONTROL_TAGS = new Set(["BUTTON", "A", "SELECT", "SUMMARY"]);

/** Traduce un KeyboardEvent real al objeto plano que el intérprete entiende. */
export function editorKeyEventLike(
  e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "isComposing"> & {
    target: EventTarget | null;
  },
): EditorKeyEventLike {
  const target = e.target as { tagName?: string; isContentEditable?: boolean } | null;
  const tagName = target?.tagName ?? "";
  return {
    key: e.key,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    isComposing: e.isComposing,
    targetKind:
      EDITABLE_TAGS.has(tagName) || target?.isContentEditable === true
        ? "editable"
        : CONTROL_TAGS.has(tagName)
          ? "control"
          : "other",
  };
}

/**
 * Las dos imprimibles que siguen siendo del editor con la línea de comandos
 * abierta: «?» abre la ayuda y «\» el modo enfoque; las anuncian el panel de
 * atajos, el título del botón y dos e2e (primera-hora, axe-estudio).
 */
const EDITOR_CHARACTER_KEYS = new Set(["?", "\\"]);

/**
 * Fase 0 — ¿esta tecla es un CARÁCTER para la línea de comandos?
 *
 * Medido en Chromium: `key.length === 1` deja fuera Enter, Escape, F3, Tab,
 * las flechas, Dead, Process y Unidentified. Espacio NO es un carácter: es
 * Intro para el motor, para el borrador heredado y para los grips
 * (native-grip-controller.ts). Ctrl sin Alt y Meta son atajos; Ctrl+Alt es
 * AltGr («@» = AltGr+2 en es-ES) y Alt solo es Option en Mac («@» = ⌥2),
 * pero Alt+letra o Alt+dígito en Linux/Windows enfoca sin insertar nada
 * (medido), así que se deja pasar.
 */
export function isCommandLineCharacter(event: EditorKeyEventLike): boolean {
  if (event.key.length !== 1 || event.key === " ") return false;
  if (event.metaKey || (event.ctrlKey && !event.altKey)) return false;
  if (event.altKey && !event.ctrlKey && /^[a-z0-9]$/i.test(event.key)) return false;
  if (event.isComposing) return false;
  return !EDITOR_CHARACTER_KEYS.has(event.key);
}

/** Atajos del registro que despachan directo a la barra de herramientas. */
export const TOOLBAR_SHORTCUT_IDS = new Set<CadToolbarActionId>([
  "select",
  "measure",
  "line",
  "polyline",
  "rect",
  "circle",
  "offset",
  "aisle",
  "zone",
  "equipment",
  "text",
  "fit_view",
  "undo",
  "redo",
]);

export const READ_ONLY_TOOLBAR_ACTION_IDS = new Set<CadToolbarActionId>([
  "select",
  "pan",
  "fit_view",
]);

const READ_ONLY_SHORTCUT_IDS = new Set<string>([
  "grid_toggle",
  "object_snap_toggle",
  "ortho_toggle",
  "polar_tracking_toggle",
  "object_tracking_toggle",
  "validate_layout",
  "export_dxf",
  ...READ_ONLY_TOOLBAR_ACTION_IDS,
]);

/** ¿Esta tecla MUTARÍA el documento? (para el aviso de solo lectura). */
export function isReadOnlyMutationKey(
  event: Pick<EditorKeyEventLike, "key" | "ctrlKey" | "metaKey">,
  shortcutId?: string,
): boolean {
  if (shortcutId) return !READ_ONLY_SHORTCUT_IDS.has(shortcutId);
  const key = event.key.toLowerCase();
  if (event.ctrlKey || event.metaKey)
    return ["s", "z", "y", "d", "c", "v", "g"].includes(key);
  return [
    "backspace",
    "delete",
    "enter",
    "arrowleft",
    "arrowright",
    "arrowup",
    "arrowdown",
  ].includes(key);
}

/** El paso de la cascada de Escape que aplica, en su orden de precedencia. */
export type EditorEscapeStep =
  | "exit-hatch-pick"
  | "close-palette"
  | "clear-preview"
  | "clear-command-text"
  | "cancel-draw"
  | "reset-tool"
  | "clear-selection"
  | "none";

export type EditorKeyAction =
  | { type: "notify-read-only" }
  | { type: "reveal-properties" }
  | { type: "toggle-styles" }
  | { type: "toggle-draft-settings" }
  | { type: "open-palette" }
  | { type: "toggle-walk" }
  | { type: "toolbar"; id: CadToolbarActionId }
  | { type: "save" }
  | { type: "grid-toggle" }
  | { type: "grid-snap-toggle" }
  | { type: "dynamic-input-toggle" }
  | { type: "osnap-toggle" }
  | { type: "ortho-toggle" }
  | { type: "polar-toggle" }
  | { type: "object-tracking-toggle" }
  | { type: "open-checks" }
  | { type: "open-dxf-export" }
  | { type: "escape"; step: EditorEscapeStep }
  | { type: "toggle-help" }
  | { type: "select-all" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "commit-draft" }
  /** La tecla es un carácter: enfocar la línea de comandos SIN preventDefault, para que el navegador lo inserte. */
  | { type: "command-line" }
  /** Intro o Espacio en reposo desde el lienzo: repetir el último comando, como en AutoCAD. */
  | { type: "repeat-last-command" }
  | { type: "fit-view"; target: "selection" | "all" | "plant" }
  | { type: "toggle-focus-mode" }
  | { type: "delete-selection"; native: boolean }
  | { type: "duplicate-selection"; native: boolean }
  | { type: "copy-selection"; native: boolean }
  | { type: "paste" }
  | { type: "ungroup" }
  | { type: "group" }
  | { type: "nudge"; dx: number; dy: number; native: boolean };

export interface EditorKeyContextBeforeEngine {
  readonly readOnly: boolean;
  readonly walkMode: boolean;
  readonly workspaceShortcuts: readonly CadKeyboardShortcut[];
  /** El muelle de la línea de comandos está montado y acepta órdenes. */
  readonly commandLineOpen: boolean;
}

/**
 * Fase 1 — hasta donde el editor decide SOLO. Devuelve la acción, o `null`
 * para que el manejador ofrezca la tecla al motor y siga con la fase 2.
 */
export function interpretEditorKeyBeforeEngine(
  event: EditorKeyEventLike,
  ctx: EditorKeyContextBeforeEngine,
): EditorKeyAction | null {
  if (event.targetKind === "editable") return null;
  const cadShortcut = matchCadShortcut(event, ctx.workspaceShortcuts);
  if (ctx.readOnly && isReadOnlyMutationKey(event, cadShortcut?.id)) {
    return { type: "notify-read-only" };
  }
  // Ctrl+1 propiedades, Ctrl+8 estilos, Ctrl+9 DSETTINGS — como en AutoCAD.
  // No pasan por matchCadShortcut porque su registro vive fuera de la sesión
  // que las cableó; cuando el registro las admita, estas tres líneas se
  // sustituyen por sus ids.
  if ((event.ctrlKey || event.metaKey) && event.key === "1")
    return { type: "reveal-properties" };
  if ((event.ctrlKey || event.metaKey) && event.key === "8")
    return { type: "toggle-styles" };
  if ((event.ctrlKey || event.metaKey) && event.key === "9")
    return { type: "toggle-draft-settings" };
  if (cadShortcut?.id === "palette") return { type: "open-palette" };
  // En modo caminata WASD/mirada mandan; sólo Esc (salir) llega aquí.
  if (ctx.walkMode) {
    return event.key === "Escape" ? { type: "toggle-walk" } : null;
  }
  // Fase 0: con la línea de comandos abierta, teclear «L» escribe «L» en ella
  // (y arranca LINE con Intro), como en AutoCAD; medido antes: «l» arrancaba
  // la herramienta sin Intro y «1», «@» o «,» morían en el body. Los atajos
  // de una letra del registro sólo viven con el muelle oculto (golden 19).
  if (ctx.commandLineOpen && isCommandLineCharacter(event)) {
    return { type: "command-line" };
  }
  if (
    cadShortcut &&
    TOOLBAR_SHORTCUT_IDS.has(cadShortcut.id as CadToolbarActionId)
  ) {
    return { type: "toolbar", id: cadShortcut.id as CadToolbarActionId };
  }
  switch (cadShortcut?.id) {
    case "save":
      return { type: "save" };
    case "grid_toggle":
      return { type: "grid-toggle" };
    case "grid_snap_toggle":
      return { type: "grid-snap-toggle" };
    case "dynamic_input_toggle":
      return { type: "dynamic-input-toggle" };
    case "object_snap_toggle":
      return { type: "osnap-toggle" };
    case "ortho_toggle":
      return { type: "ortho-toggle" };
    case "polar_tracking_toggle":
      return { type: "polar-toggle" };
    case "object_tracking_toggle":
      return { type: "object-tracking-toggle" };
    case "validate_layout":
      return { type: "open-checks" };
    case "export_dxf":
      return { type: "open-dxf-export" };
    default:
      return null;
  }
}

export interface EditorKeyContextAfterEngine {
  /** Rejilla en unidades de mundo: el paso de empuje (×5 con Shift, aquí). */
  readonly gridSize: number;
  readonly hasSelection: boolean;
  readonly hasNativeSelection: boolean;
  readonly hatchPickMode: boolean;
  readonly paletteOpen: boolean;
  readonly commandPreviewOpen: boolean;
  readonly commandTextPending: boolean;
  readonly drawCommandActive: boolean;
  readonly toolIsSelect: boolean;
  /** ¿Hay texto del DOM seleccionado? (Ctrl+C respeta la copia de texto.) */
  readonly hasDomTextSelection: boolean;
}

/**
 * Fase 2 — cuando ni el router del motor ni los grips consumieron la tecla:
 * cascada de Escape y atajos de edición/selección, rama a rama como el
 * manejador histórico.
 */
export function interpretEditorKeyAfterEngine(
  event: EditorKeyEventLike,
  ctx: EditorKeyContextAfterEngine,
): EditorKeyAction | null {
  const step = event.shiftKey ? ctx.gridSize * 5 : ctx.gridSize;
  const hasSel = ctx.hasSelection || ctx.hasNativeSelection;
  const native = ctx.hasNativeSelection;
  const ctrl = event.ctrlKey || event.metaKey;
  if (event.key === "Escape") {
    const escapeStep: EditorEscapeStep = ctx.hatchPickMode
      ? "exit-hatch-pick"
      : ctx.paletteOpen
        ? "close-palette"
        : ctx.commandPreviewOpen
          ? "clear-preview"
          : ctx.commandTextPending
            ? "clear-command-text"
            : ctx.drawCommandActive
              ? "cancel-draw"
              : !ctx.toolIsSelect
                ? "reset-tool"
                : hasSel
                  ? "clear-selection"
                  : "none";
    return { type: "escape", step: escapeStep };
  }
  if (event.key === "?" || (event.key === "/" && event.shiftKey))
    return { type: "toggle-help" };
  if ((event.key === "a" || event.key === "A") && ctrl)
    return { type: "select-all" };
  if ((event.key === "z" || event.key === "Z") && ctrl && !event.shiftKey)
    return { type: "undo" };
  if (
    ((event.key === "z" || event.key === "Z") && ctrl && event.shiftKey) ||
    ((event.key === "y" || event.key === "Y") && ctrl)
  )
    return { type: "redo" };
  // Espacio vale por Intro, como en AutoCAD y como ya hace la caja vacía de la
  // línea de comandos. Sobre un BUTTON enfocado ninguno de los dos se roba:
  // activan el control (medido: Intro sobre BUTTON = click).
  const enterOrSpace = (event.key === "Enter" || event.key === " ") && event.targetKind === "other";
  if (enterOrSpace && ctx.drawCommandActive) return { type: "commit-draft" };
  if (enterOrSpace) return { type: "repeat-last-command" };
  // Sin m/w/f/r sueltas: M=MOVE, W=WBLOCK, F=FILLET son alias de acad.pgp y la
  // letra suelta es de la línea de comandos; R rotaba +15° sin preguntar
  // mientras la ayuda prometía «pide grados». ROTATE, MOVE y FILLET se teclean.
  // Shift+F exige Shift de verdad: «F» con Bloq Mayús encuadraba la planta.
  if (
    (event.key === "F" || event.key === "f") &&
    event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey
  )
    return { type: "fit-view", target: "plant" };
  if (event.key === "\\") return { type: "toggle-focus-mode" };
  if ((event.key === "Delete" || event.key === "Backspace") && hasSel)
    return { type: "delete-selection", native };
  if ((event.key === "d" || event.key === "D") && ctrl && hasSel)
    return { type: "duplicate-selection", native };
  if (
    (event.key === "c" || event.key === "C") &&
    ctrl &&
    hasSel &&
    !ctx.hasDomTextSelection
  )
    return { type: "copy-selection", native };
  if ((event.key === "v" || event.key === "V") && ctrl)
    return { type: "paste" };
  if ((event.key === "g" || event.key === "G") && ctrl && event.shiftKey && hasSel)
    return { type: "ungroup" };
  if ((event.key === "g" || event.key === "G") && ctrl && hasSel)
    return { type: "group" };
  if (event.key === "ArrowLeft" && hasSel)
    return { type: "nudge", dx: -step, dy: 0, native };
  if (event.key === "ArrowRight" && hasSel)
    return { type: "nudge", dx: step, dy: 0, native };
  if (event.key === "ArrowUp" && hasSel)
    return { type: "nudge", dx: 0, dy: -step, native };
  if (event.key === "ArrowDown" && hasSel)
    return { type: "nudge", dx: 0, dy: step, native };
  return null;
}
