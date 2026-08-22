import { socialCard, SOCIAL_CARD_SIZE, SOCIAL_CARD_CONTENT_TYPE } from "@/lib/seo/social-card";

/**
 * La misma tarjeta para X/Twitter.
 *
 * Existe como archivo propio aunque el contenido coincida con el de Open Graph:
 * `page-metadata.ts` declara `summary_large_image`, y esa tarjeta recorta a
 * 2:1 mientras Open Graph muestra 1.91:1. Tener el archivo separado deja el
 * encuadre de X ajustable el día que haga falta sin tocar el de WhatsApp, que
 * es el canal que de verdad vende aquí.
 */
export const alt = "Valle Design · CAD en línea para dibujar planos en el navegador";
export const size = SOCIAL_CARD_SIZE;
export const contentType = SOCIAL_CARD_CONTENT_TYPE;

export default function Image() {
  return socialCard({
    eyebrow: "CAD en línea · Arquitectura e ingeniería",
    title: "Dibuja tus planos en el navegador. Sin instalar nada.",
    footnote: "Capas · Cotas asociativas · Espacio papel · DXF · PDF a escala",
  });
}
