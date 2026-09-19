"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cx } from "@/components/ui";
import type { CadRibbonCommand } from "@/lib/cad/ribbon";
import { CadRibbonButton } from "./CadRibbonButton";

/**
 * EL DESPLEGABLE DE UN PANEL — lo que no cabe en la cinta, a un clic.
 *
 * Como el «slide-out» de un panel de AutoCAD: el ▾ junto al rótulo (o el
 * botón grande de un panel plegado) abre, bajo el panel, los comandos que la
 * cinta no está mostrando. Se monta SÓLO al abrir: en reposo no hay ningún
 * botón de más en el DOM, así que `cad-ribbon-command-X` sigue siendo único
 * en la pestaña y el golden 67 (ningún control tapado) mide la cinta en
 * reposo tal como se ve.
 *
 * Cierra con Escape (y devuelve el foco a quien lo abrió), con un clic
 * fuera, y al despachar un comando. El foco entra al primer botón al abrir
 * para que se pueda recorrer con Tab sin pasar por el ratón.
 */
export function CadRibbonPanelFlyout({
  panelLabel,
  labelId,
  commands,
  onRun,
  disabledCommands,
  variant,
  icon: PanelIcon,
  onExpandPanel,
}: {
  panelLabel: string;
  /** El id del rótulo del panel: en la variante `panel` vive dentro del botón. */
  labelId: string;
  commands: readonly CadRibbonCommand[];
  onRun: (name: string) => void;
  disabledCommands?: ReadonlySet<string>;
  /** `caret`: el ▾ junto al rótulo. `panel`: el botón grande del panel plegado. */
  variant: "caret" | "panel";
  icon?: LucideIcon;
  /** Sólo en un panel plegado A MANO: cómo volver a desplegarlo en la cinta. */
  onExpandPanel?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return;
    // Un clic FUERA cierra: se escucha en `pointerdown` para que el mismo
    // clic que abre otro desplegable cierre éste sin un paso intermedio.
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    rootRef.current
      ?.querySelector<HTMLButtonElement>('[data-testid^="cad-ribbon-command-"]')
      ?.focus();
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };
  const triggerTitle = open ? `Cerrar el panel ${panelLabel}` : `Mostrar todo el panel ${panelLabel}`;

  return (
    <div
      ref={rootRef}
      className={variant === "panel" ? "flex h-full" : "inline-flex"}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.preventDefault();
        event.stopPropagation();
        close(true);
      }}
    >
      {variant === "panel" ? (
        <button
          ref={triggerRef}
          type="button"
          data-testid={`cad-ribbon-panel-toggle-${panelLabel}`}
          aria-expanded={open}
          aria-controls={open ? popoverId : undefined}
          onClick={() => setOpen((value) => !value)}
          title={triggerTitle}
          className={cx(
            "flex h-[3.75rem] w-[4.5rem] shrink-0 flex-col items-center justify-start gap-0.5 rounded-control px-0.5 py-0.5",
            "text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {PanelIcon ? <PanelIcon aria-hidden="true" className="h-6 w-6 shrink-0" /> : null}
          <span id={labelId} className="type-micro w-full break-words text-center leading-tight">
            {panelLabel}
          </span>
          <ChevronDown aria-hidden="true" className="h-3 w-3 shrink-0" />
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          data-testid={`cad-ribbon-panel-toggle-${panelLabel}`}
          aria-expanded={open}
          aria-controls={open ? popoverId : undefined}
          aria-label={triggerTitle}
          onClick={() => setOpen((value) => !value)}
          title={triggerTitle}
          className="rounded-control p-px text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown aria-hidden="true" className={cx("h-3 w-3", open && "rotate-180")} />
        </button>
      )}
      {open ? (
        <div
          id={popoverId}
          role="group"
          aria-label={`Panel ${panelLabel}, completo`}
          data-testid={`cad-ribbon-panel-flyout-${panelLabel}`}
          className="absolute left-0 top-full z-40 mt-0.5 flex min-w-max flex-col gap-1 rounded-card border border-border bg-popover p-1.5 text-popover-foreground shadow-floating"
        >
          <div className="flex items-center justify-between gap-3 px-1">
            <span className="type-micro font-semibold">{panelLabel}</span>
            {onExpandPanel ? (
              <button
                type="button"
                data-testid={`cad-ribbon-panel-expand-${panelLabel}`}
                onClick={() => {
                  setOpen(false);
                  onExpandPanel();
                }}
                className="type-micro rounded-control px-1 text-primary-ink hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Mostrar en la cinta
              </button>
            ) : null}
          </div>
          <div className="grid auto-cols-max grid-flow-col grid-rows-6 gap-0.5">
            {commands.map((command) => (
              <CadRibbonButton
                key={command.name}
                command={command}
                size="menu"
                disabled={disabledCommands?.has(command.name)}
                onRun={(name) => {
                  close(false);
                  onRun(name);
                }}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
