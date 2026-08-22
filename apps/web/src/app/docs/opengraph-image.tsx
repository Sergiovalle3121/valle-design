import { socialCard, SOCIAL_CARD_SIZE, SOCIAL_CARD_CONTENT_TYPE } from "@/lib/seo/social-card";

/**
 * Tarjeta social GENÉRICA de las guías (`/docs` y todas sus hijas).
 *
 * Genérica a propósito: escribir una por guía obligaría a mantener seis
 * archivos casi idénticos, y el titular de una guía ya viaja en `og:title`. Lo
 * que la imagen aporta aquí es reconocimiento de marca, no información nueva.
 */
export const alt = "Valle Design · Guías de dibujo técnico";
export const size = SOCIAL_CARD_SIZE;
export const contentType = SOCIAL_CARD_CONTENT_TYPE;

export default function Image() {
  return socialCard({
    eyebrow: "Guías",
    title: "Cómo se dibuja, se acota y se imprime un plano.",
    footnote: "Escritas desde lo que el producto hace de verdad",
  });
}
