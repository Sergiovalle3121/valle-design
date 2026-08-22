"use client";

import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";
import { controlClass, FieldShell } from "./Field";
import { cx, touchTarget } from "./styles";

interface Common {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  hideLabel?: boolean;
  /** Clases del CONTENEDOR, no del control. */
  wrapperClassName?: string;
}

/* ── INPUT ──────────────────────────────────────────────────────────────── */

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size">,
    Common {
  /**
   * Tipografía monoespaciada para el contenido. Un token, una coordenada o una
   * clave se leen carácter a carácter, y una grotesca proporcional convierte
   * el cotejo en un ejercicio de fe: la l, la I y el 1 son la misma mancha.
   */
  mono?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, hideLabel, wrapperClassName, mono, className, ...rest },
  ref,
) {
  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      hideLabel={hideLabel}
      required={rest.required}
      className={wrapperClassName}
    >
      {({ id, describedBy, invalid }) => (
        <input
          {...rest}
          ref={ref}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={controlClass(
            invalid,
            cx(touchTarget, "type-small", mono && "type-mono", className),
          )}
        />
      )}
    </FieldShell>
  );
});

/* ── TEXTAREA ───────────────────────────────────────────────────────────── */

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement>,
    Common {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { label, hint, error, hideLabel, wrapperClassName, className, rows = 4, ...rest },
    ref,
  ) {
    return (
      <FieldShell
        label={label}
        hint={hint}
        error={error}
        hideLabel={hideLabel}
        required={rest.required}
        className={wrapperClassName}
      >
        {({ id, describedBy, invalid }) => (
          <textarea
            {...rest}
            ref={ref}
            id={id}
            rows={rows}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className={controlClass(
              invalid,
              cx("type-small resize-y py-2.5", className),
            )}
          />
        )}
      </FieldShell>
    );
  },
);

/* ── SELECT ─────────────────────────────────────────────────────────────── */

export interface SelectProps
  extends SelectHTMLAttributes<HTMLSelectElement>,
    Common {
  children: ReactNode;
}

/**
 * El `<select>` nativo con la piel del sistema.
 *
 * Nativo a propósito: en móvil abre la rueda del sistema operativo, que es
 * infinitamente mejor que cualquier lista que podamos dibujar, y con teclado ya
 * hace lo correcto sin una línea de JavaScript. Lo único que se sustituye es la
 * flecha —`appearance-none` mata la del sistema, distinta en cada plataforma— y
 * se dibuja la nuestra, que no captura el puntero para no robarle el clic.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    { label, hint, error, hideLabel, wrapperClassName, className, children, ...rest },
    ref,
  ) {
    return (
      <FieldShell
        label={label}
        hint={hint}
        error={error}
        hideLabel={hideLabel}
        required={rest.required}
        className={wrapperClassName}
      >
        {({ id, describedBy, invalid }) => (
          <div className="relative">
            <select
              {...rest}
              ref={ref}
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              className={controlClass(
                invalid,
                cx(touchTarget, "type-small appearance-none pr-9", className),
              )}
            >
              {children}
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
          </div>
        )}
      </FieldShell>
    );
  },
);
