import {
  CAD_KEYBOARD_SHORTCUTS,
  type CadKeyboardShortcut,
  type CadKeyboardShortcutId,
} from './keyboard-shortcuts';
import { readRenamedStorageKey, type RenamableStorage } from '../storage-rename';

export type CadWorkspaceProfile = 'drafting' | 'review' | 'presentation' | 'focus';
export type CadToolbarDensity = 'compact' | 'comfortable';
export type CadRightClickAction = 'context' | 'enter' | 'repeat';

/**
 * La vista con la que abre un documento.
 *
 * ── POR QUÉ ES UNA PREFERENCIA Y NO UNA CONSTANTE ───────────────────────────
 * El estudio abría SIEMPRE en 3D. Es la peor primera impresión posible para un
 * CAD 2D: lo primero que ve quien entra a dibujar un plano es una perspectiva,
 * y su primer gesto tiene que ser buscar el botón que la apaga. El 3D de este
 * producto está para COMPROBAR el volumen de lo dibujado, no para diseñar — así
 * lo dice la propia documentación — y una vista de comprobación no puede ser la
 * bienvenida.
 *
 * Ahora abre en 2D, que es el plano. Y se guarda la elección: quien de verdad
 * trabaja en 3D lo deja puesto una vez y no vuelve a tocarlo, en vez de pelearse
 * con el valor por defecto en cada documento que abre.
 */
export type CadViewMode = '2d' | '3d';

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
  /** Vista con la que abre un documento. Ver `CadViewMode`. */
  viewMode: CadViewMode;
  shortcutOverrides: Partial<Record<CadKeyboardShortcutId, string>>;
}

export const CAD_WORKSPACE_DEFAULTS: CadWorkspacePreferences = {
  schema: 1,
  profile: 'drafting',
  leftDock: true,
  rightDock: true,
  commandDock: true,
  // Apagado de fábrica desde 2026-09-02. El minimapa es una capa que vive
  // SOBRE el área de dibujo y se queda con el ratón donde está: abajo a la
  // derecha se comía los arrastres de selección (auditoría del 2026-09-01) y
  // arriba a la derecha roba esa esquina (golden 68). AutoCAD no tiene
  // minimapa; quien lo quiera lo enciende en sus preferencias y sabe dónde está.
  minimap: false,
  toolbarDensity: 'compact',
  crosshairPercent: 32,
  pickBoxPx: 8,
  aperturePx: 12,
  rightClickAction: 'context',
  // 2D por defecto: es un CAD de planos, y el 3D es la comprobación.
  viewMode: '2d',
  shortcutOverrides: {},
};

export const CAD_WORKSPACE_PROFILES: Record<CadWorkspaceProfile, Pick<CadWorkspacePreferences, 'leftDock' | 'rightDock' | 'commandDock' | 'minimap' | 'toolbarDensity'>> = {
  drafting: { leftDock: true, rightDock: true, commandDock: true, minimap: false, toolbarDensity: 'compact' },
  review: { leftDock: false, rightDock: true, commandDock: true, minimap: false, toolbarDensity: 'comfortable' },
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
  // Sólo '3d' explícito cambia el defecto: cualquier valor corrupto o ausente
  // devuelve el plano, que es la vista que no puede sorprender a nadie.
  const viewMode: CadViewMode = raw.viewMode === '3d' ? '3d' : '2d';
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
    viewMode,
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
