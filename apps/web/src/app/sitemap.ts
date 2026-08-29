import type { MetadataRoute } from "next";
import { PUBLIC_ROUTES, absoluteUrl } from "@/config/site-routes";
import { galleryTemplates } from "@/lib/marketing/template-gallery";

/**
 * SITEMAP derivado, nunca escrito a mano.
 *
 * Cada entrada sale de una de DOS fuentes derivadas: `PUBLIC_ROUTES` (las
 * páginas declaradas) y el catálogo de plantillas (una ficha por plantilla,
 * vía `galleryTemplates()`). Este archivo sigue sin conocer ninguna ruta por
 * su cuenta: añadir una página pública es tocar la lista, y añadir una
 * plantilla al catálogo la mete aquí sola. Las fichas no viven en
 * `PUBLIC_ROUTES` porque esa configuración viaja en el bundle cliente de la
 * barra pública y el catálogo pesa 5 000 líneas; el sitemap solo existe en
 * servidor.
 *
 * `lastModified` es la fecha del BUILD, no la de edición del contenido: el
 * repositorio no guarda una fecha de publicación por página, y fabricar una por
 * ruta sería inventar un dato. La fecha del despliegue es cierta y no engaña a
 * nadie sobre qué cambió.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    ...PUBLIC_ROUTES.map((route) => ({
      url: absoluteUrl(route.path),
      lastModified,
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    })),
    ...galleryTemplates().map((template) => ({
      url: absoluteUrl(`/plantillas/${template.id}`),
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
