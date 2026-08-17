import type { MetadataRoute } from "next";
import { PUBLIC_ROUTES, absoluteUrl } from "@/config/site-routes";

/**
 * SITEMAP derivado, nunca escrito a mano.
 *
 * Cada entrada sale de `PUBLIC_ROUTES`; este archivo no conoce ninguna ruta por
 * su cuenta. Es la única forma de que "añadir una página pública" sea un cambio
 * en un sitio y no tres, y de que el spec pueda comparar el sitemap con la
 * lista sin comparar un fichero consigo mismo.
 *
 * `lastModified` es la fecha del BUILD, no la de edición del contenido: el
 * repositorio no guarda una fecha de publicación por página, y fabricar una por
 * ruta sería inventar un dato. La fecha del despliegue es cierta y no engaña a
 * nadie sobre qué cambió.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PUBLIC_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
