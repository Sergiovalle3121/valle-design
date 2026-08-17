import type { Metadata } from "next";
import { BRAND } from "@/config/brand";
import { absoluteUrl } from "@/config/site-routes";

/**
 * METADATA de una página pública — una función, no diez copias.
 *
 * Cada página necesita lo mismo: título, descripción, canonical y las mismas
 * etiquetas Open Graph. Escrito a mano en cada archivo, lo que ocurre es que
 * unas páginas tienen canonical y otras no, y las que lo tienen apuntan a
 * dominios distintos. El canonical importa de verdad aquí: sin él, la misma
 * página servida con y sin barra final, o con parámetros de campaña pegados,
 * se indexa varias veces y compite consigo misma.
 *
 * El `title` va SIN el nombre del producto: el `template` del layout raíz ya lo
 * añade (`%s · Valle Design`). Repetirlo daría "Precios · Valle Design · Valle
 * Design", que es exactamente el tipo de detalle que delata una web descuidada.
 */
export function publicPageMetadata({
  path,
  title,
  description,
}: {
  /** Ruta interna, empezando por `/`. De ella sale el canonical. */
  path: string;
  title: string;
  description: string;
}): Metadata {
  const url = absoluteUrl(path);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      // En Open Graph no hay plantilla que complete el nombre: aquí sí se
      // escribe entero, porque este título viaja solo dentro de una tarjeta
      // compartida en WhatsApp o LinkedIn.
      title: `${title} · ${BRAND.productNames.design}`,
      description,
      siteName: BRAND.productNames.design,
      locale: "es_MX",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · ${BRAND.productNames.design}`,
      description,
    },
  };
}
