"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Spinner } from "./Spinner";
import {
  BUTTON_SIZES,
  BUTTON_VARIANTS,
  cx,
  disabledBase,
  focusRing,
  motionBase,
  type ButtonSize,
  type ButtonVariant,
} from "./styles";

/**
 * EL BOTÓN. Uno.
 *
 * La app tenía 329 `<button>` escritos a mano y CINCO constantes de botón
 * incompatibles entre sí (`publicActionClass`, `linkBase`, `buttonClass` y dos
 * `BUTTON` distintos), con al menos 25 combinaciones de radio + fondo. Eso no
 * es variedad: es que nadie podía reutilizar el de al lado, así que cada
 * pantalla escribía el suyo y ninguno envejecía igual.
 *
 * CONTRASTE. El relleno primario NO usa `--primary`: ese acento es el tono
 * VISIBLE de la marca, no el legible. Usa `--brand-primary-strong`, que existe
 * en el sistema exactamente para esto. Medido por `npm run check:contrast`:
 * reposo 6,93:1 en claro y 5,34:1 en oscuro; hover 8,85:1 y 4,76:1. Los cuatro
 * estados pasan AA, porque un botón no deja de tener que leerse mientras el
 * puntero está encima — y desde la campaña de firma esos números ya no se
 * mantienen a mano: si alguien mueve el token, el gate lo dice.
 */

const SPINNER_SIZE = { sm: "xs", md: "sm", lg: "md" } as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * Trabajo en curso. Deshabilita el botón y cambia el icono izquierdo por un
   * spinner CONSERVANDO la etiqueta, para que el ancho no salte: un botón que
   * encoge al pulsarlo mueve todo lo que tiene al lado.
   */
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "md",
      loading = false,
      iconLeft,
      iconRight,
      fullWidth = false,
      className,
      children,
      disabled,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        // Un botón ocupado sigue siendo un botón: `aria-busy` es lo que un
        // lector de pantalla anuncia sin que la etiqueta tenga que mentir.
        aria-busy={loading || undefined}
        className={cx(
          "inline-flex items-center justify-center rounded-control whitespace-nowrap",
          motionBase,
          focusRing,
          disabledBase,
          "disabled:cursor-not-allowed",
          BUTTON_SIZES[size],
          BUTTON_VARIANTS[variant],
          fullWidth && "w-full",
          className,
        )}
        {...rest}
      >
        {loading ? (
          <Spinner size={SPINNER_SIZE[size]} label={null} />
        ) : (
          iconLeft
        )}
        {children}
        {iconRight}
      </button>
    );
  },
);
