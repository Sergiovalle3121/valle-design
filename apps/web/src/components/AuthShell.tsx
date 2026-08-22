import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { COMMERCIAL_LINKS } from "@/config/commercial";

/**
 * LA TARJETA DEL EMBUDO DE IDENTIDAD — una, no dos.
 *
 * `AuthPage` y `IdentityActionForm` tenían EL MISMO bloque copiado: el mismo
 * `<main>` centrado, la misma tarjeta con el mismo radio, la misma marca
 * arriba y el mismo par de párrafos de error y aviso. Dos copias del mismo
 * bloque no son un problema de líneas: son dos superficies que van a divergir,
 * y ya lo habían hecho —una traía el logo en índigo y la otra en cian, así que
 * la marca cambiaba de color entre registrarse y verificar el correo—.
 *
 * Los mensajes viven AQUÍ y no en cada formulario porque el par error/aviso es
 * lo que más se copia mal: `role="alert"` interrumpe al lector de pantalla y
 * `role="status"` espera turno. Un aviso de éxito con `role="alert"` corta la
 * frase que el usuario estaba oyendo; uno de error con `role="status"` llega
 * cuando ya se fue.
 */
export function AuthShell({
  title,
  description,
  children,
  error,
  message,
  footer,
  titleId = "auth-title",
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
  error?: string | null;
  message?: ReactNode | null;
  footer?: ReactNode;
  titleId?: string;
}) {
  return (
    <main
      id="contenido"
      className="relative grid min-h-screen place-items-center px-5 py-10"
    >
      {/* Fondo ambiental del sistema (`.aurora-bg`), fijo y por debajo de todo:
          da profundidad sin robarle contraste al formulario. */}
      <div aria-hidden="true" className="aurora-bg fixed inset-0 -z-10" />

      <section
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-surface border border-border bg-card p-6 shadow-floating sm:p-9"
      >
        <Link href="/" className="inline-flex">
          <Logo />
        </Link>

        <h1 id={titleId} className="type-title mt-8 text-foreground">
          {title}
        </h1>
        <p className="type-small mt-2 text-muted-foreground">{description}</p>

        {children}

        {error ? (
          <p role="alert" className="type-small mt-4 text-danger-ink">
            {error}
          </p>
        ) : null}
        {message ? (
          <div role="status" className="type-small mt-4 text-success-ink">
            {message}
          </div>
        ) : null}

        {footer}

        <p className="type-caption mt-5 text-center text-muted-foreground">
          ¿Necesitas ayuda?{" "}
          <a
            className="underline underline-offset-4 hover:text-foreground"
            href={COMMERCIAL_LINKS.support}
          >
            Contacta con soporte
          </a>
          .
        </p>
      </section>
    </main>
  );
}
