"use client";

import type { ReactNode } from "react";
import { cx } from "@/components/ui";
import { CAD_SHELL_METRICS } from "./cad-shell-layout";
import { useCadUiMode } from "./ui-mode-host";

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
  /**
   * Se pinta también en el modo Esencial. Lo demás del riel se esconde ahí
   * (no se borra): sigue en Pro y por Ctrl+K. Tanda 1 del encargo del
   * 22-sep-2026: paneles laterales plegados y biblioteca a petición.
   */
  essential?: true;
}

export interface CadDockRailProps {
  side: "left" | "right";
  items: readonly CadRailItem[];
  /** Id del panel abierto en este lado, o `null` si el muelle está plegado. */
  activeId: string | null;
  /** Pulsar el botón YA activo vuelve a plegar el muelle (mismo botón, cierra). */
  onToggle: (id: string) => void;
  /**
   * El botón que TIENE ALGO QUE ENSEÑAR aunque su panel esté plegado: lleva un
   * punto, como la barra de actividad de un IDE.
   *
   * Hace falta desde que designar dejó de abrir el muelle solo (ola «legible»:
   * el plano se quedaba quieto, pero quien designaba perdía la única señal de
   * que hay propiedades que tocar). El punto repone esa señal sin mover ni un
   * píxel del dibujo. No se pinta en el que ya está abierto: ahí el contenido
   * se ve, y un aviso de algo que está a la vista es ruido.
   */
  badgeId?: string | null;
  className?: string;
}

/**
 * EL RIEL. 44 px de iconos, uno por panel del muelle — reemplaza el botón
 * único de "colapsar/expandir" que tenía cada muelle (36 px, un solo
 * destino) por una fila de destinos, como la barra de actividad de un IDE o
 * la ficha de paletas de AutoCAD. Máximo UN panel abierto por lado: el
 * propio `activeId` lo garantiza — es un valor, no un conjunto.
 */
export function CadDockRail({
  side,
  items,
  activeId,
  onToggle,
  badgeId,
  className,
}: CadDockRailProps) {
  const mode = useCadUiMode();
  const visibles = mode === "esencial" ? items.filter((item) => item.essential) : items;
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
      {visibles.map((item) => {
        const active = item.id === activeId;
        const marcado = !active && item.id === badgeId;
        return (
          <button
            key={item.id}
            type="button"
            data-testid={`cad-rail-${item.id}`}
            data-badge={marcado ? "true" : undefined}
            aria-label={marcado ? `${item.ariaLabel} (hay algo que ver)` : item.ariaLabel}
            aria-pressed={active}
            title={item.title ?? item.ariaLabel}
            onClick={() => onToggle(item.id)}
            className={cx(
              "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-control transition-colors",
              active
                ? "bg-brand-strong text-primary-foreground"
                : "hover:bg-muted hover:text-foreground",
            )}
          >
            {item.icon}
            {marcado ? (
              // Un punto, no un número: lo que importa es que HAY algo, y el
              // recuento exacto ya lo dice la barra de estado («3 sel»).
              <span
                aria-hidden="true"
                className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-brand-strong"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
