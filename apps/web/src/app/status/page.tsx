import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { PublicPageShell, PublicSection } from "../docs/PublicPageShell";
import { Badge, buttonClass } from "@/components/ui";
import { COMMERCIAL_LINKS } from "@/config/commercial";
import { publicPageMetadata } from "@/lib/seo/page-metadata";

export const metadata: Metadata = publicPageMetadata({
  path: "/status",
  title: "Estado del servicio",
  description:
    "Fuente pública de estado de Valle Design. Esta página no declara disponibilidad que no pueda demostrar con telemetría configurada.",
});

export default function StatusPage() {
  const externalStatus =
    COMMERCIAL_LINKS.status === "/status" ? undefined : COMMERCIAL_LINKS.status;

  return (
    <PublicPageShell
      eyebrow="Servicio"
      title="Estado"
      intro="Esta ruta no inventa disponibilidad: una página estática no demuestra que la web, la API, la base de datos o sus dependencias estén operativas."
    >
      <PublicSection title="Fuente de estado">
        {/* El BADGE dice de un vistazo qué clase de página es ésta, que es lo
            que alguien preocupado necesita saber antes de leer un párrafo. Y
            dice la verdad en los dos casos: «hay fuente» o «no la hay» — nunca
            «todo operativo», que es lo que esta página existe para NO decir. */}
        {externalStatus ? (
          <>
            <Badge tone="brand" dot>
              Fuente externa configurada
            </Badge>
            <p>
              Este despliegue tiene configurada una página externa como fuente
              pública de estado. La telemetría vive ahí, no aquí.
            </p>
            <a
              className={buttonClass({ variant: "primary" })}
              href={externalStatus}
            >
              Abrir página de estado
              <ExternalLink aria-hidden="true" className="h-4 w-4" />
            </a>
          </>
        ) : (
          <>
            <Badge tone="neutral" dot>
              Sin telemetría pública
            </Badge>
            <p role="status">
              No hay una fuente pública de telemetría configurada en este
              despliegue. No se declara ningún estado operativo desde esta
              página: una página estática no demuestra que nada esté vivo.
            </p>
          </>
        )}
      </PublicSection>

      <PublicSection title="¿Tienes un problema?">
        <p>
          Si una operación falla, conserva el mensaje visible y consulta el
          canal de soporte configurado. No incluyas credenciales ni tokens.
        </p>
        <a
          className={buttonClass({ variant: "secondary" })}
          href={COMMERCIAL_LINKS.support}
        >
          Ir a soporte
        </a>
      </PublicSection>
    </PublicPageShell>
  );
}
