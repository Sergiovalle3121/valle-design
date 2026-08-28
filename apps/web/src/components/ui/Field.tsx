"use client";

import { useId, type ReactNode } from "react";
import { cx, focusRing, motionBase } from "./styles";

/**
 * EL ENVOLTORIO DE CAMPO — etiqueta, ayuda y error, resueltos una vez.
 *
 * Los 127 `<input>` escritos a mano de la app repetían el mismo bloque
 * `<div><label/><input/></div>` con cinco radios distintos y sin un solo
 * mensaje de error asociado por `aria-describedby`. Un error que se pinta en
 * rojo debajo del campo pero no está enlazado NO EXISTE para quien usa lector
 * de pantalla: oye "correo electrónico, campo de texto" y nada más.
 *
 * Aquí el enlace es estructural: el campo recibe `aria-describedby` y
 * `aria-invalid`, y la ayuda desaparece cuando hay error para no leer dos
 * textos que se contradicen.
 */

export interface FieldShellProps {
  label: string;
  /** Ayuda permanente bajo el campo. Se oculta mientras hay error. */
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  /** Oculta la etiqueta a la vista SIN quitarla del árbol de accesibilidad. */
  hideLabel?: boolean;
  className?: string;
  children: (ids: {
    id: string;
    describedBy: string | undefined;
    invalid: boolean;
  }) => ReactNode;
}

export function FieldShell({
  label,
  hint,
  error,
  required,
  hideLabel,
  className,
  children,
}: FieldShellProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const invalid = Boolean(error);
  const describedBy = invalid ? errorId : hint ? hintId : undefined;

  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <label
        htmlFor={id}
        className={cx(
          "type-small font-medium text-foreground",
          hideLabel && "sr-only",
        )}
      >
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-0.5 text-danger-ink">
            *
          </span>
        ) : null}
      </label>

      {children({ id, describedBy, invalid })}

      {invalid ? (
        <p id={errorId} role="alert" className="type-caption text-danger-ink">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="type-caption text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * La piel compartida de input, textarea y select. Un solo sitio donde vive el
 * radio, el relleno, el borde, el anillo de foco y el estado inválido: si esto
 * se duplicara, los tres controles empezarían a divergir a la primera prisa.
 */
export function controlClass(invalid: boolean, className?: string): string {
  return cx(
    "w-full rounded-control border bg-card px-3.5 text-foreground",
    "placeholder:text-muted-foreground",
    motionBase,
    focusRing,
    // El campo enfocado no sólo se marca: se ENCIENDE. `focus-glow` añade la
    // veladura del acento por fuera del anillo y el borde salta al color de
    // marca, así que el ojo encuentra el campo activo sin buscarlo. Es la
    // diferencia entre un formulario correcto y uno que se siente vivo, y en
    // el embudo de alta —donde el cliente entrega sus datos— eso vale dinero.
    "focus-glow focus-visible:border-primary",
    "disabled:cursor-not-allowed disabled:opacity-60",
    invalid
      ? "border-danger focus-visible:ring-danger focus-visible:border-danger"
      : "border-input hover:border-muted-foreground/50",
    className,
  );
}
