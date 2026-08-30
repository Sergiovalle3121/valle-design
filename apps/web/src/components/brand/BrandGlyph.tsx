import type { SVGProps } from "react";
import {
  BRAND_INK,
  DIMENSION_LINE,
  DIMENSION_TICKS,
  LOGO_VIEWBOX,
  NODE,
  STROKE,
  VALLEY,
} from "./logo-geometry";

/**
 * EL glifo de la marca como un solo componente. La geometría canónica ya
 * vivía en `logo-geometry.ts`, pero el JSX que la dibuja estaba copiado en
 * cuatro archivos (icon, apple-icon, global-error, social-card): un cambio
 * de trazo tocaba cuatro sitios y se olvidaba uno. Sin "use client" ni
 * estado a propósito: lo consumen por igual los generadores de imagen
 * (next/og · Satori) y las páginas React.
 */
export function BrandGlyph({
  size,
  ...svgProps
}: { size: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={LOGO_VIEWBOX}
      fill="none"
      {...svgProps}
    >
      <g
        stroke={BRAND_INK.dark}
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
        stroke={BRAND_INK.dark}
        strokeWidth={STROKE.valley}
        strokeLinecap="square"
        strokeLinejoin="round"
      />
      <rect
        x={NODE.x}
        y={NODE.y}
        width={NODE.size}
        height={NODE.size}
        fill={BRAND_INK.accent}
      />
    </svg>
  );
}
