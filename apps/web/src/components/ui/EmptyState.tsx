import type { ReactNode } from "react";
import { cx } from "./styles";

export interface EmptyStateProps {
  /** Ilustración o icono. Decorativo: el texto es quien informa. */
  art?: ReactNode;
  title: string;
  description?: ReactNode;
  /** Acción principal. Un estado vacío sin salida es un callejón. */
  action?: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
  size?: "sm" | "md";
  "data-testid"?: string;
}

/**
 * ESTADO VACÍO.
 *
 * Un estado vacío no es "no hay nada": es el momento en que alguien acaba de
 * llegar y no sabe qué hacer. La versión anterior del tablero resolvía esto con
 * una caja punteada y una frase gris, que informa de la ausencia y no ofrece
 * salida — y quien llega por primera vez a un producto de dibujo no quiere leer
 * que su lista está vacía, quiere dibujar.
 *
 * Por eso el `action` no es opcional en la práctica: si estás pintando un
 * estado vacío sin una salida, estás pintando un callejón.
 */
export function EmptyState({
  art,
  title,
  description,
  action,
  secondaryAction,
  className,
  size = "md",
  ...rest
}: EmptyStateProps) {
  return (
    <div
      {...rest}
      className={cx(
        "flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-card/50 text-center",
        size === "sm" ? "gap-3 p-6" : "gap-4 p-10 sm:p-14",
        className,
      )}
    >
      {art ? (
        <div aria-hidden="true" className="text-muted-foreground">
          {art}
        </div>
      ) : null}
      <div className="max-w-md">
        <p className={cx(size === "sm" ? "type-small font-semibold" : "type-heading", "text-foreground")}>
          {title}
        </p>
        {description ? (
          <p className="type-small mt-2 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action || secondaryAction ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2.5">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
