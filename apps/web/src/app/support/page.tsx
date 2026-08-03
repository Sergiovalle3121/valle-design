import type { Metadata } from "next";
import {
  PublicPageShell,
  PublicSection,
  publicActionClass,
} from "../docs/PublicPageShell";
import { COMMERCIAL_CONTACTS, COMMERCIAL_LINKS } from "@/config/commercial";

export const metadata: Metadata = {
  title: "Soporte",
  description:
    "Canales y recomendaciones para solicitar ayuda con Valle Design.",
};

export default function SupportPage() {
  return (
    <PublicPageShell
      eyebrow="Ayuda"
      title="Soporte"
      intro="Consulta primero la documentación y comparte sólo la información necesaria para reproducir el problema. Nunca envíes contraseñas ni tokens de sesión, verificación o recuperación."
    >
      <PublicSection title="Antes de solicitar ayuda">
        <ul className="list-disc space-y-3 pl-6">
          <li>Indica la ruta en la que ocurrió el problema.</li>
          <li>
            Describe la acción que intentabas realizar y el mensaje visible.
          </li>
          <li>
            Confirma si estabas sin conexión o si tu sesión había expirado.
          </li>
          <li>
            Elimina datos confidenciales de capturas y archivos de ejemplo.
          </li>
        </ul>
      </PublicSection>

      <PublicSection title="Canal de soporte">
        {COMMERCIAL_CONTACTS.support ? (
          <a
            className={publicActionClass}
            href={`mailto:${COMMERCIAL_CONTACTS.support}`}
          >
            Escribir a soporte
          </a>
        ) : (
          <>
            <p>
              Este despliegue no ha configurado un correo público de soporte.
              Consulta la página de contacto para encontrar un canal habilitado
              por el operador.
            </p>
            <a className={publicActionClass} href={COMMERCIAL_LINKS.contact}>
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
        <a className={publicActionClass} href={COMMERCIAL_LINKS.status}>
          Consultar estado
        </a>
      </PublicSection>
    </PublicPageShell>
  );
}
