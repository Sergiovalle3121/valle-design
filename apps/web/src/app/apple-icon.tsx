import { ImageResponse } from "next/og";
import { BrandGlyph } from "@/components/brand/BrandGlyph";
import {
  BRAND_INK,
} from "@/components/brand/logo-geometry";

/**
 * ICONO PARA "AÑADIR A PANTALLA DE INICIO" EN iOS.
 *
 * 180×180 es el tamaño que pide Apple. Dos diferencias respecto del favicon, y
 * ninguna es cosmética:
 *
 *  · SIN esquinas redondeadas. iOS recorta el icono con su propia máscara; si
 *    ya viene redondeado, se recorta dos veces y queda un halo del fondo de la
 *    página alrededor del icono.
 *  · Márgenes generosos. La máscara de iOS come alrededor de un 8% de cada
 *    lado, así que la marca vive en el centro con aire de sobra.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: BRAND_INK.light,
        }}
      >
        <BrandGlyph size={118} />
      </div>
    ),
    size,
  );
}
