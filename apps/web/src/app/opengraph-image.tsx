import { socialCard, SOCIAL_CARD_SIZE, SOCIAL_CARD_CONTENT_TYPE } from "@/lib/seo/social-card";

/**
 * Tarjeta social de la PORTADA (y de toda ruta que no traiga la suya: Next
 * hereda este archivo hacia abajo en el árbol de rutas).
 *
 * El titular dice lo que el producto hace, no lo que la empresa es. Quien ve
 * esto en WhatsApp está decidiendo si toca el enlace, y "dibuja tus planos en
 * el navegador" responde esa pregunta; "plataforma CAD en la nube" no.
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
