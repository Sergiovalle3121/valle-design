import type { SVGProps } from "react";
import { PRODUCT_LABEL } from "@/config/brand";
import {
  DIMENSION_LINE,
  DIMENSION_TICKS,
  LOGO_VIEWBOX,
  NODE,
  STROKE,
  VALLEY,
} from "./logo-geometry";
import { cx } from "@/components/ui";

/**
 * EL LOGOTIPO DE VALLE DESIGN.
 *
 * Lo que sustituye: hasta hoy el "logo" eran cuatro `<DraftingCompass/>` de
 * lucide pintados a mano en cuatro archivos distintos — un icono genérico que
 * usan miles de productos, en dos colores diferentes según la pantalla. La
 * marca cambiaba de color en el primer clic del embudo.
 *
 * COLOR. El isotipo se pinta con `currentColor`: hereda el color del texto de
 * quien lo contiene, así que el mismo componente sirve en claro, en oscuro,
 * sobre el relleno de un botón y en monocromo, sin una sola variante. El nodo
 * de precisión es lo ÚNICO que puede ir al acento (`accent`), porque es el
 * punto focal; en monocromo se apaga solo.
 *
 * TAMAÑO MÍNIMO. 16 px para el isotipo (por debajo, la línea de cota se cierra
 * y el nodo se come la V) y 96 px de ancho para el lockup. Está en BRAND.md.
 */

type MarkProps = SVGProps<SVGSVGElement> & {
  /** Pinta el nodo de precisión con el acento en vez de con el color del texto. */
  accent?: boolean;
};

export function LogoMark({ accent = true, className, ...rest }: MarkProps) {
  return (
    <svg
      viewBox={LOGO_VIEWBOX}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={cx("shrink-0", className)}
      {...rest}
    >
      <g
        stroke="currentColor"
        strokeWidth={STROKE.dimension}
        strokeLinecap="square"
      >
        <path d={DIMENSION_LINE} />
        {DIMENSION_TICKS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <path
        d={VALLEY}
        stroke="currentColor"
        strokeWidth={STROKE.valley}
        strokeLinecap="square"
        strokeLinejoin="round"
      />
      <rect
        x={NODE.x}
        y={NODE.y}
        width={NODE.size}
        height={NODE.size}
        // `text-brand-strong` sobre el propio <rect>: así el acento sale del
        // token y no de un hex, y en monocromo basta con no pasar `accent`.
        className={accent ? "fill-brand-strong dark:fill-primary" : "fill-current"}
      />
    </svg>
  );
}

/**
 * Lockup horizontal: isotipo + nombre.
 *
 * El nombre NO es una imagen: es texto real compuesto con la tipografía de la
 * marca que ya carga `next/font`. Un wordmark rasterizado o vectorizado a
 * curvas se ve borroso al escalar y es invisible para un buscador; éste se
 * selecciona, se lee y se indexa.
 */
export function Logo({
  className,
  markClassName,
  showWordmark = true,
}: {
  className?: string;
  markClassName?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={cx("h-7 w-7", markClassName)} />
      {showWordmark ? (
        <span className="font-semibold tracking-title text-foreground">
          {PRODUCT_LABEL.design}
        </span>
      ) : (
        <span className="sr-only">{PRODUCT_LABEL.design}</span>
      )}
    </span>
  );
}
