"use client";

import { useLocale } from 'next-intl';
import { useTheme, type ColorScheme } from '@/contexts/ThemeContext';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { CAD_KEYBOARD_SHORTCUTS, type CadKeyboardShortcutId } from '@/lib/cad/keyboard-shortcuts';
import {
  buildCadWorkspaceShortcuts,
  cadWorkspaceShortcutConflicts,
  type CadWorkspacePreferences,
  type CadWorkspaceProfile,
} from '@/lib/cad/cad-workspace';

interface CadWorkspaceDockProps {
  preferences: CadWorkspacePreferences;
  onChange(preferences: CadWorkspacePreferences): void;
  onProfile(profile: CadWorkspaceProfile): void;
  onReset(): void;
}

const SHORTCUT_IDS: CadKeyboardShortcutId[] = [
  'palette', 'select', 'line', 'polyline', 'circle', 'offset', 'save',
  'undo', 'redo', 'object_snap_toggle', 'ortho_toggle', 'polar_tracking_toggle',
];

export function CadWorkspaceDock({ preferences, onChange, onProfile, onReset }: CadWorkspaceDockProps) {
  const locale = useLocale();
  const english = locale === 'en';
  const { colorScheme, resolvedScheme, setColorScheme } = useTheme();
  const update = <K extends keyof CadWorkspacePreferences>(key: K, value: CadWorkspacePreferences[K]) =>
    onChange({ ...preferences, [key]: value });
  const shortcuts = buildCadWorkspaceShortcuts(preferences);
  const conflicts = cadWorkspaceShortcutConflicts(shortcuts);
  const labels = english ? {
    title: 'Professional workspace', profiles: 'Workspace layouts', drafting: 'Drafting', review: 'Review', presentation: 'Presentation', focus: 'Focus',
    docks: 'Docked interface', left: 'Library / layers', right: 'Properties', command: 'Command line', minimap: 'Minimap', density: 'Toolbar density', compact: 'Compact', comfortable: 'Comfortable',
    precision: 'Pointer precision', crosshair: 'Crosshair size', pickbox: 'Pick box', aperture: 'Snap aperture', rightClick: 'Right-click behavior', context: 'Context menu', enter: 'Enter / finish', repeat: 'Repeat last command',
    appearance: 'Appearance & language', shortcuts: 'Custom shortcuts', reset: 'Reset workspace', conflict: 'Conflicting bindings',
  } : {
    title: 'Workspace profesional', profiles: 'Distribuciones de workspace', drafting: 'Dibujo', review: 'Revisión', presentation: 'Presentación', focus: 'Foco',
    docks: 'Interfaz acoplada', left: 'Biblioteca / capas', right: 'Propiedades', command: 'Línea de comandos', minimap: 'Minimapa', density: 'Densidad del toolbar', compact: 'Compacta', comfortable: 'Cómoda',
    precision: 'Precisión del puntero', crosshair: 'Tamaño del crosshair', pickbox: 'Pick box', aperture: 'Apertura OSNAP', rightClick: 'Comportamiento de clic derecho', context: 'Menú contextual', enter: 'Enter / terminar', repeat: 'Repetir último comando',
    appearance: 'Apariencia e idioma', shortcuts: 'Atajos personalizados', reset: 'Restablecer workspace', conflict: 'Bindings en conflicto',
  };
  const panel = 'rounded-xl border border-white/10 bg-white/[0.035] p-3';
  const select = 'rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[11px] text-white outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50';
  return (
    <div data-testid="cad-workspace-dock" className="h-full overflow-y-auto p-3 text-[11px] text-gray-200">
      <div className="mb-3">
        <div className="text-sm font-semibold text-indigo-100">{labels.title}</div>
        <div className="mt-0.5 text-[10px] text-gray-500">{resolvedScheme} · {preferences.profile}</div>
      </div>

      <section className={panel}>
        <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-gray-500">{labels.profiles}</div>
        <div className="grid grid-cols-2 gap-1.5">
          {(['drafting', 'review', 'presentation', 'focus'] as CadWorkspaceProfile[]).map((profile) => (
            <button key={profile} data-testid={`cad-workspace-profile-${profile}`} onClick={() => onProfile(profile)} className={`rounded-lg border px-2 py-1.5 text-[10.5px] font-semibold focus-visible:ring-2 focus-visible:ring-indigo-400/50 ${preferences.profile === profile ? 'border-indigo-300/40 bg-indigo-400/15 text-indigo-100' : 'border-white/10 bg-white/[0.04] text-gray-300 hover:bg-white/[0.1]'}`}>{labels[profile]}</button>
          ))}
        </div>
      </section>

      <section className={`${panel} mt-2`}>
        <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-gray-500">{labels.docks}</div>
        <div className="grid grid-cols-2 gap-2">
          {([
            ['leftDock', labels.left], ['rightDock', labels.right], ['commandDock', labels.command], ['minimap', labels.minimap],
          ] as Array<[keyof Pick<CadWorkspacePreferences, 'leftDock' | 'rightDock' | 'commandDock' | 'minimap'>, string]>).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 rounded-lg border border-white/10 bg-gray-950/45 px-2 py-1.5"><input data-testid={`cad-workspace-${key}`} type="checkbox" checked={preferences[key]} onChange={(event) => update(key, event.target.checked)} className="accent-indigo-500" />{label}</label>
          ))}
        </div>
        <label className="mt-2 flex items-center justify-between gap-2 text-gray-400">{labels.density}<select value={preferences.toolbarDensity} onChange={(event) => update('toolbarDensity', event.target.value as CadWorkspacePreferences['toolbarDensity'])} className={select}><option value="compact">{labels.compact}</option><option value="comfortable">{labels.comfortable}</option></select></label>
      </section>

      <section className={`${panel} mt-2`}>
        <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-gray-500">{labels.precision}</div>
        {([
          ['crosshairPercent', labels.crosshair, 5, 100, '%'],
          ['pickBoxPx', labels.pickbox, 3, 24, 'px'],
          ['aperturePx', labels.aperture, 4, 40, 'px'],
        ] as const).map(([key, label, min, max, unit]) => (
          <label key={key} className="mb-2 block text-gray-400"><span className="flex justify-between"><span>{label}</span><span className="tabular-nums text-indigo-200">{preferences[key]}{unit}</span></span><input data-testid={`cad-workspace-${key}`} type="range" min={min} max={max} value={preferences[key]} onChange={(event) => update(key, Number(event.target.value))} className="mt-1 w-full accent-indigo-500" /></label>
        ))}
        <label className="flex items-center justify-between gap-2 text-gray-400">{labels.rightClick}<select data-testid="cad-workspace-right-click" value={preferences.rightClickAction} onChange={(event) => update('rightClickAction', event.target.value as CadWorkspacePreferences['rightClickAction'])} className={select}><option value="context">{labels.context}</option><option value="enter">{labels.enter}</option><option value="repeat">{labels.repeat}</option></select></label>
      </section>

      <section className={`${panel} mt-2`}>
        <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-gray-500">{labels.appearance}</div>
        <div className="flex items-center justify-between gap-2">
          <select aria-label="Theme" value={colorScheme} onChange={(event) => setColorScheme(event.target.value as ColorScheme)} className={select}><option value="system">System</option><option value="dark">Dark</option><option value="light">Light</option></select>
          <LanguageSwitcher variant="compact" />
        </div>
      </section>

      <section className={`${panel} mt-2`}>
        <div className="mb-2 flex items-center justify-between"><span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-gray-500">{labels.shortcuts}</span>{conflicts.length > 0 && <span className="text-[9px] text-rose-300">{labels.conflict}: {conflicts.length}</span>}</div>
        <div className="grid grid-cols-2 gap-1.5">
          {SHORTCUT_IDS.map((id) => {
            const definition = CAD_KEYBOARD_SHORTCUTS.find((shortcut) => shortcut.id === id)!;
            const active = shortcuts.find((shortcut) => shortcut.id === id);
            const value = preferences.shortcutOverrides[id] ?? [active?.ctrl ? 'Ctrl' : null, active?.shift ? 'Shift' : null, active?.alt ? 'Alt' : null, active?.key?.toUpperCase()].filter(Boolean).join('+');
            return <label key={id} className="min-w-0 text-[9.5px] text-gray-500"><span className="block truncate" title={definition.description}>{definition.label}</span><input data-testid={`cad-workspace-shortcut-${id}`} value={value} onChange={(event) => update('shortcutOverrides', { ...preferences.shortcutOverrides, [id]: event.target.value })} className="mt-0.5 w-full rounded-md border border-white/10 bg-gray-950/70 px-1.5 py-1 text-[10px] text-white outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50" /></label>;
          })}
        </div>
      </section>

      <button data-testid="cad-workspace-reset" onClick={onReset} className="mt-3 w-full rounded-lg border border-amber-300/20 bg-amber-400/[0.07] px-3 py-1.5 font-semibold text-amber-100 hover:bg-amber-400/[0.12] focus-visible:ring-2 focus-visible:ring-amber-300/60">{labels.reset}</button>
    </div>
  );
}
