import type { Metadata } from "next";
import {
  PublicPageShell,
  PublicSection,
  publicActionClass,
} from "../docs/PublicPageShell";
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
        {externalStatus ? (
          <>
            <p>
              Este despliegue tiene configurada una página externa como fuente
              pública de estado.
            </p>
            <a className={publicActionClass} href={externalStatus}>
              Abrir página de estado
            </a>
          </>
        ) : (
          <p role="status">
            No hay una fuente pública de telemetría configurada en este
            despliegue. No se declara ningún estado operativo desde esta página.
          </p>
        )}
      </PublicSection>

      <PublicSection title="¿Tienes un problema?">
        <p>
          Si una operación falla, conserva el mensaje visible y consulta el
          canal de soporte configurado. No incluyas credenciales ni tokens.
        </p>
        <a className={publicActionClass} href={COMMERCIAL_LINKS.support}>
          Ir a soporte
        </a>
      </PublicSection>
    </PublicPageShell>
  );
}
