import assert from 'node:assert/strict';
import { CAD_KEYBOARD_SHORTCUTS } from './keyboard-shortcuts';
import {
  CAD_WORKSPACE_DEFAULTS,
  applyCadWorkspaceProfile,
  buildCadWorkspaceShortcuts,
  cadWorkspaceShortcutConflicts,
  cadWorkspaceStorageKey,
  normalizeCadWorkspacePreferences,
  parseCadShortcutBinding,
} from './cad-workspace';

const normalized = normalizeCadWorkspacePreferences({
  profile: 'review', crosshairPercent: 500, pickBoxPx: 1, aperturePx: 0,
  rightClickAction: 'repeat', shortcutOverrides: { line: 'Ctrl+Shift+L', invalid: 'X', save: 'not-a-key' },
});
assert.equal(normalized.crosshairPercent, 100);
assert.equal(normalized.pickBoxPx, 3);
assert.equal(normalized.aperturePx, 4);
assert.deepEqual(normalized.shortcutOverrides, { line: 'Ctrl+Shift+L', save: 'not-a-key' });
assert.deepEqual(
  applyCadWorkspaceProfile(normalized, 'presentation'),
  { ...normalized, profile: 'presentation', leftDock: false, rightDock: false, commandDock: false, minimap: false, toolbarDensity: 'comfortable' },
);
assert.equal(cadWorkspaceStorageKey({ tenantId: 'a', userId: 'b' }), 'valle_cad_workspace:a:b');

const line = CAD_KEYBOARD_SHORTCUTS.find((shortcut) => shortcut.id === 'line')!;
assert.deepEqual(parseCadShortcutBinding('Ctrl+Shift+L', line), { ...line, key: 'l', ctrl: true, shift: true, alt: false });
assert.equal(parseCadShortcutBinding('Ctrl+Mouse4', line), null);
const custom = buildCadWorkspaceShortcuts({ shortcutOverrides: { line: 'Ctrl+Shift+L', select: 'Q' } });
assert.equal(custom.find((shortcut) => shortcut.id === 'line')?.ctrl, true);
assert.equal(custom.find((shortcut) => shortcut.id === 'select')?.key, 'q');
assert.equal(cadWorkspaceShortcutConflicts(custom).length, 0);
assert.deepEqual(cadWorkspaceShortcutConflicts([
  { ...line, id: 'line', key: 'q' },
  { ...line, id: 'select', key: 'q' },
]), ['line:select']);
assert.equal(normalizeCadWorkspacePreferences(null).profile, CAD_WORKSPACE_DEFAULTS.profile);

console.log('cad workspace preference specs passed');
