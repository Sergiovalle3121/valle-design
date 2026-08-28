"use client";

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { Check } from "lucide-react";
import { cx, focusRing, motionBase } from "./styles";

/* ── CHECKBOX ───────────────────────────────────────────────────────────── */

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  wrapperClassName?: string;
}

/**
 * Casilla de verificación.
 *
 * El `<input>` real sigue ahí, `sr-only` pero PRESENTE: es lo que hace que el
 * teclado, el formulario, el autocompletado y el lector de pantalla funcionen
 * sin escribir una línea de ARIA. Lo que se dibuja es un hermano decorativo que
 * lee el estado con `peer-checked`. Una casilla hecha con `<div onClick>` se ve
 * igual y no la puede usar la mitad de la gente.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox(
    { label, hint, error, wrapperClassName, className, ...rest },
    ref,
  ) {
    const id = useId();
    const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

    return (
      <div className={cx("flex flex-col gap-1.5", wrapperClassName)}>
        <div className="flex items-start gap-2.5">
          <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
            <input
              {...rest}
              ref={ref}
              id={id}
              type="checkbox"
              aria-describedby={describedBy}
              aria-invalid={Boolean(error) || undefined}
              className={cx("peer sr-only", className)}
            />
            <span
              aria-hidden="true"
              className={cx(
                "flex h-5 w-5 items-center justify-center rounded-[0.3125rem] border",
                motionBase,
                error ? "border-danger" : "border-input",
                "bg-card peer-checked:border-brand-strong peer-checked:bg-brand-strong",
                "peer-disabled:opacity-50",
                "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
                // La palomita se revela por COLOR, no por opacidad, y el color
                // lo pone este contenedor —que sí es hermano del input— para
                // que `peer-checked` alcance. `peer-*` genera un selector de
                // hermano (`~`): sobre un nieto del hermano no engancha, y la
                // palomita quedaría visible siempre.
                "text-transparent peer-checked:text-primary-foreground",
              )}
            >
              <Check className="h-3.5 w-3.5 text-current" />
            </span>
          </span>
          <label
            htmlFor={id}
            className="type-small cursor-pointer text-foreground"
          >
            {label}
          </label>
        </div>
        {error ? (
          <p
            id={`${id}-error`}
            role="alert"
            className="type-caption pl-[1.875rem] text-danger-ink"
          >
            {error}
          </p>
        ) : hint ? (
          <p
            id={`${id}-hint`}
            className="type-caption pl-[1.875rem] text-muted-foreground"
          >
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);

/* ── SWITCH ─────────────────────────────────────────────────────────────── */

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
  /** Se propaga tal cual: NUNCA se renombra un gancho de prueba existente. */
  "data-testid"?: string;
}

/**
 * Conmutador.
 *
 * Casilla y conmutador NO son lo mismo, aunque los dos guarden un booleano: la
 * casilla dice "esto se aplicará cuando envíes"; el conmutador dice "esto YA
 * está aplicado". Por eso el conmutador es un `role="switch"` y no un
 * `checkbox`, y por eso no vive dentro de un `<form>` que se envía.
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  hint,
  disabled,
  className,
  ...rest
}: SwitchProps) {
  const id = useId();
  return (
    <div className={cx("flex items-start justify-between gap-4", className)}>
      <span className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={id} className="type-small font-medium text-foreground">
          {label}
        </label>
        {hint ? (
          <span className="type-caption text-muted-foreground">{hint}</span>
        ) : null}
      </span>
      <button
        {...rest}
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cx(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent",
          motionBase,
          focusRing,
          "disabled:pointer-events-none disabled:opacity-50",
          checked ? "bg-brand-strong" : "bg-muted border-input",
        )}
      >
        <span
          aria-hidden="true"
          className={cx(
            "inline-block h-4.5 w-4.5 rounded-full bg-card shadow-resting",
            motionBase,
            checked ? "translate-x-[1.4rem]" : "translate-x-[0.2rem]",
          )}
        />
      </button>
    </div>
  );
}
