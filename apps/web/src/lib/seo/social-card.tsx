import { ImageResponse } from "next/og";
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
 * LA TARJETA SOCIAL — una sola, parametrizada por ruta.
 *
 * QUÉ ARREGLA. `page-metadata.ts` prometía `twitter:card = summary_large_image`
 * y no declaraba NI UNA imagen; `openGraph` tampoco. El resultado medido: cada
 * enlace compartido salía como un rectángulo gris vacío. En México el canal de
 * venta real es WhatsApp, y ahí un enlace sin tarjeta no es "un enlace sin
 * imagen": es un enlace que parece sospechoso.
 *
 * POR QUÉ ES UN MÓDULO Y NO SEIS ARCHIVOS. Cada ruta necesita su titular, pero
 * el fondo, la marca, la retícula y el pie son los mismos. Con seis copias, la
 * séptima ruta copia la sexta y ya nadie sabe cuál es la buena.
 *
 * SIN `<img>` NI FUENTE REMOTA. `ImageResponse` corre en el runtime de Node
 * durante el build o la petición y NO tiene acceso a la hoja de estilos de la
 * página: todo va en estilos en línea con el color resuelto. Es la segunda
 * excepción autorizada a "ningún hex fuera de globals.css", documentada en
 * `docs/design/BRAND.md`, y por eso los valores salen de `BRAND_INK` — que es
 * la conversión de los tokens, no una paleta paralela.
 *
 * La tipografía es la del sistema del runtime: cargar Inter aquí obligaría a
 * leer un `.woff` del disco en cada render y a mantener una copia del archivo.
 * Se prefiere una tarjeta que SIEMPRE se genera a una que a veces falla.
 */

export const SOCIAL_CARD_SIZE = { width: 1200, height: 630 };
export const SOCIAL_CARD_CONTENT_TYPE = "image/png";

/** La retícula de plano del fondo, dibujada con dos degradados repetidos. */
const BLUEPRINT_GRID =
  `linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px),` +
  `linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)`;

export function socialCard({
  eyebrow,
  title,
  footnote,
}: {
  /** Etiqueta técnica sobre el titular. En mayúsculas, corta. */
  eyebrow: string;
  /** El titular. Dos líneas como máximo a 60 px; más, y se corta en WhatsApp. */
  title: string;
  /** Pie: el dominio, o la promesa que remata. */
  footnote: string;
}) {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: 72,
          background: BRAND_INK.light,
          backgroundImage: BLUEPRINT_GRID,
          backgroundSize: "48px 48px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Halo de marca en la esquina: el mismo gesto que el hero, resuelto
            con un degradado radial porque `filter: blur()` no existe aquí. */}
        <div
          style={{
            position: "absolute",
            top: -220,
            right: -160,
            width: 720,
            height: 720,
            borderRadius: 9999,
            background: `radial-gradient(circle, ${BRAND_INK.accent}55 0%, transparent 65%)`,
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="44" height="44" viewBox={LOGO_VIEWBOX} fill="none">
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
          <span
            style={{
              fontSize: 30,
              fontWeight: 600,
              color: BRAND_INK.dark,
              letterSpacing: -0.6,
            }}
          >
            Valle Design
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <span
            style={{
              fontSize: 21,
              letterSpacing: 3.4,
              color: "#a5b4fc",
              textTransform: "uppercase",
            }}
          >
            {eyebrow}
          </span>
          <span
            style={{
              fontSize: 62,
              lineHeight: 1.1,
              fontWeight: 700,
              letterSpacing: -2,
              color: BRAND_INK.dark,
              maxWidth: 900,
            }}
          >
            {title}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 4,
              background: BRAND_INK.accent,
            }}
          />
          <span style={{ fontSize: 26, color: "#9aa6b8" }}>{footnote}</span>
        </div>
      </div>
    ),
    SOCIAL_CARD_SIZE,
  );
}
