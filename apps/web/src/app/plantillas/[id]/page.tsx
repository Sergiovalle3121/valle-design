import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, FileDown } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { PublicNav } from "@/components/PublicNav";
import { SkipLink } from "@/components/SkipLink";
import { PlanRender } from "@/components/gallery/PlanRender";
import { buttonClass } from "@/components/ui";
import { buildCadTemplateDocument } from "@/lib/cad/template-document";
import { cadTemplateNotes } from "@/lib/cad/template-render";
import { CAD_LAYOUT_TEMPLATES, type CadLayoutTemplateId } from "@/lib/cad/templates";
import {
  galleryTemplate,
  galleryTemplates,
  templateSeoDescription,
  templateSeoTitle,
} from "@/lib/marketing/template-gallery";
import { publicPageMetadata } from "@/lib/seo/page-metadata";
import {
  breadcrumbJsonLd,
  templateCreativeWorkJsonLd,
} from "@/lib/seo/structured-data";

/**
 * La FICHA de una plantilla: el plano en grande, lo que trae de verdad
 * (capas y estilos LEÍDOS del documento construido, no copiados a mano), su
 * lámina PDF trazada por el pipeline real, y el arranque con un clic.
 *
 * Es una página de aterrizaje de búsqueda («plano de taquería») y por eso se
 * PRERRENDERIZA: las 149 salen estáticas en build con su metadata completa.
 */
export function generateStaticParams() {
  return CAD_LAYOUT_TEMPLATES.map((template) => ({ id: template.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const template = galleryTemplate(id);
  if (!template) return {};
  return publicPageMetadata({
    path: `/plantillas/${template.id}`,
    title: templateSeoTitle(template),
    description: templateSeoDescription(template),
  });
}

export default async function PlantillaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const template = galleryTemplate(id);
  if (!template) notFound();

  // La galería tipa ids como string (viajan serializados); el conversor valida
  // en runtime y aquí el id ya pasó por `galleryTemplate`.
  const built = buildCadTemplateDocument(template.id as CadLayoutTemplateId);
  /**
   * Capas CON contenido: el documento declara el sustrato completo de la
   * norma, pero a la ficha le importa qué capas traen dibujo. Se calculan del
   * documento real — si la conversión cambia, la ficha dice la verdad nueva.
   */
  const usedLayerIds = new Set(
    built.document.entities.flatMap((entity) =>
      "layer" in entity && typeof entity.layer === "string" ? [entity.layer] : [],
    ),
  );
  const usedLayers = built.document.layers.filter((layer) => usedLayerIds.has(layer.id));
  const textStyles = Object.keys(built.document.styles.text ?? {});
  const dimStyles = Object.keys(built.document.styles.dimension ?? {});
  const notes = cadTemplateNotes(built.document.entities);
  const related = galleryTemplates()
    .filter((item) => item.giro === template.giro && item.id !== template.id)
    .slice(0, 3);

  return (
    <>
      <SkipLink />
      <PublicNav />
      <main id="contenido" className="text-foreground">
        <JsonLd
          data={templateCreativeWorkJsonLd({
            name: `Plantilla: ${template.label}`,
            description: templateSeoDescription(template),
            path: `/plantillas/${template.id}`,
            imagePath: `/plantillas/renders/${template.id}.claro.svg`,
          })}
        />
        <JsonLd
          data={breadcrumbJsonLd([
            ["Plantillas", "/plantillas"],
            [template.label, `/plantillas/${template.id}`],
          ])}
        />

        <div className="mx-auto max-w-7xl px-5 pb-16 pt-10 sm:px-8">
          <nav aria-label="Miga de pan" className="type-small text-muted-foreground">
            <Link href="/plantillas" className="hover:text-foreground">
              Plantillas
            </Link>
            <span aria-hidden="true"> / </span>
            <span className="text-foreground">{template.label}</span>
          </nav>

          <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div>
              <PlanRender
                id={template.id}
                label={template.label}
                widthM={template.widthM}
                heightM={template.heightM}
                priority
                sizes="(min-width: 1024px) 60vw, 100vw"
                className="block overflow-hidden rounded-card border border-border shadow-resting"
              />
              <p className="type-micro mt-3 text-muted-foreground">
                Dibujado por el motor de Valle Design a escala 1:
                {built.scaleDenominator}. El plano cambia de tema contigo.
              </p>
            </div>

            <div>
              <p className="type-eyebrow text-primary-ink">{template.giroLabel}</p>
              <h1 className="type-title mt-3">{template.label}</h1>
              <p className="type-lead mt-4 text-muted-foreground">{template.description}</p>

              <dl className="mt-6 grid grid-cols-2 gap-4">
                <div className="rounded-card border border-border p-4">
                  <dt className="type-micro text-muted-foreground">Huella</dt>
                  <dd className="mt-1 font-mono text-sm text-foreground">
                    {template.widthM} × {template.heightM} m
                  </dd>
                </div>
                <div className="rounded-card border border-border p-4">
                  <dt className="type-micro text-muted-foreground">Objetos editables</dt>
                  <dd className="mt-1 font-mono text-sm text-foreground">{template.objects}</dd>
                </div>
                <div className="rounded-card border border-border p-4">
                  <dt className="type-micro text-muted-foreground">Lámina</dt>
                  <dd className="mt-1 font-mono text-sm text-foreground">
                    A1 · ESC 1:{built.scaleDenominator}
                  </dd>
                </div>
                <div className="rounded-card border border-border p-4">
                  <dt className="type-micro text-muted-foreground">Unidades</dt>
                  <dd className="mt-1 font-mono text-sm text-foreground">milímetros</dd>
                </div>
              </dl>

              <div className="mt-8 flex flex-col gap-3">
                {/* `returnTo` viaja saneado por AuthPage: tras crear la cuenta,
                    el tablero abre con la plantilla preseleccionada. */}
                <Link
                  href={`/register?returnTo=${encodeURIComponent(`/dashboard?plantilla=${template.id}`)}`}
                  data-testid="template-start-cta"
                  className={buttonClass({ variant: "primary", size: "lg" })}
                >
                  Empieza con esta plantilla
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
                <a
                  href={`/plantillas/${template.id}/lamina`}
                  data-testid="template-pdf-download"
                  className={buttonClass({ variant: "secondary", size: "lg" })}
                >
                  <FileDown aria-hidden="true" className="h-4 w-4" />
                  Lámina PDF de muestra
                </a>
                <p className="type-small text-muted-foreground">
                  El PDF lo traza el mismo motor que usarás tú: cajetín
                  mexicano, escala verdadera y responsiva del D.R.O. en su
                  lugar.
                </p>
              </div>
            </div>
          </div>

          <section aria-labelledby="que-trae" className="mt-14">
            <h2 id="que-trae" className="type-title">
              Qué trae puesta
            </h2>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div className="rounded-card border border-border bg-card p-6">
                <h3 className="font-semibold text-foreground">
                  Capas con dibujo ({usedLayers.length})
                </h3>
                <ul className="mt-4 space-y-2">
                  {usedLayers.map((layer) => (
                    <li key={layer.id} className="flex items-center gap-3 type-small">
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 rounded-full border border-border"
                        style={{ backgroundColor: layer.color }}
                      />
                      <span className="font-mono text-foreground">{layer.id}</span>
                      <span className="text-muted-foreground">{layer.name}</span>
                    </li>
                  ))}
                </ul>
                <p className="type-small mt-4 text-muted-foreground">
                  Más el sustrato completo de capas de la norma mexicana, listo
                  para lo que añadas tú.
                </p>
              </div>
              <div className="rounded-card border border-border bg-card p-6">
                <h3 className="font-semibold text-foreground">Estilos de anotación</h3>
                <p className="type-small mt-4 text-muted-foreground">
                  Estilos de texto ({textStyles.length}):
                </p>
                <p className="mt-1 font-mono text-sm text-foreground">
                  {textStyles.join(" · ")}
                </p>
                <p className="type-small mt-4 text-muted-foreground">
                  Estilos de cota ({dimStyles.length}):
                </p>
                <p className="mt-1 font-mono text-sm text-foreground">
                  {dimStyles.join(" · ")}
                </p>
                {notes.length > 0 ? (
                  <>
                    <p className="type-small mt-4 text-muted-foreground">
                      Notas incluidas en el plano:
                    </p>
                    <ul className="mt-1 space-y-1">
                      {notes.slice(0, 4).map((note) => (
                        <li key={note} className="type-small text-foreground">
                          «{note}»
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            </div>
          </section>

          {related.length > 0 ? (
            <section aria-labelledby="relacionadas" className="mt-14">
              <h2 id="relacionadas" className="type-title">
                Del mismo giro
              </h2>
              <ul className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-3">
                {related.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/plantillas/${item.id}`}
                      className="group flex h-full flex-col overflow-hidden rounded-card border border-border transition-[border-color,box-shadow] duration-200 ease-out-expo hover:border-primary/40 hover:shadow-elevated"
                    >
                      <PlanRender
                        id={item.id}
                        label={item.label}
                        widthM={item.widthM}
                        heightM={item.heightM}
                        sizes="(min-width: 640px) 33vw, 100vw"
                        className="block border-b border-border"
                      />
                      <span className="p-4 font-semibold text-foreground">{item.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </main>
    </>
  );
}
