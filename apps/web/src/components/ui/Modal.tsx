"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "./Button";
import { cx } from "./styles";

/**
 * DIÁLOGO MODAL ACCESIBLE.
 *
 * Un modal mal hecho no se ve mal: se rompe. Lo que este resuelve, y que casi
 * nunca se resuelve:
 *
 *  1. FOCO ATRAPADO. Con Tab abierto, el foco escapa al documento de detrás y
 *     quien navega con teclado empieza a pulsar botones que no ve. Aquí el Tab
 *     circula dentro del diálogo y sólo dentro.
 *  2. FOCO DEVUELTO. Al cerrar, el foco vuelve al control que lo abrió. Sin
 *     esto, el foco cae al principio del documento y hay que recorrer la página
 *     entera para volver donde se estaba.
 *  3. SCROLL BLOQUEADO. Sin bloquearlo, la rueda del ratón desplaza la página
 *     de atrás y el modal parece flotar sobre un fondo que se mueve solo.
 *  4. ESCAPE CIERRA. Es la tecla que todo el mundo pulsa.
 *  5. PORTAL A <body>. Un modal dentro de un contenedor con `overflow: hidden`
 *     o `transform` se recorta o se reposiciona: el ancestro le cambia el
 *     sistema de coordenadas a `position: fixed`.
 *
 * El clic en el velo cierra SÓLO si empezó en el velo: arrastrar una selección
 * de texto desde dentro del diálogo y soltar fuera no debe cerrarlo.
 */

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Oculta la X. Úsalo sólo si el pie ya ofrece una salida explícita. */
  hideCloseButton?: boolean;
  className?: string;
  "data-testid"?: string;
}

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-3xl",
} as const;

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  hideCloseButton = false,
  className,
  ...rest
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const veilPressRef = useRef(false);

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const targets = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((node) => node.offsetParent !== null || node === document.activeElement);
      if (targets.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = targets[0];
      const last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;

    restoreRef.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown, true);

    // Al primer control del diálogo, no al diálogo: quien usa teclado espera
    // poder actuar de inmediato, no tener que tabular una vez para empezar.
    const panel = panelRef.current;
    const firstControl = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (firstControl ?? panel)?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = overflow;
      restoreRef.current?.focus?.();
    };
  }, [open, onKeyDown]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[400] grid place-items-center overflow-y-auto bg-foreground/40 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        veilPressRef.current = event.target === event.currentTarget;
      }}
      onMouseUp={(event) => {
        if (veilPressRef.current && event.target === event.currentTarget) onClose();
        veilPressRef.current = false;
      }}
    >
      <div
        {...rest}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cx(
          "w-full rounded-surface border border-border bg-card text-card-foreground shadow-floating outline-none",
          SIZES[size],
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-6 pb-4">
          <div className="min-w-0">
            <h2 className="type-heading text-foreground">{title}</h2>
            {description ? (
              <p className="type-small mt-1.5 text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {hideCloseButton ? null : (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Cerrar"
              className="-mr-2 -mt-1 px-2"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          )}
        </div>

        {children ? <div className="p-6">{children}</div> : null}

        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border p-6 pt-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
