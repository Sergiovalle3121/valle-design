import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { PublicNav } from "@/components/PublicNav";
import { SkipLink } from "@/components/SkipLink";
import { BRAND } from "@/config/brand";
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
    <>
      {/* La MISMA barra que la portada: pegajosa, con vidrio al desplazar,
          conmutador de tema y menú real en móvil. Antes cada página pública
          traía su propia cabecera de dos enlaces, así que el conmutador de tema
          no existía fuera del estudio y el logotipo cambiaba de tamaño según la
          ruta. Una barra, todas las páginas. */}
      <SkipLink />
      <PublicNav />

      <main id="contenido" className="min-h-screen text-foreground">
        <article className="mx-auto max-w-4xl px-5 py-14 sm:px-8 sm:py-20">
          <header>
            <p className="type-eyebrow text-primary-ink">{eyebrow}</p>
            <h1 className="type-title mt-4">{title}</h1>
            <p className="type-lead mt-5 max-w-3xl text-muted-foreground">
              {intro}
            </p>
          </header>
          <div className="mt-12 space-y-12">{children}</div>
        </article>

        <footer className="border-t border-border px-5 py-10 sm:px-8">
          <div className="mx-auto flex max-w-5xl flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <Logo />
              <p className="type-small mt-3 text-muted-foreground">
                {BRAND.copyright}
              </p>
            </div>
            <nav
              aria-label="Ayuda y contacto"
              className="type-small flex flex-wrap gap-x-5 gap-y-3 text-muted-foreground"
            >
              {[
                ["Precios", COMMERCIAL_LINKS.pricing],
                ["Documentación", COMMERCIAL_LINKS.documentation],
                ["Soporte", COMMERCIAL_LINKS.support],
                ["Contacto", COMMERCIAL_LINKS.contact],
              ].map(([label, href]) => (
                <a
                  key={label}
                  className="underline-offset-4 hover:text-foreground hover:underline"
                  href={href}
                >
                  {label}
                </a>
              ))}
            </nav>
          </div>
        </footer>
      </main>
    </>
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
