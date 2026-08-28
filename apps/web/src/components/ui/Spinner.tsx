import { cx } from "./styles";

const SIZES = {
  xs: "h-3 w-3 border-[1.5px]",
  sm: "h-4 w-4 border-2",
  md: "h-5 w-5 border-2",
  lg: "h-8 w-8 border-[3px]",
} as const;

export interface SpinnerProps {
  size?: keyof typeof SIZES;
  className?: string;
  /**
   * Texto que anuncia el lector de pantalla. Si el spinner vive DENTRO de un
   * botón que ya dice "Guardando…", pasa `label={null}`: anunciarlo dos veces
   * es peor que no anunciarlo.
   */
  label?: string | null;
}

/**
 * Indicador de trabajo en curso.
 *
 * `border-current` es lo que lo hace universal: hereda el color del texto de
 * quien lo contiene, así que el mismo componente sirve dentro de un botón
 * primario (blanco), de uno fantasma (color de texto) y de un panel (apagado)
 * sin una sola variante de color.
 *
 * El movimiento lo neutraliza `prefers-reduced-motion` desde `globals.css`; el
 * anillo sigue viéndose, sólo deja de girar.
 */
export function Spinner({
  size = "sm",
  className,
  label = "Cargando",
}: SpinnerProps) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-hidden={label ? undefined : true}
      className={cx(
        "inline-block shrink-0 animate-spin rounded-full border-current border-r-transparent align-[-0.125em]",
        SIZES[size],
        className,
      )}
    >
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
