import type { Metadata } from "next";
import Link from "next/link";
import { PublicPageShell, PublicSection } from "../docs/PublicPageShell";
import { publicPageMetadata } from "@/lib/seo/page-metadata";

export const metadata: Metadata = {
  ...publicPageMetadata({
    path: "/terminos",
    title: "Términos de servicio — borrador",
    description:
      "Borrador de términos de servicio de VALLECAD, pendiente de completar y revisar.",
  }),
  robots: { index: false, follow: false },
};

export default function TerminosPage() {
  return (
    <PublicPageShell
      eyebrow="Información legal"
      title="Términos de servicio"
      intro="Borrador para revisión de Sergio"
    >
      <p
        role="status"
        className="type-body rounded-card border border-border bg-card p-5 text-foreground"
      >
        Este documento aún no se ha aprobado y no autoriza por sí solo un cobro.
        Los{" "}
        <Link href="/terms" className="underline">
          términos vigentes
        </Link>{" "}
        siguen disponibles.
      </p>

      <PublicSection title="Servicio y prestador">
        <p>
          VALLECAD es un programa de dibujo técnico 2D y modelado 3D en el
          navegador. Algunas funciones, formatos de intercambio y modalidades de
          colaboración tienen límites declarados en el producto; ningún archivo
          debe usarse sin revisión profesional cuando afecte una obra,
          fabricación o decisión de ingeniería.
        </p>
        <p>
          <strong>
            Razón social, RFC, domicilio y medios de contacto del prestador:
            pendientes de Sergio.
          </strong>
        </p>
      </PublicSection>

      <PublicSection title="Cuentas y planos">
        <p>
          Cada persona debe utilizar una cuenta y una organización para las que
          tenga autorización. El titular del plano conserva sus derechos sobre
          el contenido que crea. La prestación del servicio requiere permiso
          para alojar, procesar, mostrar y entregar ese contenido conforme a las
          acciones de la persona usuaria.
        </p>
        <p>
          El acceso a un plano compartido depende de los permisos vigentes;
          publicar un enlace no debe interpretarse como cesión de propiedad
          intelectual.
        </p>
      </PublicSection>

      <PublicSection title="Planes, cobros y cancelación">
        <p>
          Las condiciones del plan gratuito para uso educativo, su duración y
          sus límites deben coincidir con el catálogo que se ofrezca.{" "}
          <strong>
            Condiciones definitivas de ese plan: pendientes de Sergio.
          </strong>
        </p>
        <p>
          Antes de contratar, la pantalla de pago deberá mostrar moneda, precio
          total, periodicidad, cargos adicionales y medio de pago. Si un plan
          implica cobros automáticos recurrentes, la periodicidad, monto, fecha
          de cobro, consentimiento y mecanismo de cancelación deberán explicarse
          de forma destacada antes de pagar.
        </p>
        <p>
          <strong>Reembolsos: pendiente de Sergio.</strong> Quedan por definir
          los supuestos, plazos y procedimiento. Una cancelación no debe quitar
          la propiedad de los planos al usuario.{" "}
          <strong>
            Periodo de acceso, exportación y eliminación de planos tras
            cancelar: pendiente de Sergio.
          </strong>
        </p>
      </PublicSection>

      <PublicSection title="Alcance y soporte">
        <p>
          Las capacidades se ofrecen dentro de los límites técnicos publicados y
          pueden requerir una cuenta o un plan habilitado. El servicio no
          sustituye la verificación de medidas, normativas o entregables por una
          persona competente.
        </p>
        <p>
          <strong>
            Disponibilidad comprometida, soporte, jurisdicción y medios para
            reclamaciones: pendientes de revisión.
          </strong>{" "}
          No se declara un nivel de servicio garantizado en este borrador.
        </p>
      </PublicSection>

      <PublicSection title="Cambios y privacidad">
        <p>
          Una modificación de términos debe publicarse como nueva versión y
          pedir una nueva aceptación cuando corresponda.{" "}
          <strong>
            Fecha de entrada en vigor y mecanismo de notificación: pendientes de
            Sergio.
          </strong>
        </p>
        <p>
          El tratamiento de datos se describe en el{" "}
          <Link href="/privacidad" className="underline">
            aviso de privacidad en borrador
          </Link>
          .
        </p>
      </PublicSection>

      <PublicSection title="Estado del documento">
        <p>
          Borrador para revisión de Sergio. Redactado el 23 de septiembre de
          2026; sin aprobación jurídica ni fecha de entrada en vigor.
        </p>
      </PublicSection>
    </PublicPageShell>
  );
}
