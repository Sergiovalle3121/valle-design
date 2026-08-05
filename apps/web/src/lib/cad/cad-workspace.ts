import {
  CAD_KEYBOARD_SHORTCUTS,
  type CadKeyboardShortcut,
  type CadKeyboardShortcutId,
} from './keyboard-shortcuts';
import { readRenamedStorageKey, type RenamableStorage } from '../storage-rename';

export type CadWorkspaceProfile = 'drafting' | 'review' | 'presentation' | 'focus';
export type CadToolbarDensity = 'compact' | 'comfortable';
export type CadRightClickAction = 'context' | 'enter' | 'repeat';

export interface CadWorkspacePreferences {
  schema: 1;
  profile: CadWorkspaceProfile;
  leftDock: boolean;
  rightDock: boolean;
  commandDock: boolean;
  minimap: boolean;
  toolbarDensity: CadToolbarDensity;
  crosshairPercent: number;
  pickBoxPx: number;
  aperturePx: number;
  rightClickAction: CadRightClickAction;
  shortcutOverrides: Partial<Record<CadKeyboardShortcutId, string>>;
}

export const CAD_WORKSPACE_DEFAULTS: CadWorkspacePreferences = {
  schema: 1,
  profile: 'drafting',
  leftDock: true,
  rightDock: true,
  commandDock: true,
  minimap: true,
  toolbarDensity: 'compact',
  crosshairPercent: 32,
  pickBoxPx: 8,
  aperturePx: 12,
  rightClickAction: 'context',
  shortcutOverrides: {},
};

export const CAD_WORKSPACE_PROFILES: Record<CadWorkspaceProfile, Pick<CadWorkspacePreferences, 'leftDock' | 'rightDock' | 'commandDock' | 'minimap' | 'toolbarDensity'>> = {
  drafting: { leftDock: true, rightDock: true, commandDock: true, minimap: true, toolbarDensity: 'compact' },
  review: { leftDock: false, rightDock: true, commandDock: true, minimap: true, toolbarDensity: 'comfortable' },
  presentation: { leftDock: false, rightDock: false, commandDock: false, minimap: false, toolbarDensity: 'comfortable' },
  focus: { leftDock: false, rightDock: false, commandDock: true, minimap: false, toolbarDensity: 'compact' },
};

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};

export function normalizeCadWorkspacePreferences(value: unknown): CadWorkspacePreferences {
  const raw = value && typeof value === 'object' ? value as Partial<CadWorkspacePreferences> : {};
  const profile = raw.profile && raw.profile in CAD_WORKSPACE_PROFILES ? raw.profile : CAD_WORKSPACE_DEFAULTS.profile;
  const rightClickAction: CadRightClickAction = raw.rightClickAction === 'enter' || raw.rightClickAction === 'repeat' ? raw.rightClickAction : 'context';
  const overrides = raw.shortcutOverrides && typeof raw.shortcutOverrides === 'object'
    ? Object.fromEntries(Object.entries(raw.shortcutOverrides).filter(([key, binding]) =>
        CAD_KEYBOARD_SHORTCUTS.some((shortcut) => shortcut.id === key) && typeof binding === 'string' && binding.trim().length <= 32,
      )) as CadWorkspacePreferences['shortcutOverrides']
    : {};
  return {
    schema: 1,
    profile,
    leftDock: typeof raw.leftDock === 'boolean' ? raw.leftDock : CAD_WORKSPACE_DEFAULTS.leftDock,
    rightDock: typeof raw.rightDock === 'boolean' ? raw.rightDock : CAD_WORKSPACE_DEFAULTS.rightDock,
    commandDock: typeof raw.commandDock === 'boolean' ? raw.commandDock : CAD_WORKSPACE_DEFAULTS.commandDock,
    minimap: typeof raw.minimap === 'boolean' ? raw.minimap : CAD_WORKSPACE_DEFAULTS.minimap,
    toolbarDensity: raw.toolbarDensity === 'comfortable' ? 'comfortable' : 'compact',
    crosshairPercent: clamp(raw.crosshairPercent, 5, 100, CAD_WORKSPACE_DEFAULTS.crosshairPercent),
    pickBoxPx: clamp(raw.pickBoxPx, 3, 24, CAD_WORKSPACE_DEFAULTS.pickBoxPx),
    aperturePx: clamp(raw.aperturePx, 4, 40, CAD_WORKSPACE_DEFAULTS.aperturePx),
    rightClickAction,
    shortcutOverrides: overrides,
  };
}

export function applyCadWorkspaceProfile(
  current: CadWorkspacePreferences,
  profile: CadWorkspaceProfile,
): CadWorkspacePreferences {
  return normalizeCadWorkspacePreferences({ ...current, ...CAD_WORKSPACE_PROFILES[profile], profile });
}

export interface CadWorkspaceScope {
  tenantId?: string | null;
  userId?: string | null;
}

export function cadWorkspaceStorageKey(scope: CadWorkspaceScope): string {
  return `valle_cad_workspace:${scope.tenantId || 'tenant'}:${scope.userId || 'user'}`;
}

/**
 * Clave del nombre de producto ANTERIOR. Sigue existiendo en el navegador de
 * quien ya configuró su espacio de trabajo: renombrar sin leerla le devolvería
 * los ajustes de fábrica sin explicación alguna.
 */
export function legacyCadWorkspaceStorageKey(scope: CadWorkspaceScope): string {
  return `axos_cad_workspace:${scope.tenantId || 'tenant'}:${scope.userId || 'user'}`;
}

/**
 * Lee las preferencias del espacio de trabajo, migrando la clave del nombre
 * anterior si es la única que existe. Cualquier fallo cae a los defaults: unas
 * preferencias ilegibles no pueden impedir abrir un dibujo.
 */
export function loadCadWorkspacePreferences(
  storage: RenamableStorage,
  scope: CadWorkspaceScope,
): CadWorkspacePreferences {
  const serialized = readRenamedStorageKey(
    storage,
    cadWorkspaceStorageKey(scope),
    legacyCadWorkspaceStorageKey(scope),
  );
  if (serialized === null) return CAD_WORKSPACE_DEFAULTS;
  try {
    return normalizeCadWorkspacePreferences(JSON.parse(serialized));
  } catch {
    return CAD_WORKSPACE_DEFAULTS;
  }
}

export function parseCadShortcutBinding(
  value: string,
  template: CadKeyboardShortcut,
): CadKeyboardShortcut | null {
  const parts = value.split('+').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;
  const key = parts.at(-1)!;
  if (!/^(?:[a-z0-9]|f(?:[1-9]|1[0-2])|escape|space|delete|backspace)$/i.test(key)) return null;
  const modifiers = new Set(parts.slice(0, -1).map((part) => part.toLowerCase()));
  if ([...modifiers].some((part) => !['ctrl', 'control', 'cmd', 'meta', 'shift', 'alt', 'option'].includes(part))) return null;
  return {
    ...template,
    key: key.toLowerCase(),
    ctrl: modifiers.has('ctrl') || modifiers.has('control') || modifiers.has('cmd') || modifiers.has('meta'),
    shift: modifiers.has('shift'),
    alt: modifiers.has('alt') || modifiers.has('option'),
  };
}

export function buildCadWorkspaceShortcuts(
  preferences: Pick<CadWorkspacePreferences, 'shortcutOverrides'>,
  defaults = CAD_KEYBOARD_SHORTCUTS,
): CadKeyboardShortcut[] {
  const emittedOverrides = new Set<CadKeyboardShortcutId>();
  return defaults.flatMap((shortcut) => {
    const override = preferences.shortcutOverrides[shortcut.id]?.trim();
    if (!override) return [shortcut];
    if (emittedOverrides.has(shortcut.id)) return [];
    emittedOverrides.add(shortcut.id);
    return [parseCadShortcutBinding(override, shortcut) ?? shortcut];
  });
}

export function cadWorkspaceShortcutConflicts(shortcuts: readonly CadKeyboardShortcut[]): string[] {
  const bindings = new Map<string, CadKeyboardShortcutId>();
  const conflicts = new Set<string>();
  for (const shortcut of shortcuts) {
    const binding = `${shortcut.ctrl ? 'c' : ''}${shortcut.shift ? 's' : ''}${shortcut.alt ? 'a' : ''}:${shortcut.key.toLowerCase()}`;
    const previous = bindings.get(binding);
    if (previous && previous !== shortcut.id) conflicts.add(`${previous}:${shortcut.id}`);
    else bindings.set(binding, shortcut.id);
  }
  return [...conflicts].sort();
}
