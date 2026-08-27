import type { Metadata } from "next";
import {
  PublicPageShell,
  PublicSection,
  publicActionClass,
} from "../docs/PublicPageShell";
import { BRAND } from "@/config/brand";
import { COMMERCIAL_CONTACTS } from "@/config/commercial";
import { publicPageMetadata } from "@/lib/seo/page-metadata";
import { legalVersionLine } from "@/lib/legal/legal-versions";

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

      <PublicSection title="Métricas de activación">
        <p>
          El servicio calcula unas pocas cifras <strong>agregadas</strong> para
          saber si quien se registra llega a dibujar: cuántas organizaciones
          existen, cuántas están en periodo gratuito, cuántas han guardado su
          primer dibujo y cuántas han publicado un entregable.
        </p>
        <p>
          Estas cifras se <strong>derivan de datos que la aplicación ya guarda
          para funcionar</strong> —la organización, su suscripción y el
          registro de uso que ya cuenta los guardados—: no se recoge ni un dato
          nuevo para medirlas. Son conteos: no incluyen el contenido de ningún
          plano, ni nombres de proyectos o documentos, ni correos, ni
          identificadores de organización, y no se comparten con terceros.
        </p>
        <p>
          No se utilizan cookies de analítica, ni rastreadores de terceros, ni
          se crea un perfil de comportamiento de ninguna persona.
        </p>
      </PublicSection>

      <PublicSection title="Datos de pago durante el lanzamiento gratuito">
        <p>
          Durante el lanzamiento gratuito <strong>no se solicita ni se almacena
          ningún medio de pago</strong>. La aplicación no recibe, procesa ni
          conserva números de tarjeta en ningún momento del alta.
        </p>
      </PublicSection>

      <PublicSection title="Borrador pendiente de revisión legal">
        <p>
          Este aviso lo redactó el equipo de producto describiendo lo que el
          software hace de verdad. <strong>No ha pasado revisión legal
          profesional</strong>: el operador debe completar plazos, bases
          jurídicas y derechos aplicables antes de prestar un servicio público.
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

      <PublicSection title="Versión de este documento">
        <p>{legalVersionLine("privacy")}</p>
        <p>
          Una versión publicada nunca se edita: cualquier cambio de texto se
          publica como versión nueva con su propia fecha, y el registro de
          versiones lo custodia el servidor.
        </p>
      </PublicSection>
    </PublicPageShell>
  );
}
