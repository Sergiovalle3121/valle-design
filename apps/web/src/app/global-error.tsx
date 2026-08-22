"use client";

import {
  BRAND_INK,
  DIMENSION_LINE,
  DIMENSION_TICKS,
  LOGO_VIEWBOX,
  NODE,
  STROKE,
  VALLEY,
} from "@/components/brand/logo-geometry";

/**
 * EL ÚLTIMO RECURSO — cuando falla el propio `layout` raíz.
 *
 * `global-error` sustituye al documento ENTERO, `<html>` y `<body>` incluidos.
 * Eso tiene una consecuencia que se olvida siempre y que decide cómo hay que
 * escribir este archivo: **el layout raíz no se ha montado**, así que aquí NO
 * existen el `ThemeProvider`, ni las variables CSS de `globals.css`, ni la
 * tipografía de `next/font`, ni los proveedores de idioma. Un componente que
 * use `bg-card` o `<Logo/>` se pintaría sin estilo o directamente reventaría —
 * dentro de la pantalla que existe para cuando todo lo demás ha reventado.
 *
 * Por eso, y sólo por eso, esta pantalla lleva estilos en línea con el color
 * resuelto y dibuja el isotipo desde la misma geometría de marca. Es la tercera
 * excepción a «ningún hex fuera de globals.css», documentada en
 * `docs/design/BRAND.md`.
 *
 * Se pinta en oscuro fijo: sin `ThemeProvider` no hay forma de saber qué tema
 * quería el usuario, y un blanco a pantalla completa a las once de la noche es
 * peor que un oscuro a mediodía.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es-MX">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "2rem",
          background: BRAND_INK.light,
          color: BRAND_INK.dark,
          fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "34rem" }}>
          <svg
            width="40"
            height="40"
            viewBox={LOGO_VIEWBOX}
            fill="none"
            aria-hidden="true"
            style={{ display: "block", margin: "0 auto" }}
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

          <h1
            style={{
              margin: "2rem 0 0",
              fontSize: "1.75rem",
              fontWeight: 650,
              letterSpacing: "-0.024em",
            }}
          >
            Valle Design no pudo arrancar
          </h1>
          <p
            style={{
              margin: "1rem 0 0",
              fontSize: "1rem",
              lineHeight: 1.65,
              color: "#9aa6b8",
            }}
          >
            Falló algo en la base de la aplicación. Tus documentos guardados
            están intactos: esto ocurrió antes de tocar ninguno.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "2rem",
              minHeight: "3rem",
              padding: "0 1.5rem",
              borderRadius: "0.625rem",
              border: "none",
              background: BRAND_INK.accent,
              color: "#ffffff",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>

          {error.digest ? (
            <p
              style={{
                margin: "2rem 0 0",
                fontSize: "0.875rem",
                color: "#9aa6b8",
              }}
            >
              Código para soporte:{" "}
              <code style={{ fontFamily: "ui-monospace, monospace" }}>
                {error.digest}
              </code>
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
