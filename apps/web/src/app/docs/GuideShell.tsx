import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  DOC_GUIDES,
  docGuide,
  docGuidePath,
  type DocGuideSlug,
} from "@/config/site-routes";
import { JsonLd } from "@/components/JsonLd";
import { publicPageMetadata } from "@/lib/seo/page-metadata";
import {
  breadcrumbJsonLd,
  techArticleJsonLd,
} from "@/lib/seo/structured-data";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Surface, buttonClass, cx } from "@/components/ui";
import { PublicPageShell } from "./PublicPageShell";

/**
 * ARMAZÓN COMÚN DE LAS GUÍAS.
 *
 * Cinco guías con el mismo `metadata`, el mismo JSON-LD, las mismas migas y el
 * mismo cierre son cinco oportunidades de que una se quede atrás. Aquí se
 * escribe una vez y cada guía aporta sólo lo suyo: su texto.
 *
 * El título y la descripción NO se escriben en la página de la guía: salen de
 * `DOC_GUIDES`, que es también lo que lee el índice y el sitemap. Es la única
 * manera de que el enlace del índice y el `<title>` real no acaben diciendo
 * cosas distintas del mismo artículo.
 */

export function guideMetadata(slug: DocGuideSlug): Metadata {
  const guide = docGuide(slug);
  return publicPageMetadata({
    path: docGuidePath(slug),
    title: guide.title,
    description: guide.description,
  });
}

/** Párrafo de texto corrido. Existe para no repetir clases en cada guía. */
export function P({ children }: { children: ReactNode }) {
  return <p className="type-body">{children}</p>;
}

/** Apartado con encabezado de nivel 2: es el esqueleto que lee el buscador. */
export function GuideSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="type-heading">{title}</h2>
      <div className="type-body mt-4 space-y-4 text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

/**
 * Aviso de límite. Se pinta distinto para que se vea, no para que se esconda:
 * una guía que enseña a usar algo tiene que decir dónde deja de funcionar, o el
 * lector lo descubrirá con el plano a medias.
 */
export function GuideLimit({ children }: { children: ReactNode }) {
  return (
    <aside className="flex gap-3.5 rounded-card border border-warning/30 bg-warning/[.06] p-5">
      <AlertTriangle
        aria-hidden="true"
        className="mt-0.5 h-5 w-5 shrink-0 text-warning-ink"
      />
      <div className="min-w-0">
        <p className="type-eyebrow text-warning-ink">Límite actual</p>
        <div className="type-small mt-2 space-y-3 text-foreground">
          {children}
        </div>
      </div>
    </aside>
  );
}

export function GuideArticle({
  slug,
  children,
}: {
  slug: DocGuideSlug;
  children: ReactNode;
}) {
  const guide = docGuide(slug);
  const path = docGuidePath(slug);
  const others = DOC_GUIDES.filter((candidate) => candidate.slug !== slug);

  return (
    <>
      <JsonLd
        data={techArticleJsonLd({
          path,
          title: guide.title,
          description: guide.description,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          ["Inicio", "/"],
          ["Guías", "/docs"],
          [guide.title, path],
        ])}
      />
      <PublicPageShell eyebrow="Guía" title={guide.title} intro={guide.summary}>
        {children}

        {/* El cierre no es un banner pegado al final: es el siguiente paso
            de quien acaba de leer, y por eso ofrece el atajo que de verdad
            quiere —abrir un plano ya dibujado— y no sólo «crear cuenta». */}
        <Surface
          as="section"
          aria-labelledby="siguiente-paso"
          padded="lg"
          elevation="resting"
          className="relative overflow-hidden"
        >
          <div
            aria-hidden="true"
            className="product-halo pointer-events-none absolute -right-16 -top-20 h-56 w-56"
          />
          <h2 id="siguiente-paso" className="type-heading">
            Ponlo en práctica
          </h2>
          <p className="type-body mt-3 max-w-2xl text-muted-foreground">
            Todo lo de esta guía se hace desde el navegador, sin instalar nada.
            Crea tu cuenta y abre el plano de ejemplo para seguir los pasos sobre
            un dibujo de verdad.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              className={buttonClass({ variant: "primary" })}
              href="/register"
            >
              Crear cuenta gratis
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <Link
              className={buttonClass({ variant: "secondary" })}
              href="/precios"
            >
              Ver precios
            </Link>
          </div>
        </Surface>

        <nav aria-label="Otras guías">
          <h2 className="type-heading">Otras guías</h2>
          {/* Tarjetas y no enlaces subrayados: al terminar de leer, lo que se
              pulsa es el bloque entero, y un objetivo de 3 px de alto obliga a
              apuntar. */}
          <ul className="mt-5 grid gap-4 sm:grid-cols-2">
            {others.map((other) => (
              <li key={other.slug}>
                <Link
                  href={docGuidePath(other.slug)}
                  className={cx(
                    "group flex h-full flex-col rounded-card border border-border p-5",
                    "transition-[background-color,border-color,box-shadow] duration-200 ease-out-expo",
                    "hover:border-primary/40 hover:bg-card hover:shadow-elevated",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  )}
                >
                  <span className="type-small font-semibold text-foreground">
                    {other.title}
                  </span>
                  <span className="type-small mt-2 text-muted-foreground">
                    {other.summary}
                  </span>
                  <span className="type-caption mt-4 inline-flex items-center gap-1.5 font-semibold text-primary-ink">
                    Leer
                    <ArrowRight
                      aria-hidden="true"
                      className="h-3.5 w-3.5 transition-transform duration-200 ease-out-expo group-hover:translate-x-0.5"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </PublicPageShell>
    </>
  );
}
