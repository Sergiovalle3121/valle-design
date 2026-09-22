"use client";

/**
 * Barra de estado de las ayudas al dibujo.
 *
 * Los cuatro conmutadores que AutoCAD deja siempre a la vista —OSNAP, ORTHO,
 * POLAR y OTRACK— más la puerta a DSETTINGS y al gestor de estilos.
 * Componente PRESENTACIONAL puro y memoizado: recibe la instantánea de los
 * ajustes y emite callbacks.
 *
 * ## Ola «estado»: de texto a icono
 *
 * Cada conmutador ocupaba un botón de texto («OSNAP on · F3», «POLAR 45°· F10»,
 * «OTRACK on · 0· F11»…) que sólo cabía completo envolviendo a un segundo
 * renglón, y bajo 40 rem la tecla se ocultaba con `@max-[40rem]:hidden` sin
 * quedar alcanzable en ningún otro sitio. Con la fila de estado fija a una
 * sola línea de 26 px (contrato del armazón, `CAD_SHELL_METRICS.statusRow`) el
 * texto ya no cabe cuatro veces — así que deja de ser texto: es un icono con
 * `aria-label`/`title` completos (nombre + tecla, p. ej. «Referencia a objetos
 * activada · F3») y `data-active` para quien lo mida por atributo. El nombre
 * accesible ya no es el texto visible, así que cualquier golden que localice
 * por `data-testid` (todos lo hacen: `check:e2e-localizadores` los audita)
 * sigue encontrando el mismo botón; el que localizara por el texto «OSNAP» no
 * existía — sólo se leía por `data-active` (golden 52).
 *
 * `bg-brand-strong text-primary-foreground` para «encendido» reutiliza el par
 * ya verificado por `check:contrast` (el mismo que usa `CadDockRail`), no
 * `--primary` crudo: el sistema de diseño reserva `--primary` para acentos
 * gráficos (el punto de un estado, un trazo) y `--brand-strong` para el
 * RELLENO de un control con estado, que es justo lo que es este botón cuando
 * está activo.
 */
import React from "react";
import { Compass, CornerUpRight, Magnet, Palette, Settings2, Waypoints } from "lucide-react";
import type { CadDraftSettingsSnapshot } from "./draft-settings-host";

/**
 * UN SOLO COLOR DE «ACTIVO», ahora como RELLENO en vez de tinta de letra.
 *
 * Los cuatro conmutadores llevaban cuatro colores de TEXTO distintos en una
 * versión anterior a ésta —OSNAP cian, ORTHO ámbar, POLAR violeta, OTRACK
 * fucsia—, y ninguno de los cuatro significaba nada: no son cuatro categorías,
 * son cuatro instancias de UN estado. El estado es binario, así que el icono
 * es binario: relleno de marca cuando está puesto, tinta apagada cuando no. Lo
 * que distingue un conmutador de otro es su icono y su `aria-label`, que es lo
 * que un lector de pantalla anuncia de todas formas.
 */
const ICON_ON = "bg-brand-strong text-primary-foreground";
const ICON_OFF = "text-muted-foreground hover:bg-muted hover:text-foreground";
const ICON_BUTTON =
  "inline-flex h-full min-w-[1.5rem] shrink-0 items-center justify-center rounded-sm px-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";

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
      icon: Magnet,
      // Ejemplo literal del encargo: el nombre y la tecla, en ese orden.
      // «Referencia» es femenino: activada/desactivada.
      name: "Referencia a objetos",
      participio: settings.osnap ? "activada" : "desactivada",
      key: "F3",
      onClick: onToggleOsnap,
    },
    {
      id: "ortho",
      active: settings.ortho,
      icon: CornerUpRight,
      // «Modo» es masculino: activado/desactivado.
      name: "Modo ortogonal",
      participio: settings.ortho ? "activado" : "desactivado",
      key: "F8",
      onClick: onToggleOrtho,
    },
    {
      id: "polar",
      active: settings.polar,
      icon: Compass,
      // «Rastreo» es masculino: activado/desactivado.
      name: settings.polar
        ? `Rastreo polar a ${settings.polarIncrement}°`
        : "Rastreo polar",
      participio: settings.polar ? "activado" : "desactivado",
      key: "F10",
      onClick: onTogglePolar,
    },
  ] as const;

  return (
    <>
      {toggles.map((toggle) => {
        const Icon = toggle.icon;
        const label = `${toggle.name} ${toggle.participio} · ${toggle.key}`;
        return (
          <button
            key={toggle.id}
            type="button"
            data-testid={`cad-draft-status-${toggle.id}`}
            data-active={toggle.active ? "true" : "false"}
            // El estado del conmutador debe OÍRSE, no sólo verse: aria-pressed
            // es lo que un lector de pantalla anuncia como «presionado».
            aria-pressed={toggle.active}
            aria-label={label}
            title={label}
            onClick={toggle.onClick}
            className={`${ICON_BUTTON} ${toggle.active ? ICON_ON : ICON_OFF}`}
          >
            <Icon aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        );
      })}
      <select
        aria-label="Incremento del rastreo polar"
        title="Incremento del rastreo polar"
        data-testid="cad-draft-status-polar-increment"
        value={settings.polarIncrement}
        onChange={(event) => onPolarIncrement(Number(event.target.value))}
        className="type-micro rounded-control bg-surface/60 px-1 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {polarIncrements.map((value) => (
          <option key={value} value={value} className="text-foreground">
            {value}°
          </option>
        ))}
      </select>
      <button
        type="button"
        data-testid="cad-draft-status-otrack"
        data-active={settings.objectSnapTracking ? "true" : "false"}
        aria-pressed={settings.objectSnapTracking}
        aria-label={`Seguimiento de referencia a objetos ${
          settings.objectSnapTracking
            ? `activado · ${settings.acquiredTrackingPoints} punto(s) adquirido(s)`
            : "desactivado"
        } · F11`}
        title={`Seguimiento de referencia a objetos ${settings.objectSnapTracking ? "activado" : "desactivado"} · F11`}
        onClick={onToggleObjectSnapTracking}
        className={`${ICON_BUTTON} ${settings.objectSnapTracking ? ICON_ON : ICON_OFF}`}
      >
        <Waypoints aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
      {settings.acquiredTrackingPoints > 0 && (
        <button
          type="button"
          data-testid="cad-draft-status-clear-tracking"
          onClick={onClearTracking}
          className={`${ICON_OFF} whitespace-nowrap px-1`}
        >
          Limpiar tracking
        </button>
      )}
      <button
        type="button"
        data-testid="cad-draft-status-settings"
        aria-label="Ajustes de dibujo (DSETTINGS)"
        title="Ajustes de dibujo (DSETTINGS)"
        onClick={onOpenSettings}
        className={`${ICON_BUTTON} ${ICON_OFF}`}
      >
        <Settings2 aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        data-testid="cad-draft-status-styles"
        aria-label="Gestor de estilos: texto, cota, directriz, tabla y ploteo"
        title="Gestor de estilos: texto, cota, directriz, tabla y ploteo"
        onClick={onOpenStyles}
        className={`${ICON_BUTTON} ${ICON_OFF}`}
      >
        <Palette aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
    </>
  );
});
