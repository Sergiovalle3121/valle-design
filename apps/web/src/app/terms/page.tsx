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

      <PublicSection title="Lanzamiento gratuito: qué se cobra y qué no">
        <p>
          Durante el lanzamiento el acceso es gratuito por el periodo que
          anuncia la página de precios, y <strong>no se solicita ni se
          almacena ningún medio de pago</strong> para crear una cuenta. Al
          terminar ese periodo no se realiza ningún cargo automático: no hay
          nada que cobrar porque no se capturó nada con qué hacerlo.
        </p>
        <p>
          <strong>Tus documentos no quedan condicionados al pago.</strong>{" "}
          Cuando el periodo gratuito termina, la cuenta pasa a modo de sólo
          lectura: puedes seguir entrando, abrir tus documentos, imprimirlos y
          exportarlos a DXF. Lo que requiere un plan activo es continuar
          editándolos. Esta condición es una obligación del servicio, no una
          cortesía revocable.
        </p>
        <p>
          Las tarifas que la página de precios publica las sirve el catálogo
          real del despliegue y describen lo que costará un plan cuando el
          cobro se active; hoy no hay contratación en línea disponible. No se
          publica un nivel de servicio (SLA): un compromiso de disponibilidad
          requiere un acuerdo escrito con el titular. La página de estado sólo
          es autoritativa cuando el despliegue configura una fuente real de
          telemetría.
        </p>
        <a className={publicActionClass} href={COMMERCIAL_LINKS.contact}>
          Consultar contacto
        </a>
      </PublicSection>

      <PublicSection title="Borrador pendiente de revisión legal">
        <p>
          Este texto lo redactó el equipo de producto para que la web no
          prometa nada que el software no haga. <strong>No ha pasado revisión
          legal profesional</strong> y no sustituye el acuerdo escrito que
          requiere un uso comercial. Se publica así, dicho en voz alta, en vez
          de aparentar una solidez jurídica que todavía no tiene.
        </p>
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
