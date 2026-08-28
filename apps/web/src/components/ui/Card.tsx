import type { ElementType, HTMLAttributes, ReactNode } from "react";
import {
  cx,
  elevation,
  motionBase,
  radius,
  type Elevation,
  type Radius,
} from "./styles";

/**
 * LA SUPERFICIE. Tarjeta, panel, paleta y aviso son la misma cosa con distinta
 * elevación, así que son un componente con una prop.
 *
 * Lo que esto arregla: la app tenía 29 `shadow-2xl` contra 2 `shadow-sm`. Casi
 * todo flotaba al máximo, y cuando todo flota nada destaca — la jerarquía se
 * apaga y la interfaz se lee como un montón de cajas del mismo peso. Con tres
 * niveles nombrados por intención, elegir mal cuesta más que elegir bien.
 *
 * `as` existe porque una tarjeta a veces es un `<article>`, a veces un `<li>` y
 * a veces una `<section>`: la semántica la decide el contenido, no el estilo.
 */

/**
 * LA TEXTURA TÉCNICA — el detalle de tarjeta premium de la campaña de firma.
 *
 * Tres opciones y no más, porque una textura que se puede elegir de siete
 * maneras deja de significar nada:
 *
 *   · `none`    lo normal. El 90% de las tarjetas de la app.
 *   · `corners` marcas de escuadra en las cuatro esquinas, como las marcas de
 *               registro de una lámina. Para lo que hay que MIRAR: el marco
 *               del producto, la tarjeta de un plan, el panel de alta.
 *   · `grid`    retícula de plano de fondo. Para superficies grandes y vacías
 *               —estados vacíos, secciones de fondo— donde el vacío es el
 *               problema y la textura es lo que lo llena sin añadir ruido.
 *
 * Ninguna de las dos toca el contenido: la retícula va detrás y las marcas van
 * en un `::before` con `pointer-events: none`, así que una tarjeta con textura
 * sigue siendo pulsable exactamente igual.
 */
export type SurfaceTexture = "none" | "corners" | "grid";

export interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  elevation?: Elevation;
  radius?: Radius;
  /** Borde hairline del token. Se quita para superficies que ya van dentro de otra. */
  bordered?: boolean;
  /** Sube un nivel de elevación bajo el puntero. Sólo si la tarjeta ES pulsable. */
  interactive?: boolean;
  padded?: boolean | "sm" | "lg";
  /** Textura técnica de fondo. Ver `SurfaceTexture`. */
  texture?: SurfaceTexture;
  children?: ReactNode;
}

const PADDING = {
  false: "",
  true: "p-6",
  sm: "p-4",
  lg: "p-8 sm:p-10",
} as const;

const TEXTURE: Record<SurfaceTexture, string> = {
  none: "",
  corners: "corner-marks",
  // La retícula sale al pleno del token de borde (ver `.blueprint-grid`); la
  // sutileza la pone la opacidad, aquí y no en la utilidad, para que una
  // sección oscura pueda pedir más presencia que una tarjeta clara.
  grid: "blueprint-grid bg-blend-normal",
};

export function Surface({
  as: Tag = "div",
  elevation: level = "resting",
  radius: r = "card",
  bordered = true,
  interactive = false,
  padded = true,
  texture = "none",
  className,
  children,
  ...rest
}: SurfaceProps) {
  return (
    <Tag
      className={cx(
        "bg-card text-card-foreground",
        radius[r],
        elevation[level],
        bordered && "border border-border",
        PADDING[String(padded) as keyof typeof PADDING],
        TEXTURE[texture],
        // Una tarjeta pulsable ahora SE LEVANTA además de iluminarse. Un
        // píxel y medio de traslación es imperceptible como movimiento y
        // perfectamente perceptible como respuesta: el ojo lee «esto se puede
        // tocar» antes de que el cerebro lea la etiqueta.
        interactive &&
          cx(
            motionBase,
            "hover:shadow-elevated hover:border-primary/40 hover:-translate-y-0.5",
          ),
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** Alias con el nombre que espera quien viene de otro sistema de diseño. */
export const Card = Surface;

/* ── Piezas de composición ──────────────────────────────────────────────── */

export function CardHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="type-eyebrow mb-2 text-muted-foreground">{eyebrow}</p>
        ) : null}
        <h3 className="type-heading text-foreground">{title}</h3>
        {description ? (
          <p className="type-small mt-2 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
