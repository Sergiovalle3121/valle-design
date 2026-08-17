import type { MetadataRoute } from "next";
import {
  PRIVATE_ROUTE_PREFIXES,
  SITE_URL,
  absoluteUrl,
} from "@/config/site-routes";

/**
 * ROBOTS — permite el rastreo de la superficie pública y cierra la privada.
 *
 * El `disallow` no es una medida de seguridad y no se usa como tal: lo que
 * protege `/dashboard` o `/studio` es la sesión verificada en el servidor. Su
 * trabajo aquí es de posicionamiento — evitar que el rastreador gaste
 * presupuesto en pantallas que sólo le devolverán un login, y evitar que una
 * URL con token de un solo uso (`/reset-password`, `/verify-email`) termine
 * indexada por haber sido compartida.
 *
 * El `sitemap` se declara aunque el buscador ya lo busque en la ruta estándar:
 * es la forma barata de que también lo encuentren los rastreadores que sólo
 * leen este archivo.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: PRIVATE_ROUTE_PREFIXES.map((prefix) => `${prefix}/`),
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: SITE_URL,
  };
}
