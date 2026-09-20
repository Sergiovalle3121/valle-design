"use client";

import type { ReactNode } from "react";
import { cx } from "@/components/ui";
import { CAD_SHELL_METRICS } from "./cad-shell-layout";

/**
 * Un botón del riel. `ariaLabel` es el NOMBRE ACCESIBLE — `check:e2e-
 * localizadores` exige que no coincida con el de ningún botón de la cinta
 * (el riel abre un PANEL, nunca ejecuta la orden que ese panel administra:
 * «Abrir biblioteca», no «Línea»). `title` es el texto del tooltip; si se
 * omite se usa `ariaLabel`. Se guardan por separado porque algunos botones
 * reubicados desde la barra vieja traen un `title` largo y descriptivo que
 * varios goldens ya localizan con `getByTitle`, y mover el botón no debe
 * romper ese localizador.
 */
export interface CadRailItem {
  id: string;
  icon: ReactNode;
  ariaLabel: string;
  title?: string;
}

export interface CadDockRailProps {
  side: "left" | "right";
  items: readonly CadRailItem[];
  /** Id del panel abierto en este lado, o `null` si el muelle está plegado. */
  activeId: string | null;
  /** Pulsar el botón YA activo vuelve a plegar el muelle (mismo botón, cierra). */
  onToggle: (id: string) => void;
  className?: string;
}

/**
 * EL RIEL. 44 px de iconos, uno por panel del muelle — reemplaza el botón
 * único de "colapsar/expandir" que tenía cada muelle (36 px, un solo
 * destino) por una fila de destinos, como la barra de actividad de un IDE o
 * la ficha de paletas de AutoCAD. Máximo UN panel abierto por lado: el
 * propio `activeId` lo garantiza — es un valor, no un conjunto.
 */
export function CadDockRail({ side, items, activeId, onToggle, className }: CadDockRailProps) {
  return (
    <div
      data-testid={side === "left" ? "cad-left-rail" : "cad-right-rail"}
      className={cx(
        "flex shrink-0 flex-col items-center gap-0.5 bg-surface/90 py-1.5 text-muted-foreground",
        side === "left" ? "border-r border-border" : "border-l border-border",
        className,
      )}
      style={{ width: CAD_SHELL_METRICS.rail }}
    >
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            data-testid={`cad-rail-${item.id}`}
            aria-label={item.ariaLabel}
            aria-pressed={active}
            title={item.title ?? item.ariaLabel}
            onClick={() => onToggle(item.id)}
            className={cx(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-control transition-colors",
              active
                ? "bg-brand-strong text-primary-foreground"
                : "hover:bg-muted hover:text-foreground",
            )}
          >
            {item.icon}
          </button>
        );
      })}
    </div>
  );
}
