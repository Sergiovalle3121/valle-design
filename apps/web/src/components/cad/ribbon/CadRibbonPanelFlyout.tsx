"use client";

import { useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cx } from "@/components/ui";
import type { CadRibbonCommand } from "@/lib/cad/ribbon";
import { CadRibbonButton } from "./CadRibbonButton";
import { cadRibbonFlyoutRows, isInsideCadRibbonFloating, openCadRibbonFlyout } from "./ribbon-floating";

/** Una acción sobre el panel entero, en la cabecera del desplegable. */
export interface CadRibbonPanelAction {
  label: string;
  testId: string;
  run: () => void;
}

/**
 * EL DESPLEGABLE DE UN PANEL — lo que no cabe en la cinta, a un clic.
 *
 * Como el «slide-out» de un panel de AutoCAD: pulsar la barra del rótulo
 * (rótulo + ▾) o el botón grande de un panel plegado abre, bajo el panel, los
 * comandos que la cinta no está mostrando. Se monta SÓLO al abrir: en reposo
 * no hay ningún botón de más en el DOM, así que `cad-ribbon-command-X` sigue
 * siendo único en la pestaña y el golden 67 (ningún control tapado) mide la
 * cinta en reposo tal como se ve.
 *
 * Se pinta en un PORTAL a `<body>` con `position: fixed` calculada desde el
 * panel (`ribbon-floating.ts`): colgado de la tira de paneles, que es
 * `overflow-x-auto`, quedaba recortado a sus 77 px de alto y se salía por la
 * derecha. Los eventos de React siguen el árbol de React a través del
 * portal, así que Escape y el blindaje de sólo lectura de `cad-shell` lo
 * siguen viendo como parte de la cinta.
 *
 * Cierra con Escape (y devuelve el foco a quien lo abrió), con un clic
 * fuera, al irse el foco a otra parte, al cambiar el tamaño de la ventana
 * (la cinta reparte de nuevo sus paneles) y al despachar un comando. El foco
 * entra al primer botón al abrir, sin desplazar nada, para que se pueda
 * recorrer con Tab sin pasar por el ratón.
 */
export function CadRibbonPanelFlyout({
  panelLabel,
  labelId,
  commands,
  onRun,
  disabledCommands,
  variant,
  icon: PanelIcon,
  anchorRef,
  panelAction,
}: {
  panelLabel: string;
  /** El id del rótulo del panel: vive dentro del disparador (en las dos variantes). */
  labelId: string;
  commands: readonly CadRibbonCommand[];
  onRun: (name: string) => void;
  disabledCommands?: ReadonlySet<string>;
  /** `title`: la barra del rótulo (rótulo + ▾). `panel`: el botón grande del panel plegado. */
  variant: "title" | "panel";
  icon?: LucideIcon;
  /** Bajo qué se abre: el panel entero. Sin él, bajo el propio disparador. */
  anchorRef?: RefObject<HTMLElement | null>;
  /** «Plegar a un botón» o «Mostrar en la cinta», en la cabecera. */
  panelAction?: CadRibbonPanelAction;
}) {
  // El ancho de la ventana AL ABRIR, o null si está cerrado: decide cuántas
  // columnas caben (`cadRibbonFlyoutRows`). Se lee en el clic, no al pintar.
  const [openViewportWidth, setOpenViewportWidth] = useState<number | null>(null);
  const open = openViewportWidth !== null;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  // `useLayoutEffect`: se coloca antes de pintar, así el primer cuadro ya
  // sale en su sitio (nace `invisible` en la esquina hasta entonces).
  useLayoutEffect(() => {
    if (!open) return;
    const popover = popoverRef.current;
    const anchor = anchorRef?.current ?? rootRef.current;
    if (!popover || !anchor) return;
    return openCadRibbonFlyout({
      popover,
      anchor,
      root: rootRef.current,
      view: window,
      doc: document,
      onDismiss: () => setOpenViewportWidth(null),
    });
  }, [open, anchorRef]);

  const toggle = () => setOpenViewportWidth(open ? null : window.innerWidth);
  const close = (restoreFocus: boolean) => {
    setOpenViewportWidth(null);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
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
      onBlur={(event) => {
        // El foco se fue a otra parte (Tab fuera del desplegable): se cierra.
        // Sin `relatedTarget` (la ventana perdió el foco) no se toca nada.
        if (!open || !event.relatedTarget) return;
        if (isInsideCadRibbonFloating(event.relatedTarget, [rootRef.current, popoverRef.current])) return;
        setOpenViewportWidth(null);
      }}
    >
      {variant === "panel" ? (
        <button
          ref={triggerRef}
          type="button"
          data-testid={`cad-ribbon-panel-toggle-${panelLabel}`}
          aria-expanded={open}
          aria-controls={open ? popoverId : undefined}
          onClick={toggle}
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
        // La barra del rótulo ENTERA abre el panel, como en AutoCAD: antes
        // el rótulo plegaba el panel (y lo guardaba) y sólo el ▾ de 14 px
        // lo abría.
        <button
          ref={triggerRef}
          type="button"
          data-testid={`cad-ribbon-panel-toggle-${panelLabel}`}
          aria-expanded={open}
          aria-controls={open ? popoverId : undefined}
          aria-label={triggerTitle}
          onClick={toggle}
          title={triggerTitle}
          className={cx(
            "type-micro inline-flex items-center gap-0.5 rounded-control px-1",
            "text-muted-foreground hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            open && "bg-muted text-foreground",
          )}
        >
          <span id={labelId}>{panelLabel}</span>
          <ChevronDown aria-hidden="true" className={cx("h-3 w-3 shrink-0", open && "rotate-180")} />
        </button>
      )}
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              id={popoverId}
              role="group"
              aria-label={`Panel ${panelLabel}, completo`}
              data-testid={`cad-ribbon-panel-flyout-${panelLabel}`}
              // `fixed` + `invisible` en la esquina hasta que
              // `positionCadRibbonFloating` lo coloca; `w-max` para medir su
              // ancho natural; `overflow-auto` por si la ventana le pone tope.
              // `z-[80]`: sobre el estudio (`cad-shell`, `z-[70]`, también en
              // <body>) y bajo los diálogos (`Modal`, `z-[400]`).
              className="invisible fixed left-0 top-0 z-[80] flex w-max flex-col gap-1 overflow-auto rounded-card border border-border bg-popover p-1.5 text-popover-foreground shadow-floating"
            >
              <div className="flex items-center justify-between gap-3 px-1">
                <span className="type-micro font-semibold">{panelLabel}</span>
                {panelAction ? (
                  <button
                    type="button"
                    data-testid={panelAction.testId}
                    onClick={() => {
                      close(false);
                      panelAction.run();
                    }}
                    className="type-micro rounded-control px-1 text-primary-ink hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {panelAction.label}
                  </button>
                ) : null}
              </div>
              <div
                className="grid auto-cols-max grid-flow-col gap-0.5"
                style={{ gridTemplateRows: `repeat(${cadRibbonFlyoutRows(commands.length, openViewportWidth)}, auto)` }}
              >
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
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
