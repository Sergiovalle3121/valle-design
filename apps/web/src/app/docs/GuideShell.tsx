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
import { PublicPageShell, publicActionClass } from "./PublicPageShell";

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
  return <p className="leading-8">{children}</p>;
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
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-4 space-y-4 leading-8 text-gray-600 dark:text-gray-300">
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
    <aside className="rounded-xl border border-amber-500/30 bg-amber-500/[.06] p-5 leading-7">
      <p className="text-sm font-semibold uppercase tracking-[.14em] text-amber-700 dark:text-amber-300">
        Límite actual
      </p>
      <div className="mt-2 space-y-3">{children}</div>
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

        <section aria-labelledby="siguiente-paso">
          <h2 id="siguiente-paso" className="text-2xl font-semibold">
            Ponlo en práctica
          </h2>
          <p className="mt-4 leading-8 text-gray-600 dark:text-gray-300">
            Todo lo de esta guía se hace desde el navegador, sin instalar nada.
            Crea tu cuenta y abre un proyecto para seguir los pasos con un dibujo
            de verdad.
          </p>
          <Link className={`${publicActionClass} mt-5`} href="/register">
            Crear cuenta
          </Link>
        </section>

        <nav aria-label="Otras guías">
          <h2 className="text-2xl font-semibold">Otras guías</h2>
          <ul className="mt-4 space-y-3">
            {others.map((other) => (
              <li key={other.slug}>
                <Link
                  className="font-medium text-indigo-700 underline-offset-4 hover:underline dark:text-indigo-200"
                  href={docGuidePath(other.slug)}
                >
                  {other.title}
                </Link>
                <span className="block text-sm text-gray-500 dark:text-gray-400">
                  {other.summary}
                </span>
              </li>
            ))}
          </ul>
        </nav>
      </PublicPageShell>
    </>
  );
}
