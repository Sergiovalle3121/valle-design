import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { PublicNav } from "@/components/PublicNav";
import { SkipLink } from "@/components/SkipLink";
import { RevealOnScroll } from "@/components/marketing/RevealOnScroll";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { USE_CASE_PROFILES } from "@/lib/marketing/use-cases";
import { publicPageMetadata } from "@/lib/seo/page-metadata";
import { breadcrumbJsonLd, itemListJsonLd } from "@/lib/seo/structured-data";

/**
 * /casos-de-uso — el índice por profesión. Cinco perfiles, cada uno con su
 * dolor y su flujo REAL (ver lib/marketing/use-cases.ts, donde vive el
 * contrato de honestidad de estas páginas).
 */
export const metadata: Metadata = publicPageMetadata({
  path: "/casos-de-uso",
  title: "Casos de uso: CAD por profesión",
  description:
    "Cómo usan Valle Design arquitectos, ingenieros civiles, interioristas, " +
    "constructores y estudiantes: el flujo real, las plantillas de su giro y " +
    "sus preguntas respondidas.",
});

export default function CasosDeUsoPage() {
  return (
    <>
      <SkipLink />
      <PublicNav />
      <main id="contenido" className="text-foreground">
        <JsonLd
          data={itemListJsonLd(
            USE_CASE_PROFILES.map((profile) => [
              profile.titulo,
              `/casos-de-uso/${profile.slug}`,
            ]),
          )}
        />
        <JsonLd data={breadcrumbJsonLd([["Casos de uso", "/casos-de-uso"]])} />
        <section className="border-b border-border">
          <div className="mx-auto max-w-7xl px-5 pb-12 pt-12 sm:px-8 lg:pt-16">
            <p className="type-eyebrow text-primary-ink">Casos de uso</p>
            <h1 className="type-display mt-5 max-w-3xl">
              El mismo tablero, tu oficio
            </h1>
            <p className="type-lead mt-6 max-w-2xl text-muted-foreground">
              Cinco maneras de trabajar con Valle Design, contadas sin humo:
              el dolor que resuelve, el flujo paso a paso con lo que el
              producto hace HOY, y las plantillas de tu giro.
            </p>
          </div>
        </section>
        <section aria-label="Perfiles" className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
          <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {USE_CASE_PROFILES.map((profile, index) => (
              <RevealOnScroll as="li" key={profile.slug} delayMs={index * 70}>
                <Link
                  href={`/casos-de-uso/${profile.slug}`}
                  className="group flex h-full flex-col rounded-card border border-border bg-card p-6 shadow-resting transition-[border-color,box-shadow,transform] duration-200 ease-out-expo hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elevated"
                >
                  <span className="type-micro text-primary-ink">{profile.nombre}</span>
                  <span className="mt-2 text-lg font-semibold text-foreground">
                    {profile.titulo}
                  </span>
                  <span className="type-small mt-3 flex-1 text-muted-foreground">
                    {profile.dolor}
                  </span>
                  <span className="mt-5 inline-flex items-center gap-1.5 type-small font-medium text-primary-ink">
                    Ver el flujo completo
                    <ArrowRight
                      aria-hidden="true"
                      className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                    />
                  </span>
                </Link>
              </RevealOnScroll>
            ))}
          </ul>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
