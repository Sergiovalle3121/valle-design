/**
 * TEXTO SEO de las fichas de plantilla.
 *
 * Vive aparte de `template-gallery.ts` a propósito: el manifiesto de evidencia
 * (`apps/web/scripts/template-gallery-evidence.mts`) importa el catálogo para
 * hashear geometría y corre en CI ANTES del build, cuando
 * `@valle-design/contracts` todavía no está compilado. El catálogo no puede
 * arrastrar el manifiesto de marca hasta ese gate; el título y la descripción,
 * que sí lo necesitan, sólo los pide una página de Next, donde la resolución
 * del paquete es la del build.
 */
import { PRODUCT_LABEL } from "@/config/brand";

import type { GalleryTemplate } from "./template-giros";

/** Título SEO de la ficha: cómo se busca, no cómo se llama la entidad. */
export function templateSeoTitle(template: GalleryTemplate): string {
  return `Plano de ${template.label.toLowerCase()} — plantilla CAD gratuita en el navegador`;
}

export function templateSeoDescription(template: GalleryTemplate): string {
  return (
    `${template.description} Ábrela en ${PRODUCT_LABEL.design} con capas de norma mexicana, ` +
    `cotas y cajetín listos: ${template.widthM} × ${template.heightM} m, ` +
    `${template.objects} objetos editables. Sin instalar nada.`
  );
}
