import { ImageResponse } from "next/og";
import { BrandGlyph } from "@/components/brand/BrandGlyph";
import {
  BRAND_INK,
} from "@/components/brand/logo-geometry";

/**
 * EL ICONO DE LA PESTAÑA.
 *
 * Antes de esto no existía ninguno: la pestaña mostraba el globo terráqueo por
 * defecto de Next, que es literalmente la marca de Next en el navegador del
 * cliente. Un producto de 199 al mes con el favicon de su framework le está
 * diciendo al comprador cuánto se ha mirado a sí mismo.
 *
 * Se genera con `ImageResponse` desde LA MISMA geometría que el componente
 * `<Logo/>` y que los SVG de `public/brand/`. Sin binarios que mantener a mano
 * y sin posibilidad de que el icono se quede en una versión anterior del logo.
 *
 * FONDO SÓLIDO, no transparente: el icono se ve sobre la pestaña (clara), sobre
 * la barra de marcadores (que sigue el tema del sistema) y sobre el escritorio
 * si alguien lo ancla. Con fondo propio se ve igual en los tres; sin él,
 * desaparece en uno.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: 6,
        }}
      >
        <BrandGlyph size={26} />
      </div>
    ),
    size,
  );
}
