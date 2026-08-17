import type { Metadata } from "next";
import {
  PublicPageShell,
  PublicSection,
  publicActionClass,
} from "../docs/PublicPageShell";
import { BRAND } from "@/config/brand";
import { COMMERCIAL_CONTACTS } from "@/config/commercial";
import { publicPageMetadata } from "@/lib/seo/page-metadata";

export const metadata: Metadata = publicPageMetadata({
  path: "/privacy",
  title: "Aviso de privacidad",
  description:
    "Aviso técnico sobre los datos que trata Valle Design, dónde viven los documentos y qué debe completar el operador de cada despliegue.",
});

export default function PrivacyPage() {
  return (
    <PublicPageShell
      eyebrow="Información legal"
      title="Aviso básico de privacidad"
      intro={`Este aviso describe la superficie técnica de ${BRAND.productNames.design}. El operador de cada despliegue debe completar los plazos, bases jurídicas y derechos aplicables antes de prestar un servicio público.`}
    >
      <PublicSection title="Datos necesarios para operar una cuenta">
        <p>
          La aplicación trata el correo de la cuenta, el nombre visible cuando
          se proporciona, una derivación criptográfica de la contraseña y los
          datos necesarios para gestionar sesiones. Una sesión puede registrar
          dirección IP, agente de usuario y fecha de expiración.
        </p>
        <p>
          También se tratan la organización y sus membresías, así como los
          proyectos, documentos y contenido que el usuario decida crear.
        </p>
      </PublicSection>

      <PublicSection title="Finalidad y responsabilidad">
        <p>
          Estos datos permiten autenticar usuarios, aplicar permisos, abrir y
          guardar el trabajo y diagnosticar errores del servicio. El operador
          del despliegue determina su infraestructura, retención, respaldos y
          proveedores, y debe informar de ello en su aviso definitivo.
        </p>
        <p>
          Esta página no declara una certificación de seguridad ni cumplimiento
          normativo para todos los despliegues.
        </p>
      </PublicSection>

      <PublicSection title="Consultas sobre datos">
        {COMMERCIAL_CONTACTS.privacy ? (
          <a
            className={publicActionClass}
            href={`mailto:${COMMERCIAL_CONTACTS.privacy}`}
          >
            Contactar sobre privacidad
          </a>
        ) : (
          <p>
            No se ha configurado un correo público de privacidad. El operador
            debe habilitar un canal antes de ofrecer el servicio a terceros.
          </p>
        )}
      </PublicSection>
    </PublicPageShell>
  );
}
