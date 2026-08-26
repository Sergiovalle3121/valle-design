import type { Metadata } from "next";
import {
  PublicPageShell,
  PublicSection,
  publicActionClass,
} from "../docs/PublicPageShell";
import { COMMERCIAL_LINKS } from "@/config/commercial";
import { publicPageMetadata } from "@/lib/seo/page-metadata";
import { legalVersionLine } from "@/lib/legal/legal-versions";

export const metadata: Metadata = publicPageMetadata({
  path: "/terms",
  title: "Términos de uso",
  description:
    "Condiciones básicas para evaluar y usar Valle Design, y los límites operativos que la web declara de forma expresa.",
});

export default function TermsPage() {
  return (
    <PublicPageShell
      eyebrow="Información legal"
      title="Condiciones básicas de uso"
      intro="Estas condiciones resumen límites operativos visibles en la web. No sustituyen el acuerdo escrito requerido para una evaluación, piloto o uso comercial."
    >
      <PublicSection title="Acceso autorizado">
        <p>
          Usa únicamente una cuenta y una organización para las que tengas
          autorización. No intentes eludir controles de acceso, acceder a datos
          de otra organización ni interferir con la disponibilidad del servicio.
        </p>
      </PublicSection>

      <PublicSection title="Alcance del producto">
        <p>
          Las funciones disponibles son las que aparecen en el despliegue y
          están habilitadas para tu cuenta. Esta web no promete compatibilidad
          DWG nativa, automatización mediante inteligencia artificial,
          revisiones colaborativas, certificaciones ni una exactitud garantizada
          para todo caso de ingeniería.
        </p>
        <p>
          Revisa cada archivo y entregable antes de utilizarlo en fabricación,
          construcción u otra actividad profesional.
        </p>
      </PublicSection>

      <PublicSection title="Condiciones comerciales y disponibilidad">
        <p>
          Las tarifas publicadas en la página de precios las sirve el catálogo
          real del despliegue, y la compra por autoservicio —cuando el
          despliegue la tiene habilitada— se procesa mediante el checkout
          hospedado del proveedor de pagos; los datos de pago no pasan por
          Valle Design. No se publica un nivel de servicio (SLA): un
          compromiso de disponibilidad requiere un acuerdo escrito con el
          titular. La página de estado sólo es autoritativa cuando el
          despliegue configura una fuente real de telemetría.
        </p>
        <a className={publicActionClass} href={COMMERCIAL_LINKS.contact}>
          Consultar contacto
        </a>
      </PublicSection>

      <PublicSection title="Versión de este documento">
        <p>{legalVersionLine("terms")}</p>
        <p>
          Una versión publicada nunca se edita: cualquier cambio de texto se
          publica como versión nueva con su propia fecha, y el registro de
          versiones lo custodia el servidor.
        </p>
      </PublicSection>
    </PublicPageShell>
  );
}
