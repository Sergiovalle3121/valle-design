import type { Metadata } from "next";
import { LifeBuoy, Mail, ShieldAlert } from "lucide-react";
import { PublicPageShell, PublicSection } from "../docs/PublicPageShell";
import { SupportSearch } from "@/components/marketing/SupportSearch";
import { Surface, buttonClass } from "@/components/ui";
import { COMMERCIAL_CONTACTS, COMMERCIAL_LINKS } from "@/config/commercial";
import { publicPageMetadata } from "@/lib/seo/page-metadata";

export const metadata: Metadata = publicPageMetadata({
  path: "/support",
  title: "Soporte técnico",
  description:
    "Canales de ayuda de Valle Design y qué información incluir para que un problema se pueda reproducir y resolver.",
});

export default function SupportPage() {
  return (
    <PublicPageShell
      eyebrow="Ayuda"
      title="Soporte"
      intro="Consulta primero la documentación y comparte sólo la información necesaria para reproducir el problema. Nunca envíes contraseñas ni tokens de sesión, verificación o recuperación."
    >
      {/* La búsqueda va PRIMERO (campaña de sitio): la mayoría de las dudas ya
          tienen respuesta escrita en el centro de preguntas o en una guía, y
          encontrarla es más rápido que esperar un correo. */}
      <PublicSection title="Busca tu respuesta">
        <SupportSearch />
      </PublicSection>

      <PublicSection title="Antes de solicitar ayuda">
        <p>
          Cuatro datos convierten «no me funciona» en algo que se puede
          reproducir. Sin ellos, la primera respuesta será pedírtelos.
        </p>
        {/* Tarjetas numeradas y no viñetas: quien está atascado lee una lista
            de puntos en diagonal, y una lista numerada se sigue. */}
        <ol className="grid gap-3 sm:grid-cols-2">
          {[
            "La ruta en la que ocurrió el problema.",
            "Qué intentabas hacer y el mensaje que viste.",
            "Si estabas sin conexión o tu sesión había expirado.",
            "Capturas y archivos de ejemplo SIN datos confidenciales.",
          ].map((item, index) => (
            <li
              key={item}
              className="flex gap-3 rounded-card border border-border p-4"
            >
              <span
                aria-hidden="true"
                className="type-mono type-caption grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 font-semibold text-primary-ink"
              >
                {index + 1}
              </span>
              <span className="type-small text-foreground">{item}</span>
            </li>
          ))}
        </ol>
        <Surface
          padded="sm"
          elevation="none"
          className="flex gap-3 border-warning/30 bg-warning/[.06]"
        >
          <ShieldAlert
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0 text-warning-ink"
          />
          <p className="type-small text-foreground">
            Nunca envíes contraseñas ni tokens de sesión, de verificación o de
            recuperación. Nadie de soporte te los va a pedir.
          </p>
        </Surface>
      </PublicSection>

      <PublicSection title="Canal de soporte">
        {COMMERCIAL_CONTACTS.support ? (
          <>
            {/* El correo ESCRITO además del botón: quien copia la dirección a
                su gestor de correo no debería tener que inspeccionar el HTML. */}
            <p className="type-body">
              Escríbenos a{" "}
              <a
                className="font-medium text-primary-ink underline underline-offset-4"
                href={`mailto:${COMMERCIAL_CONTACTS.support}`}
              >
                {COMMERCIAL_CONTACTS.support}
              </a>
              . El estado del sistema se publica en{" "}
              <a
                className="font-medium text-primary-ink underline underline-offset-4"
                href={COMMERCIAL_LINKS.status}
              >
                la página de estado
              </a>
              .
            </p>
            <a
              className={buttonClass({ variant: "primary" })}
              href={`mailto:${COMMERCIAL_CONTACTS.support}`}
            >
              <Mail aria-hidden="true" className="h-4 w-4" />
              Escribir a soporte
            </a>
          </>
        ) : (
          <>
            <p>
              Este despliegue no ha configurado un correo público de soporte.
              Consulta la página de contacto para encontrar un canal habilitado
              por el operador.
            </p>
            <a
              className={buttonClass({ variant: "secondary" })}
              href={COMMERCIAL_LINKS.contact}
            >
              Ir a contacto
            </a>
          </>
        )}
      </PublicSection>

      <PublicSection title="Incidentes del servicio">
        <p>
          La página de estado explica si existe una fuente pública de
          telemetría. No asumas que un servicio está disponible a partir de una
          página estática.
        </p>
        <a
          className={buttonClass({ variant: "secondary" })}
          href={COMMERCIAL_LINKS.status}
        >
          <LifeBuoy aria-hidden="true" className="h-4 w-4" />
          Consultar estado
        </a>
      </PublicSection>
    </PublicPageShell>
  );
}
