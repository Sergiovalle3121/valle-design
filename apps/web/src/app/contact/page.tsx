import type { Metadata } from "next";
import {
  PublicPageShell,
  PublicSection,
  publicActionClass,
} from "../docs/PublicPageShell";
import { COMMERCIAL_CONTACTS } from "@/config/commercial";
import { publicPageMetadata } from "@/lib/seo/page-metadata";

export const metadata: Metadata = publicPageMetadata({
  path: "/contact",
  title: "Contacto y canales de atención",
  description:
    "Canales públicos configurados para hablar con el equipo de Valle Design: comercial, soporte del producto y privacidad.",
});

const channelLabels = {
  sales: "Consultas comerciales",
  support: "Soporte del producto",
  privacy: "Privacidad",
} as const;

export default function ContactPage() {
  const channels = Object.entries(COMMERCIAL_CONTACTS).filter(
    (entry): entry is [keyof typeof channelLabels, string] =>
      typeof entry[1] === "string",
  );

  return (
    <PublicPageShell
      eyebrow="Contacto"
      title="Habla con el operador de este despliegue"
      intro="Los canales aparecen sólo cuando se han configurado con una dirección pública real. Esta página no contiene un formulario simulado ni almacena mensajes."
    >
      <PublicSection title="Canales disponibles">
        {channels.length > 0 ? (
          <ul className="grid gap-4 sm:grid-cols-2">
            {channels.map(([kind, email]) => (
              <li
                key={kind}
                className="rounded-2xl border border-black/10 p-5 dark:border-white/10"
              >
                <h2 className="font-semibold text-foreground">
                  {channelLabels[kind]}
                </h2>
                <a
                  className="mt-3 inline-block break-all underline underline-offset-4"
                  href={`mailto:${email}`}
                >
                  {email}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p role="status">
            Este despliegue todavía no tiene un correo público configurado.
            Solicita al operador que defina las variables de contacto de la
            marca antes de publicar esta página como canal de atención.
          </p>
        )}
      </PublicSection>

      <PublicSection title="Antes de escribir">
        <p>
          No envíes contraseñas, cookies, tokens de verificación o recuperación,
          ni documentos confidenciales. Para soporte técnico, comparte el mínimo
          ejemplo necesario para reproducir el problema.
        </p>
        {COMMERCIAL_CONTACTS.sales && (
          <a
            className={publicActionClass}
            href={`mailto:${COMMERCIAL_CONTACTS.sales}?subject=Valle%20Design%20-%20consulta%20comercial`}
          >
            Iniciar consulta comercial
          </a>
        )}
      </PublicSection>
    </PublicPageShell>
  );
}
