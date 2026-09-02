/**
 * LA LETRA SUELTA ES DE LA LÍNEA DE COMANDOS.
 *
 * Intersección entre los alias de UNA letra de acad.pgp
 * (`engine/alias-table.ts`) y las teclas sueltas que el lienzo atiende:
 * registro, fase 1, fase 2, etiquetas de la barra, títulos del monolito y
 * overrides persistidos. Tiene que ser VACÍA salvo L, C, T, I, que ejecutan el
 * mismo comando que su alias. Medido el 2026-09-02 antes del arreglo: 13
 * letras robadas (A E M O F S X G B W Z P V) y 39 colisiones en total.
 *
 * Límite declarado: NO cubre Shift+letra (Shift+O, Shift+V, Shift+F). Cuando
 * la línea de comandos reciba las mayúsculas tecleadas, esas tres se deciden
 * con ese frente.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CAD_COMMAND_ALIASES } from "./engine/alias-table";
import {
  CAD_KEYBOARD_SHORTCUTS,
  CAD_SHORTCUTS_THAT_ARE_ALIASES,
  cadShortcutAliasCollision,
} from "./keyboard-shortcuts";
import { interpretEditorKeyAfterEngine, interpretEditorKeyBeforeEngine } from "./editor-keyboard";
import { CAD_TOOLBAR_ACTIONS } from "./toolbar";
import { buildCadWorkspaceShortcuts, cadWorkspaceAliasCollisions } from "./cad-workspace";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const singleLetterAliases = Object.entries(CAD_COMMAND_ALIASES).filter(([alias]) => /^[A-Z]$/.test(alias));
ok(singleLetterAliases.length >= 15, `acad.pgp tiene ${singleLetterAliases.length} alias de una letra`);

// (a) Registro: ninguna entrada suelta roba un alias.
const colisiones: string[] = [];
for (const shortcut of CAD_KEYBOARD_SHORTCUTS) {
  const stolen = cadShortcutAliasCollision(shortcut);
  if (stolen) colisiones.push(`registro: ${shortcut.key} dispara ${shortcut.id} y en acad.pgp ${shortcut.key.toUpperCase()}=${stolen}`);
}
// Y la lista de coincidencias sólo puede contener ids cuya tecla ES su alias.
for (const [id, command] of Object.entries(CAD_SHORTCUTS_THAT_ARE_ALIASES)) {
  const entry = CAD_KEYBOARD_SHORTCUTS.find((shortcut) => shortcut.id === id && !shortcut.ctrl && !shortcut.shift && !shortcut.alt);
  ok(!!entry && CAD_COMMAND_ALIASES[entry.key.toUpperCase()] === command, `${id} coincide con su alias: ${entry?.key.toUpperCase()}=${command}`);
}

// (b) Intérprete: cada alias de una letra, en minúscula y en mayúscula sin
// Shift, con y sin selección, no es del editor en ninguna de las dos fases
// (salvo las que coinciden con su alias en fase 1).
// Con el muelle OCULTO: es el único estado en el que una letra suelta puede ser del editor.
const BEFORE = { readOnly: false, walkMode: false, workspaceShortcuts: CAD_KEYBOARD_SHORTCUTS, commandLineOpen: false };
const AFTER = { gridSize: 100, hasSelection: false, hasNativeSelection: false, hatchPickMode: false, paletteOpen: false, commandPreviewOpen: false, commandTextPending: false, drawCommandActive: false, toolIsSelect: true, hasDomTextSelection: false };
const coinciden = new Set(Object.keys(CAD_SHORTCUTS_THAT_ARE_ALIASES));
for (const [alias, command] of singleLetterAliases) {
  for (const key of [alias.toLowerCase(), alias]) {
    const event = { key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, targetKind: "other" as const };
    const before = interpretEditorKeyBeforeEngine(event, BEFORE);
    if (before && !(before.type === "toolbar" && coinciden.has(before.id))) colisiones.push(`fase 1: ${key} → ${JSON.stringify(before)} (alias ${alias}=${command})`);
    for (const ctx of [AFTER, { ...AFTER, hasSelection: true }, { ...AFTER, hasNativeSelection: true }]) {
      const after = interpretEditorKeyAfterEngine(event, ctx);
      if (after) colisiones.push(`fase 2: ${key} → ${JSON.stringify(after)} (alias ${alias}=${command})`);
    }
  }
}

// (c) Barra: toda etiqueta de una letra existe como tecla suelta del registro
// con el mismo id (una etiqueta sin tecla detrás es falsa).
for (const action of CAD_TOOLBAR_ACTIONS) {
  if (!action.shortcut || action.shortcut.length !== 1) continue;
  const real = CAD_KEYBOARD_SHORTCUTS.find((shortcut) => shortcut.id === action.id && shortcut.key.toLowerCase() === action.shortcut!.toLowerCase() && !shortcut.ctrl && !shortcut.shift);
  if (!real) colisiones.push(`barra: ${action.id} anuncia ${action.shortcut} y el registro no la tiene`);
}

// (d) Títulos del monolito y de la paleta: ningún `title="…(X)"` anuncia una
// letra-alias suelta (medido: V, M, W, F sobrevivían en cuatro títulos).
for (const file of ["src/components/cad/editor/Layout3DEditor.tsx", "src/components/cad/editor/CadToolPalette.tsx"]) {
  const source = readFileSync(resolve(process.cwd(), file), "utf8");
  for (const match of source.matchAll(/title="[^"]*\(([A-Z])\)"/g)) {
    const letter = match[1];
    const aliased = CAD_COMMAND_ALIASES[letter];
    const real = CAD_KEYBOARD_SHORTCUTS.find((shortcut) => shortcut.key.toLowerCase() === letter.toLowerCase() && !shortcut.ctrl && !shortcut.shift);
    if (aliased && !(real && CAD_SHORTCUTS_THAT_ARE_ALIASES[real.id] === aliased)) colisiones.push(`${file}: título anuncia (${letter}) y en acad.pgp ${letter}=${aliased}`);
  }
}

// (e) Overrides persistidos: una letra-alias guardada no se arma y se explica.
const armados = buildCadWorkspaceShortcuts({ shortcutOverrides: { select: "m", polyline: "P" } });
ok(armados.every((shortcut) => shortcut.key !== "m" && shortcut.key !== "p"), "override persistido: m y P no se arman");
assert.deepEqual(cadWorkspaceAliasCollisions({ shortcutOverrides: { select: "m", polyline: "P" } }), ["polyline:p→PAN", "select:m→MOVE"]);
checks += 1;

assert.deepEqual(colisiones, [], `colisiones lienzo ↔ acad.pgp:\n${colisiones.join("\n")}`);
checks += 1;
console.log(`keyboard-alias-collisions: ${checks} comprobaciones verdes — ${singleLetterAliases.length} alias de una letra, intersección vacía salvo ${[...coinciden].join(", ")}`);
