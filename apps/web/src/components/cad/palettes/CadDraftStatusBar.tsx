"use client";

/**
 * Barra de estado de las ayudas al dibujo.
 *
 * Los cuatro conmutadores que AutoCAD deja siempre a la vista —OSNAP, ORTHO,
 * POLAR y OTRACK— más la puerta a DSETTINGS. Componente PRESENTACIONAL puro y
 * memoizado: recibe la instantánea de los ajustes y emite callbacks.
 *
 * Estaban escritos a mano dentro del JSX de 6.300 líneas del monolito, con su
 * propio `className` ternario repetido cuatro veces. Aquí son un `map`.
 */
import React from "react";
import type { CadDraftSettingsSnapshot } from "./draft-settings-host";

export interface CadDraftStatusBarProps {
  settings: CadDraftSettingsSnapshot;
  polarIncrements: readonly number[];
  onToggleOsnap: () => void;
  onToggleOrtho: () => void;
  onTogglePolar: () => void;
  onPolarIncrement: (degrees: number) => void;
  onToggleObjectSnapTracking: () => void;
  onClearTracking: () => void;
  onOpenSettings: () => void;
  onOpenStyles: () => void;
}

export const CadDraftStatusBar = React.memo(function CadDraftStatusBar({
  settings,
  polarIncrements,
  onToggleOsnap,
  onToggleOrtho,
  onTogglePolar,
  onPolarIncrement,
  onToggleObjectSnapTracking,
  onClearTracking,
  onOpenSettings,
  onOpenStyles,
}: CadDraftStatusBarProps) {
  const toggles = [
    {
      id: "osnap",
      active: settings.osnap,
      tone: "text-cyan-200",
      label: `OSNAP ${settings.osnap ? "on" : "off"} · F3`,
      onClick: onToggleOsnap,
    },
    {
      id: "ortho",
      active: settings.ortho,
      tone: "text-amber-300",
      label: `ORTHO ${settings.ortho ? "on" : "off"} · F8`,
      onClick: onToggleOrtho,
    },
    {
      id: "polar",
      active: settings.polar,
      tone: "text-violet-300",
      label: `POLAR ${settings.polar ? `${settings.polarIncrement}°` : "off"} · F10`,
      onClick: onTogglePolar,
    },
  ];

  return (
    <>
      {toggles.map((toggle) => (
        <button
          key={toggle.id}
          data-testid={`cad-draft-status-${toggle.id}`}
          data-active={toggle.active ? "true" : "false"}
          // El estado del conmutador debe OÍRSE, no sólo verse: aria-pressed
          // es lo que un lector de pantalla anuncia como «presionado».
          aria-pressed={toggle.active}
          onClick={toggle.onClick}
          className={
            toggle.active
              ? `${toggle.tone} hover:text-white`
              : "text-gray-500 hover:text-white"
          }
        >
          {toggle.label}
        </button>
      ))}
      <select
        aria-label="Incremento polar"
        data-testid="cad-draft-status-polar-increment"
        value={settings.polarIncrement}
        onChange={(event) => onPolarIncrement(Number(event.target.value))}
        className="rounded bg-white/[0.06] px-1 py-0.5 text-[10px] text-gray-200 outline-none"
      >
        {polarIncrements.map((value) => (
          <option key={value} value={value} className="text-gray-900">
            {value}°
          </option>
        ))}
      </select>
      <button
        data-testid="cad-draft-status-otrack"
        data-active={settings.objectSnapTracking ? "true" : "false"}
        onClick={onToggleObjectSnapTracking}
        className={
          settings.objectSnapTracking
            ? "text-fuchsia-300 hover:text-white"
            : "text-gray-500 hover:text-white"
        }
      >
        OTRACK{" "}
        {settings.objectSnapTracking
          ? `on · ${settings.acquiredTrackingPoints}`
          : "off"}{" "}
        · F11
      </button>
      {settings.acquiredTrackingPoints > 0 && (
        <button
          data-testid="cad-draft-status-clear-tracking"
          onClick={onClearTracking}
          className="text-gray-500 hover:text-white"
        >
          Limpiar tracking
        </button>
      )}
      <button
        data-testid="cad-draft-status-settings"
        onClick={onOpenSettings}
        title="Ayudas al dibujo (DSETTINGS)"
        className="text-gray-500 hover:text-white"
      >
        DSETTINGS
      </button>
      <button
        data-testid="cad-draft-status-styles"
        onClick={onOpenStyles}
        title="Gestor de estilos: texto, cota, directriz, tabla y ploteo"
        className="text-gray-500 hover:text-white"
      >
        ESTILOS
      </button>
    </>
  );
});
