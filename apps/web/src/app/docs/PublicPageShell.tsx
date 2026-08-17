import type { ReactNode } from "react";
import Link from "next/link";
import { DraftingCompass } from "lucide-react";
import { BRAND, PRODUCT_LABEL } from "@/config/brand";
import { COMMERCIAL_LINKS } from "@/config/commercial";

export function PublicPageShell({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main id="contenido" className="min-h-screen text-foreground">
      <header className="border-b border-black/10 dark:border-white/10">
        <nav
          aria-label="Navegación de página pública"
          className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-5 sm:px-8"
        >
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <DraftingCompass
              aria-hidden="true"
              className="h-6 w-6 text-indigo-500"
            />
            {PRODUCT_LABEL.design}
          </Link>
          <Link
            href="/"
            className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5"
          >
            Volver al inicio
          </Link>
        </nav>
      </header>

      <article className="mx-auto max-w-4xl px-5 py-14 sm:px-8 sm:py-20">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[.18em] text-indigo-600 dark:text-indigo-300">
            {eyebrow}
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
            {title}
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-gray-600 dark:text-gray-300">
            {intro}
          </p>
        </header>
        <div className="mt-12 space-y-12">{children}</div>
      </article>

      <footer className="border-t border-black/10 px-5 py-8 dark:border-white/10 sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-semibold">{PRODUCT_LABEL.design}</p>
            <p className="mt-1 text-sm text-gray-500">{BRAND.copyright}</p>
          </div>
          <nav
            aria-label="Ayuda y contacto"
            className="flex flex-wrap gap-x-5 gap-y-3 text-sm"
          >
            <a
              className="underline-offset-4 hover:underline"
              href={COMMERCIAL_LINKS.pricing}
            >
              Precios
            </a>
            <a
              className="underline-offset-4 hover:underline"
              href={COMMERCIAL_LINKS.documentation}
            >
              Documentación
            </a>
            <a
              className="underline-offset-4 hover:underline"
              href={COMMERCIAL_LINKS.support}
            >
              Soporte
            </a>
            <a
              className="underline-offset-4 hover:underline"
              href={COMMERCIAL_LINKS.contact}
            >
              Contacto
            </a>
          </nav>
        </div>
      </footer>
    </main>
  );
}

export function PublicSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-2xl font-semibold">{title}</h2>
      <div className="mt-4 space-y-4 leading-7 text-gray-600 dark:text-gray-300">
        {children}
      </div>
    </section>
  );
}

export const publicActionClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-indigo-500 px-4 py-2 font-semibold text-indigo-700 hover:bg-indigo-500/5 dark:text-indigo-200";
