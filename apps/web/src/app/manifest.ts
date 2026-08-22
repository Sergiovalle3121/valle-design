import type { MetadataRoute } from "next";
import { BRAND } from "@/config/brand";
import { BRAND_INK } from "@/components/brand/logo-geometry";

/**
 * MANIFIESTO DE APLICACIÓN WEB.
 *
 * Se declara como ruta y no como archivo estático por la misma razón que el
 * sitemap: el nombre, la descripción y el color salen del manifiesto de marca,
 * así que un rebranding sigue siendo un cambio de configuración y no una
 * cacería de literales por el repositorio.
 *
 * `display: "standalone"` — un CAD instalado en el escritorio no quiere la
 * barra de direcciones del navegador comiéndose 60 px de lienzo.
 *
 * `background_color` es lo que pinta el sistema operativo ANTES de que arranque
 * la aplicación: va al fondo OSCURO porque es el tema en el que se dibuja, y un
 * destello blanco antes de abrir el estudio es exactamente el tipo de detalle
 * que separa una aplicación de una página web con atajo.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.productNames.design} · ${BRAND.descriptor}`,
    short_name: BRAND.productNames.design,
    description: BRAND.tagline.es,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    lang: "es-MX",
    dir: "ltr",
    background_color: BRAND_INK.light,
    theme_color: BRAND_INK.light,
    categories: ["productivity", "graphics", "business"],
    icons: [
      {
        src: "/icon",
        sizes: "32x32",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        // `any maskable` deja que Android recorte el icono con la forma del
        // lanzador que tenga el usuario: el fondo sólido aguanta el recorte.
        purpose: "any",
      },
      {
        src: "/brand/isotipo-oscuro.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
