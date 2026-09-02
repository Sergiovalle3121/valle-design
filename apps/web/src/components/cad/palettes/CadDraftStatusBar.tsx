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

/**
 * UN SOLO COLOR DE «ACTIVO».
 *
 * Los cuatro conmutadores llevaban cuatro colores distintos —OSNAP cian, ORTHO
 * ámbar, POLAR violeta, OTRACK fucsia—, y ninguno de los cuatro significaba
 * nada: no son cuatro categorías, son cuatro instancias de UN estado. Cuatro
 * colores para un estado le enseñan al ojo que el color no informa, y a partir
 * de ahí deja de mirarlo: el ámbar de ORTHO se leía igual que un aviso.
 *
 * El estado es binario, así que el código es binario: acento de marca cuando
 * está puesto, gris apagado cuando no. Lo que distingue un conmutador de otro
 * es su etiqueta, que es lo que un dibujante lee de todas formas.
 */
const TOGGLE_ON = "text-primary hover:text-foreground";
const TOGGLE_OFF = "text-muted-foreground hover:text-foreground";

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
      label: `OSNAP ${settings.osnap ? "on" : "off"}`, key: "F3",
      onClick: onToggleOsnap,
    },
    {
      id: "ortho",
      active: settings.ortho,
      label: `ORTHO ${settings.ortho ? "on" : "off"}`, key: "F8",
      onClick: onToggleOrtho,
    },
    {
      id: "polar",
      active: settings.polar,
      label: `POLAR ${settings.polar ? `${settings.polarIncrement}°` : "off"}`, key: "F10",
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
          className={toggle.active ? TOGGLE_ON : TOGGLE_OFF}
        >
          {toggle.label}
          {/* La tecla es de segundo orden bajo 40 rem: con el panel derecho
              ancho el lienzo baja a ~500 px y cada sufijo cuesta un renglón
              de barra, que a 720 px de alto se lo come el lienzo (golden 19). */}
          <span className="@max-[40rem]:hidden">{` · ${toggle.key}`}</span>
        </button>
      ))}
      <select
        aria-label="Incremento polar"
        data-testid="cad-draft-status-polar-increment"
        value={settings.polarIncrement}
        onChange={(event) => onPolarIncrement(Number(event.target.value))}
        className="type-micro rounded-control bg-surface/60 px-1.5 py-0.5 text-foreground outline-none @max-[40rem]:hidden"
      >
        {polarIncrements.map((value) => (
          <option key={value} value={value} className="text-foreground">
            {value}°
          </option>
        ))}
      </select>
      <button
        data-testid="cad-draft-status-otrack"
        data-active={settings.objectSnapTracking ? "true" : "false"}
        onClick={onToggleObjectSnapTracking}
        className={settings.objectSnapTracking ? TOGGLE_ON : TOGGLE_OFF}
      >
        OTRACK{" "}
        {settings.objectSnapTracking
          ? `on · ${settings.acquiredTrackingPoints}`
          : "off"}{" "}
        <span className="@max-[40rem]:hidden"> · F11</span>
      </button>
      {settings.acquiredTrackingPoints > 0 && (
        <button
          data-testid="cad-draft-status-clear-tracking"
          onClick={onClearTracking}
          className={TOGGLE_OFF}
        >
          Limpiar tracking
        </button>
      )}
      <button
        data-testid="cad-draft-status-settings"
        onClick={onOpenSettings}
        title="Ayudas al dibujo (DSETTINGS)"
        className={`${TOGGLE_OFF} @max-[40rem]:hidden`}
      >
        DSETTINGS
      </button>
      <button
        data-testid="cad-draft-status-styles"
        onClick={onOpenStyles}
        title="Gestor de estilos: texto, cota, directriz, tabla y ploteo"
        className={`${TOGGLE_OFF} @max-[40rem]:hidden`}
      >
        ESTILOS
      </button>
    </>
  );
});
