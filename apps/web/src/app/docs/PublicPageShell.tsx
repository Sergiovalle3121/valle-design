import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { BRAND, PRODUCT_LABEL } from "@/config/brand";
import { COMMERCIAL_LINKS } from "@/config/commercial";
import { buttonClass } from "@/components/ui";

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
      <header className="border-b border-border">
        <nav
          aria-label="Navegación de página pública"
          className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-5 sm:px-8"
        >
          <Link href="/" className="inline-flex">
            <Logo />
          </Link>
          <Link href="/" className={buttonClass({ variant: "ghost", size: "md" })}>
            Volver al inicio
          </Link>
        </nav>
      </header>

      <article className="mx-auto max-w-4xl px-5 py-14 sm:px-8 sm:py-20">
        <header>
          <p className="type-eyebrow text-primary-ink">
            {eyebrow}
          </p>
          <h1 className="type-title mt-4">{title}</h1>
          <p className="type-lead mt-5 max-w-3xl text-muted-foreground">
            {intro}
          </p>
        </header>
        <div className="mt-12 space-y-12">{children}</div>
      </article>

      <footer className="border-t border-border px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-semibold">{PRODUCT_LABEL.design}</p>
            <p className="type-small mt-1 text-muted-foreground">
              {BRAND.copyright}
            </p>
          </div>
          <nav
            aria-label="Ayuda y contacto"
            className="type-small flex flex-wrap gap-x-5 gap-y-3 text-muted-foreground"
          >
            <a
              className="underline-offset-4 hover:text-foreground hover:underline"
              href={COMMERCIAL_LINKS.pricing}
            >
              Precios
            </a>
            <a
              className="underline-offset-4 hover:text-foreground hover:underline"
              href={COMMERCIAL_LINKS.documentation}
            >
              Documentación
            </a>
            <a
              className="underline-offset-4 hover:text-foreground hover:underline"
              href={COMMERCIAL_LINKS.support}
            >
              Soporte
            </a>
            <a
              className="underline-offset-4 hover:text-foreground hover:underline"
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
      <h2 className="type-heading">{title}</h2>
      <div className="type-body mt-4 space-y-4 text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

/**
 * La acción de una página pública.
 *
 * Antes era su propia cadena de clases —una de las CINCO constantes de botón
 * incompatibles que tenía la app—. Ahora delega en la primitiva: sigue
 * existiendo con el mismo nombre para no tocar los ocho sitios que la importan,
 * pero ya no puede divergir del botón del resto del producto.
 */
export const publicActionClass = buttonClass({ variant: "secondary" });
