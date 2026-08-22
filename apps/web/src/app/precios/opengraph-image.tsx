import { socialCard, SOCIAL_CARD_SIZE, SOCIAL_CARD_CONTENT_TYPE } from "@/lib/seo/social-card";

/**
 * Tarjeta social de PRECIOS.
 *
 * No lleva cifra: el catálogo se resuelve en servidor y una tarjeta social se
 * cachea durante días en cada mensajería que la haya visto. Un precio congelado
 * en una imagen que ya no se puede corregir es una promesa que el producto
 * acabaría incumpliendo sin querer.
 */
export const alt = "Valle Design · Planes y precios";
export const size = SOCIAL_CARD_SIZE;
export const contentType = SOCIAL_CARD_CONTENT_TYPE;

export default function Image() {
  return socialCard({
    eyebrow: "Planes y precios",
    title: "Un plan por despacho. Sin licencias por equipo.",
    footnote: "IVA incluido · Factura CFDI · Cancela cuando quieras",
  });
}
