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
      className={`flex items-center justify-between gap-3 rounded-lg border px-2.5 py-1.5 text-left text-[11px] transition-colors ${
        active
          ? "border-indigo-400/40 bg-indigo-400/[0.10] text-indigo-100"
          : "border-white/10 bg-white/[0.03] text-gray-400 hover:text-white"
      }`}
    >
      <span>
        {label}
        {hint && (
          <span className="ml-1.5 text-[9.5px] text-gray-500">{hint}</span>
        )}
      </span>
      <span className="text-[10px] font-semibold">{active ? "ON" : "OFF"}</span>
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
        className="w-[min(640px,92vw)] max-h-[80vh] overflow-y-auto rounded-2xl border border-white/10 bg-gray-900 p-4 text-white shadow-2xl"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold">
              DSETTINGS · Ayudas al dibujo
            </div>
            <div className="text-[10.5px] text-gray-500">
              Captura a objetos, rastreo y rejilla. F3 / F8 / F10 / F11 conmutan
              lo mismo desde el teclado.
            </div>
          </div>
          <button
            type="button"
            data-testid="cad-draft-settings-close"
            aria-label="Cerrar ayudas al dibujo"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-[11px] text-gray-400 hover:bg-white/10 hover:text-white"
          >
            Cerrar
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wide text-indigo-200">
                Captura a objetos (OSNAP)
              </span>
              <span
                data-testid="cad-draft-settings-mode-count"
                className="text-[10px] text-gray-500"
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
                  className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[11px] ${
                    settings.osnap ? "text-gray-300" : "text-gray-600"
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
            <div className="mt-2 flex items-center gap-2 text-[10px]">
              <button
                type="button"
                data-testid="cad-osnap-all"
                onClick={() => onAllModes(true)}
                className="text-gray-400 hover:text-white"
              >
                Todos
              </button>
              <button
                type="button"
                data-testid="cad-osnap-none"
                onClick={() => onAllModes(false)}
                className="text-gray-400 hover:text-white"
              >
                Ninguno
              </button>
              <button
                type="button"
                data-testid="cad-osnap-reset"
                onClick={onResetModes}
                className="text-gray-400 hover:text-white"
              >
                Por defecto
              </button>
            </div>
          </section>

          <div className="space-y-3">
            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
              <div className="mb-2 text-[10px] uppercase tracking-wide text-indigo-200">
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
                <label className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-gray-400">
                  Incremento polar
                  <select
                    data-testid="cad-draft-settings-polar-increment"
                    value={settings.polarIncrement}
                    onChange={(event) =>
                      onPolarIncrement(Number(event.target.value))
                    }
                    className="rounded bg-gray-950/70 px-1.5 py-0.5 text-[11px] text-gray-100 outline-none"
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
                <div className="flex items-center justify-between gap-2 px-1 text-[10.5px] text-gray-500">
                  <span data-testid="cad-draft-settings-tracked">
                    {settings.acquiredTrackingPoints} punto(s) adquirido(s)
                  </span>
                  <button
                    type="button"
                    data-testid="cad-draft-settings-clear-tracking"
                    onClick={onClearTracking}
                    className="text-gray-400 hover:text-white"
                  >
                    Limpiar
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
              <div className="mb-2 text-[10px] uppercase tracking-wide text-indigo-200">
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
                <div className="px-1 text-[10.5px] text-gray-500">
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
