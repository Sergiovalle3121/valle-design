"use client";

/**
 * DSETTINGS — el cuadro de ayudas al dibujo.
 *
 * Componente PRESENTACIONAL puro: recibe la instantánea de los ajustes y emite
 * callbacks. No importa nada de `lib/cad` ni sabe quién sostiene el estado,
 * así que se monta en un test sin editor y no puede entrar en un ciclo de
 * importación.
 *
 * Los catorce modos OSNAP ya los resolvía el motor; lo que faltaba era esta
 * pantalla. Rejilla, polar y OTRACK viven aquí también porque en AutoCAD son
 * pestañas del mismo cuadro y separarlos obligaría a recordar tres sitios.
 *
 * La rejilla NO vive en el anfitrión de ajustes: sigue siendo estado del
 * editor, porque la dibuja la escena y hay veinte sitios que la leen. Entra
 * como props para que el cuadro la enseñe y la conmute; moverla es trabajo de
 * otra ola y está anotado como tal.
 */
import React from "react";
import type { CadDraftSettingsSnapshot } from "./draft-settings-host";

/** Etiqueta legible de cada modo. La clave es el `SnapType` del motor. */
const OSNAP_LABELS: Record<string, string> = {
  endpoint: "Punto final",
  midpoint: "Punto medio",
  center: "Centro",
  "geometric-center": "Centro geométrico",
  node: "Punto (nodo)",
  quadrant: "Cuadrante",
  intersection: "Intersección",
  insertion: "Inserción",
  perpendicular: "Perpendicular",
  tangent: "Tangente",
  nearest: "Cercano",
  "apparent-intersection": "Intersección aparente",
  extension: "Extensión",
  grid: "Rejilla",
};

export interface CadDraftSettingsDialogProps {
  settings: CadDraftSettingsSnapshot;
  /** Modos disponibles, en el orden de desempate del motor. */
  modes: readonly string[];
  polarIncrements: readonly number[];
  /** Rejilla: la sostiene el editor, no el anfitrión de ajustes. */
  grid: { visible: boolean; snap: boolean; size: number };
  onToggleOsnap: () => void;
  onToggleMode: (mode: string, value: boolean) => void;
  onAllModes: (value: boolean) => void;
  onResetModes: () => void;
  onToggleOrtho: () => void;
  onTogglePolar: () => void;
  onPolarIncrement: (degrees: number) => void;
  onToggleObjectSnapTracking: () => void;
  onClearTracking: () => void;
  onToggleGridVisible: () => void;
  onToggleGridSnap: () => void;
  onClose: () => void;
}

function Toggle({
  testId,
  label,
  hint,
  active,
  onClick,
}: {
  testId: string;
  label: string;
  hint?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-active={active ? "true" : "false"}
      onClick={onClick}
      className={`flex items-center justify-between gap-3 rounded-control border px-2.5 py-1.5 text-left type-micro transition-colors ${
        active
          ? "border-primary/30 bg-primary/15 text-primary-ink"
          : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
      }`}
    >
      <span>
        {label}
        {hint && (
          <span className="ml-1.5 type-micro text-muted-foreground">{hint}</span>
        )}
      </span>
      <span className="type-micro font-semibold">{active ? "ON" : "OFF"}</span>
    </button>
  );
}

export const CadDraftSettingsDialog = React.memo(
  function CadDraftSettingsDialog({
    settings,
    modes,
    polarIncrements,
    grid,
    onToggleOsnap,
    onToggleMode,
    onAllModes,
    onResetModes,
    onToggleOrtho,
    onTogglePolar,
    onPolarIncrement,
    onToggleObjectSnapTracking,
    onClearTracking,
    onToggleGridVisible,
    onToggleGridSnap,
    onClose,
  }: CadDraftSettingsDialogProps) {
    const activeModes = modes.filter(
      (mode) => settings.osnapModes[mode as never],
    ).length;

    return (
      <div
        data-testid="cad-draft-settings"
        className="w-[min(640px,92vw)] max-h-[80vh] overflow-y-auto rounded-card border border-border bg-surface p-4 text-foreground shadow-2xl"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="type-small font-semibold">
              DSETTINGS · Ayudas al dibujo
            </div>
            <div className="type-micro text-muted-foreground">
              Captura a objetos, rastreo y rejilla. F3 / F8 / F10 / F11 conmutan
              lo mismo desde el teclado.
            </div>
          </div>
          <button
            type="button"
            data-testid="cad-draft-settings-close"
            aria-label="Cerrar ayudas al dibujo"
            onClick={onClose}
            className="rounded-control px-2 py-1 type-micro text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Cerrar
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <section className="rounded-card border border-border bg-muted/40 p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="type-micro uppercase tracking-wide text-primary-ink">
                Captura a objetos (OSNAP)
              </span>
              <span
                data-testid="cad-draft-settings-mode-count"
                className="type-micro text-muted-foreground"
              >
                {activeModes}/{modes.length}
              </span>
            </div>
            <Toggle
              testId="cad-draft-settings-osnap"
              label="OSNAP activo"
              hint="F3"
              active={settings.osnap}
              onClick={onToggleOsnap}
            />
            <div className="mt-2 grid gap-1">
              {modes.map((mode) => (
                <label
                  key={mode}
                  className={`flex items-center justify-between gap-2 rounded-control px-2 py-1 type-micro ${
                    settings.osnap ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {OSNAP_LABELS[mode] ?? mode}
                  <input
                    type="checkbox"
                    data-testid={`cad-osnap-mode-${mode}`}
                    checked={settings.osnapModes[mode as never] === true}
                    onChange={(event) =>
                      onToggleMode(mode, event.target.checked)
                    }
                    className="accent-indigo-500"
                  />
                </label>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2 type-micro">
              <button
                type="button"
                data-testid="cad-osnap-all"
                onClick={() => onAllModes(true)}
                className="text-muted-foreground hover:text-foreground"
              >
                Todos
              </button>
              <button
                type="button"
                data-testid="cad-osnap-none"
                onClick={() => onAllModes(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                Ninguno
              </button>
              <button
                type="button"
                data-testid="cad-osnap-reset"
                onClick={onResetModes}
                className="text-muted-foreground hover:text-foreground"
              >
                Por defecto
              </button>
            </div>
          </section>

          <div className="space-y-3">
            <section className="rounded-card border border-border bg-muted/40 p-2.5">
              <div className="mb-2 type-micro uppercase tracking-wide text-primary-ink">
                Rastreo
              </div>
              <div className="grid gap-1.5">
                <Toggle
                  testId="cad-draft-settings-ortho"
                  label="Ortho"
                  hint="F8"
                  active={settings.ortho}
                  onClick={onToggleOrtho}
                />
                <Toggle
                  testId="cad-draft-settings-polar"
                  label="Rastreo polar"
                  hint="F10"
                  active={settings.polar}
                  onClick={onTogglePolar}
                />
                <label className="flex items-center justify-between gap-2 rounded-control border border-border bg-muted/40 px-2.5 py-1.5 type-micro text-muted-foreground">
                  Incremento polar
                  <select
                    data-testid="cad-draft-settings-polar-increment"
                    value={settings.polarIncrement}
                    onChange={(event) =>
                      onPolarIncrement(Number(event.target.value))
                    }
                    className="rounded bg-surface/80 px-1.5 py-0.5 type-micro text-foreground outline-none"
                  >
                    {polarIncrements.map((value) => (
                      <option
                        key={value}
                        value={value}
                        className="text-gray-900"
                      >
                        {value}°
                      </option>
                    ))}
                  </select>
                </label>
                <Toggle
                  testId="cad-draft-settings-otrack"
                  label="Rastreo por objeto (OTRACK)"
                  hint="F11"
                  active={settings.objectSnapTracking}
                  onClick={onToggleObjectSnapTracking}
                />
                <div className="flex items-center justify-between gap-2 px-1 type-micro text-muted-foreground">
                  <span data-testid="cad-draft-settings-tracked">
                    {settings.acquiredTrackingPoints} punto(s) adquirido(s)
                  </span>
                  <button
                    type="button"
                    data-testid="cad-draft-settings-clear-tracking"
                    onClick={onClearTracking}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Limpiar
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-card border border-border bg-muted/40 p-2.5">
              <div className="mb-2 type-micro uppercase tracking-wide text-primary-ink">
                Rejilla y resolución
              </div>
              <div className="grid gap-1.5">
                <Toggle
                  testId="cad-draft-settings-grid-visible"
                  label="Mostrar rejilla"
                  hint="F7"
                  active={grid.visible}
                  onClick={onToggleGridVisible}
                />
                <Toggle
                  testId="cad-draft-settings-grid-snap"
                  label="Forzar cursor a la rejilla"
                  hint="F9"
                  active={grid.snap}
                  onClick={onToggleGridSnap}
                />
                <div className="px-1 type-micro text-muted-foreground">
                  Paso actual: {grid.size} unidades del documento.
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  },
);
