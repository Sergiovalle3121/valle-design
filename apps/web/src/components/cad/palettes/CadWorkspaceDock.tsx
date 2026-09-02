"use client";

import { useLocale } from "next-intl";
import { useTheme, type ColorScheme } from "@/contexts/ThemeContext";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import {
  CAD_KEYBOARD_SHORTCUTS,
  type CadKeyboardShortcutId,
} from "@/lib/cad/keyboard-shortcuts";
import {
  buildCadWorkspaceShortcuts,
  cadWorkspaceAliasCollisions,
  cadWorkspaceShortcutConflicts,
  type CadWorkspacePreferences,
  type CadWorkspaceProfile,
} from "@/lib/cad/cad-workspace";

interface CadWorkspaceDockProps {
  preferences: CadWorkspacePreferences;
  onChange(preferences: CadWorkspacePreferences): void;
  onProfile(profile: CadWorkspaceProfile): void;
  onReset(): void;
}

const SHORTCUT_IDS: CadKeyboardShortcutId[] = [
  "palette",
  "select",
  "line",
  "polyline",
  "circle",
  "offset",
  "save",
  "undo",
  "redo",
  "object_snap_toggle",
  "ortho_toggle",
  "polar_tracking_toggle",
];

export function CadWorkspaceDock({
  preferences,
  onChange,
  onProfile,
  onReset,
}: CadWorkspaceDockProps) {
  const locale = useLocale();
  const english = locale === "en";
  const { colorScheme, resolvedScheme, setColorScheme } = useTheme();
  const update = <K extends keyof CadWorkspacePreferences>(
    key: K,
    value: CadWorkspacePreferences[K],
  ) => onChange({ ...preferences, [key]: value });
  const shortcuts = buildCadWorkspaceShortcuts(preferences);
  // Un override que roba un alias de acad.pgp cuenta como conflicto: no se
  // arma, y el título del campo dice por qué.
  const aliasCollisions = cadWorkspaceAliasCollisions(preferences);
  const conflicts = [...cadWorkspaceShortcutConflicts(shortcuts), ...aliasCollisions];
  const labels = english
    ? {
        title: "Professional workspace",
        profiles: "Workspace layouts",
        drafting: "Drafting",
        review: "Review",
        presentation: "Presentation",
        focus: "Focus",
        docks: "Docked interface",
        left: "Library / layers",
        right: "Properties",
        command: "Command line",
        minimap: "Minimap",
        density: "Toolbar density",
        compact: "Compact",
        comfortable: "Comfortable",
        precision: "Pointer precision",
        crosshair: "Crosshair size",
        pickbox: "Pick box",
        aperture: "Snap aperture",
        rightClick: "Right-click behavior",
        backgroundDrag: "Drag on empty space",
        marquee: "Selects (window / crossing)",
        pan: "Pans the view",
        context: "Context menu",
        enter: "Enter / finish",
        repeat: "Repeat last command",
        appearance: "Appearance & language",
        shortcuts: "Custom shortcuts",
        reset: "Reset workspace",
        conflict: "Conflicting bindings",
      }
    : {
        title: "Workspace profesional",
        profiles: "Distribuciones de workspace",
        drafting: "Dibujo",
        review: "Revisión",
        presentation: "Presentación",
        focus: "Foco",
        docks: "Interfaz acoplada",
        left: "Biblioteca / capas",
        right: "Propiedades",
        command: "Línea de comandos",
        minimap: "Minimapa",
        density: "Densidad del toolbar",
        compact: "Compacta",
        comfortable: "Cómoda",
        precision: "Precisión del puntero",
        crosshair: "Tamaño del crosshair",
        pickbox: "Pick box",
        aperture: "Apertura OSNAP",
        rightClick: "Comportamiento de clic derecho",
        backgroundDrag: "Arrastrar sobre el fondo",
        marquee: "Designa (ventana / cruce)",
        pan: "Encuadra la vista",
        context: "Menú contextual",
        enter: "Enter / terminar",
        repeat: "Repetir último comando",
        appearance: "Apariencia e idioma",
        shortcuts: "Atajos personalizados",
        reset: "Restablecer workspace",
        conflict: "Bindings en conflicto",
      };
  const panel = "rounded-card border border-border bg-muted/40 p-3";
  const select =
    "rounded-control border border-border bg-surface/80 px-2 py-1.5 type-micro text-foreground outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50";
  return (
    <div
      data-testid="cad-workspace-dock"
      className="h-full overflow-y-auto p-3 type-micro text-foreground"
    >
      <div className="mb-3">
        <div className="text-sm font-semibold text-primary-ink">
          {labels.title}
        </div>
        <div className="mt-0.5 type-micro text-muted-foreground">
          {resolvedScheme} · {preferences.profile}
        </div>
      </div>

      <section className={panel}>
        <div className="mb-2 type-micro font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {labels.profiles}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {(
            [
              "drafting",
              "review",
              "presentation",
              "focus",
            ] as CadWorkspaceProfile[]
          ).map((profile) => (
            <button
              key={profile}
              data-testid={`cad-workspace-profile-${profile}`}
              onClick={() => onProfile(profile)}
              className={`rounded-control border px-2 py-1.5 type-micro font-semibold focus-visible:ring-2 focus-visible:ring-indigo-400/50 ${preferences.profile === profile ? "border-primary/30 bg-primary/15 text-primary-ink" : "border-border bg-muted/40 text-foreground hover:bg-muted"}`}
            >
              {labels[profile]}
            </button>
          ))}
        </div>
      </section>

      <section className={`${panel} mt-2`}>
        <div className="mb-2 type-micro font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {labels.docks}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["leftDock", labels.left],
              ["rightDock", labels.right],
              ["commandDock", labels.command],
              ["minimap", labels.minimap],
            ] as Array<
              [
                keyof Pick<
                  CadWorkspacePreferences,
                  "leftDock" | "rightDock" | "commandDock" | "minimap"
                >,
                string,
              ]
            >
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-2 rounded-control border border-border bg-surface/80 px-2 py-1.5"
            >
              <input
                data-testid={`cad-workspace-${key}`}
                type="checkbox"
                checked={preferences[key]}
                onChange={(event) => update(key, event.target.checked)}
                className="accent-indigo-500"
              />
              {label}
            </label>
          ))}
        </div>
        <label className="mt-2 flex items-center justify-between gap-2 text-muted-foreground">
          {labels.density}
          <select
            value={preferences.toolbarDensity}
            onChange={(event) =>
              update(
                "toolbarDensity",
                event.target.value as CadWorkspacePreferences["toolbarDensity"],
              )
            }
            className={select}
          >
            <option value="compact">{labels.compact}</option>
            <option value="comfortable">{labels.comfortable}</option>
          </select>
        </label>
      </section>

      <section className={`${panel} mt-2`}>
        <div className="mb-2 type-micro font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {labels.precision}
        </div>
        {(
          [
            ["crosshairPercent", labels.crosshair, 5, 100, "%"],
            ["pickBoxPx", labels.pickbox, 3, 24, "px"],
            ["aperturePx", labels.aperture, 4, 40, "px"],
          ] as const
        ).map(([key, label, min, max, unit]) => (
          <label key={key} className="mb-2 block text-muted-foreground">
            <span className="flex justify-between">
              <span>{label}</span>
              <span className="tabular-nums text-primary-ink">
                {preferences[key]}
                {unit}
              </span>
            </span>
            <input
              data-testid={`cad-workspace-${key}`}
              type="range"
              min={min}
              max={max}
              value={preferences[key]}
              onChange={(event) => update(key, Number(event.target.value))}
              className="mt-1 w-full accent-indigo-500"
            />
          </label>
        ))}
        <label className="flex items-center justify-between gap-2 text-muted-foreground">
          {labels.rightClick}
          <select
            data-testid="cad-workspace-right-click"
            value={preferences.rightClickAction}
            onChange={(event) =>
              update(
                "rightClickAction",
                event.target
                  .value as CadWorkspacePreferences["rightClickAction"],
              )
            }
            className={select}
          >
            <option value="context">{labels.context}</option>
            <option value="enter">{labels.enter}</option>
            <option value="repeat">{labels.repeat}</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-2 text-muted-foreground">
          {labels.backgroundDrag}
          <select
            data-testid="cad-workspace-background-drag"
            value={preferences.backgroundDrag}
            onChange={(event) =>
              update(
                "backgroundDrag",
                event.target.value as CadWorkspacePreferences["backgroundDrag"],
              )
            }
            className={select}
          >
            <option value="marquee">{labels.marquee}</option>
            <option value="pan">{labels.pan}</option>
          </select>
        </label>
      </section>

      <section className={`${panel} mt-2`}>
        <div className="mb-2 type-micro font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {labels.appearance}
        </div>
        <div className="flex items-center justify-between gap-2">
          <select
            aria-label="Theme"
            value={colorScheme}
            onChange={(event) =>
              setColorScheme(event.target.value as ColorScheme)
            }
            className={select}
          >
            <option value="system">System</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
          <LanguageSwitcher variant="compact" />
        </div>
      </section>

      <section className={`${panel} mt-2`}>
        <div className="mb-2 flex items-center justify-between">
          <span className="type-micro font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {labels.shortcuts}
          </span>
          {conflicts.length > 0 && (
            <span className="type-micro text-danger-ink">
              {labels.conflict}: {conflicts.length}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {SHORTCUT_IDS.map((id) => {
            const definition = CAD_KEYBOARD_SHORTCUTS.find(
              (shortcut) => shortcut.id === id,
            )!;
            const active = shortcuts.find((shortcut) => shortcut.id === id);
            const value =
              preferences.shortcutOverrides[id] ??
              [
                active?.ctrl ? "Ctrl" : null,
                active?.shift ? "Shift" : null,
                active?.alt ? "Alt" : null,
                active?.key?.toUpperCase(),
              ]
                .filter(Boolean)
                .join("+");
            return (
              <label key={id} className="min-w-0 type-micro text-muted-foreground">
                <span className="block truncate" title={definition.description}>
                  {definition.label}
                </span>
                <input
                  data-testid={`cad-workspace-shortcut-${id}`}
                  title={aliasCollisions
                    .filter((collision) => collision.startsWith(`${id}:`))
                    .map((collision) => {
                      const stolen = collision.slice(collision.indexOf("→") + 1);
                      return english
                        ? `${value} is ${stolen} on the command line; pick another key or a combination`
                        : `${value} es ${stolen} en la línea de comandos; elige otra tecla o una combinación`;
                    })
                    .join(" · ") || undefined}
                  value={value}
                  onChange={(event) =>
                    update("shortcutOverrides", {
                      ...preferences.shortcutOverrides,
                      [id]: event.target.value,
                    })
                  }
                  className="mt-0.5 w-full rounded-control border border-border bg-surface/80 px-1.5 py-1 type-micro text-foreground outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50"
                />
              </label>
            );
          })}
        </div>
      </section>

      <button
        data-testid="cad-workspace-reset"
        onClick={onReset}
        className="mt-3 w-full rounded-control border border-warning/30 bg-warning/15 px-3 py-1.5 font-semibold text-warning-ink hover:bg-warning/15 focus-visible:ring-2 focus-visible:ring-amber-300/60"
      >
        {labels.reset}
      </button>
    </div>
  );
}
