import { socialCard, SOCIAL_CARD_SIZE, SOCIAL_CARD_CONTENT_TYPE } from "@/lib/seo/social-card";
import { galleryTemplate } from "@/lib/marketing/template-gallery";

/**
 * Tarjeta social POR PLANTILLA: quien comparte «plano de taquería» en un chat
 * ve el giro y el dato duro, no una tarjeta genérica. Sin cifras de precio ni
 * promesas: huella y objetos salen del catálogo.
 */
export const alt = "Plantilla de plano CAD de Valle Design";
export const size = SOCIAL_CARD_SIZE;
export const contentType = SOCIAL_CARD_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const template = galleryTemplate(id);
  return socialCard({
    eyebrow: template ? `Plantilla · ${template.giroLabel}` : "Plantillas",
    title: template ? `Plano de ${template.label}` : "Plantillas de planos",
    footnote: template
      ? `${template.widthM} × ${template.heightM} m · ${template.objects} objetos editables · gratis en el navegador`
      : "Arranques por giro, gratis en el navegador",
  });
}
