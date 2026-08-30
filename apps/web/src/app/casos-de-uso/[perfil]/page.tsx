import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { PublicNav } from "@/components/PublicNav";
import { SkipLink } from "@/components/SkipLink";
import { PlanRender } from "@/components/gallery/PlanRender";
import { RevealOnScroll } from "@/components/marketing/RevealOnScroll";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { buttonClass } from "@/components/ui";
import { galleryTemplates } from "@/lib/marketing/template-gallery";
import { USE_CASE_PROFILES, findUseCaseProfile } from "@/lib/marketing/use-cases";
import { publicPageMetadata } from "@/lib/seo/page-metadata";
import { breadcrumbJsonLd, faqPageJsonLd } from "@/lib/seo/structured-data";

/**
 * La página de UN perfil: dolor → flujo real → plantillas de su giro → FAQ.
 * Las capturas propias del producto llegan como renders del motor (las
 * plantillas del giro): imágenes que se regeneran con el código, jamás stock.
 */
export function generateStaticParams() {
  return USE_CASE_PROFILES.map((profile) => ({ perfil: profile.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ perfil: string }>;
}): Promise<Metadata> {
  const { perfil } = await params;
  const profile = findUseCaseProfile(perfil);
  if (!profile) return {};
  return publicPageMetadata({
    path: `/casos-de-uso/${profile.slug}`,
    title: profile.titulo,
    description: `${profile.dolor.slice(0, 130)}…`,
  });
}

export default async function PerfilPage({
  params,
}: {
  params: Promise<{ perfil: string }>;
}) {
  const { perfil } = await params;
  const profile = findUseCaseProfile(perfil);
  if (!profile) notFound();

  const giros = new Set<string>(profile.giros);
  const templates = galleryTemplates()
    .filter((template) => giros.has(template.giro))
    .slice(0, 6);

  return (
    <>
      <SkipLink />
      <PublicNav />
      <main id="contenido" className="text-foreground">
        <JsonLd
          data={faqPageJsonLd(
            profile.faq.map((item) => [item.pregunta, item.respuesta] as const),
          )}
        />
        <JsonLd
          data={breadcrumbJsonLd([
            ["Casos de uso", "/casos-de-uso"],
            [profile.nombre, `/casos-de-uso/${profile.slug}`],
          ])}
        />

        <section className="border-b border-border">
          <div className="mx-auto max-w-7xl px-5 pb-12 pt-10 sm:px-8">
            <nav aria-label="Miga de pan" className="type-small text-muted-foreground">
              <Link href="/casos-de-uso" className="hover:text-foreground">
                Casos de uso
              </Link>
              <span aria-hidden="true"> / </span>
              <span className="text-foreground">{profile.nombre}</span>
            </nav>
            <h1 className="type-display mt-6 max-w-3xl">{profile.titulo}</h1>
            <p className="type-lead mt-6 max-w-2xl text-muted-foreground">{profile.dolor}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/demo" className={buttonClass({ variant: "primary", size: "lg" })}>
                Probar sin cuenta
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              <Link
                href="/register"
                className={buttonClass({ variant: "secondary", size: "lg" })}
              >
                Crear cuenta gratis
              </Link>
            </div>
          </div>
        </section>

        <section aria-labelledby="flujo" className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
          <h2 id="flujo" className="type-title">
            El flujo, paso a paso
          </h2>
          <ol className="mt-8 grid gap-5 md:grid-cols-2">
            {profile.flujo.map((step, index) => (
              <RevealOnScroll as="li" key={step.paso} delayMs={index * 60}>
                <div className="flex h-full gap-4 rounded-card border border-border bg-card p-6 shadow-resting">
                  <span
                    aria-hidden="true"
                    className="type-sheet-number text-primary-ink opacity-85"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="font-semibold text-foreground">{step.paso}</h3>
                    <p className="type-small mt-2 text-muted-foreground">{step.detalle}</p>
                  </div>
                </div>
              </RevealOnScroll>
            ))}
          </ol>
        </section>

        {templates.length > 0 ? (
          <section
            aria-labelledby="plantillas-perfil"
            className="border-y border-border bg-muted/30"
          >
            <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
              <h2 id="plantillas-perfil" className="type-title">
                Plantillas de tu giro, ya dibujadas
              </h2>
              <ul className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
                {templates.map((template) => (
                  <li key={template.id}>
                    <Link
                      href={`/plantillas/${template.id}`}
                      className="group flex h-full flex-col overflow-hidden rounded-card border border-border bg-card transition-[border-color,box-shadow] duration-200 ease-out-expo hover:border-primary/40 hover:shadow-elevated"
                    >
                      <PlanRender
                        id={template.id}
                        label={template.label}
                        widthM={template.widthM}
                        heightM={template.heightM}
                        sizes="(min-width: 1024px) 33vw, 50vw"
                        className="block border-b border-border"
                      />
                      <span className="p-4 text-sm font-semibold text-foreground">
                        {template.label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <Link
                  href="/plantillas"
                  className={buttonClass({ variant: "secondary", size: "md" })}
                >
                  Ver el catálogo completo
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </section>
        ) : null}

        <section aria-labelledby="faq-perfil" className="mx-auto max-w-4xl px-5 py-14 sm:px-8">
          <h2 id="faq-perfil" className="type-title">
            Lo que preguntan en {profile.nombre.toLowerCase()}
          </h2>
          <dl className="mt-8 space-y-6">
            {profile.faq.map((item) => (
              <div key={item.pregunta} className="rounded-card border border-border p-6">
                <dt className="font-semibold text-foreground">{item.pregunta}</dt>
                <dd className="type-body mt-3 text-muted-foreground">{item.respuesta}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
