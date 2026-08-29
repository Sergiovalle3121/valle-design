import type { Metadata } from "next";
import { Suspense } from "react";
import { JsonLd } from "@/components/JsonLd";
import { PublicNav } from "@/components/PublicNav";
import { SkipLink } from "@/components/SkipLink";
import { TemplateExplorer } from "@/components/gallery/TemplateExplorer";
import { galleryTemplates } from "@/lib/marketing/template-gallery";
import { publicPageMetadata } from "@/lib/seo/page-metadata";
import { breadcrumbJsonLd, itemListJsonLd } from "@/lib/seo/structured-data";

/**
 * /plantillas — EL ESCAPARATE.
 *
 * El producto trae un catálogo de plantillas mexicanas que hasta esta campaña
 * vivía escondido dentro del editor: casa habitación, consultorio, taquería,
 * notaría, nave industrial. Eso no es una lista de opciones — es la respuesta
 * exacta a «plano de <mi negocio>», que es como busca la gente que este
 * producto atiende. Esta página lo pone en la calle: cada plantilla con su
 * plano dibujado POR EL MOTOR (no ilustraciones), su ficha y su lámina PDF.
 *
 * La cifra del título sale del catálogo en build: si mañana son 160, la página
 * dice 160 sin que nadie recuerde tocarla.
 */
const templates = galleryTemplates();

export const metadata: Metadata = publicPageMetadata({
  path: "/plantillas",
  title: `Plantillas de planos: ${templates.length} arranques por giro`,
  description:
    `${templates.length} plantillas CAD gratuitas para tu plano en el navegador: ` +
    "vivienda, salud, alimentos, comercio y talleres, con capas de norma mexicana y cajetín listos.",
});

export default function PlantillasPage() {
  return (
    <>
      <SkipLink />
      <PublicNav />
      <main id="contenido" className="text-foreground">
        <JsonLd
          data={itemListJsonLd(
            templates.map((template) => [
              template.label,
              `/plantillas/${template.id}`,
            ]),
          )}
        />
        <JsonLd data={breadcrumbJsonLd([["Plantillas", "/plantillas"]])} />
        <section className="border-b border-border">
          <div className="mx-auto max-w-7xl px-5 pb-12 pt-12 sm:px-8 lg:pt-16">
            <p className="flex items-center gap-3 type-eyebrow text-primary-ink">
              <span className="type-sheet-number opacity-85">01</span>
              Catálogo de plantillas
            </p>
            <h1 className="type-display mt-5 max-w-3xl">
              El plano de tu giro ya está empezado
            </h1>
            <p className="type-lead mt-6 max-w-2xl text-muted-foreground">
              {templates.length} arranques dibujados con el motor real: capas de
              norma mexicana, escala puesta y cajetín con responsiva. Elige el
              tuyo, mira su lámina y empieza a dibujar en el navegador — gratis
              y sin instalar nada.
            </p>
          </div>
        </section>
        <section aria-label="Todas las plantillas" className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
          {/* useSearchParams exige Suspense en App Router; el fallback es la
              misma retícula sin filtros aplicados, así que no hay salto. */}
          <Suspense>
            <TemplateExplorer templates={templates} />
          </Suspense>
        </section>
      </main>
    </>
  );
}
